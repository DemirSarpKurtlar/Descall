// node src/lib/chatCacheIdentity.selftest.mjs
// A history refresh keeps the on-screen message objects when nothing changed,
// so memoized bubbles of the open chat do not re-render.
import assert from "node:assert/strict";
import { reconcileHistoryWindow, keepMessageIdentity, sameMessageContent } from "./chatCache.js";

const at = (n) => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();
const msg = (id, n, extra = {}) => ({ id, text: `m${id}`, timestamp: at(n), from: { id: "u1", username: "a" }, reactions: [], ...extra });

const onScreen = [msg("1", 1), msg("2", 2), msg("3", 3)];
// Same rows from the network: new objects, same content.
const fresh = [msg("1", 1), msg("2", 2), msg("3", 3)];
const full = reconcileHistoryWindow(onScreen, fresh);
assert.equal(full, onScreen, "unchanged full page keeps the array");
const inc = reconcileHistoryWindow(onScreen, fresh, { incremental: true });
assert.equal(inc, onScreen, "unchanged incremental page keeps the array");

// One edited row: only that object is new.
const edited = [msg("1", 1), msg("2", 2, { text: "edited" }), msg("3", 3)];
const out = reconcileHistoryWindow(onScreen, edited);
assert.notEqual(out, onScreen);
assert.equal(out[0], onScreen[0]);
assert.notEqual(out[1], onScreen[1]);
assert.equal(out[1].text, "edited");
assert.equal(out[2], onScreen[2]);

// Reaction change is a content change (nested compare).
const reacted = [msg("1", 1, { reactions: [{ emoji: "x", count: 1, users: ["u2"] }] }), msg("2", 2), msg("3", 3)];
const out2 = reconcileHistoryWindow(onScreen, reacted);
assert.notEqual(out2[0], onScreen[0]);
assert.equal(out2[0].reactions.length, 1);

// New message appended: old rows keep identity.
const more = [...fresh, msg("4", 4)];
const out3 = reconcileHistoryWindow(onScreen, more);
assert.equal(out3.length, 4);
assert.equal(out3[2], onScreen[2]);

assert.equal(sameMessageContent({ a: 1 }, { a: 1, b: undefined }), true);
assert.equal(sameMessageContent({ a: 1 }, { a: 1, b: 2 }), false);
assert.equal(keepMessageIdentity([], fresh), fresh);

console.log("chatCacheIdentity.selftest: ok");
