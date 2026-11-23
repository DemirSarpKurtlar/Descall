/**
 * Run: node frontend/src/lib/passkeys/passkeys.selftest.mjs
 * Passkey client: base64url codec, platform routing (web, iOS plugin, Android plugin, Tauri
 * command, desktop browser handoff), normalised errors and the handoff poll loop, against
 * fake windows, plugins and API.
 */
import assert from "node:assert/strict";
import { base64urlToBuffer, bufferToBase64url, toCreationOptions, toRequestOptions, authenticationToJSON, registrationToJSON } from "./codec.js";
import { detectPasskeyPath, hostMatchesRpId, serverPlatformFor } from "./platform.js";
import { normalizePasskeyError, passkeyErrorKey, isSilentPasskeyError, PasskeyClientError } from "./errors.js";
import { runHandoff, openExternal } from "./handoff.js";
import * as pk from "./index.js";

// ---- codec -------------------------------------------------------------------------------
{
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const s = bufferToBase64url(bytes);
  assert.equal(s, "AAEC-vv8_f7_");
  assert.deepEqual(new Uint8Array(base64urlToBuffer(s)), bytes);
  assert.equal(bufferToBase64url(new Uint8Array([1, 2, 3]).subarray(1)), bufferToBase64url(new Uint8Array([2, 3])), "views keep their offset");
  const c = toCreationOptions({ challenge: "AAEC", user: { id: "AQ", name: "a", displayName: "a" }, excludeCredentials: [{ id: "AAAA", transports: ["internal"] }], rp: { id: "descall.com", name: "Descall" } });
  assert.ok(c.challenge instanceof ArrayBuffer);
  assert.equal(c.excludeCredentials[0].type, "public-key");
  assert.deepEqual(c.excludeCredentials[0].transports, ["internal"]);
  const r = toRequestOptions({ challenge: "AAEC", rpId: "descall.com", userVerification: "required" });
  assert.equal(r.allowCredentials, undefined, "discoverable: allowCredentials left out");
  const buf = (a) => new Uint8Array(a).buffer;
  const auth = authenticationToJSON({
    id: "AQID",
    rawId: buf([1, 2, 3]),
    type: "public-key",
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({}),
    response: { clientDataJSON: buf([123, 125]), authenticatorData: buf([1]), signature: buf([2]), userHandle: buf([9]) },
  });
  assert.deepEqual(auth.response, { clientDataJSON: "e30", authenticatorData: "AQ", signature: "Ag", userHandle: "CQ" });
  assert.equal(auth.rawId, auth.id, "rawId equals id (the server checks it)");
  const reg = registrationToJSON({
    id: "AQID",
    rawId: buf([1, 2, 3]),
    type: "public-key",
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
    response: { clientDataJSON: buf([123, 125]), attestationObject: buf([7]), getTransports: () => ["internal", "hybrid"] },
  });
  assert.deepEqual(reg.response.transports, ["internal", "hybrid"]);
  assert.deepEqual(reg.clientExtensionResults, { credProps: { rk: true } });
}

// ---- platform routing ----------------------------------------------------------------------
const webWin = (host = "descall.com", extra = {}) => ({
  isSecureContext: true,
  location: { hostname: host },
  PublicKeyCredential: function PublicKeyCredential() {},
  navigator: { credentials: { get() {}, create() {} } },
  ...extra,
});
const cap = (platform) => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => platform }, location: { hostname: "localhost" } });
{
  assert.equal(detectPasskeyPath(cap("ios")), "ios");
  assert.equal(detectPasskeyPath(cap("android")), "android");
  assert.equal(detectPasskeyPath({ __TAURI_INTERNALS__: {}, electronAPI: { isTauri: true, passkeyCreate() {}, passkeyGet() {} } }), "tauri");
  assert.equal(detectPasskeyPath({ __TAURI_INTERNALS__: {}, electronAPI: { isTauri: true } }), "handoff", "older Tauri build without the commands");
  assert.equal(detectPasskeyPath({ electronAPI: { isElectron: true }, location: { hostname: "app" } }), "handoff", "Electron (descall://app)");
  assert.equal(detectPasskeyPath(webWin()), "web");
  assert.equal(detectPasskeyPath(webWin("www.descall.com")), "web");
  assert.equal(detectPasskeyPath(webWin("descall-preview.vercel.app")), null, "other hosts cannot use rp id descall.com");
  assert.equal(detectPasskeyPath(webWin("descall.com", { isSecureContext: false })), null);
  assert.equal(detectPasskeyPath(webWin("descall.com", { PublicKeyCredential: undefined })), null, "old browser");
  assert.equal(detectPasskeyPath(undefined), null);
  assert.equal(hostMatchesRpId("evildescall.com", "descall.com"), false);
  assert.equal(serverPlatformFor("tauri"), "windows");
  assert.equal(serverPlatformFor("handoff", { electronAPI: {} }), "electron");
  assert.equal(serverPlatformFor("handoff", { __TAURI_INTERNALS__: {} }), "windows");
}

