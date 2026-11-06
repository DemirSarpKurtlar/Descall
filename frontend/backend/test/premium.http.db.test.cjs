"use strict";

/**
 * Descall+ / Ultra end to end: the real Express routes calling the real SQL functions (supabase.rpc
 * is backed by a throwaway Postgres), so argument names, error codes and response shapes are
 * checked against the migration. Covers grant with the first DesCoin gift, idempotent retry, bulk
 * partial failure, user search, premium/me, campaign redeem, the scheduler tick and premium:updated.
 * Skips without PREMIUM_TEST_PG_URL (or PROMO_TEST_PG_URL).
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const pg = require("./premiumPg.cjs");

if (!pg.available()) {
  console.log("premium.http.db.test.cjs: skipped (set PREMIUM_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const ADMIN = "00000000-0000-4000-8000-0000000000aa";
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function run() {
  const db = pg.freshDb("http");
  const one = (sql) => pg.q(db.url, sql);
  const totpOn = { totp_enabled_at: "2026-11-01T00:00:00Z", totp_secret_enc: "enc", totp_recovery_hashes: [] };
  // Auth rows live in the fake (sessions, admin flags); memberships and DesCoin live in Postgres.
  const fake = createFakeSupabase({
    users: [
      { id: ADMIN, username: "admin", is_admin: true, is_super_admin: true, active_sessions: [{ id: "s-a" }], ...totpOn },
      { id: U(1), username: "user1", is_admin: false, active_sessions: [{ id: "s-1" }] },
      { id: U(5), username: "user5", is_admin: false, active_sessions: [{ id: "s-5" }] },
      { id: U(6), username: "user6", is_admin: false, active_sessions: [{ id: "s-6" }] },
    ],
  });
  pg.attachRpc(fake, db.url);
  const supabasePath = require.resolve("../db/supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

  const express = require("express");
  const { signToken, signStepUpToken } = require("../config/jwt");
  const premiumService = require("../lib/premium/service");
  const emitted = [];
  const io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }), emit() {} };

  const app = express();
  app.set("io", io);
  app.use(express.json());
  app.use("/api/admin", require("../routes/admin"));
  app.use("/api/premium", require("../routes/premium"));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ id: ADMIN, username: "admin", sid: "s-a" });
  const stepUp = signStepUpToken({ id: ADMIN, sid: "s-a" });
  const userTok = signToken({ id: U(1), username: "user1", sid: "s-1" });
  const call = async (method, path, { body, token = admin, step = method === "GET" ? null : stepUp } = {}) => {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    if (step) headers["X-Admin-Step-Up"] = step;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const balance = (u) => Number(one(`SELECT descoin_balance FROM users WHERE id = '${u}'`));

  try {
    one(`INSERT INTO users (id, username, display_name, email) VALUES ${[ADMIN, ...Array.from({ length: 12 }, (_, i) => U(i + 1))]
      .map((id, i) => `('${id}', 'user${i}', 'Name ${i}', 'mail${i}@example.org')`).join(", ")};`);

    // grant + first gift, then a retry with the same request id
    const body = { op: "grant", plan: "ultra", days: 30, is_free: true, reason: "test", request_id: "http-req-0001" };
    let r = await call("POST", `/api/admin/premium/users/${U(1)}/apply`, { body });
    assert(r.status === 200 && r.body.subscription.plan_id === "ultra" && r.body.event.kind === "grant", `grant: ${r.status} ${JSON.stringify(r.body)}`);
    assert(balance(U(1)) === 15000, "ultra gift paid at the grant");
    r = await call("POST", `/api/admin/premium/users/${U(1)}/apply`, { body });
    assert(r.status === 200 && r.body.replay === true && balance(U(1)) === 15000, "retry is a no-op");
    r = await call("POST", `/api/admin/premium/users/${U(1)}/apply`, { body: { ...body, request_id: "http-req-0002" } });
    assert(r.status === 409 && r.body.code === "already_active", "one active membership");
    assert(emitted.filter((e) => e.room === `user:${U(1)}` && e.event === "premium:updated").length === 1, "one premium:updated for one change");

    // the member sees it
    r = await call("GET", "/api/premium/me", { token: userTok });
    assert(r.status === 200 && r.body.plan === "ultra" && r.body.monthly_descoin === 15000 && r.body.features.includes("voice_hud"), "premium/me");
    assert(r.body.ends_at && r.body.unlimited === false && r.body.next_coin_at === null, "a 30-day membership gets one gift: the next cycle would start at the end");

    // extend, change, cancel through HTTP
    r = await call("POST", `/api/admin/premium/users/${U(1)}/apply`, { body: { op: "extend", days: 5, reason: "bonus" } });
    assert(r.status === 200 && r.body.event.kind === "extend", "extend");
    r = await call("GET", "/api/premium/me", { token: userTok });
    assert(r.body.next_coin_at !== null, "extended past day 30: a second gift is scheduled");
    r = await call("POST", `/api/admin/premium/users/${U(1)}/apply`, { body: { op: "change_plan", plan: "plus", reason: "downgrade" } });
    assert(r.status === 200 && r.body.subscription.plan_id === "plus", "change plan");
    r = await call("POST", `/api/admin/premium/users/${U(1)}/apply`, { body: { op: "set_unlimited", unlimited: true, reason: "vip" } });
    assert(r.status === 200 && r.body.subscription.unlimited === true && r.body.subscription.ends_at === null, "unlimited");
    r = await call("POST", `/api/admin/premium/users/${U(1)}/apply`, { body: { op: "cancel", reason: "done" } });
    assert(r.status === 200 && r.body.subscription.status === "cancelled", "cancel");
    r = await call("GET", "/api/premium/me", { token: userTok });
    assert(r.body.plan === null && r.body.features.length === 0, "cancelled: no features");

    // bulk partial failure + idempotent retry
    const bulkBody = { user_ids: [U(2), U(3), "00000000-0000-4000-8000-00000000ffff", "bad"], op: "grant", plan: "plus", unlimited: true, is_free: true, reason: "beta", request_id: "http-bulk-0001" };
    r = await call("POST", "/api/admin/premium/bulk", { body: bulkBody });
    assert(r.status === 200 && r.body.batch.total === 4 && r.body.batch.ok === 2 && r.body.batch.failed === 2, `bulk: ${JSON.stringify(r.body.batch)}`);
    const batchId = r.body.batch.id;
    r = await call("POST", "/api/admin/premium/bulk", { body: bulkBody });
    assert(r.body.replay === true && r.body.batch.id === batchId && balance(U(2)) === 5000, "bulk retry does not double-grant");
    r = await call("GET", `/api/admin/premium/bulk/${batchId}`);
    assert(r.status === 200 && r.body.results.length === 3, "batch readable");

    // search, detail, dashboard, analytics
    r = await call("GET", "/api/admin/premium/users/search?q=mail3%40");
    assert(r.status === 200 && r.body.users.length === 1 && r.body.users[0].id === U(3), "search by e-mail");
    assert(r.body.users[0].email_masked === "ma***@e***.org" && !JSON.stringify(r.body).includes("mail3@example.org"), "masked only");
    r = await call("GET", `/api/admin/premium/users/${U(1)}`);
    assert(r.status === 200 && r.body.user.id === U(1) && r.body.events.length >= 5, "user detail with events");
    r = await call("GET", "/api/admin/premium/dashboard");
    assert(r.status === 200 && r.body.active_total === 2 && r.body.active_plus === 2 && r.body.paid_count === null, `dashboard: ${JSON.stringify(r.body)}`);
    r = await call("GET", "/api/admin/premium/analytics?bucket=week");
    assert(r.status === 200 && Array.isArray(r.body.series) && r.body.bucket === "week", "analytics");

    // campaign redeem (campaign rows are written with SQL here; the CRUD route goes through PostgREST)
    one("INSERT INTO premium_campaigns (code, kind, plan_id, duration_days, total_limit) VALUES ('WELCOME7', 'free_membership', 'plus', 7, 1)");
    r = await call("POST", "/api/premium/redeem", { body: { code: "welcome-7" }, token: signToken({ id: U(5), username: "user5", sid: "s-5" }) });
    assert(r.status === 200 && r.body.plan === "plus" && r.body.premium.plan === "plus" && balance(U(5)) === 5000, `redeem: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call("POST", "/api/premium/redeem", { body: { code: "WELCOME7" }, token: signToken({ id: U(6), username: "user6", sid: "s-6" }) });
    assert(r.status === 409 && r.body.code === "limit", "total limit");

    // scheduler tick: expire + pay due cycles, notify the members
    one(`UPDATE user_subscriptions SET ends_at = now() - interval '1 minute', next_coin_at = now() + interval '1 day' WHERE user_id = '${U(5)}'`);
    one(`UPDATE user_subscriptions SET next_coin_at = now() - interval '1 hour' WHERE user_id = '${U(2)}'`);
    emitted.length = 0;
    const tick = await premiumService.runScheduledOnce({ io });
    assert(tick.skipped === false && tick.expire.expired === 1 && tick.coins.cycles === 1, `tick: ${JSON.stringify(tick)}`);
    assert(balance(U(2)) === 10000, "second cycle paid");
    assert(emitted.some((e) => e.room === `user:${U(5)}`) && emitted.some((e) => e.room === `user:${U(2)}`), "members told");
    const again = await premiumService.runScheduledOnce({ io });
    assert(again.coins.cycles === 0 && again.expire.expired === 0, "nothing twice");

    // balances agree with the ledger
    assert(one("SELECT count(*) FROM users u WHERE u.descoin_balance <> (SELECT coalesce(sum(amount), 0) FROM descoin_ledger l WHERE l.user_id = u.id)") === "0", "reconcilable");
  } finally {
    server.close();
    db.drop();
  }
  console.log("premium.http.db.test.cjs: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
