// Selftest: reply focus registry (A2 §4.5: focus only on "Yanıtla").
import assert from "node:assert/strict";
import { registerComposerInput, getComposerInput, focusComposerForReply } from "./composerFocus.js";

assert.equal(focusComposerForReply(), false, "nothing registered");
const calls = [];
const el = {
  value: "merhaba",
  isConnected: true,
  focus(opts) { calls.push(["focus", opts]); },
  setSelectionRange(a, b) { calls.push(["sel", a, b]); },
};
const off = registerComposerInput(el);
assert.equal(getComposerInput(), el);
assert.equal(focusComposerForReply(), true);
assert.deepEqual(calls, [["focus", { preventScroll: true }], ["sel", 7, 7]]);
el.isConnected = false;
assert.equal(getComposerInput(), null, "detached input is ignored");
el.isConnected = true;
const other = { focus() {}, value: "" };
const off2 = registerComposerInput(other);
off(); // stale unregister must not clear the newer input
assert.equal(getComposerInput(), other);
off2();
assert.equal(getComposerInput(), null);
console.log("composerFocus selftest OK");