// ---- errors ------------------------------------------------------------------------------
{
  const dom = (name, message = "") => Object.assign(new Error(message), { name });
  assert.equal(normalizePasskeyError(dom("NotAllowedError")).code, "cancelled");
  assert.equal(normalizePasskeyError(dom("NotAllowedError"), { startedAt: Date.now() - 300000, timeoutMs: 300000 }).code, "timeout");
  assert.equal(normalizePasskeyError(dom("InvalidStateError")).code, "already_registered");
  assert.equal(normalizePasskeyError(dom("SecurityError")).code, "security");
  assert.equal(normalizePasskeyError(dom("NotSupportedError")).code, "unsupported");
  assert.equal(normalizePasskeyError(dom("AbortError"), { ownAbort: true }).code, "aborted");
  assert.equal(normalizePasskeyError({ code: "no_credential", message: "none" }).code, "no_credential", "Android / iOS plugin code");
  assert.equal(normalizePasskeyError({ code: "canceled" }).code, "cancelled", "iOS spelling");
  assert.equal(normalizePasskeyError("NotFound").code, "no_credential", "Tauri error string");
  const server = normalizePasskeyError(Object.assign(new Error("x"), { status: 401, code: "UV_REQUIRED", body: { code: "UV_REQUIRED" } }));
  assert.equal(server.code, "server");
  assert.equal(server.serverCode, "UV_REQUIRED");
  assert.equal(passkeyErrorKey(server), "passkey.err.uvRequired");
  assert.equal(passkeyErrorKey(normalizePasskeyError(Object.assign(new Error("x"), { status: 403, code: "CLONED" }))), "passkey.err.suspended");
  assert.equal(passkeyErrorKey(normalizePasskeyError(Object.assign(new Error("x"), { status: 429 }))), "passkey.err.rateLimited");
  assert.equal(passkeyErrorKey(dom("NotAllowedError")), null, "cancel is silent");
  assert.equal(passkeyErrorKey(new PasskeyClientError("no_credential")), "passkey.err.no_credential");
  assert.ok(isSilentPasskeyError(new PasskeyClientError("aborted")));
  assert.equal(normalizePasskeyError({ code: "transient" }).code, "network");
}

