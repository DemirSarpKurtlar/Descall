"use strict";

/**
 * Premium admin pages end to end: the real /api/admin/premium routes against the real SQL (RPCs and
 * the premium tables in a throwaway Postgres), driven with the request bodies the admin UI model
 * builds (src/components/admin/premium/premiumModel.js) and checked for every field the pages read.
 * Pages: plans, member search + detail, each op, bulk, history (events), dashboard, analytics,
 * finance, campaigns (create / list / edit / disable / stats), audit. Every error code a page can
 * show must have an English message in premiumAdmin.err.
 * Skips without PREMIUM_TEST_PG_URL (or PROMO_TEST_PG_URL).
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const pg = require("./premiumPg.cjs");

if (!pg.available()) {
  console.log("premiumAdmin.e2e.db.test.cjs: skipped (set PREMIUM_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

const fs = require("fs");
const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const { attachTables } = require("./pgQuery.cjs");

const SRC = path.join(__dirname, "../../src");
const ADMIN = "00000000-0000-4000-8000-0000000000aa";
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PG_TABLES = [
  "premium_plans", "user_subscriptions", "subscription_events", "premium_bulk_batches", "premium_bulk_results",
  "premium_campaigns", "premium_campaign_redemptions", "admin_audit",
];

let checks = 0;
function assert(c, msg) {
  checks += 1;
  if (!c) throw new Error("FAIL: " + msg);
}
const has = (obj, keys, label) => {
  for (const k of keys) assert(obj && Object.prototype.hasOwnProperty.call(obj, k), `${label}: field "${k}" present (${JSON.stringify(obj)?.slice(0, 300)})`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const model = await import(pathToFileURL(path.join(SRC, "components/admin/premium/premiumModel.js")).href);
  const { PREMIUM_ADMIN_EN: EN } = await import(pathToFileURL(path.join(SRC, "i18n/locales/premiumAdmin.en.js")).href);
  const translated = (code) => typeof EN.err[code] === "string" && EN.err[code].length > 0;

  const db = pg.freshDb("admine2e");
  const one = (sql) => pg.q(db.url, sql);
  one(fs.readFileSync(path.join(path.dirname(pg.PREMIUM_MIGRATION), "20261030_admin_audit.sql"), "utf8"));

  const people = [
    { id: ADMIN, username: "admin", display_name: "Admin" },
    ...Array.from({ length: 8 }, (_, i) => ({ id: U(i + 1), username: `user${i + 1}`, display_name: `Name ${i + 1}` })),
  ];
  const totpOn = { totp_enabled_at: "2026-11-01T00:00:00Z", totp_secret_enc: "enc", totp_recovery_hashes: [] };
  // Auth rows (sessions, admin flags, 2FA) live in the fake; the same people exist in Postgres.
  const fake = createFakeSupabase({
    users: people.map((p) => (p.id === ADMIN
      ? { ...p, is_admin: true, is_super_admin: true, active_sessions: [{ id: "s-a" }], ...totpOn }
      : { ...p, is_admin: false, active_sessions: [{ id: `s-${p.username}` }] })),
  });
  pg.attachRpc(fake, db.url);
  attachTables(fake, db.url, PG_TABLES);
  const supabasePath = require.resolve("../db/supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

  const express = require("express");
  const { signToken, signStepUpToken } = require("../config/jwt");
  const io = { to: () => ({ emit() {} }), emit() {} };
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
  const P = "/api/admin/premium";
  const call = async (method, p, { body, token = admin } = {}) => {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    if (method !== "GET") headers["X-Admin-Step-Up"] = stepUp;
    const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const expectError = async (method, p, body, code, status, label) => {
    const r = await call(method, p, { body });
    assert(r.status === status && r.body.code === code, `${label}: ${status} ${code}, got ${r.status} ${JSON.stringify(r.body)}`);
    assert(translated(code), `${label}: premiumAdmin.err.${code} has an English message`);
  };
  const form = (op, extra = {}) => ({ op, plan: "plus", duration: { mode: "preset", days: 30 }, isFree: true, reason: "e2e check", note: "", ...extra });
  const applyBody = (f, current) => {
    const out = model.buildApplyPayload(f, { requestId: model.newRequestId(), current, now: Date.now() });
    assert(out.ok, `model builds ${f.op}: ${JSON.stringify(out)}`);
    return out.body;
  };

  try {
    one(`INSERT INTO users (id, username, display_name, email) VALUES ${people.map((p) => `('${p.id}', '${p.username}', '${p.display_name}', '${p.username}@example.org')`).join(", ")};`);

    /* ---------- Plan management ---------- */
    let r = await call("GET", `${P}/plans`);
    assert(r.status === 200 && Array.isArray(r.body.plans) && r.body.plans.length === 2, "plans list");
    for (const plan of r.body.plans) has(plan, ["id", "name", "description", "features", "status", "visible", "monthly_descoin"], `plan ${plan.id}`);
    const plus = r.body.plans.find((x) => x.id === "plus");
    const patch = model.buildPlanPatch({ name: "Descall+", description: "Plus plan", features: plus.features.join("\n"), visible: true, status: "active" });
    assert(patch.ok, "plan patch builds");
    r = await call("PATCH", `${P}/plans/plus`, { body: patch.body });
    assert(r.status === 200 && r.body.plan.description === "Plus plan" && r.body.plan.features.length === plus.features.length, `plan saved: ${JSON.stringify(r.body).slice(0, 200)}`);
    await expectError("PATCH", `${P}/plans/plus`, { ...patch.body, features: ["no_such_feature"] }, "unknown_feature", 400, "unknown feature key");
    await expectError("PATCH", `${P}/plans/plus`, { price_minor: 499 }, "field_not_editable", 400, "price stays null");

    /* ---------- Member subscriptions: search + detail ---------- */
    r = await call("GET", `${P}/users/search${model.qs({ q: "user1" })}`);
    assert(r.status === 200 && r.body.users.length >= 1 && r.body.users[0].id === U(1), "search by username");
    has(r.body.users[0], ["id", "username", "display_name", "avatar_url", "email_masked", "subscription"], "search hit");
    assert(!JSON.stringify(r.body).includes("user1@example.org"), "only the masked e-mail leaves the server");
    r = await call("GET", `${P}/users/${U(1)}`);
    assert(r.status === 200 && r.body.subscription === null && Array.isArray(r.body.events), "detail before any membership");
    has(r.body.user, ["id", "username", "display_name", "avatar_url", "email_masked"], "detail user");
    await expectError("GET", `${P}/users/${U(99)}`, null, "user_not_found", 404, "unknown member");

    /* ---------- each op, as the action form sends it ---------- */
    // grant (preset days; the UI has no start date: it starts now)
    let body = applyBody(form("grant", { plan: "ultra" }), null);
    assert(!("starts_at" in body), "no start date is sent");
    r = await call("POST", `${P}/users/${U(1)}/apply`, { body });
    assert(r.status === 200 && r.body.subscription.plan_id === "ultra" && r.body.event.kind === "grant", `grant: ${JSON.stringify(r.body)}`);
    has(r.body.subscription, ["plan_id", "status", "started_at", "ends_at", "unlimited", "is_free", "source", "next_coin_at"], "subscription");
    const retry = await call("POST", `${P}/users/${U(1)}/apply`, { body });
    assert(retry.status === 200 && retry.body.replay === true, "same request_id is a replay");
    await expectError("POST", `${P}/users/${U(1)}/apply`, applyBody(form("grant"), null), "already_active", 409, "second grant");

    let detail = (await call("GET", `${P}/users/${U(1)}`)).body;
    let sub = detail.subscription;
    assert(model.subscriptionState(sub).state === "active", "UI reads it as active");
    const grantEv = detail.events.find((e) => e.kind === "grant");
    assert(grantEv?.actor_username === "admin" && grantEv.user?.username === "user1", `events name the admin and member: ${JSON.stringify(grantEv)}`);
    const gift = detail.events.find((e) => e.kind === "coin_grant");
    assert(gift && gift.actor_username === null && gift.actor_kind === "system" && EN.kind.coin_grant, "the first DesCoin gift is a system event");

    // extend (days only; an exact date is a model error pointing to set_end)
    assert(model.buildApplyPayload(form("extend", { duration: { mode: "date", endDate: "2030-01-01" } }), { requestId: "x", current: sub }).error === "extendDate", "extend by date is refused in the form");
    const endBefore = new Date(sub.ends_at).getTime();
    r = await call("POST", `${P}/users/${U(1)}/apply`, { body: applyBody(form("extend", { duration: { mode: "custom", days: "5" } }), sub) });
    assert(r.status === 200 && new Date(r.body.subscription.ends_at).getTime() - endBefore === 5 * 864e5, "extend adds 5 days to the end");
    sub = r.body.subscription;

    // change plan, same plan
    await expectError("POST", `${P}/users/${U(1)}/apply`, { op: "change_plan", plan: "ultra", reason: "same", request_id: model.newRequestId() }, "same_plan", 409, "same plan");
    r = await call("POST", `${P}/users/${U(1)}/apply`, { body: applyBody(form("change_plan", { plan: "plus" }), sub) });
    assert(r.status === 200 && r.body.subscription.plan_id === "plus", "change plan");
    sub = r.body.subscription;

    // set end (exact date), then unlimited
    const target = model.dateToLocalInput(Date.now() + 60 * 864e5);
    r = await call("POST", `${P}/users/${U(1)}/apply`, { body: applyBody(form("set_end", { duration: { mode: "date", endDate: target.date, endTime: "12:00" } }), sub) });
    assert(r.status === 200 && r.body.subscription.ends_at && r.body.subscription.unlimited === false, "set end");
    sub = r.body.subscription;
    await expectError("POST", `${P}/users/${U(1)}/apply`, { op: "set_end", ends_at: new Date(Date.now() - 864e5).toISOString(), reason: "past", request_id: model.newRequestId() }, "invalid_end", 400, "end in the past");
    r = await call("POST", `${P}/users/${U(1)}/apply`, { body: applyBody(form("set_unlimited"), sub) });
    assert(r.status === 200 && r.body.subscription.unlimited === true && r.body.subscription.ends_at === null, "unlimited");
    sub = r.body.subscription;
    await expectError("POST", `${P}/users/${U(1)}/apply`, applyBody(form("set_unlimited"), sub), "already_unlimited", 409, "unlimited twice");
    await expectError("POST", `${P}/users/${U(1)}/apply`, { op: "extend", days: 3, reason: "x", request_id: model.newRequestId() }, "already_unlimited", 409, "extend an unlimited one");

    // cancel, then every non-grant op answers not_active (the form disables them)
    r = await call("POST", `${P}/users/${U(1)}/apply`, { body: applyBody(form("cancel"), sub) });
    assert(r.status === 200 && r.body.subscription.status === "cancelled", "cancel");
    sub = r.body.subscription;
    await expectError("POST", `${P}/users/${U(1)}/apply`, { op: "extend", days: 3, reason: "x", request_id: model.newRequestId() }, "not_active", 409, "extend after cancel");
    assert(model.subscriptionState(sub).state === "cancelled", "UI reads cancelled");

    // grant again with an exact end date (ends_at)
    r = await call("POST", `${P}/users/${U(1)}/apply`, { body: applyBody(form("grant", { duration: { mode: "date", endDate: target.date, endTime: "23:59" } }), sub) });
    assert(r.status === 200 && r.body.subscription.plan_id === "plus" && !r.body.subscription.unlimited, "grant to an exact date");

    // server-side validation the form cannot reach
    await expectError("POST", `${P}/users/${U(2)}/apply`, { op: "grant", plan: "plus", days: 30, request_id: model.newRequestId() }, "reason_required", 400, "no reason");
    await expectError("POST", `${P}/users/${U(2)}/apply`, { op: "grant", plan: "gold", days: 30, reason: "x", request_id: model.newRequestId() }, "invalid_plan", 400, "unknown plan");
    await expectError("POST", `${P}/users/${U(2)}/apply`, { op: "grant", plan: "plus", days: 0, reason: "x" }, "invalid_duration", 400, "zero days");
    await expectError("POST", `${P}/users/${U(2)}/apply`, { op: "grant", plan: "plus", reason: "x", request_id: model.newRequestId() }, "invalid_duration", 400, "grant without a duration");
    await expectError("POST", `${P}/users/${U(2)}/apply`, { op: "grant", plan: "plus", days: 3, reason: "x".repeat(501) }, "too_long", 400, "long reason");
    await expectError("POST", `${P}/users/${U(2)}/apply`, { op: "explode", reason: "x" }, "invalid_op", 400, "unknown op");
    await expectError("POST", `${P}/users/${U(2)}/apply`, { op: "cancel", reason: "x", request_id: "bad id!" }, "invalid_request_id", 400, "bad request id");

    /* ---------- Bulk ---------- */
    const bulkOut = model.buildBulkPayload(form("grant", { plan: "plus", duration: { mode: "unlimited" } }), [{ id: U(2) }, { id: U(3) }, { id: U(1) }], { requestId: model.newRequestId() });
    assert(bulkOut.ok, "bulk body builds");
    r = await call("POST", `${P}/bulk`, { body: bulkOut.body });
    assert(r.status === 200, `bulk: ${JSON.stringify(r.body)}`);
    has(r.body.batch, ["id", "total", "ok", "failed", "created_at"], "bulk batch");
    assert(r.body.batch.total === 3 && r.body.batch.ok === 2 && r.body.batch.failed === 1, "U1 already active, two granted");
    for (const row of r.body.results) {
      has(row, ["user_id", "ok", "error"], "bulk row");
      if (!row.ok) assert(translated(row.error), `bulk failure code ${row.error} has a message`);
    }
    assert(r.body.results.find((x) => x.user_id === U(1)).error === "already_active", "per-member failure code");
    const batchId = r.body.batch.id;
    r = await call("GET", `${P}/bulk/${batchId}`);
    assert(r.status === 200 && r.body.batch.id === batchId && r.body.results.length === 3, "batch readable");
    const bulkCancel = model.buildBulkPayload(form("cancel"), [U(4)], { requestId: model.newRequestId() });
    r = await call("POST", `${P}/bulk`, { body: bulkCancel.body });
    assert(r.body.results[0].error === "not_active" && translated("not_active"), "bulk cancel on a non-member");
    await expectError("POST", `${P}/bulk`, { user_ids: [], op: "grant", reason: "x", request_id: model.newRequestId() }, "no_users", 400, "empty bulk");

    /* ---------- Subscription history ---------- */
    r = await call("GET", `${P}/events${model.qs({ user: "user1", kind: "", plan: "", actor: "", limit: 3 })}`);
    assert(r.status === 200 && r.body.events.length === 3 && r.body.next_cursor, `events by username, paged: ${JSON.stringify(r.body).slice(0, 200)}`);
    for (const ev of r.body.events) {
      has(ev, ["id", "created_at", "kind", "prev_plan", "new_plan", "new_ends_at", "new_unlimited", "actor_kind", "reason", "note", "is_free", "batch_id", "request_id", "user", "actor_username"], "event");
      assert(ev.user?.username === "user1" && ev.user_id === U(1), "event user");
      assert(EN.kind[ev.kind], `event kind ${ev.kind} has a label`);
    }
    const page2 = await call("GET", `${P}/events${model.qs({ user: U(1), cursor: r.body.next_cursor, limit: 3 })}`);
    assert(page2.status === 200 && page2.body.events.length >= 1 && !page2.body.events.some((e) => r.body.events.some((x) => x.id === e.id)), "next page has older events");
    r = await call("GET", `${P}/events${model.qs({ actor: "@admin", kind: "grant" })}`);
    assert(r.status === 200 && r.body.events.length >= 3 && r.body.events.every((e) => e.actor_username === "admin" && e.kind === "grant"), "actor by username + kind");
    r = await call("GET", `${P}/events${model.qs({ user: "nobody_here" })}`);
    assert(r.status === 200 && r.body.events.length === 0 && r.body.next_cursor === null, "unknown username: empty page");
    r = await call("GET", `${P}/events${model.qs({ plan: "ultra" })}`);
    assert(r.status === 200 && r.body.events.every((e) => e.new_plan === "ultra" || e.prev_plan === "ultra"), "plan filter");

    /* ---------- Campaigns ---------- */
    const camp = model.buildCampaignPayload({ code: "e2e-free-7", kind: "free_membership", planLimit: "plus", durationDays: "7", totalLimit: "10", perUserLimit: "1", allowedUsers: [{ id: U(5) }, { id: U(6) }], active: true });
    assert(camp.ok, "campaign body builds");
    r = await call("POST", `${P}/campaigns`, { body: camp.body });
    assert(r.status === 201 && r.body.campaign.code === "E2EFREE7", `campaign create: ${r.status} ${JSON.stringify(r.body)}`);
    has(r.body.campaign, ["id", "code", "kind", "plan_id", "duration_days", "value", "starts_at", "ends_at", "total_limit", "per_user_limit", "allowed_user_ids", "allowed_users", "used_count", "active"], "campaign");
    assert(r.body.campaign.allowed_users.map((u) => u.username).sort().join() === "user5,user6", "allowed people come back with names");
    const freeCamp = r.body.campaign;
    const pct = model.buildCampaignPayload({ code: "E2EPCT10", kind: "percent", planLimit: "", value: "10", perUserLimit: "1", active: true });
    r = await call("POST", `${P}/campaigns`, { body: pct.body });
    assert(r.status === 201 && r.body.campaign.percent_off === 10 && r.body.campaign.value === 10, `percent coupon stores value: ${JSON.stringify(r.body)}`);
    const fixed = model.buildCampaignPayload({ code: "E2EFIX5", kind: "fixed", planLimit: "", value: "500", currency: "eur", perUserLimit: "1", active: true });
    r = await call("POST", `${P}/campaigns`, { body: fixed.body });
    assert(r.status === 201 && r.body.campaign.amount_off_minor === 500 && r.body.campaign.currency === "EUR", `fixed coupon: ${JSON.stringify(r.body)}`);
    await expectError("POST", `${P}/campaigns`, camp.body, "code_taken", 409, "duplicate code");
    await expectError("POST", `${P}/campaigns`, { ...camp.body, code: "ab" }, "invalid_code", 400, "short code");

    r = await call("POST", "/api/premium/redeem", { body: { code: "e2e-free-7" }, token: signToken({ id: U(5), username: "user5", sid: "s-user5" }) });
    assert(r.status === 200 && r.body.premium?.plan === "plus", `redeem: ${r.status} ${JSON.stringify(r.body)}`);

    r = await call("GET", `${P}/campaigns`);
    assert(r.status === 200 && Array.isArray(r.body.campaigns) && r.body.campaigns.length === 3, "campaign list");
    const listed = r.body.campaigns.find((c) => c.id === freeCamp.id);
    assert(listed.used_count === 1 && listed.allowed_users.length === 2, "list reads used_count and names");

    r = await call("GET", `${P}/campaigns/${freeCamp.id}/stats`);
    assert(r.status === 200, "stats");
    has(r.body, ["redemptions", "unique_users", "still_active", "recent"], "campaign stats");
    assert(r.body.redemptions === 1 && r.body.unique_users === 1 && r.body.still_active === 1, `stats numbers: ${JSON.stringify(r.body)}`);
    assert(r.body.recent[0].username === "user5" && r.body.recent[0].at, "recent redemption has a name and time");

    // edit (the form sends the whole body again) and disable
    const edit = model.buildCampaignPayload({ code: listed.code, kind: listed.kind, planLimit: listed.plan_id, durationDays: "14", totalLimit: "20", perUserLimit: "1", allowedUsers: listed.allowed_users, active: true });
    r = await call("PATCH", `${P}/campaigns/${freeCamp.id}`, { body: edit.body });
    assert(r.status === 200 && r.body.campaign.duration_days === 14 && r.body.campaign.total_limit === 20, `campaign edit: ${JSON.stringify(r.body)}`);
    r = await call("PATCH", `${P}/campaigns/${freeCamp.id}`, { body: { active: false } });
    assert(r.status === 200 && r.body.campaign.active === false, "disable");
    r = await call("POST", "/api/premium/redeem", { body: { code: "E2EFREE7" }, token: signToken({ id: U(6), username: "user6", sid: "s-user6" }) });
    assert(r.status === 404 && r.body.code === "invalid", "a disabled coupon cannot be redeemed");

    /* ---------- Dashboard ---------- */
    r = await call("GET", `${P}/dashboard`);
    assert(r.status === 200, "dashboard");
    has(r.body, ["active_total", "active_plus", "active_ultra", "expired", "expiring_7d", "new_7d", "new_30d", "free_count", "paid_count", "payments_integrated"], "dashboard");
    assert(r.body.active_total === 4 && r.body.active_plus === 4 && r.body.paid_count === null && r.body.payments_integrated === false, `dashboard numbers: ${JSON.stringify(r.body)}`);

    /* ---------- Analytics (normalized exactly as the page does) ---------- */
    const range = model.resolveRange("30d");
    r = await call("GET", `${P}/analytics${model.qs({ from: range.from, to: range.to, bucket: range.bucket })}`);
    assert(r.status === 200 && r.body.timezone === "UTC", `analytics: ${r.status}`);
    has(r.body, ["acquisitions", "active", "plan_split", "cancellations_renewals", "free_paid", "upgrades_downgrades", "avg_duration_days", "conversion", "campaigns"], "analytics");
    const an = model.normalizeAnalytics(r.body);
    const sum = (rows, i) => (rows || []).reduce((n, row) => n + row.values[i], 0);
    assert(an.acquisitions && sum(an.acquisitions, 0) === 4 && sum(an.acquisitions, 1) === 1, `acquisitions by plan (plus: regrant, 2 bulk, coupon; ultra: first grant): ${JSON.stringify(an.acquisitions?.filter((x) => x.values.some(Boolean)))}`);
    assert(an.active && an.active[an.active.length - 1].values.length === 1 && an.active[an.active.length - 1].values[0] === 4, `active total at the end: ${JSON.stringify(an.active?.slice(-2))}`);
    assert(an.planSplit && an.planSplit.plus === 4 && an.planSplit.ultra === 0, `plan split: ${JSON.stringify(an.planSplit)}`);
    assert(an.cancelRenew && sum(an.cancelRenew, 0) === 1 && sum(an.cancelRenew, 1) === 1, "one cancel, one renewal");
    assert(Array.isArray(an.upDown) && sum(an.upDown, 1) === 1 && sum(an.upDown, 0) === 0, "one downgrade (Ultra to Descall+)");
    assert(an.freePaid && an.freePaid.free === 4 && an.freePaid.paid === null, "free/paid");
    assert(an.avgDuration && typeof an.avgDuration.all === "number", "average duration");
    assert(an.conversion && an.conversion.denominator >= 9 && an.conversion.rate != null, `conversion: ${JSON.stringify(an.conversion)}`);
    assert(EN.an.convLabel[an.conversion.denominatorLabel], `denominator label ${an.conversion.denominatorLabel} has a translation`);
    assert(an.campaigns && an.campaigns.length === 3 && an.campaigns.find((c) => c.code === "E2EFREE7").redemptions === 1 && an.campaigns.find((c) => c.code === "E2EFREE7").stillActive === 1, `campaign rows: ${JSON.stringify(an.campaigns)}`);
    await expectError("GET", `${P}/analytics${model.qs({ from: range.to, to: range.from })}`, null, "invalid_range", 400, "reversed range");

    /* ---------- Finance ---------- */
    r = await call("GET", `${P}/finance`);
    assert(r.status === 200, "finance");
    has(r.body, ["payments_integrated", "revenue", "free_count", "manual_grants", "campaign_grants"], "finance");
    assert(r.body.payments_integrated === false && r.body.revenue === null, "no revenue without payments");
    assert(r.body.manual_grants === 4 && r.body.campaign_grants === 1 && r.body.free_count === 4, `finance counts: ${JSON.stringify(r.body)}`);

    /* ---------- Admin action log ---------- */
    await sleep(300); // audit rows are written fire-and-forget
    r = await call("GET", `${P}/audit${model.qs({ q: "", actor: "admin", limit: 5 })}`);
    assert(r.status === 200 && r.body.durable === true && r.body.items.length === 5 && r.body.next_cursor, `audit page: ${JSON.stringify(r.body).slice(0, 300)}`);
    for (const it of r.body.items) has(it, ["id", "at", "actor_id", "actor_username", "action", "target", "target_username", "meta"], "audit item");
    const more = await call("GET", `${P}/audit${model.qs({ actor: "admin", limit: 50, cursor: r.body.next_cursor })}`);
    assert(more.status === 200 && more.body.items.length > 0 && !more.body.items.some((x) => r.body.items.some((y) => y.id === x.id)), "audit next page");
    const all = [...r.body.items, ...more.body.items];
    const grant = all.find((x) => x.action === "premium_grant" && x.target === U(1));
    assert(grant && grant.actor_username === "admin" && grant.target_username === "user1" && grant.meta.reason === "e2e check", `grant audit row: ${JSON.stringify(grant)}`);
    for (const action of ["premium_grant", "premium_extend", "premium_change_plan", "premium_set_end", "premium_set_unlimited", "premium_cancel", "premium_bulk", "premium_plan_update", "premium_campaign_create", "premium_campaign_update"]) {
      assert(all.some((x) => x.action === action), `audit has ${action}`);
      assert(EN.audit.act[action.replace(/^premium_/, "")], `audit action ${action} has a label`);
    }
    assert(all.find((x) => x.action === "premium_bulk").meta.reason === "e2e check", "bulk reason in the log");
    r = await call("GET", `${P}/audit${model.qs({ actor: "nobody_here" })}`);
    assert(r.status === 200 && r.body.items.length === 0, "unknown admin: empty");
  } finally {
    server.close();
    db.drop();
  }
  console.log(`premiumAdmin.e2e.db.test.cjs: ok (${checks} checks)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
