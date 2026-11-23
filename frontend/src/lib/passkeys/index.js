/**
 * Passkeys, one API for every platform (the screens never ask which one runs):
 *
 *   isAvailable()                 -> { available, path, conditional, reason }
 *   signIn({ conditional, signal, onHandoff })
 *                                 -> the POST /login body ({ token, sessionId, user }, or
 *                                    { requires2fa, pendingToken, ... } without user verification)
 *   register(name, { reauthToken, signal, onHandoff }) -> { passkey }
 *   reauthWithPasskey()           -> reauthToken (needs an existing passkey; not on the handoff path)
 *   startConditional({ onResult, onError }) -> stop()   web autofill on the username field
 *   list / rename / remove / reauthWithSecret            Settings > Security
 *
 * Errors are PasskeyClientError (lib/passkeys/errors.js) on every path.
 * Paths (lib/passkeys/platform.js): web, ios, android, tauri, handoff.
 */
import { toCreationOptions, toRequestOptions, registrationToJSON, authenticationToJSON } from "./codec.js";
import { PasskeyClientError, normalizePasskeyError } from "./errors.js";
import { detectPasskeyPath, serverPlatformFor, PASSKEY_RP_ID } from "./platform.js";
import { runHandoff, openExternal } from "./handoff.js";

export { PasskeyClientError, normalizePasskeyError, isSilentPasskeyError, passkeyErrorKey } from "./errors.js";
export { detectPasskeyPath } from "./platform.js";

const CONFIG_TTL_MS = 5 * 60 * 1000;
const CONDITIONAL_RESTART_MS = 4 * 60 * 1000; // challenges live 5 minutes

/** Test seam: replace the window, Capacitor plugin loader and API. */
const env = {
  win: () => (typeof window !== "undefined" ? window : undefined),
  // Loaded on first use, so importing this module stays cheap (login screen, tests).
  api: null,
  plugin: async () => {
    const { registerPlugin } = await import("@capacitor/core");
    return registerPlugin("DescallPasskey");
  },
};
export function __setPasskeyEnvForTests(patch) {
  Object.assign(env, patch);
  configCache = null;
  nativeAvailability = null;
}

async function api() {
  if (!env.api) env.api = (await import("./api.js")).passkeyApi;
  return env.api;
}

let configCache = null; // { at, value }
let nativeAvailability = null; // Promise<{ available, reason, apiVersion }>
let inFlight = null; // the running modal ceremony
let conditionalCtl = null; // AbortController of the web autofill request
const conditionalResumers = new Set(); // autofill loops to restart after a modal ceremony

async function serverConfig() {
  if (configCache && Date.now() - configCache.at < CONFIG_TTL_MS) return configCache.value;
  try {
    const value = await (await api()).config();
    configCache = { at: Date.now(), value };
    return value;
  } catch {
    // Offline or old backend: try again on the next call, do not cache the failure long.
    configCache = { at: Date.now() - CONFIG_TTL_MS + 15000, value: { enabled: false, offline: true } };
    return configCache.value;
  }
}

async function nativeStatus(path) {
  if (!nativeAvailability) {
    nativeAvailability = (async () => {
      try {
        if (path === "ios" || path === "android") {
          const plugin = await env.plugin();
          const r = await plugin.isAvailable();
          return { available: Boolean(r?.available), reason: r?.reason || null };
        }
        if (path === "tauri") {
          const api = env.win()?.electronAPI;
          const r = typeof api?.passkeyAvailable === "function" ? await api.passkeyAvailable() : null;
          return { available: Boolean(r?.available), reason: r?.reason || null, apiVersion: r?.apiVersion || 0 };
        }
      } catch {
        /* plugin missing in an older app build */
      }
      return { available: false, reason: "plugin_missing" };
    })();
  }
  return nativeAvailability;
}

/**
 * The effective path: the Tauri app falls back to the browser handoff when webauthn.dll is
 * not usable (Windows 10 before 1903).
 */