// ---- handoff -----------------------------------------------------------------------------
{
  const url = `https://descall.com/passkey/desktop#c=${"a".repeat(43)}`;
  const opened = [];
  const polls = ["pending", "pending", { token: "t", user: { id: "u" } }];
  const api = {
    handoffSignIn: async (platform) => ({ url, pollSecret: "p".repeat(43), matchCode: "1234", expiresInSec: 300, platform }),
    handoffPoll: async (secret) => {
      assert.equal(secret, "p".repeat(43));
      const next = polls.shift();
      return typeof next === "string" ? { status: next } : next;
    },
  };
  let started = null;
  const body = await runHandoff("signin", { api, open: (u) => opened.push(u), interval: 1, onStarted: (s) => (started = s) });
  assert.equal(body.token, "t");
  assert.deepEqual(opened, [url], "the page opens once in the default browser");
  assert.equal(started.matchCode, "1234");
  started.reopen();
  assert.equal(opened.length, 2, "the person can reopen the page");

  const expiring = { handoffSignIn: api.handoffSignIn, handoffPoll: async () => { throw Object.assign(new Error("gone"), { status: 410, code: "HANDOFF_USED" }); } };
  await assert.rejects(runHandoff("signin", { api: expiring, open: () => {}, interval: 1 }), (e) => e.code === "timeout");

  const banned = { handoffSignIn: api.handoffSignIn, handoffPoll: async () => { throw Object.assign(new Error("banned"), { status: 403, code: "ACCOUNT_BANNED", body: { code: "ACCOUNT_BANNED", banTicket: "x" } }); } };
  await assert.rejects(runHandoff("signin", { api: banned, open: () => {}, interval: 1 }), (e) => e.code === "server" && e.serverCode === "ACCOUNT_BANNED", "a ban reaches the app's ban screen");

  let flaky = 0;
  const offline = { handoffSignIn: api.handoffSignIn, handoffPoll: async () => { flaky += 1; if (flaky < 3) throw Object.assign(new Error("net"), { code: "transient" }); return { status: "registered", passkey: { id: "k" } }; } };
  offline.handoffRegister = async (token) => { assert.equal(token, "reauth"); return api.handoffSignIn(); };
  const reg = await runHandoff("register", { api: offline, reauthToken: "reauth", open: () => {}, interval: 1 });
  assert.deepEqual(reg, { passkey: { id: "k" } }, "network blips keep polling");

  const ctl = new AbortController();
  const hang = { handoffSignIn: api.handoffSignIn, handoffPoll: async () => ({ status: "pending" }) };
  const p = runHandoff("signin", { api: hang, open: () => {}, interval: 5, signal: ctl.signal });
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(p, (e) => e.code === "aborted");
  assert.throws(() => openExternal("https://evil.example/passkey/desktop?c=x", { open() {} }));
}

// ---- one API, every path ---------------------------------------------------------------------
function fakeApi(log) {
  return {
    config: async () => ({ enabled: true, rpId: "descall.com", android: true }),
    authOptions: async (platform) => {
      log.push(["authOptions", platform]);
      return { challenge: "AAEC", rpId: "descall.com", timeout: 300000, userVerification: "required" };
    },
    authVerify: async (response, platform) => {
      log.push(["authVerify", platform, response.id]);
      if (response.id === "ghost") throw Object.assign(new Error("unknown"), { status: 401, code: "UNKNOWN_CREDENTIAL", body: { code: "UNKNOWN_CREDENTIAL", credentialId: "ghost" } });
      return { token: "tok", method: "passkey" };
    },
    registerOptions: async (token, platform) => {
      log.push(["registerOptions", token, platform]);
      return { challenge: "AAEC", user: { id: "AQ", name: "a", displayName: "a" }, rp: { id: "descall.com", name: "Descall" }, excludeCredentials: [], timeout: 300000 };
    },
    registerVerify: async (token, response, name, platform) => {
      log.push(["registerVerify", token, name, platform, response.id]);
      return { passkey: { id: "new", name } };
    },
    handoffSignIn: async (platform) => {
      log.push(["handoffSignIn", platform]);
      return { url: `https://descall.com/passkey/desktop#c=${"b".repeat(43)}`, pollSecret: "s".repeat(43), matchCode: "0042", expiresInSec: 300 };
    },
    handoffPoll: async () => ({ token: "handoff-tok" }),
  };
}
const nativeResponse = (id) => JSON.stringify({ id, rawId: id, type: "public-key", response: { clientDataJSON: "e30", authenticatorData: "AQ", signature: "Ag", userHandle: "AQ" } });

