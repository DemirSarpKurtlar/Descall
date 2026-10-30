"use strict";
// Run: node lib/twoFactorService.selftest.cjs
// Authenticator two-factor (3.2.0): setup → enable → verify (replay-safe) →
// recovery codes single-use → disable; admin gate + step-up middleware.
process.env.JWT_SECRET = process.env.JWT_SECRET || "selftest-jwt-secret-0123456789abcdef0123456789";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const totp = require("./totp");
const svc = require("./twoFactorService");

// Minimal supabase-js stand-in over one users table (enough for this module).
function fakeDb(rows) {
  function query() {
    const filters = [];
    let patch = null;
    const api = {
      select() { return api; },
      update(p) { patch = p; return api; },
      eq(k, v) { filters.push((r) => r[k] === v); return api; },
      is(k, v) { filters.push((r) => (r[k] ?? null) === v); return api; },
      contains(k, arr) { filters.push((r) => arr.every((x) => (r[k] || []).includes(x))); return api; },
      maybeSingle() { const r = rows.find((x) => filters.every((f) => f(x))); return Promise.resolve({ data: r ? { ...r } : null, error: null }); },
      then(resolve, reject) {
        const hit = rows.filter((x) => filters.every((f) => f(x)));
        if (patch) hit.forEach((r) => Object.assign(r, patch));
        return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(resolve, reject);
      },
    };
    return api;
  }
  return { from() { return query(); } };
}

