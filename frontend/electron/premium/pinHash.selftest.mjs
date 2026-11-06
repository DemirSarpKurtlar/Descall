// PIN hash / verify selftest for the app lock. Run: node electron/premium/pinHash.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { hashPin, verifyPin, validPin, lockoutMs } = require("./pinHash.cjs");

assert.equal(validPin("1234"), true);
assert.equal(validPin("123"), false);
assert.equal(validPin("12a4"), false);
assert.equal(validPin("1234567890123"), false);
assert.throws(() => hashPin("12"));

const rec = hashPin("482913");
assert.equal(rec.v, 1);
assert.notEqual(rec.hash, "482913");
assert.ok(!JSON.stringify(rec).includes("482913"), "PIN never stored in clear");
assert.equal(Buffer.from(rec.salt, "base64").length, 16);
assert.equal(verifyPin("482913", rec), true);
assert.equal(verifyPin("482914", rec), false);
assert.equal(verifyPin("", rec), false);
assert.equal(verifyPin("482913", null), false);
assert.equal(verifyPin("482913", { ...rec, hash: Buffer.alloc(32).toString("base64") }), false);

// Same PIN, new salt: different hash (no rainbow tables).
const rec2 = hashPin("482913");
assert.notEqual(rec2.salt, rec.salt);
assert.notEqual(rec2.hash, rec.hash);
assert.equal(verifyPin("482913", rec2), true);

// Same salt reproduces the hash.
const rec3 = hashPin("482913", Buffer.from(rec.salt, "base64"));
assert.equal(rec3.hash, rec.hash);

assert.equal(lockoutMs(0), 0);
assert.equal(lockoutMs(4), 0);
assert.equal(lockoutMs(5), 30_000);
assert.equal(lockoutMs(6), 60_000);
assert.equal(lockoutMs(30), 15 * 60_000);

console.log("pinHash selftest: ok");
