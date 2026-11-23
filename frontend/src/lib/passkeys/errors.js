/**
 * One error shape for every passkey path (web, iOS plugin, Android plugin, Tauri command,
 * desktop browser handoff), so screens map `code` to copy once:
 *
 *   cancelled            the person closed the sheet (or the platform hides "no passkey" behind it)
 *   no_credential        this device has no Descall passkey (Android, Windows tell us)
 *   timeout              nobody answered in time
 *   already_registered   this authenticator already holds a Descall passkey for the account
 *   unsupported          no passkey support here (old OS / browser / no screen lock)
 *   security             the platform refused the site (domain association not verified yet)
 *   busy                 another passkey request is open
 *   aborted              we cancelled it ourselves (conditional autofill restarted): never shown
 *   network              the server could not be reached
 *   server               the server refused; see serverCode (UV_REQUIRED, UNKNOWN_CREDENTIAL,
 *                        CLONED, SUSPENDED, PASSKEYS_UNAVAILABLE, REAUTH_REQUIRED, LIMIT, ...)
 *   unknown              anything else
 */

export const PASSKEY_ERROR_CODES = Object.freeze([
  "cancelled",
  "no_credential",
  "timeout",
  "already_registered",
  "unsupported",
  "security",
  "busy",
  "aborted",
  "network",
  "server",
  "unknown",
]);

export class PasskeyClientError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code);
    this.name = "PasskeyClientError";
    this.code = PASSKEY_ERROR_CODES.includes(code) ? code : "unknown";
    Object.assign(this, extra);
  }
}

/** Codes a screen should not show as an error (the person chose it, or we did). */
export function isSilentPasskeyError(err) {
  return err?.code === "aborted" || err?.code === "cancelled";
}

const NATIVE_CODES = {
  // Android plugin (DescallPasskeyPlugin.java) and iOS plugin (DescallPasskeyPlugin.swift) reject codes.
  canceled: "cancelled",
  cancelled: "cancelled",
  no_credential: "no_credential",
  timeout: "timeout",
  already_registered: "already_registered",
  unsupported: "unsupported",
  domain: "security",
  security: "security",
  busy: "busy",
  aborted: "aborted",
  // Windows webauthn.dll (desktop/crates/descall-passkey): HRESULT names.
  NotAllowedError: "cancelled",
  NotFound: "no_credential",
  InvalidStateError: "already_registered",
  NotSupportedError: "unsupported",
  TimeoutError: "timeout",
};

/**
 * @param {unknown} err  DOMException, Capacitor plugin error ({ code }), Tauri error string,
 *                       or an HTTP error from api/http.js ({ status, code, body }).
 * @param {object} [ctx] { startedAt, timeoutMs, aborted } to tell a timeout from a cancel.
 */
export function normalizePasskeyError(err, ctx = {}) {
  if (err instanceof PasskeyClientError) return err;
  if (ctx.aborted) return new PasskeyClientError("aborted", "aborted", { cause: err });
  // api/http.js turns 408 / 502 / 503 / 504 and dropped connections into code "transient".
  if (err && typeof err === "object" && err.code === "transient") {
    return new PasskeyClientError("network", err.message, { status: err.status || 0, cause: err });
  }
  // Server answers (api/http.js and api/authedHttp.js errors carry status).
  if (err && typeof err === "object" && Number.isFinite(err.status) && err.status > 0) {
    return new PasskeyClientError("server", err.message, {
      status: err.status,
      serverCode: err.code || err.body?.code || null,
      body: err.body || null,
      credentialId: err.body?.credentialId || null,
      cause: err,
    });
  }
  const name = typeof err === "object" && err ? String(err.name || "") : "";
  const nativeCode = typeof err === "object" && err ? String(err.code || "") : typeof err === "string" ? err : "";
  if (NATIVE_CODES[nativeCode]) return new PasskeyClientError(NATIVE_CODES[nativeCode], String(err?.message || nativeCode), { cause: err });
  switch (name) {
    case "AbortError":
      return new PasskeyClientError(ctx.ownAbort ? "aborted" : "busy", "aborted", { cause: err });
    case "NotAllowedError": {
      // Browsers report cancel, timeout and "no passkey here" all as NotAllowedError.
      const elapsed = ctx.startedAt ? Date.now() - ctx.startedAt : 0;
      const timedOut = ctx.timeoutMs && elapsed >= ctx.timeoutMs - 1500;
      return new PasskeyClientError(timedOut ? "timeout" : "cancelled", String(err.message || name), { cause: err });
    }
    case "InvalidStateError":
      return new PasskeyClientError("already_registered", String(err.message || name), { cause: err });
    case "NotSupportedError":
      return new PasskeyClientError("unsupported", String(err.message || name), { cause: err });
    case "SecurityError":
      return new PasskeyClientError("security", String(err.message || name), { cause: err });
    case "TimeoutError":
      return new PasskeyClientError("timeout", String(err.message || name), { cause: err });
    case "TypeError":
      if (/fetch|network|load failed/i.test(String(err.message || ""))) return new PasskeyClientError("network", err.message, { cause: err });
      break;
    default:
      break;
  }
  if (typeof err === "string" && /cancel/i.test(err)) return new PasskeyClientError("cancelled", err);
  return new PasskeyClientError("unknown", String(err?.message || err || "unknown"), { cause: err });
}

/**
 * i18n key (namespace passkey.err.*) for an error, or null when nothing should be shown.
 * Server codes get their own keys; unknown ones fall back to the generic message.
 */
export function passkeyErrorKey(err) {
  const e = normalizePasskeyError(err);
  if (isSilentPasskeyError(e)) return null;
  if (e.code !== "server") return `passkey.err.${e.code}`;
  const sc = String(e.serverCode || "");
  const known = {
    UV_REQUIRED: "uvRequired",
    UNKNOWN_CREDENTIAL: "unknownCredential",
    CLONED: "suspended",
    SUSPENDED: "suspended",
    PASSKEYS_UNAVAILABLE: "unavailable",
    PASSKEYS_DISABLED: "unavailable",
    REAUTH_REQUIRED: "reauthRequired",
    LIMIT: "limit",
    DUPLICATE: "already_registered",
    HANDOFF_EXPIRED: "handoffExpired",
    HANDOFF_USED: "handoffExpired",
    CHALLENGE_EXPIRED: "timeout",
    BAD_PASSWORD: "badPassword",
    BAD_CODE: "badCode",
    BAD_NAME: "badName",
    SESSION_REQUIRED: "unavailable",
  };
  if (known[sc]) return `passkey.err.${known[sc]}`;
  if (e.status === 429) return "passkey.err.rateLimited";
  return "passkey.err.server";
}