// Web.
{
  const log = [];
  const buf = (a) => new Uint8Array(a).buffer;
  const win = webWin("descall.com", {
    PublicKeyCredential: Object.assign(function PublicKeyCredential() {}, {
      isConditionalMediationAvailable: async () => true,
      signalUnknownCredential: async (o) => log.push(["signal", o.credentialId, o.rpId]),
    }),
    navigator: {
      credentials: {
        get: async (o) => {
          log.push(["navigator.get", o.mediation || "modal", o.publicKey.userVerification]);
          assert.ok(o.publicKey.challenge instanceof ArrayBuffer);
          return { id: "web-cred", rawId: buf([1]), type: "public-key", getClientExtensionResults: () => ({}), response: { clientDataJSON: buf([1]), authenticatorData: buf([1]), signature: buf([1]), userHandle: buf([1]) } };
        },
        create: async (o) => {
          log.push(["navigator.create", o.publicKey.authenticatorSelection?.residentKey || "n/a"]);
          return { id: "web-new", rawId: buf([2]), type: "public-key", getClientExtensionResults: () => ({}), response: { clientDataJSON: buf([1]), attestationObject: buf([1]), getTransports: () => ["internal"] } };
        },
      },
    },
  });
  pk.__setPasskeyEnvForTests({ win: () => win, api: fakeApi(log), plugin: async () => { throw new Error("no plugin on the web"); } });
  const avail = await pk.isAvailable();
  assert.deepEqual(avail, { available: true, path: "web", conditional: true, reason: null });
  const body = await pk.signIn();
  assert.equal(body.token, "tok");
  assert.deepEqual(log.slice(0, 3), [["authOptions", "web"], ["navigator.get", "modal", "required"], ["authVerify", "web", "web-cred"]]);
  const reg = await pk.register(" Laptop ", { reauthToken: "rt" });
  assert.equal(reg.passkey.name, "Laptop");
  assert.ok(log.some((l) => l[0] === "registerVerify" && l[1] === "rt" && l[3] === "web" && l[4] === "web-new"));
  await assert.rejects(pk.register("x", {}), (e) => e.serverCode === "REAUTH_REQUIRED", "registration needs a re-auth token");
  // Conditional autofill: a conditional request, then the result goes to onResult.
  const got = await new Promise((resolve, reject) => {
    const stop = pk.startConditional({ onResult: (b) => { stop(); resolve(b); }, onError: reject });
  });
  assert.equal(got.token, "tok");
  assert.ok(log.some((l) => l[0] === "navigator.get" && l[1] === "conditional"), "conditional mediation on the username field");
}

// Web: unknown credential tells the browser to drop it (Signal API).
{
  const log = [];
  const win = webWin("descall.com", {
    PublicKeyCredential: Object.assign(function PublicKeyCredential() {}, { signalUnknownCredential: async (o) => log.push(["signal", o.credentialId, o.rpId]) }),
    navigator: { credentials: { get: async () => ({ id: "ghost", rawId: new Uint8Array([1]).buffer, type: "public-key", response: { clientDataJSON: new ArrayBuffer(1), authenticatorData: new ArrayBuffer(1), signature: new ArrayBuffer(1) } }) } },
  });
  pk.__setPasskeyEnvForTests({ win: () => win, api: fakeApi(log) });
  await assert.rejects(pk.signIn(), (e) => e.serverCode === "UNKNOWN_CREDENTIAL");
  assert.ok(log.some((l) => l[0] === "signal" && l[1] === "ghost" && l[2] === "descall.com"));
}

// Web: unsupported host hides the feature.
{
  pk.__setPasskeyEnvForTests({ win: () => webWin("descall-git-x.vercel.app"), api: fakeApi([]) });
  assert.deepEqual(await pk.isAvailable(), { available: false, path: null, conditional: false, reason: "unsupported" });
}

// iOS and Android: the DescallPasskey plugin gets the server JSON and returns response JSON.
for (const platform of ["ios", "android"]) {
  const log = [];
  const plugin = {
    isAvailable: async () => ({ available: true }),
    get: async ({ options }) => {
      log.push(["plugin.get", JSON.parse(options).rpId]);
      return { response: nativeResponse(`${platform}-cred`) };
    },
    create: async ({ options }) => {
      log.push(["plugin.create", JSON.parse(options).rp.id]);
      return { response: nativeResponse(`${platform}-new`) };
    },
  };
  pk.__setPasskeyEnvForTests({ win: () => cap(platform), api: fakeApi(log), plugin: async () => plugin });
  assert.equal((await pk.isAvailable()).path, platform);
  assert.equal((await pk.signIn()).token, "tok");
  assert.deepEqual(log.slice(0, 3), [["authOptions", platform], ["plugin.get", "descall.com"], ["authVerify", platform, `${platform}-cred`]]);
  await pk.register("", { reauthToken: "rt" });
  assert.ok(log.some((l) => l[0] === "plugin.create"));
  assert.ok(log.some((l) => l[0] === "registerVerify" && l[2] === undefined && l[3] === platform), "an empty name lets the server choose");
  // Old OS: the plugin says no and the entry hides.
  pk.__setPasskeyEnvForTests({ win: () => cap(platform), api: fakeApi([]), plugin: async () => ({ isAvailable: async () => ({ available: false, reason: "os_too_old" }) }) });
  assert.deepEqual(await pk.isAvailable(), { available: false, path: platform, conditional: false, reason: "os_too_old" });
  // Plugin errors are normalised.
  pk.__setPasskeyEnvForTests({
    win: () => cap(platform),
    api: fakeApi([]),
    plugin: async () => ({ isAvailable: async () => ({ available: true }), get: async () => { throw Object.assign(new Error("none"), { code: "no_credential" }); } }),
  });
  await assert.rejects(pk.signIn(), (e) => e instanceof PasskeyClientError && e.code === "no_credential");
}