async function effectivePath() {
  const path = detectPasskeyPath(env.win(), { rpId: PASSKEY_RP_ID });
  if (path === "tauri") {
    const s = await nativeStatus(path);
    return s.available ? "tauri" : "handoff";
  }
  return path;
}

async function conditionalSupported(win) {
  try {
    const PKC = win?.PublicKeyCredential;
    if (typeof PKC?.getClientCapabilities === "function") {
      const caps = await PKC.getClientCapabilities();
      if (caps && typeof caps.conditionalGet === "boolean") return caps.conditionalGet;
    }
    return typeof PKC?.isConditionalMediationAvailable === "function" ? Boolean(await PKC.isConditionalMediationAvailable()) : false;
  } catch {
    return false;
  }
}

export async function isAvailable() {
  const path = await effectivePath();
  if (!path) return { available: false, path: null, conditional: false, reason: "unsupported" };
  const cfg = await serverConfig();
  if (!cfg?.enabled) return { available: false, path, conditional: false, reason: cfg?.offline ? "offline" : "disabled" };
  if (path === "android" && cfg.android === false) return { available: false, path, conditional: false, reason: "android_not_configured" };
  if (path === "ios" || path === "android") {
    const s = await nativeStatus(path);
    if (!s.available) return { available: false, path, conditional: false, reason: s.reason || "unsupported" };
  }
  const conditional = path === "web" ? await conditionalSupported(env.win()) : false;
  return { available: true, path, conditional, reason: null };
}

/** Runs `fn` as the only modal ceremony; a pending web autofill request is cancelled first. */
async function exclusive(fn) {
  if (inFlight) throw new PasskeyClientError("busy", "another passkey request is open");
  stopConditional();
  const p = (async () => fn())();
  inFlight = p;
  try {
    return await p;
  } finally {
    if (inFlight === p) inFlight = null;
    // The autofill request was cancelled for this ceremony: offer it again.
    for (const resume of conditionalResumers) setTimeout(resume, 300);
  }
}

async function webGet(optionsJSON, { mediation, signal } = {}) {
  const win = env.win();
  const startedAt = Date.now();
  try {
    const cred = await win.navigator.credentials.get({ publicKey: toRequestOptions(optionsJSON), ...(mediation ? { mediation } : {}), ...(signal ? { signal } : {}) });
    if (!cred) throw new PasskeyClientError("cancelled", "no credential returned");
    return authenticationToJSON(cred);
  } catch (err) {
    throw normalizePasskeyError(err, { startedAt, timeoutMs: optionsJSON.timeout, ownAbort: signal?.aborted, aborted: signal?.aborted });
  }
}

async function webCreate(optionsJSON, { signal } = {}) {
  const win = env.win();
  const startedAt = Date.now();
  try {
    const cred = await win.navigator.credentials.create({ publicKey: toCreationOptions(optionsJSON), ...(signal ? { signal } : {}) });
    if (!cred) throw new PasskeyClientError("cancelled", "no credential returned");
    return registrationToJSON(cred);
  } catch (err) {
    throw normalizePasskeyError(err, { startedAt, timeoutMs: optionsJSON.timeout, aborted: signal?.aborted });
  }
}

const parseJSON = (v) => (typeof v === "string" ? JSON.parse(v) : v);

/** Native ceremony: Capacitor plugin (ios / android) or the Tauri command. */
async function nativeCeremony(path, kind, optionsJSON) {
  try {
    if (path === "tauri") {
      const api = env.win()?.electronAPI;
      const raw = kind === "create" ? await api.passkeyCreate(JSON.stringify(optionsJSON)) : await api.passkeyGet(JSON.stringify(optionsJSON));
      return parseJSON(raw);
    }
    const plugin = await env.plugin();
    const r = kind === "create" ? await plugin.create({ options: JSON.stringify(optionsJSON) }) : await plugin.get({ options: JSON.stringify(optionsJSON) });
    return parseJSON(r?.response);
  } catch (err) {
    throw normalizePasskeyError(err);
  }
}

