"use strict";
// Run: node lib/totp.selftest.cjs
const assert = require("node:assert/strict");
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-totp-selftest-only-0123456789";
const T = require("./totp");

// RFC 6238 Appendix B (SHA1, seed "12345678901234567890"), last 6 digits.
const rfcSecret = T.base32Encode(Buffer.from("12345678901234567890"));
for (const [t, code] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]]) {
  assert.equal(T.hotp(rfcSecret, Math.floor(t / 30)), code, `RFC vector t=${t}`);
}
// RFC 4226 HOTP vectors 0..2.
assert.deepEqual([0, 1, 2].map((c) => T.hotp(rfcSecret, c)), ["755224", "287082", "359152"]);

// Base32 round trip.
const raw = Buffer.from([0, 1, 2, 250, 255, 128, 7]);
assert.deepEqual(T.base32Decode(T.base32Encode(raw)), raw);
assert.equal(T.generateSecret().length, 32);

// verifyTotp: ±1 step drift, replay refused, bad format.
const s = T.generateSecret();
const now = 1_700_000_000_000;
const c = T.counterAt(now);
assert.deepEqual(T.verifyTotp(s, T.hotp(s, c), { now }), { ok: true, counter: c });
assert.equal(T.verifyTotp(s, T.hotp(s, c - 1), { now }).ok, true, "previous step accepted");
assert.equal(T.verifyTotp(s, T.hotp(s, c + 1), { now }).ok, true, "next step accepted");
assert.equal(T.verifyTotp(s, T.hotp(s, c - 2), { now }).ok, false, "two steps old refused");
assert.deepEqual(T.verifyTotp(s, T.hotp(s, c), { now, lastCounter: c }), { ok: false, reason: "replay" });
assert.equal(T.verifyTotp(s, "12345", { now }).reason, "format");
assert.equal(T.verifyTotp(s, " 123 456 ", { now }).reason === "format", false, "spaces are ignored");

// otpauth URI.
assert.match(T.otpauthUri("ABCD", "demir"), /^otpauth:\/\/totp\/Descall%3Ademir\?secret=ABCD&issuer=Descall&algorithm=SHA1&digits=6&period=30$/);

// Encryption round trip; tampering detected; ciphertext never contains the secret.
const blob = T.encryptSecret(s);
assert.ok(!blob.includes(s));
assert.equal(T.decryptSecret(blob), s);
const parts = blob.split(":"); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
assert.throws(() => T.decryptSecret(parts.join(":")));
assert.notEqual(T.encryptSecret(s), blob, "fresh IV each time");

// Recovery codes: 10, unique, format, match once by hash.
const codes = T.generateRecoveryCodes();
assert.equal(codes.length, 10);
assert.equal(new Set(codes).size, 10);
for (const r of codes) assert.match(r, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
const hashes = codes.map(T.hashRecovery);
assert.equal(T.matchRecovery(codes[3].toUpperCase().replace("-", " "), hashes), 3, "case / separator tolerant");
assert.equal(T.matchRecovery("aaaaa-bbbbb", hashes), -1);
assert.equal(T.matchRecovery("short", hashes), -1);
console.log("totp.selftest ok");
