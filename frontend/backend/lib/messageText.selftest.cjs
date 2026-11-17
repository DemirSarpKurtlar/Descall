"use strict";
const assert = require("assert");
const { maxMessageLength, checkText, optionalString } = require("./messageText");

assert.strictEqual(maxMessageLength({}), 2000);
assert.strictEqual(maxMessageLength({ maxMessageLength: 500 }), 500);
assert.strictEqual(maxMessageLength({ maxMessageLength: "x" }), 2000);
assert.deepStrictEqual(checkText(undefined), { ok: true, text: "" });
assert.strictEqual(checkText(undefined, { optional: false }).ok, false);
assert.strictEqual(checkText(123).code, "BAD_TEXT");
assert.strictEqual(checkText({ a: 1 }).code, "BAD_TEXT");
assert.strictEqual(checkText("a".repeat(2001)).code, "TOO_LONG");
assert.strictEqual(checkText(" ".repeat(50) + "a".repeat(10), { max: 20 }).ok, true, "length is measured trimmed");
assert.strictEqual(checkText("merhaba").text, "merhaba");
assert.strictEqual(optionalString(undefined), null);
assert.strictEqual(optionalString(5), false);
assert.strictEqual(optionalString("x"), "x");
console.log("messageText selftest OK");
