// node src/lib/typingFlare.selftest.mjs
import assert from "node:assert/strict";
import { typingFlareKey } from "./typingFlare.js";

const flare = (k) => ({ equippedTypingFlare: { effect_key: k } });
const peer = { id: "p", username: "ayse", ...flare("s2-lanterns") };
assert.equal(typingFlareKey({ typers: [{ id: "p", username: "ayse" }], activeDmUser: peer }), "s2-lanterns", "DM: the typing peer's flare");
assert.equal(typingFlareKey({ typers: [] , activeDmUser: peer }), null, "nobody typing");
assert.equal(typingFlareKey({ typers: [{ id: "x" }], activeDmUser: peer }), null, "a different typer never borrows the peer's flare");
assert.equal(typingFlareKey({ typers: [{ id: "f" }], friends: [{ id: "f", ...flare("s2-comet") }] }), "s2-comet", "group: friend's flare");
assert.equal(typingFlareKey({ typers: [{ id: "f", ...flare("s2-rain") }], friends: [{ id: "f", ...flare("s2-comet") }] }), "s2-rain", "payload wins");
assert.equal(typingFlareKey({ typers: [{ id: "u" }], friends: [] }), null, "unknown typer: default dots");
console.log("[typingFlare] ok");
