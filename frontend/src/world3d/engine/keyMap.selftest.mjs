// node src/world3d/engine/keyMap.selftest.mjs
import assert from "node:assert/strict";
import { worldKeyOf } from "./keyMap.js";

assert.equal(worldKeyOf({ code: "KeyW", key: "ц" }), "w", "Russian layout W");
assert.equal(worldKeyOf({ code: "KeyA", key: "ς" }), "a", "Greek layout A");
assert.equal(worldKeyOf({ code: "KeyW", key: "W" }), "w", "shift held");
assert.equal(worldKeyOf({ code: "ShiftRight", key: "Shift" }), "shift");
assert.equal(worldKeyOf({ code: "ArrowLeft", key: "ArrowLeft" }), "arrowleft");
assert.equal(worldKeyOf({ code: "", key: "Escape" }), "escape", "fallback to key");
assert.equal(worldKeyOf({ code: "KeyQ", key: "q" }), "q");
assert.equal(worldKeyOf(null), "");
console.log("keyMap.selftest: ok");
