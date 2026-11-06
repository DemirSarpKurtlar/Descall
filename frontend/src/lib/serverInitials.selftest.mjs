import assert from "node:assert/strict";
import { serverInitials, serverColor } from "./serverInitials.js";

assert.equal(serverInitials("Sunucu 1"), "S1");
assert.equal(serverInitials("Sunucu 10"), "S10");
assert.equal(serverInitials("Sunucu 11"), "S11");
assert.notEqual(serverInitials("Sunucu 1"), serverInitials("Sunucu 10"));
assert.equal(serverInitials("Büyük Sunucu"), "BS");
assert.equal(serverInitials("istanbul ekibi"), "İE");
assert.equal(serverInitials("oyun"), "O");
assert.equal(serverInitials("2024"), "202");
assert.equal(serverInitials(""), "?");
assert.equal(serverInitials(null), "?");
assert.equal(serverColor({ id: "a" }), serverColor({ id: "a", name: "x" }));
assert.match(serverColor({ id: "b" }), /^#[0-9A-F]{6}$/i);

console.log("serverInitials.selftest ok");
