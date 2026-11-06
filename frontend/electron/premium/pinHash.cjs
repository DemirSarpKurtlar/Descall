'use strict';

/**
 * App lock PIN hashing (pure, no electron import so it can be selftested).
 * scrypt with a random 16-byte salt; the record is then encrypted at rest with
 * safeStorage by the caller. Comparison is constant time. Attempts back off.
 */

const crypto = require('crypto');

const PARAMS = { N: 16384, r: 8, p: 1, keylen: 32 };
const PIN_RE = /^\d{4,12}$/;

function validPin(pin) {
  return PIN_RE.test(String(pin || ''));
}

function hashPin(pin, salt = crypto.randomBytes(16), params = PARAMS) {
  if (!validPin(pin)) throw new Error('invalid pin');
  const key = crypto.scryptSync(String(pin), salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: 64 * 1024 * 1024 });
  return { v: 1, salt: Buffer.from(salt).toString('base64'), hash: key.toString('base64'), N: params.N, r: params.r, p: params.p, keylen: params.keylen };
}

function verifyPin(pin, record) {
  if (!record || record.v !== 1 || !validPin(pin)) return false;
  try {
    const salt = Buffer.from(record.salt, 'base64');
    const want = Buffer.from(record.hash, 'base64');
    const got = crypto.scryptSync(String(pin), salt, want.length, { N: record.N, r: record.r, p: record.p, maxmem: 64 * 1024 * 1024 });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch (_) {
    return false;
  }
}

/** Lockout after repeated failures: 5 free tries, then 30 s doubling up to 15 min. */
function lockoutMs(failures) {
  const n = Number(failures) || 0;
  if (n < 5) return 0;
  return Math.min(15 * 60 * 1000, 30 * 1000 * 2 ** (n - 5));
}

module.exports = { hashPin, verifyPin, validPin, lockoutMs, PARAMS };