async function ceremony(path, kind, optionsJSON, { signal } = {}) {
  if (path === "web") return kind === "create" ? webCreate(optionsJSON, { signal }) : webGet(optionsJSON, { signal });
  return nativeCeremony(path, kind, optionsJSON);
}

/** Tells the browser's passkey manager that a key is gone (WebAuthn Signal API, Chrome 132+). */
export function signalUnknownCredential(credentialId) {
  try {
    const PKC = env.win()?.PublicKeyCredential;
    if (credentialId && typeof PKC?.signalUnknownCredential === "function") {
      PKC.signalUnknownCredential({ rpId: PASSKEY_RP_ID, credentialId }).catch(() => {});
    }
  } catch {
    /* optional */
  }
}

/** Keeps the browser's list in step with the account (Signal API). */
export function signalAcceptedCredentials(userHandle, credentialIds) {
  try {
    const PKC = env.win()?.PublicKeyCredential;
    if (userHandle && Array.isArray(credentialIds) && typeof PKC?.signalAllAcceptedCredentials === "function") {
      PKC.signalAllAcceptedCredentials({ rpId: PASSKEY_RP_ID, userId: userHandle, allAcceptedCredentialIds: credentialIds }).catch(() => {});
    }
  } catch {
    /* optional */
  }
}

async function verifySignIn(response, platform, signal) {
  try {
    return await (await api()).authVerify(response, platform, { signal });
  } catch (err) {
    const e = normalizePasskeyError(err);
    if (e.serverCode === "UNKNOWN_CREDENTIAL") signalUnknownCredential(e.credentialId || response?.id);
    throw e;
  }
}

/**
 * Sign in with a passkey (no username).
 * @param {object} [o] { signal, onHandoff({ matchCode, reopen }) for the desktop browser path }
 */
export async function signIn(o = {}) {
  const path = await effectivePath();
  if (!path) throw new PasskeyClientError("unsupported", "passkeys are not available here");
  const platform = serverPlatformFor(path, env.win());
  if (path === "handoff") return exclusive(async () => runHandoff("signin", { platform, signal: o.signal, onStarted: o.onHandoff, api: await api(), open: (u) => openExternal(u, env.win()) }));
  return exclusive(async () => {
    let options;
    try {
      options = await (await api()).authOptions(platform, { signal: o.signal });
    } catch (err) {
      throw normalizePasskeyError(err);
    }
    const response = await ceremony(path, "get", options, { signal: o.signal });
    return verifySignIn(response, platform, o.signal);
  });
}

/**
 * Web only: passkey suggestions in the username field's autofill (autocomplete="username webauthn").
 * Keeps one conditional request open, renews it before its challenge expires, and stops when
 * a modal request starts or stop() is called.
 */
export function startConditional({ onResult, onError } = {}) {
  let stopped = false;
  let starting = false;
  let timer = null;
  const run = async () => {
    if (stopped || starting || inFlight || conditionalCtl) return;
    starting = true;
    let ready = false;
    try {
      const path = await effectivePath();
      ready = path === "web" && (await conditionalSupported(env.win())) && Boolean((await serverConfig())?.enabled);
    } finally {
      starting = false;
    }
    if (!ready || stopped || inFlight || conditionalCtl) return;
    const ctl = new AbortController();
    conditionalCtl = ctl;
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Renew before the server's 5 minute challenge expiry.
      ctl.abort();
      if (conditionalCtl === ctl) conditionalCtl = null;
      if (!stopped) run();
    }, CONDITIONAL_RESTART_MS);
    try {
      const options = await (await api()).authOptions("web", { signal: ctl.signal });
      if (ctl.signal.aborted || stopped) return;
      const response = await webGet(options, { mediation: "conditional", signal: ctl.signal });
      if (stopped) return;
      clearTimeout(timer);
      const body = await verifySignIn(response, "web");
      onResult?.(body);
    } catch (err) {
      const e = normalizePasskeyError(err, { aborted: ctl.signal.aborted });
      if (e.code === "aborted" || stopped) return;
      clearTimeout(timer);
      onError?.(e);
      // The person dismissed or the server refused: offer autofill again.
      if (e.code !== "unsupported" && e.code !== "security") timer = setTimeout(run, 1000);
    } finally {
      if (conditionalCtl === ctl) conditionalCtl = null;
    }
  };
  conditionalResumers.add(run);
  run();
  return () => {
    stopped = true;
    conditionalResumers.delete(run);
    clearTimeout(timer);
    stopConditional();
  };
}

