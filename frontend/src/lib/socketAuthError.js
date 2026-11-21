/**
 * Socket.IO connect_error messages from backend/middleware/socketAuth.js are
 * English server text ("Authentication failed: token has expired."). They are
 * never shown as is: the app maps them to a kind and shows its own translated
 * line on the sign-in screen.
 *
 * - "expired":   the session token ran out; sign in again.
 * - "ended":     the session was signed out, the token is invalid, or 2FA is
 *                still pending; sign in again.
 * - "transient": the server could not check the session right now (database
 *                hiccup); worth a retry before giving up.
 * - null:        not an authentication error (network, transport, edge).
 *
 * Ban / blocked messages are handled before this by isBanSocketMessage.
 */
export function socketAuthFailureKind(message) {
  const m = String(message || "").toLowerCase();
  if (!/authentication (failed|required)/.test(m)) return null;
  if (/session check failed/.test(m)) return "transient";
  if (/expired/.test(m)) return "expired";
  return "ended";
}

/** i18n key for the sign-in screen line of a final authentication failure. */
export function socketAuthFailureKey(kind) {
  if (kind === "expired") return "core.app.sessionExpired";
  if (kind === "ended") return "core.app.sessionSignedOut";
  return "core.app.socketAuthFailed";
}
