// Selftest: a rejected socket session shows a translated sign-in line, never the
// server's English text. Owner report Nov 2026 (Windows app sign-in screen):
// "Authentication failed: token has expired."
import assert from "node:assert/strict";
import fs from "node:fs";
import { socketAuthFailureKind, socketAuthFailureKey } from "./socketAuthError.js";

// Every message backend/middleware/socketAuth.js sends (ban ones are handled earlier).
assert.equal(socketAuthFailureKind("Authentication failed: token has expired."), "expired");
assert.equal(socketAuthFailureKind("Authentication failed: invalid token."), "ended");
assert.equal(socketAuthFailureKind("Authentication failed: session has been signed out."), "ended");
assert.equal(socketAuthFailureKind("Authentication failed: two-factor verification required."), "ended");
assert.equal(socketAuthFailureKind("Authentication required"), "ended");
assert.equal(socketAuthFailureKind("Authentication failed: session check failed."), "transient");
assert.equal(socketAuthFailureKind("xhr poll error"), null);
assert.equal(socketAuthFailureKind("websocket error"), null);
assert.equal(socketAuthFailureKind(undefined), null);

assert.equal(socketAuthFailureKey("expired"), "core.app.sessionExpired");
assert.equal(socketAuthFailureKey("ended"), "core.app.sessionSignedOut");
assert.equal(socketAuthFailureKey("transient"), "core.app.socketAuthFailed");

// The keys exist in all 7 locales.
const loc = (f) => fs.readFileSync(new URL(`../i18n/locales/${f}`, import.meta.url), "utf8");
for (const f of ["core.tr.js", "core.en.js", "de.js", "es.js", "fr.js", "pt-BR.js", "ru.js"]) {
  const src = loc(f);
  assert.match(src, /"?sessionExpired"?:\s*"[^"]+"/, `${f}: sessionExpired`);
  assert.match(src, /"?sessionSignedOut"?:\s*"[^"]+"/, `${f}: sessionSignedOut`);
}

// App wiring: the connect_error handler never puts error.message on screen and
// signs out on a rejected session before any transport retry.
const app = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const start = app.indexOf('socket.on("connect_error"');
const handler = app.slice(start, app.indexOf('socket.on("connected"', start));
assert.ok(start > 0 && handler.length > 0, "connect_error handler found");
assert.doesNotMatch(handler, /setAuthError\(\s*error\?\.message/, "no raw server text on the sign-in screen");
assert.ok(handler.indexOf("socketAuthFailureKind(msg)") < handler.indexOf("retryPollingFirst"), "a rejected session signs out before transport retries");

console.log("socketAuthError selftest ok");
