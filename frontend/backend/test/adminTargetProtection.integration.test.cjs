"use strict";

/**
 * Admin panel: what a section-limited admin may do to whom (security audit, Nov 2026), on the
 * real /api/admin chain with admin 2FA switched on (TOTP columns present, step-up enforced).
 *  - KVKK export (/people/:id/export) carries the private messages the person sent, so it needs
 *    the DM inceleme section (dmReview) and a fresh step-up code, like reading a DM;
 *  - timeout / kick (single, bulk, from a report) never reach admin or owner accounts, the same
 *    rule as the ban and the Moderasyon masası bulk tool;
 *  - signing out sessions and freezing the wallet of an admin or the owner is the owner's call.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const OWNER = "00000000-0000-4000-8000-000000000001";
const MOD = "00000000-0000-4000-8000-000000000002";
const OTHER_ADMIN = "00000000-0000-4000-8000-000000000003";
const KAAN = "00000000-0000-4000-8000-000000000004";
const REPORT = "00000000-0000-4000-8000-0000000000a1";

const totp = { totp_enabled_at: "2026-11-01T00:00:00.000Z", totp_secret_enc: "enc", totp_recovery_hashes: [], totp_last_step: null };
function user(id, username, extra = {}) {
  return { id, username, is_admin: false, active_sessions: [{ id: `s-${username}` }], descoin_balance: 0, ...totp, ...extra };
}

const fake = createFakeSupabase({
  users: [
    user(OWNER, "admin", { is_admin: true, is_super_admin: true }),
    // A moderator-style admin: moderation, people and reports, but not DM inceleme.
    user(MOD, "mod1", { is_admin: true, admin_permissions: ["moderation", "people", "reports"] }),
    user(OTHER_ADMIN, "mod2", { is_admin: true, admin_permissions: ["moderation"] }),
    user(KAAN, "kaan"),
  ],
  dm_messages: [{ id: "m1", from_user_id: KAAN, to_user_id: OWNER, content: "gizli mesaj icerigi", created_at: "2026-11-20T10:00:00.000Z" }],
  user_reports: [{ id: REPORT, reporter_id: KAAN, target_type: "user", target_id: OWNER, target_user_id: OWNER, category: "spam", status: "open", created_at: "2026-11-20T10:00:00.000Z" }],
  admin_audit: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const moderation = require("../lib/moderation");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", { to: () => ({ emit() {} }), emit() {}, in: () => ({ fetchSockets: async () => [] }), fetchSockets: async () => [], sockets: { sockets: new Map(), adapter: { rooms: new Map() } } });
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, as, stepUp = true } = {}) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: as.id, username: as.username, sid: `s-${as.username}` })}` };
  if (stepUp) headers["X-Admin-Step-Up"] = signStepUpToken({ id: as.id, sid: `s-${as.username}` });
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = {};
  try { json = await res.json(); } catch { json = {}; }
  return { status: res.status, body: json, raw: JSON.stringify(json) };
}

const owner = { id: OWNER, username: "admin" };
const mod = { id: MOD, username: "mod1" };
const row = (id) => fake._tables.users.rows.find((u) => u.id === id);

(async () => {
  const { server, base } = await startServer();
  try {
    /* KVKK export: private messages need dmReview + step-up */
    let r = await call(base, "GET", `/api/admin/people/${KAAN}/export`, { as: mod });
    assert(r.status === 403 && r.body.code === "ADMIN_PERMISSION_DENIED", `export without the DM section is refused: ${r.status} ${r.raw.slice(0, 160)}`);
    assert(!r.raw.includes("gizli mesaj"), "no message text leaves without the DM section");
    r = await call(base, "GET", `/api/admin/people/${KAAN}/export`, { as: owner, stepUp: false });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", `export needs a fresh code: ${r.status} ${r.raw.slice(0, 160)}`);
    r = await call(base, "GET", `/api/admin/people/${KAAN}/export`, { as: owner });
    assert(r.status === 200 && r.raw.includes("gizli mesaj"), `owner with a code exports: ${r.status} ${r.raw.slice(0, 160)}`);

    /* timeout / kick never reach admins or the owner */
    r = await call(base, "POST", `/api/admin/users/${OWNER}/timeout`, { as: mod, body: { category: "spam", presetId: "24h" } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", `a moderator cannot time out the owner: ${r.status} ${r.raw.slice(0, 160)}`);
    assert(!moderation.isTimedOut(OWNER), "owner is not timed out");
    r = await call(base, "POST", `/api/admin/users/${OTHER_ADMIN}/timeout`, { as: mod, body: { category: "spam", presetId: "24h" } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", `nor another admin: ${r.status}`);
    r = await call(base, "POST", `/api/admin/reports/${REPORT}/timeout`, { as: mod, body: { presetId: "24h" } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", `nor from a report against the owner: ${r.status} ${r.raw.slice(0, 160)}`);
    assert(!moderation.isTimedOut(OWNER), "owner still not timed out");
    r = await call(base, "POST", `/api/admin/users/${OWNER}/kick`, { as: mod, body: { category: "spam" } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", `a moderator cannot kick the owner: ${r.status}`);
    r = await call(base, "POST", "/api/admin/users/bulk", { as: mod, body: { action: "kick", userIds: [KAAN, OWNER] } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", `bulk kick with the owner in it is refused: ${r.status}`);

    /* sessions and wallet of admins: owner only */
    r = await call(base, "POST", `/api/admin/people/${OWNER}/revoke-sessions`, { as: mod });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", `a moderator cannot sign the owner out: ${r.status} ${r.raw.slice(0, 160)}`);
    assert(row(OWNER).active_sessions.length === 1, "owner sessions kept");
    r = await call(base, "POST", `/api/admin/people/${OWNER}/sessions/s-admin/revoke`, { as: mod });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", `nor end one owner session: ${r.status}`);
    r = await call(base, "POST", `/api/admin/people/${OWNER}/wallet-freeze`, { as: mod, body: { frozen: true, reason: "test" } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", `nor freeze the owner's wallet: ${r.status}`);
    assert(!row(OWNER).descoin_frozen, "owner wallet not frozen");

    /* ordinary members and the owner's own incident response still work */
    r = await call(base, "POST", `/api/admin/users/${KAAN}/timeout`, { as: mod, body: { category: "spam", presetId: "1h" } });
    assert(r.status === 200, `a member can still be timed out: ${r.status} ${r.raw.slice(0, 160)}`);
    r = await call(base, "POST", `/api/admin/people/${OTHER_ADMIN}/revoke-sessions`, { as: owner });
    assert(r.status === 200, `the owner can sign out an admin: ${r.status} ${r.raw.slice(0, 160)}`);
  } finally {
    server.close();
  }
  console.log("admin target protection integration: ok");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