// Android without a configured app origin on the server: hidden (sign-ins would fail).
{
  const api = { ...fakeApi([]), config: async () => ({ enabled: true, android: false }) };
  pk.__setPasskeyEnvForTests({ win: () => cap("android"), api, plugin: async () => ({ isAvailable: async () => ({ available: true }) }) });
  assert.equal((await pk.isAvailable()).available, false);
}

// Tauri: the passkey_* commands; webauthn.dll missing -> browser handoff.
{
  const log = [];
  const electronAPI = {
    isTauri: true,
    passkeyAvailable: async () => ({ available: true, apiVersion: 4 }),
    passkeyGet: async (json) => {
      log.push(["tauri.get", JSON.parse(json).rpId]);
      return nativeResponse("win-cred");
    },
    passkeyCreate: async () => nativeResponse("win-new"),
  };
  pk.__setPasskeyEnvForTests({ win: () => ({ __TAURI_INTERNALS__: {}, electronAPI, open() {} }), api: fakeApi(log) });
  assert.equal((await pk.isAvailable()).path, "tauri");
  assert.equal((await pk.signIn()).token, "tok");
  assert.deepEqual(log[0], ["authOptions", "windows"]);
  assert.deepEqual(log[1], ["tauri.get", "descall.com"]);

  const log2 = [];
  const opened = [];
  const old = { ...electronAPI, passkeyAvailable: async () => ({ available: false, reason: "webauthn_dll_missing" }) };
  pk.__setPasskeyEnvForTests({ win: () => ({ __TAURI_INTERNALS__: {}, electronAPI: old, open: (u) => opened.push(u) }), api: fakeApi(log2) });
  assert.equal((await pk.isAvailable()).path, "handoff", "Windows before 1903 uses the browser");
}

// Electron: browser handoff with the match code.
{
  const log = [];
  const opened = [];
  pk.__setPasskeyEnvForTests({ win: () => ({ electronAPI: { isElectron: true }, open: (u) => opened.push(u), location: { hostname: "app" } }), api: fakeApi(log) });
  assert.equal((await pk.isAvailable()).path, "handoff");
  let match = null;
  const body = await pk.signIn({ onHandoff: (s) => (match = s.matchCode) });
  assert.equal(body.token, "handoff-tok");
  assert.equal(match, "0042");
  assert.deepEqual(log[0], ["handoffSignIn", "electron"]);
  assert.equal(opened.length, 1);
  await assert.rejects(pk.reauthWithPasskey(), (e) => e.code === "unsupported", "re-auth on the handoff path uses the password");
}

// One ceremony at a time.
{
  let release;
  const plugin = { isAvailable: async () => ({ available: true }), get: () => new Promise((r) => { release = () => r({ response: nativeResponse("x") }); }) };
  pk.__setPasskeyEnvForTests({ win: () => cap("ios"), api: fakeApi([]), plugin: async () => plugin });
  const first = pk.signIn();
  await new Promise((r) => setTimeout(r, 5));
  await assert.rejects(pk.signIn(), (e) => e.code === "busy");
  release();
  assert.equal((await first).token, "tok");
}

// Server switched off or unreachable: hidden.
{
  pk.__setPasskeyEnvForTests({ win: () => webWin(), api: { ...fakeApi([]), config: async () => ({ enabled: false }) } });
  assert.equal((await pk.isAvailable()).reason, "disabled");
  pk.__setPasskeyEnvForTests({ win: () => webWin(), api: { ...fakeApi([]), config: async () => { throw new Error("offline"); } } });
  assert.equal((await pk.isAvailable()).reason, "offline");
}

console.log("passkeys client selftest OK");
