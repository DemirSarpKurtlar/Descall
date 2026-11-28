"use strict";
const assert = require("node:assert/strict");
const { mentionText } = require("./mentionText");

assert.equal(mentionText({ username: "ece", display_name: "Ece" }), "@ece");
assert.equal(mentionText({ username: "Demir_42" }), "@Demir_42");
// Not mentionable: the display name, never a raw id
assert.equal(mentionText({ username: "a", display_name: "A" }), "A");
assert.equal(mentionText({ username: "ali veli", display_name: "Ali" }), "Ali");
assert.equal(mentionText({ username: "x".repeat(33), display_name: "Uzun" }), "Uzun");
assert.equal(mentionText({}), "@user");
assert.equal(mentionText(null), "@user");
for (const u of [{ username: "ece" }, { display_name: "Ece" }, {}]) assert.ok(!mentionText(u).includes("<@"));
console.log("mentionText selftest ok");
