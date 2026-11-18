"use strict";

/** middleware/adminSecondFactor.js: a failed TOTP lookup never skips the step-up code (polish admin-b-05). */

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

const assert = require("assert");
const twoFactor = require("../lib/twoFactorService");
const { requireAdmin2fa, requireStepUp } = require("../middleware/adminSecondFactor");

function res() {
  return {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

async function run(method, loadTotp) {
  twoFactor.loadTotp = loadTotp;
  const req = { method, path: "/system/switches", user: { id: "u1", sid: "s1" }, headers: {}, get: () => undefined };
  const r = res();
  let passed = false;
  await requireAdmin2fa(req, r, () => {
    requireStepUp(req, r, () => {
      passed = true;
    });
  });
  return { passed, status: r.statusCode, code: r.body?.code };
}

(async () => {
  const boom = async () => {
    throw new Error("connection reset");
  };
  let out = await run("PATCH", boom);
  assert.equal(out.passed, false, "a write is not let through on a lookup error");
  assert.equal(out.status, 503);
  assert.equal(out.code, "ADMIN_2FA_CHECK_FAILED");
  out = await run("GET", boom);
  assert.equal(out.passed, true, "reads continue during a lookup error");

  out = await run("PATCH", async () => null);
  assert.equal(out.passed, true, "migration not applied: enforcement stands down as before");

  out = await run("PATCH", async () => ({ totp_enabled_at: "2026-01-01", totp_secret_enc: "x" }));
  assert.equal(out.passed, false);
  assert.equal(out.code, "STEP_UP_REQUIRED", "TOTP on: a write needs the code");

  out = await run("PATCH", async () => ({ totp_enabled_at: null, totp_secret_enc: null }));
  assert.equal(out.code, "ADMIN_2FA_REQUIRED", "TOTP off: the panel asks for setup");
  console.log("adminSecondFactor.unit: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
