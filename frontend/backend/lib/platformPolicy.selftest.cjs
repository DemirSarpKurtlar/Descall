"use strict";
// Run: node lib/platformPolicy.selftest.cjs
// Yönetici Paneli switches must reach every send / signup / group / login path (3.1.3).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const P = require("./platformPolicy");

const base = { chatFrozen: false, slowModeSeconds: 0, rateLimitGlobalMs: 0, maxMessagesPerMinute: 0, dmEnabled: true, groupCreationEnabled: true, registrationEnabled: true, maxLoginAttempts: 5 };
const send = (cfg, extra = {}) => P.checkMessageSend({ config: { ...base, ...cfg }, userId: "u1", kind: "server", ...extra });

// Defaults: everything allowed.
P.resetPlatformPolicyForTests();
for (let i = 0; i < 100; i++) assert.equal(send({}, { now: 1000 + i }).ok, true);

// Freeze: everyone but admins, every kind.
P.resetPlatformPolicyForTests();
for (const kind of ["dm", "group", "server"]) {
  const v = send({ chatFrozen: true }, { kind });
  assert.equal(v.ok, false); assert.equal(v.code, "CHAT_FROZEN");
  assert.equal(send({ chatFrozen: true }, { kind, isAdmin: true }).ok, true);
}

// DMs off: only DMs.
assert.equal(send({ dmEnabled: false }, { kind: "dm" }).code, "DMS_DISABLED");
assert.equal(send({ dmEnabled: false }, { kind: "group", now: 5_000_000 }).ok, true);

// Global slow mode: gap between one user's messages, other users unaffected.
P.resetPlatformPolicyForTests();
assert.equal(send({ slowModeSeconds: 10 }, { now: 0 }).ok, true);
let v = send({ slowModeSeconds: 10 }, { now: 4000 });
assert.equal(v.code, "SLOW_MODE"); assert.equal(v.retryAfterMs, 6000); assert.match(v.message, /6 saniye/);
assert.equal(send({ slowModeSeconds: 10 }, { now: 4000, userId: "u2" }).ok, true);
assert.equal(send({ slowModeSeconds: 10 }, { now: 10_001 }).ok, true);

// rateLimitGlobalMs: same idea in ms.
P.resetPlatformPolicyForTests();
assert.equal(send({ rateLimitGlobalMs: 500 }, { now: 0 }).ok, true);
assert.equal(send({ rateLimitGlobalMs: 500 }, { now: 200 }).code, "RATE_LIMITED");
assert.equal(send({ rateLimitGlobalMs: 500 }, { now: 600 }).ok, true);

// Per-minute cap over a rolling window; blocked attempts do not count.
P.resetPlatformPolicyForTests();
for (let i = 0; i < 5; i++) assert.equal(send({ maxMessagesPerMinute: 5 }, { now: i * 1000 }).ok, true);
v = send({ maxMessagesPerMinute: 5 }, { now: 5000 });
assert.equal(v.code, "RATE_LIMITED"); assert.equal(v.retryAfterMs, 55_000);
assert.equal(send({ maxMessagesPerMinute: 5 }, { now: 60_001 }).ok, true, "oldest send left the window");

// Groups, signups, login attempts.
assert.equal(P.checkGroupCreate({ config: { ...base, groupCreationEnabled: false } }).code, "GROUPS_DISABLED");
assert.equal(P.checkGroupCreate({ config: { ...base, groupCreationEnabled: false }, isAdmin: true }).ok, true);
assert.equal(P.checkRegistration({ config: { ...base, registrationEnabled: false } }).code, "REGISTRATION_CLOSED");
assert.equal(P.checkRegistration({ config: base }).ok, true);
assert.equal(P.loginAttemptsPerMinute({ maxLoginAttempts: 3 }), 3);
assert.equal(P.loginAttemptsPerMinute({}), 5);
assert.equal(P.loginAttemptsPerMinute({ maxLoginAttempts: 9999 }), 50);
assert.equal(P.isPlatformAdmin({ user: { username: "admin" } }), true);
assert.equal(P.isPlatformAdmin({ user: { is_admin: true } }), true);
assert.equal(P.isPlatformAdmin({ user: { username: "x" } }), false);

// Wiring: every path asks the policy.
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
assert.match(read("socket/handlers.js"), /checkMessageSend\(\{ config: systemConfig, userId: myId, [^}]*kind: "dm"/);
assert.match(read("socket/groupHandlers.js"), /checkMessageSend\(\{ config: systemConfig, userId: myId, [^}]*kind: "group"/);
assert.match(read("socket/serverChannelHandlers.js"), /checkMessageSend\(\{ config: systemConfig, userId: myId, [^}]*kind: "server"/);
const auth = read("routes/auth.js");
assert.equal((auth.match(/platformPolicy\.checkRegistration\(/g) || []).length, 3, "password, Google and Apple signups");
assert.match(auth, /platformPolicy\.loginAttemptsPerMinute\(systemConfig\)/);
assert.match(auth, /if \(minuteKey\) recordFailure\(minuteKey, perMinute\);/);
assert.match(read("routes/groups.js"), /checkGroupCreate\(\{ config: systemConfig/);
console.log("platformPolicy.selftest ok");