(async () => {
  const user = { id: "u1", username: "demir", totp_secret_enc: null, totp_pending_enc: null, totp_pending_at: null, totp_enabled_at: null, totp_last_counter: null, totp_recovery_hashes: [], two_factor_enabled: false };
  svc.__setDbForTests(fakeDb([user]));

  assert.equal(svc.methodFor(user, await svc.loadTotp("u1")), null);
  assert.equal(svc.methodFor({ two_factor_enabled: true, email: "a@b.c", email_confirmed_at: "x" }, null), "email");

  // Setup + enable.
  const { secret, uri } = await svc.beginSetup("u1", "demir");
  assert.match(uri, /^otpauth:\/\/totp\/Descall%3Ademir\?secret=/);
  assert.ok(user.totp_pending_enc && !user.totp_pending_enc.includes(secret), "pending secret stored encrypted");
  const now = Date.now();
  assert.equal((await svc.confirmSetup("u1", "000000", { now })).ok, false);
  const ok = await svc.confirmSetup("u1", totp.hotp(secret, totp.counterAt(now)), { now });
  assert.equal(ok.ok, true);
  assert.equal(ok.recoveryCodes.length, 10);
  assert.ok(user.totp_enabled_at && user.two_factor_enabled === true && user.totp_pending_enc === null);
  assert.equal(svc.methodFor(user, user), "totp", "authenticator wins over e-mail");

  // Setup expires after 15 min.
  const u2 = { id: "u2", totp_enabled_at: null, totp_pending_enc: totp.encryptSecret(secret), totp_pending_at: new Date(now - 16 * 60 * 1000).toISOString(), totp_recovery_hashes: [] };
  svc.__setDbForTests(fakeDb([u2]));
  assert.equal((await svc.confirmSetup("u2", totp.hotp(secret, totp.counterAt(now)), { now })).reason, "expired");
  svc.__setDbForTests(fakeDb([user]));

  // Same code never works twice (the enabling code is already burnt).
  const later = now + 30_000;
  const code = totp.hotp(secret, totp.counterAt(later));
  assert.equal((await svc.verifySecondFactor("u1", code, { now: later })).ok, true);
  assert.equal((await svc.verifySecondFactor("u1", code, { now: later })).reason, "replay");

  // Recovery codes: single use, count goes down.
  const rc = ok.recoveryCodes[0];
  const r1 = await svc.verifySecondFactor("u1", rc.toUpperCase());
  assert.deepEqual([r1.ok, r1.via, r1.recoveryLeft], [true, "recovery", 9]);
  assert.equal((await svc.verifySecondFactor("u1", rc)).ok, false, "recovery code burnt");
  assert.equal((await svc.verifySecondFactor("u1", ok.recoveryCodes[1], { allowRecovery: false })).ok, false);

  // Regenerate replaces the set.
  const fresh = await svc.regenerateRecovery("u1");
  assert.equal(user.totp_recovery_hashes.length, 10);
  assert.equal((await svc.verifySecondFactor("u1", ok.recoveryCodes[2])).ok, false, "old set invalid");
  assert.equal((await svc.verifySecondFactor("u1", fresh[0])).ok, true);

  // Disable clears everything.
  await svc.disableTotp("u1");
  assert.equal(user.totp_enabled_at, null); assert.equal(user.totp_secret_enc, null); assert.equal(user.two_factor_enabled, false);
  assert.equal((await svc.verifySecondFactor("u1", "123456")).reason, "not_enabled");

  // Migration not applied: loadTotp → null (e-mail method only).
  svc.__setDbForTests({ from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: null, error: { code: "42703", message: "column users.totp_secret_enc does not exist" } }); } }; } });
  assert.equal(await svc.loadTotp("u1"), null);

  // Admin middleware: 2FA required, step-up for changes.
  const mw = require("../middleware/adminSecondFactor");
  const { signStepUpToken, signToken } = require("../config/jwt");
  const run = async (fn, req) => { let status = 200; let body = null; let passed = false; const res = { status(c) { status = c; return res; }, json(b) { body = b; return res; }, set() { return res; } }; await fn(req, res, () => { passed = true; }); return { status, body, passed }; };
  const admin = { id: "a1", username: "admin", totp_secret_enc: null, totp_enabled_at: null, totp_recovery_hashes: [] };
  svc.__setDbForTests(fakeDb([admin]));
  let r = await run(mw.requireAdmin2fa, { user: { id: "a1", sid: "s1" } });
  assert.deepEqual([r.status, r.body.code], [403, "ADMIN_2FA_REQUIRED"]);
  admin.totp_secret_enc = totp.encryptSecret(secret); admin.totp_enabled_at = new Date().toISOString();
  const req = { user: { id: "a1", sid: "s1" }, method: "POST", path: "/users/bulk", headers: {} };
  r = await run(mw.requireAdmin2fa, req);
  assert.equal(r.passed, true);
  r = await run(mw.requireStepUp, req);
  assert.deepEqual([r.status, r.body.code], [403, "STEP_UP_REQUIRED"]);
  assert.equal((await run(mw.requireStepUp, { ...req, method: "GET" })).passed, true, "reads need no step-up");
  assert.equal((await run(mw.requireStepUp, { ...req, path: "/step-up" })).passed, true);
  const good = signStepUpToken({ id: "a1", sid: "s1" });
  assert.equal((await run(mw.requireStepUp, { ...req, headers: { "x-admin-step-up": good } })).passed, true);
  assert.equal((await run(mw.requireStepUp, { ...req, headers: { "x-admin-step-up": signStepUpToken({ id: "a1", sid: "other" }) } })).passed, false, "bound to the session");
  assert.equal((await run(mw.requireStepUp, { ...req, headers: { "x-admin-step-up": signToken({ id: "a1", username: "admin", sid: "s1" }) } })).passed, false, "a login token is not a step-up token");

  // Step-up handler: right code → token; wrong → 400.
  const sc = totp.hotp(secret, totp.counterAt(Date.now()));
  r = await run(mw.stepUpHandler, { user: { id: "a1", sid: "s1" }, body: { code: "000000" } });
  assert.equal(r.status, 400);
  r = await run(mw.stepUpHandler, { user: { id: "a1", sid: "s1" }, body: { code: sc } });
  assert.equal(r.body.ok, true);
  assert.equal((await run(mw.requireStepUp, { ...req, headers: { "x-admin-step-up": r.body.token } })).passed, true);

  // A step-up token is never a session token.
  const authSrc = fs.readFileSync(path.join(__dirname, "../middleware/auth.js"), "utf8");
  assert.match(authSrc, /decoded\.pending2fa \|\| decoded\.stepUp/);
  assert.match(fs.readFileSync(path.join(__dirname, "../middleware/socketAuth.js"), "utf8"), /decoded\.pending2fa \|\| decoded\.stepUp/);
  // Wiring: every sign-in path goes through the gate; admin routers use the checks.
  const auth = fs.readFileSync(path.join(__dirname, "../routes/auth.js"), "utf8");
  assert.equal((auth.match(/await secondFactorGate\(res, user\)/g) || []).length, 3, "password, Google, Apple");
  assert.match(auth, /twoFactor\.verifySecondFactor\(user\.id, code, \{ row: totpRow \}\)/);
  assert.match(fs.readFileSync(path.join(__dirname, "../routes/admin.js"), "utf8"), /router\.use\(requireAuth, requireAdmin, adminRateLimit, requireAdmin2fa\);[\s\S]*router\.post\("\/step-up", stepUpHandler\);\nrouter\.use\(requireStepUp\);/);
  for (const f of ["adminAntibot.js", "legacyFeedbackAdmin.js", "errors.js"]) {
    assert.match(fs.readFileSync(path.join(__dirname, "../routes", f), "utf8"), /requireAdmin2fa, requireStepUp/, f);
  }
  console.log("twoFactorService.selftest ok");
})().catch((e) => { console.error(e); process.exit(1); });
