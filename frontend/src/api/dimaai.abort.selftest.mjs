/**
 * Selftest: Stop/abort must never be classified as a network failure.
 * Run: node src/api/dimaai.abort.selftest.mjs
 */
import assert from "node:assert/strict";

// Inline the helper (mirrors src/api/dimaai.js) so this stays dependency-free.
function isDimaAbortError(err, signal) {
  if (signal?.aborted) return true;
  if (!err) return false;
  if (err.name === "AbortError" || err.code === "aborted") return true;
  const msg = String(err.message || "");
  return /the user aborted a request/i.test(msg);
}

const aborted = { aborted: true };
const live = { aborted: false };

assert.equal(isDimaAbortError(new Error("Failed to fetch"), aborted), true);
assert.equal(isDimaAbortError(new Error("Failed to fetch"), live), false);
assert.equal(isDimaAbortError(new Error("Failed to fetch"), undefined), false);

const ae = new Error("aborted");
ae.name = "AbortError";
assert.equal(isDimaAbortError(ae, live), true);
assert.equal(isDimaAbortError(ae, aborted), true);

const q = new Error("Dima is at capacity");
q.code = "quota";
assert.equal(isDimaAbortError(q, live), false);

assert.equal(isDimaAbortError({ name: "AbortError" }, null), true);
assert.equal(isDimaAbortError({ code: "aborted" }, null), true);

console.log("dimaai.abort.selftest: ok");
