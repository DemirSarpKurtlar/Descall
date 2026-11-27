/**
 * Desktop browser handoff (Electron, and the Tauri app where webauthn.dll is missing).
 *
 * Why not in-app: the desktop page runs at descall://app (Electron) or https://tauri.localhost
 * (Tauri), and WebAuthn only lets https://descall.com (or a subdomain) use rp id descall.com.
 * Electron has no native WebAuthn bridge, and a new native module (koffi / FFI into
 * webauthn.dll) would add an unsigned native dependency to an app that is being replaced by
 * the Tauri shell, for Windows only (Electron also ships for macOS and Linux). The default
 * browser already has every passkey provider (Windows Hello, iCloud Keychain, Google Password
 * Manager, phones over hybrid / QR, security keys) on every OS, so the app hands the ceremony
 * to it:
 *
 *   1. the app asks the server for a handoff: a one-time code (32 random bytes) and a poll
 *      secret (32 random bytes, never leaves the app), 5 minutes, single use;
 *   2. it opens https://descall.com/passkey/desktop#c=<code> in the default browser. The code
 *      is in the fragment, so it is never sent to a server in a URL or a Referer;
 *   3. the page shows the same 4-digit match code as the app and runs the passkey ceremony;
 *   4. the app polls with the poll secret and, exactly once, gets the session (sign-in) or the
 *      new passkey (register). No custom-scheme deep link is needed, so nothing depends on
 *      descall:// being registered to the right app (Electron and Tauri may both be
 *      installed) or on the browser allowing the external-protocol prompt.
 */
import { PasskeyClientError, normalizePasskeyError } from "./errors.js";

export const POLL_INTERVAL_MS = 2000;

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener?.(
      "abort",
      () => {
        clearTimeout(t);
        reject(new PasskeyClientError("aborted", "aborted"));
      },
      { once: true }
    );
  });

/** Opens the page in the default browser (desktop shells route window.open there). */
export function openExternal(url, win = typeof window !== "undefined" ? window : undefined) {
  if (!/^https:\/\/[^/]+\/passkey\/desktop#c=[A-Za-z0-9_-]{43}$/.test(String(url || ""))) {
    throw new PasskeyClientError("unknown", "bad handoff url");
  }
  try {
    win?.open?.(url, "_blank", "noopener,noreferrer");
  } catch {
    /* the shell may return null for an external window */
  }
}

/**
 * @param {"signin"|"register"} kind
 * @param {object} o { platform, reauthToken (register), signal, onStarted({ matchCode, expiresAt, url, reopen }),
 *                     api (tests), open (tests), interval (tests) }
 * @returns sign-in: the server login body; register: { passkey }
 */
export async function runHandoff(kind, o = {}) {
  const api = o.api || (await import("./api.js")).passkeyApi;
  const open = o.open || openExternal;
  const interval = o.interval ?? POLL_INTERVAL_MS;
  let start;
  try {
    start = kind === "register" ? await api.handoffRegister(o.reauthToken, o.platform) : await api.handoffSignIn(o.platform);
  } catch (err) {
    throw normalizePasskeyError(err);
  }
  const reopen = () => open(start.url);
  reopen();
  o.onStarted?.({ matchCode: start.matchCode, expiresAt: start.expiresAt, url: start.url, reopen });
  const deadline = Date.now() + (Number(start.expiresInSec) || 300) * 1000 + 5000;
  for (;;) {
    if (o.signal?.aborted) throw new PasskeyClientError("aborted", "aborted");
    await sleep(interval, o.signal);
    let res;
    try {
      res = await api.handoffPoll(start.pollSecret, { signal: o.signal });
    } catch (err) {
      if (o.signal?.aborted) throw new PasskeyClientError("aborted", "aborted");
      const e = normalizePasskeyError(err);
      // Expired / used: stop. A dropped connection: keep polling until the deadline.
      if (e.code === "server" && (e.status === 404 || e.status === 410)) throw new PasskeyClientError("timeout", "handoff expired", { serverCode: "HANDOFF_EXPIRED" });
      if (e.code === "server" && e.status !== 429) throw e;
      if (Date.now() > deadline) throw new PasskeyClientError("timeout", "handoff expired");
      continue;
    }
    if (!res || res.status === "pending") {
      if (Date.now() > deadline) throw new PasskeyClientError("timeout", "handoff expired");
      continue;
    }
    if (res.status === "expired") throw new PasskeyClientError("timeout", "handoff expired", { serverCode: "HANDOFF_EXPIRED" });
    if (res.status === "failed") throw new PasskeyClientError("cancelled", "handoff failed");
    if (kind === "register") {
      if (res.status === "registered") return { passkey: res.passkey || null };
      throw new PasskeyClientError("unknown", "unexpected handoff answer");
    }
    // Sign-in: the same body as POST /auth/verify (token, or requires2fa).
    return res;
  }
}
