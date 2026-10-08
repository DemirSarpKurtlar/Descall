"use strict";
const assert = require("node:assert/strict");
const { maskWithList, compileWordList, maskProfanity } = require("./profanity");

const list = compileWordList(["fuck*", "göt", "siktir*", "amk"]);
assert.equal(maskWithList("what the FUCK man", list), "what the *** man");
assert.equal(maskWithList("fucking hell", list), "*** hell");
assert.equal(maskWithList("SİKTİR git", list), "*** git");
assert.equal(maskWithList("amk.", list), "***.");
// Whole-word match only for non-prefix entries: "götürmek" (to carry) stays.
assert.equal(maskWithList("götürmek göt", list), "götürmek ***");
assert.equal(maskWithList("hello world", list), "hello world");
assert.equal(maskWithList("", list), "");
assert.equal(maskWithList(null, list), null);
// Built-in list + admin words from state
const fakeState = { profanityWords: new Set(["custombad"]) };
assert.equal(maskProfanity("a custombad b shit", fakeState), "a *** b ***");
assert.equal(maskProfanity("sıkıntı yok, mükemmel", fakeState), "sıkıntı yok, mükemmel");
console.log("profanity selftest ok");
