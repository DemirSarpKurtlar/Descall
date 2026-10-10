import assert from "node:assert/strict";
import {
  DEVICE_SIGNUP_BLOCK_MESSAGE,
  MIN_AGE,
  UNDER13_BLOCK_MS,
  ageFromBirthDate,
  noteUnder13BirthDate,
  under13SignupBlocked,
} from "./age.js";

const mem = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

const now = Date.parse("2026-10-10T12:00:00Z");
const storage = mem();
assert.equal(under13SignupBlocked(storage, now), false);
assert.equal(noteUnder13BirthDate("2015-01-01", storage, now), true);
assert.equal(ageFromBirthDate("2015-01-01", new Date(now)) < MIN_AGE, true);
assert.equal(under13SignupBlocked(storage, now), true);
assert.equal(noteUnder13BirthDate("2000-01-01", storage, now), true);
assert.equal(under13SignupBlocked(storage, now + UNDER13_BLOCK_MS + 1000), false);
assert.match(DEVICE_SIGNUP_BLOCK_MESSAGE, /can't create an account/i);

const fresh = mem();
assert.equal(noteUnder13BirthDate("2000-01-01", fresh, now), false);
assert.equal(under13SignupBlocked(fresh, now), false);

console.log("age.selftest ok");
