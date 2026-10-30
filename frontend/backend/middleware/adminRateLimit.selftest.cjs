"use strict";
// Run: node middleware/adminRateLimit.selftest.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resetLimits } = require("../lib/rateLimit");
const { adminRateLimit, LIMITS } = require("./adminRateLimit");

function call(method, userId = "a1") {
  let status = 200; let passed = false; const headers = {};
  const res = { set(k, v) { headers[k] = v; return res; }, status(c) { status = c; return res; }, json() { return res; } };
  adminRateLimit({ method, user: { id: userId } }, res, () => { passed = true; });
  return { passed, status, headers };
}

resetLimits();
for (let i = 0; i < LIMITS.write.max; i++) assert.equal(call("POST").passed, true, `write ${i}`);
const blocked = call("DELETE");
assert.equal(blocked.passed, false);
assert.equal(blocked.status, 429);
assert.ok(Number(blocked.headers["Retry-After"]) >= 1);
assert.equal(call("GET").passed, true, "reads have their own budget");
assert.equal(call("POST", "a2").passed, true, "per admin, not global");
for (let i = 0; i < LIMITS.read.max; i++) call("GET", "a3");
assert.equal(call("GET", "a3").status, 429);
assert.equal(LIMITS.write.max, 60);
assert.match(fs.readFileSync(path.join(__dirname, "../routes/admin.js"), "utf8"), /router\.use\(requireAuth, requireAdmin, adminRateLimit\);/);
resetLimits();
console.log("adminRateLimit.selftest ok");