export function stopConditional() {
  if (conditionalCtl) {
    try {
      conditionalCtl.abort();
    } catch {
      /* ignore */
    }
    conditionalCtl = null;
  }
}

// ---- Settings > Security -------------------------------------------------------------

export async function listPasskeys() {
  const res = await (await api()).list();
  if (res?.userHandle) signalAcceptedCredentials(res.userHandle, (res.passkeys || []).map((p) => p.credentialId).filter(Boolean));
  return res;
}

/** Re-auth with the password or a 6-digit code (e-mail code for accounts without a password, or the authenticator app). */
export async function reauthWithSecret({ password, code }) {
  try {
    const r = await (await api()).reauth({ password, code });
    return r.reauthToken;
  } catch (err) {
    throw normalizePasskeyError(err);
  }
}

/** Re-auth with an existing passkey (user verification required). */
export async function reauthWithPasskey(o = {}) {
  const path = await effectivePath();
  if (!path || path === "handoff") throw new PasskeyClientError("unsupported", "use your password here");
  const platform = serverPlatformFor(path, env.win());
  return exclusive(async () => {
    let options;
    try {
      options = await (await api()).reauthOptions(platform);
    } catch (err) {
      throw normalizePasskeyError(err);
    }
    const response = await ceremony(path, "get", options, { signal: o.signal });
    try {
      const r = await (await api()).reauthVerify(response, platform);
      return r.reauthToken;
    } catch (err) {
      throw normalizePasskeyError(err);
    }
  });
}

/**
 * Add a passkey to the signed-in account.
 * @param {string} name optional label ("Work laptop"); the server picks one when empty
 * @param {object} o { reauthToken (required), signal, onHandoff }
 */
export async function register(name, o = {}) {
  const path = await effectivePath();
  if (!path) throw new PasskeyClientError("unsupported", "passkeys are not available here");
  if (!o.reauthToken) throw new PasskeyClientError("server", "re-auth required", { serverCode: "REAUTH_REQUIRED", status: 428 });
  const platform = serverPlatformFor(path, env.win());
  if (path === "handoff") return exclusive(async () => runHandoff("register", { platform, reauthToken: o.reauthToken, signal: o.signal, onStarted: o.onHandoff, api: await api(), open: (u) => openExternal(u, env.win()) }));
  return exclusive(async () => {
    let options;
    try {
      options = await (await api()).registerOptions(o.reauthToken, platform);
    } catch (err) {
      throw normalizePasskeyError(err);
    }
    const response = await ceremony(path, "create", options, { signal: o.signal });
    try {
      return await (await api()).registerVerify(o.reauthToken, response, String(name || "").trim() || undefined, platform);
    } catch (err) {
      throw normalizePasskeyError(err);
    }
  });
}

export async function renamePasskey(id, name) {
  try {
    return await (await api()).rename(id, name);
  } catch (err) {
    throw normalizePasskeyError(err);
  }
}

export async function removePasskey(id) {
  try {
    const r = await (await api()).remove(id);
    if (r?.credentialId) signalUnknownCredential(r.credentialId);
    return r;
  } catch (err) {
    throw normalizePasskeyError(err);
  }
}
