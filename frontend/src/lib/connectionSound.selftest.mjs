// Run: node src/lib/connectionSound.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldPlayDisconnectSound } from "./connectionSound.js";

// Idle (chat, background resume, deploy): silent.
for (const reason of ["transport close", "ping timeout", "transport error", "io server disconnect"]) {
  assert.equal(shouldPlayDisconnectSound(reason, false), false, `idle ${reason}`);
  assert.equal(shouldPlayDisconnectSound(reason, true), true, `in voice ${reason}`);
}
// Our own disconnect (sign-out, reconnect with a new token): never.
assert.equal(shouldPlayDisconnectSound("io client disconnect", true), false);
assert.equal(shouldPlayDisconnectSound("io client disconnect", false), false);

// App.jsx goes through the rule (no unconditional play on socket disconnect).
const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const block = app.slice(app.indexOf('socket.on("disconnect"'), app.indexOf('socket.io.on("reconnect_attempt"'));
assert.match(block, /shouldPlayDisconnectSound\(reason, getVoiceBusy\(\)\)/);
assert.doesNotMatch(block, /if \(reason !== "io client disconnect"\) audioManager\.play\("disconnect"\)/);
console.log("connectionSound.selftest ok");
