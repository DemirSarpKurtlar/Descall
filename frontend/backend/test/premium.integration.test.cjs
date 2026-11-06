"use strict";

/**
 * Descall+ / Ultra HTTP layer with a stubbed database: who may call what (401 / 403 for users and
 * for admins without the "premium" section), admin step-up on every write, refused attempts logged,
 * admin audit entries, premium:updated socket events, response whitelists (masked e-mail only,
 * no prices, revenue null) and the redeem rate limit. The SQL itself is covered by
 * premium.db.test.cjs (and premium.http.db.test.cjs) on a real Postgres.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const UID = "00000000-0000-4000-8000-000000000001";
const supabasePath = require.resolve("../db/supabase");
const totpOn = { totp_enabled_at: "2026-11-01T00:00:00Z", totp_secret_enc: "enc", totp_last_counter: null, totp_recovery_hashes: [] };
const fake = createFakeSupabase({
  users: [
    { id: "u-admin", username: "demir", is_admin: true, admin_permissions: ["premium"], active_sessions: [{ id: "s-a" }], ...totpOn },
    { id: "u-legacy", username: "eski", is_admin: true, admin_permissions: null, active_sessions: [{ id: "s-l" }], ...totpOn },
    { id: "u-user", username: "ayse", is_admin: false, active_sessions: [{ id: "s-u" }] },
    { id: UID, username: "zeynep", is_admin: false, active_sessions: [{ id: "s-z" }] },
  ],
  premium_plans: [
    { id: "plus", name: "Descall+", description: null, features: [], status: "active", visible: true, monthly_descoin: 5000, price_minor: null, currency: null, sort: 10 },
    { id: "ultra", name: "Descall Ultra", description: null, features: [], status: "active", visible: true, monthly_descoin: 15000, price_minor: null, currency: null, sort: 20 },
    { id: "old", name: "Old", description: null, features: [], status: "archived", visible: false, monthly_descoin: 0, price_minor: null, currency: null, sort: 30 },
  ],
  admin_audit: [],
});
const calls = [];
const next = {};
fake.rpc = async (name, args) => {
  calls.push({ name, args });
  const r = next[name];
  if (r instanceof Error) return { data: null, error: { message: r.message } };
  return { data: typeof r === "function" ? r(args) : r ?? null, error: null };
};
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const state = require("../runtime/sharedState");
const adminRouter = require("../routes/admin");
const premiumRouter = require("../routes/premium");

const emitted = [];
const io = {
  emit: (event, payload) => emitted.push({ room: "*", event, payload }),
  to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
};

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function call(base, method, path, { body, token, stepUp } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (stepUp) headers["X-Admin-Step-Up"] = stepUp;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
}

const ENDPOINTS = [
  ["GET", "/plans"], ["PATCH", "/plans/plus"], ["GET", "/users/search?q=ze"], ["GET", `/users/${UID}`],
  ["POST", `/users/${UID}/apply`], ["POST", "/bulk"], ["GET", `/bulk/${UID}`], ["GET", "/events"],
  ["GET", "/dashboard"], ["GET", "/analytics"], ["GET", "/finance"], ["GET", "/audit"],
  ["GET", "/campaigns"], ["POST", "/campaigns"], ["PATCH", `/campaigns/${UID}`], ["GET", `/campaigns/${UID}/stats`],
];

async function run() {
  const app = express();
  app.set("io", io);
  app.set("trust proxy", false);
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.use("/api/premium", premiumRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ id: "u-admin", username: "demir", sid: "s-a" });
  const legacy = signToken({ id: "u-legacy", username: "eski", sid: "s-l" });
  const user = signToken({ id: "u-user", username: "ayse", sid: "s-u" });
  const stepUp = signStepUpToken({ id: "u-admin", sid: "s-a" });
  const grantBody = { op: "grant", plan: "plus", days: 30, is_free: true, reason: "beta tester", request_id: "req-0000-0001" };
  try {
    // ---- server-side authorisation on every endpoint
    for (const [m, p] of ENDPOINTS) {
      const body = m === "GET" ? undefined : grantBody;
      let r = await call(base, m, `/api/admin/premium${p}`, { body });
      assert(r.status === 401, `anonymous refused on ${m} ${p}: ${r.status}`);
      r = await call(base, m, `/api/admin/premium${p}`, { body, token: user });
      assert(r.status === 403, `non-admin refused on ${m} ${p}: ${r.status}`);
      r = await call(base, m, `/api/admin/premium${p}`, { body, token: legacy, stepUp: signStepUpToken({ id: "u-legacy", sid: "s-l" }) });
      assert(r.status === 403 && r.body.code === "ADMIN_PERMISSION_DENIED" && r.body.section === "premium", `admin without the premium section refused on ${m} ${p}`);
    }
    assert(calls.length === 0, "refused requests never reached the database");
    assert(state.auditLog.some((e) => e.action === "premium_denied" && e.actorId === "u-user" && e.meta?.status === 403), "refused attempt logged with the account");
    assert(state.auditLog.some((e) => e.action === "premium_denied" && e.actorId === null && e.meta?.status === 401), "anonymous attempt logged");
    assert(!JSON.stringify(state.auditLog).includes("beta tester"), "bodies are not logged");

    // ---- writes need the step-up code
    for (const [m, p] of ENDPOINTS.filter(([m]) => m !== "GET")) {
      const r = await call(base, m, `/api/admin/premium${p}`, { body: grantBody, token: admin });
      assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", `step-up required on ${m} ${p}: ${r.status}`);
    }
    const wrongSession = signStepUpToken({ id: "u-admin", sid: "other" });
    assert((await call(base, "POST", `/api/admin/premium/users/${UID}/apply`, { body: grantBody, token: admin, stepUp: wrongSession })).body.code === "STEP_UP_REQUIRED", "step-up bound to the session");
    assert(calls.length === 0, "no write without step-up");
    assert((await call(base, "GET", "/api/admin/premium/finance", { token: admin })).status === 200, "reads need no step-up");

    // ---- apply
    const sub = { user_id: UID, plan_id: "plus", status: "active", active: true, unlimited: false, ends_at: "2026-12-02T00:00:00Z" };
    next.premium_admin_apply = (args) => ({ ok: true, replay: false, subscription: sub, event: { id: "e1", kind: args.p_op, request_id: args.p_request_id } });
    let r = await call(base, "POST", `/api/admin/premium/users/${UID}/apply`, { body: { ...grantBody, note: "  ilk  " }, token: admin, stepUp });
    assert(r.status === 200 && r.body.subscription.plan_id === "plus" && r.body.event.kind === "grant", "grant ok");
    const a = calls.find((c) => c.name === "premium_admin_apply").args;
    assert(a.p_actor === "u-admin" && a.p_user === UID && a.p_op === "grant" && a.p_plan === "plus" && a.p_days === 30, "args mapped");
    assert(a.p_note === "ilk" && a.p_is_free === true && a.p_request_id === "req-0000-0001" && a.p_ends_at === null, "args cleaned");
    assert(state.auditLog.some((e) => e.action === "premium_grant" && e.target === UID && e.actorId === "u-admin" && e.meta.request_id === "req-0000-0001"), "write is in the admin audit log");
    assert(emitted.some((e) => e.room === `user:${UID}` && e.event === "premium:updated"), "premium:updated sent to the member");
    const before = state.auditLog.length;
    next.premium_admin_apply = () => ({ ok: true, replay: true, subscription: sub, event: { id: "e1", kind: "grant" } });
    r = await call(base, "POST", `/api/admin/premium/users/${UID}/apply`, { body: grantBody, token: admin, stepUp });
    assert(r.status === 200 && r.body.replay === true && state.auditLog.length === before, "a replayed request is not audited twice");
    for (const [code, status] of [["already_active", 409], ["not_active", 409], ["user_not_found", 404], ["invalid_plan", 400]]) {
      next.premium_admin_apply = () => ({ ok: false, error: code });
      r = await call(base, "POST", `/api/admin/premium/users/${UID}/apply`, { body: grantBody, token: admin, stepUp });
      assert(r.status === status && r.body.code === code, `${code} -> ${status}`);
    }
    for (const [body, code] of [[{ ...grantBody, op: "fly" }, "invalid_op"], [{ ...grantBody, reason: " " }, "reason_required"],
      [{ ...grantBody, days: 0 }, "invalid_duration"], [{ ...grantBody, ends_at: "nope" }, "invalid_end"], [{ ...grantBody, request_id: "x" }, "invalid_request_id"]]) {
      r = await call(base, "POST", `/api/admin/premium/users/${UID}/apply`, { body, token: admin, stepUp });
      assert(r.status === 400 && r.body.code === code, `bad input: ${code}`);
    }
    r = await call(base, "POST", "/api/admin/premium/users/not-a-uuid/apply", { body: grantBody, token: admin, stepUp });
    assert(r.status === 404, "bad user id");

    // ---- bulk
    r = await call(base, "POST", "/api/admin/premium/bulk", { body: { ...grantBody, user_ids: [UID], request_id: undefined }, token: admin, stepUp });
    assert(r.status === 400 && r.body.code === "invalid_request_id", "bulk needs a request id");
    next.premium_admin_bulk = (args) => ({ ok: true, replay: false, batch: { id: "b1", total: args.p_user_ids.length, ok: 1, failed: 0, created_at: "now" },
      results: args.p_user_ids.map((u) => ({ user_id: u, ok: true, error: null })) });
    r = await call(base, "POST", "/api/admin/premium/bulk", { body: { ...grantBody, user_ids: [UID, "junk", UID] }, token: admin, stepUp });
    assert(r.status === 200 && r.body.batch.total === 2 && r.body.batch.failed === 1, "invalid ids reported per user, duplicates folded");
    assert(r.body.results.find((x) => x.user_id === "junk").error === "user_not_found", "per-user error");
    assert(calls.filter((c) => c.name === "premium_admin_bulk").pop().args.p_user_ids.length === 1, "only valid ids reach the database");
    assert(state.auditLog.some((e) => e.action === "premium_bulk" && e.target === "b1"), "bulk audited");
    r = await call(base, "POST", "/api/admin/premium/bulk", { body: { ...grantBody, user_ids: Array.from({ length: 501 }, () => UID) }, token: admin, stepUp });
    assert(r.status === 400 && r.body.code === "too_many_users", "bulk cap");

    // ---- search returns the masked e-mail only
    next.premium_admin_user_search = () => [{ id: UID, username: "zeynep", display_name: "Z", avatar_url: null, email_masked: "ze***@g***.com", email: "leak@example.com", subscription: null }];
    r = await call(base, "GET", "/api/admin/premium/users/search?q=zey", { token: admin });
    assert(r.status === 200 && r.body.users.length === 1 && r.body.users[0].email_masked === "ze***@g***.com", "search");
    assert(!JSON.stringify(r.body).includes("leak@example.com"), "raw e-mail stripped even if the database sent it");
    assert(JSON.stringify(Object.keys(r.body.users[0])) === JSON.stringify(["id", "username", "display_name", "avatar_url", "email_masked", "subscription"]), "contract fields");

    // ---- plans: prices are not editable
    r = await call(base, "PATCH", "/api/admin/premium/plans/plus", { body: { price_minor: 999 }, token: admin, stepUp });
    assert(r.status === 400 && r.body.code === "field_not_editable", "price stays null");
    r = await call(base, "PATCH", "/api/admin/premium/plans/plus", { body: { features: ["mini_mode", "nope"] }, token: admin, stepUp });
    assert(r.status === 400 && r.body.code === "unknown_feature", "only known feature keys");
    r = await call(base, "PATCH", "/api/admin/premium/plans/plus", { body: { name: "Descall Plus", visible: true }, token: admin, stepUp });
    assert(r.status === 200 && r.body.plan.name === "Descall Plus" && r.body.plan.price_minor === null, "rename plan");
    assert(state.auditLog.some((e) => e.action === "premium_plan_update" && e.target === "plus"), "plan change audited");

    // ---- campaigns
    r = await call(base, "POST", "/api/admin/premium/campaigns", { body: { code: "beta-2026", kind: "free_membership", plan_id: "plus" }, token: admin, stepUp });
    assert(r.status === 400, "free membership needs a duration");
    r = await call(base, "POST", "/api/admin/premium/campaigns", { body: { code: "beta-2026", kind: "free_membership", plan_id: "plus", duration_days: 7, total_limit: 10 }, token: admin, stepUp });
    assert(r.status === 201 && r.body.campaign.code === "BETA2026", "campaign created with a normalised code");
    const cid = r.body.campaign.id;
    r = await call(base, "PATCH", `/api/admin/premium/campaigns/${cid}`, { body: { active: false }, token: admin, stepUp });
    assert(r.status === 200 && r.body.campaign.active === false, "campaign disabled");
    assert(state.auditLog.some((e) => e.action === "premium_campaign_update" && e.meta.campaign === "BETA2026"), "campaign change audited");
    r = await call(base, "GET", "/api/admin/premium/campaigns", { token: admin });
    assert(r.status === 200 && r.body.campaigns.length === 1, "campaign list");

    // ---- finance never invents money
    r = await call(base, "GET", "/api/admin/premium/finance", { token: admin });
    assert(r.body.payments_integrated === false && r.body.revenue === null && r.body.mrr === null, "finance: nothing integrated, revenue null");
    next.premium_admin_dashboard = { active_total: 1, paid_count: null, payments_integrated: false };
    r = await call(base, "GET", "/api/admin/premium/dashboard", { token: admin });
    assert(r.status === 200 && r.body.paid_count === null, "dashboard passes through");
    r = await call(base, "GET", "/api/admin/premium/analytics?from=2026-12-01&to=2026-11-01", { token: admin });
    assert(r.status === 400 && r.body.code === "invalid_range", "bad range");
    r = await call(base, "GET", "/api/admin/premium/audit?q=premium", { token: admin });
    assert(r.status === 200 && r.body.entries.every((e) => e.action.startsWith("premium")), "premium audit only");

    // ---- user side
    assert((await call(base, "GET", "/api/premium/me")).status === 401, "me needs sign-in");
    next.premium_me = { plan: "ultra", status: "active", ends_at: null, unlimited: true, monthly_descoin: 15000, next_coin_at: "2026-12-01T00:00:00Z" };
    r = await call(base, "GET", "/api/premium/me", { token: user });
    assert(r.status === 200 && r.body.plan === "ultra" && r.body.unlimited === true && r.body.features.includes("voice_hud") && r.body.features.includes("mini_mode"), "me: ultra with every feature");
    next.premium_me = { plan: null, status: "expired", ends_at: "2026-10-01T00:00:00Z" };
    r = await call(base, "GET", "/api/premium/me", { token: user });
    assert(r.body.plan === null && r.body.features.length === 0 && r.body.status === "expired", "me: expired");
    r = await call(base, "GET", "/api/premium/plans", { token: user });
    assert(r.status === 200 && r.body.plans.map((p) => p.id).join() === "plus,ultra", "visible active plans only");
    assert(!JSON.stringify(r.body).includes("price"), "no prices in phase 1");
    assert(r.body.plans[1].features.length > r.body.plans[0].features.length, "ultra lists more features");

    next.premium_campaign_redeem = (args) => (args.p_code === "GOOD1234" ? { ok: true, plan: "plus", days: 7, subscription: sub } : { ok: false, error: "invalid" });
    next.premium_me = { plan: "plus", status: "active", ends_at: "2026-11-09T00:00:00Z", unlimited: false, monthly_descoin: 5000 };
    emitted.length = 0;
    const zey = signToken({ id: UID, username: "zeynep", sid: "s-z" });
    r = await call(base, "POST", "/api/premium/redeem", { body: { code: "GOOD1234" }, token: zey });
    assert(r.status === 200 && r.body.plan === "plus" && r.body.premium.plan === "plus", "redeem ok");
    assert(emitted.some((e) => e.room === `user:${UID}` && e.event === "premium:updated"), "redeem emits premium:updated");
    const statuses = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await call(base, "POST", "/api/premium/redeem", { body: { code: "WRONG" + i }, token: user })).status);
    assert(statuses.slice(0, 5).every((s) => s === 404), "wrong codes answer 404");
    assert(statuses.slice(5).every((s) => s === 429), `wrong codes lock the account after five: ${statuses}`);
    const r429 = await call(base, "POST", "/api/premium/redeem", { body: { code: "GOOD1234" }, token: user });
    assert(r429.status === 429 && Number(r429.headers.get("retry-after")) > 0, "locked even for a good code, with Retry-After");
    const attempts = [];
    for (let i = 0; i < 11; i += 1) attempts.push((await call(base, "POST", "/api/premium/redeem", { body: { code: "GOOD1234" }, token: zey })).status);
    assert(attempts.includes(429), "every try counts toward the per-account limit");
  } finally {
    server.close();
  }
  console.log("premium.integration.test.cjs: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
