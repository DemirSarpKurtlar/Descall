// Run: node src/components/admin/premium/premiumModel.selftest.mjs
// Premium Yönetimi pure helpers: end-date calculator (presets, custom days,
// exact date, unlimited), request bodies for /admin/premium (CONTRACT.md), the
// request_id idempotency helper and the before/after preview.
import assert from "node:assert/strict";
import {
  computeEnd, parseDays, localInputToDate, dateToLocalInput, extendBase, subscriptionState,
  buildApplyPayload, buildBulkPayload, buildCampaignPayload, buildPlanPatch, normalizeCampaignCode,
  createIdempotency, newRequestId, stableJson, previewChange, resolveRange, qs, metric, normalizeAnalytics,
  DURATION_PRESETS, MONTHLY_DESCOIN, PLANS, OPS, EVENT_KINDS, BULK_MAX,
} from "./premiumModel.js";

const DAY = 864e5;
const NOW = Date.UTC(2026, 10, 2, 9, 0, 0); // 2026-11-02 09:00 UTC
const iso = (ms) => new Date(ms).toISOString();

// Constants follow the contract.
assert.deepEqual(PLANS, ["plus", "ultra"]);
assert.deepEqual(MONTHLY_DESCOIN, { plus: 5000, ultra: 15000 });
assert.deepEqual(DURATION_PRESETS, [1, 7, 30, 90, 180, 365]);
assert.deepEqual(OPS, ["grant", "extend", "change_plan", "cancel", "set_end", "set_unlimited"]);
assert.equal(EVENT_KINDS.length, 9);

// ---- parseDays
assert.equal(parseDays("30"), 30);
assert.equal(parseDays(7), 7);
for (const bad of ["0", "-1", "2.5", "x", "", null, "3651"]) assert.equal(parseDays(bad), null, `parseDays(${bad})`);

// ---- computeEnd: presets
for (const n of DURATION_PRESETS) {
  const r = computeEnd({ mode: "preset", days: n }, NOW);
  assert.ok(r.ok);
  assert.equal(r.unlimited, false);
  assert.equal(r.days, n);
  assert.equal(r.endsAt.toISOString(), iso(NOW + n * DAY), `preset ${n}`);
}
assert.equal(computeEnd({ mode: "preset", days: 45 }, NOW).ok, false, "45 is not a preset");
// custom days
assert.equal(computeEnd({ mode: "custom", days: "45" }, NOW).endsAt.toISOString(), iso(NOW + 45 * DAY));
assert.deepEqual(computeEnd({ mode: "custom", days: "0" }, NOW), { ok: false, error: "days" });
// a later start shifts the end
assert.equal(computeEnd({ mode: "custom", days: 10, start: iso(NOW + 5 * DAY) }, NOW).endsAt.toISOString(), iso(NOW + 15 * DAY));
// exact end date (local time input → UTC)
const exact = computeEnd({ mode: "date", endDate: "2026-12-31", endTime: "23:59" }, NOW);
assert.ok(exact.ok);
assert.equal(exact.endsAt.toISOString(), new Date(2026, 11, 31, 23, 59).toISOString());
assert.equal(exact.days, Math.ceil((new Date(2026, 11, 31, 23, 59) - NOW) / DAY));
assert.deepEqual(computeEnd({ mode: "date", endDate: "2026-01-01" }, NOW), { ok: false, error: "endPast" });
assert.deepEqual(computeEnd({ mode: "date", endDate: "2026-02-30" }, NOW), { ok: false, error: "endDate" });
assert.deepEqual(computeEnd({ mode: "date", endDate: "nope" }, NOW), { ok: false, error: "endDate" });
assert.deepEqual(
  computeEnd({ mode: "date", endDate: "2026-11-10", start: new Date(2026, 10, 20) }, NOW),
  { ok: false, error: "endBeforeStart" },
);
// unlimited
assert.deepEqual(computeEnd({ mode: "unlimited" }, NOW), { ok: true, unlimited: true, endsAt: null, days: null });
assert.equal(computeEnd({ mode: "?" }, NOW).ok, false);

// local input round trip
const li = dateToLocalInput(new Date(2026, 4, 7, 8, 5));
assert.deepEqual(li, { date: "2026-05-07", time: "08:05" });
assert.equal(localInputToDate(li.date, li.time).getTime(), new Date(2026, 4, 7, 8, 5).getTime());

// ---- extendBase / subscriptionState
const active = { plan_id: "plus", status: "active", ends_at: iso(NOW + 10 * DAY), unlimited: false, is_free: true };
assert.equal(extendBase(active, NOW).toISOString(), active.ends_at, "extend counts from the current end");
assert.equal(extendBase({ ...active, ends_at: iso(NOW - DAY) }, NOW).toISOString(), iso(NOW), "expired: from now");
assert.equal(extendBase(null, NOW).toISOString(), iso(NOW));
assert.deepEqual(subscriptionState(active, NOW), { state: "active", plan: "plus", daysLeft: 10 });
assert.equal(subscriptionState({ ...active, ends_at: iso(NOW - 1000) }, NOW).state, "expired", "past end reads expired");
assert.deepEqual(subscriptionState({ plan_id: "ultra", status: "active", unlimited: true, ends_at: null }, NOW), { state: "active", plan: "ultra", daysLeft: null });
assert.equal(subscriptionState(null, NOW).state, "none");

// ---- buildApplyPayload
const base = { reason: "Test hesabi", note: "  ilk  deneme ", isFree: true };
let r = buildApplyPayload({ ...base, op: "grant", plan: "plus", duration: { mode: "preset", days: 30 } }, { requestId: "rid-1", now: NOW });
assert.deepEqual(r, { ok: true, body: { op: "grant", plan: "plus", is_free: true, reason: "Test hesabi", note: "ilk deneme", unlimited: false, days: 30, request_id: "rid-1" } });
r = buildApplyPayload({ ...base, op: "grant", plan: "ultra", duration: { mode: "unlimited" } }, { requestId: "rid", now: NOW });
assert.equal(r.body.unlimited, true);
assert.ok(!("days" in r.body) && !("ends_at" in r.body), "unlimited sends no end");
r = buildApplyPayload({ ...base, op: "grant", plan: "plus", duration: { mode: "date", endDate: "2027-01-15", endTime: "12:00" } }, { requestId: "rid", now: NOW });
assert.equal(r.body.ends_at, new Date(2027, 0, 15, 12, 0).toISOString());
assert.ok(!("days" in r.body));
// the server has no start date: a grant always starts now, and a stray start is ignored
r = buildApplyPayload({ ...base, op: "grant", plan: "plus", start: iso(NOW + 3 * DAY), duration: { mode: "preset", days: 7 } }, { requestId: "rid", now: NOW });
assert.equal(r.body.days, 7);
assert.ok(!("starts_at" in r.body) && !("ends_at" in r.body), "no start date is sent");
// reason is required
assert.deepEqual(buildApplyPayload({ op: "cancel", reason: "  " }, { requestId: "x", now: NOW }), { ok: false, error: "reason" });
assert.deepEqual(buildApplyPayload({ ...base, op: "grant", duration: { mode: "preset", days: 30 } }, { requestId: "x", now: NOW }), { ok: false, error: "plan" });
assert.deepEqual(buildApplyPayload({ ...base, op: "nope" }, { requestId: "x", now: NOW }), { ok: false, error: "op" });
assert.deepEqual(buildApplyPayload({ ...base, op: "cancel" }, { now: NOW }), { ok: false, error: "requestId" });
// extend: days, or an exact date; never unlimited
r = buildApplyPayload({ ...base, op: "extend", duration: { mode: "custom", days: "12" } }, { requestId: "x", current: active, now: NOW });
assert.equal(r.body.days, 12);
assert.equal(r.body.plan, "plus", "plan carries the current plan");
assert.deepEqual(buildApplyPayload({ ...base, op: "extend", duration: { mode: "unlimited" } }, { requestId: "x", current: active, now: NOW }), { ok: false, error: "extendUnlimited" });
assert.deepEqual(buildApplyPayload({ ...base, op: "extend", duration: { mode: "date", endDate: "2027-01-15" } }, { requestId: "x", current: active, now: NOW }), { ok: false, error: "extendDate" }, "extend takes days only (the server adds days)");
// change_plan must change something
assert.deepEqual(buildApplyPayload({ ...base, op: "change_plan", plan: "plus" }, { requestId: "x", current: active, now: NOW }), { ok: false, error: "samePlan" });
assert.equal(buildApplyPayload({ ...base, op: "change_plan", plan: "ultra" }, { requestId: "x", current: active, now: NOW }).body.plan, "ultra");
// set_end from presets counts from now; set_unlimited
r = buildApplyPayload({ ...base, op: "set_end", duration: { mode: "preset", days: 90 } }, { requestId: "x", current: active, now: NOW });
assert.equal(r.body.ends_at, iso(NOW + 90 * DAY));
assert.equal(r.body.unlimited, false);
assert.equal(buildApplyPayload({ ...base, op: "set_unlimited" }, { requestId: "x", current: active, now: NOW }).body.unlimited, true);
r = buildApplyPayload({ ...base, op: "cancel", isFree: false }, { requestId: "x", current: active, now: NOW });
assert.equal(r.body.is_free, false);
assert.equal(r.body.op, "cancel");

// ---- buildBulkPayload
r = buildBulkPayload({ ...base, op: "grant", plan: "ultra", duration: { mode: "preset", days: 7 } }, [{ id: "a" }, "b", { id: "a" }, ""], { requestId: "bulk-1", now: NOW });
assert.deepEqual(r.body.user_ids, ["a", "b"], "deduped, empties dropped");
assert.equal(r.body.request_id, "bulk-1");
assert.equal(r.body.days, 7);
assert.deepEqual(buildBulkPayload({ ...base, op: "cancel" }, [], { requestId: "x" }), { ok: false, error: "noUsers" });
assert.deepEqual(buildBulkPayload({ ...base, op: "cancel" }, Array.from({ length: BULK_MAX + 1 }, (_, i) => `u${i}`), { requestId: "x" }), { ok: false, error: "tooMany" });

// ---- campaigns
assert.equal(normalizeCampaignCode("ab-cd 12!"), "ABCD12");
r = buildCampaignPayload({ code: "launch-2026", kind: "free_membership", planLimit: "plus", durationDays: "30", totalLimit: "100", perUserLimit: "", allowedUsers: [{ id: "u1" }, { id: "u1" }], active: true, startDate: "2026-11-05", endDate: "2026-12-05" });
assert.ok(r.ok);
assert.equal(r.body.code, "LAUNCH2026");
assert.equal(r.body.duration_days, 30);
assert.equal(r.body.total_limit, 100);
assert.equal(r.body.per_user_limit, 1, "per-user limit defaults to 1");
assert.deepEqual(r.body.allowed_user_ids, ["u1"]);
assert.equal(r.body.starts_at, new Date(2026, 10, 5, 0, 0).toISOString());
assert.equal(r.body.ends_at, new Date(2026, 11, 5, 23, 59).toISOString());
assert.equal(r.body.value, null);
assert.deepEqual(buildCampaignPayload({ code: "ABC", kind: "free_membership" }), { ok: false, error: "code" });
assert.deepEqual(buildCampaignPayload({ code: "ABCD", kind: "free_membership", planLimit: "plus", durationDays: "" }), { ok: false, error: "days" });
assert.deepEqual(buildCampaignPayload({ code: "ABCD", kind: "free_membership", durationDays: "7" }), { ok: false, error: "campaignPlan" });
assert.deepEqual(buildCampaignPayload({ code: "ABCD", kind: "percent", value: "150" }), { ok: false, error: "value" });
r = buildCampaignPayload({ code: "SALE10", kind: "percent", value: "10", planLimit: "" });
assert.equal(r.body.value, 10);
assert.equal(r.body.plan_id, null);
assert.equal(r.body.currency, null);
assert.deepEqual(buildCampaignPayload({ code: "ABCD", kind: "percent", value: "" }), { ok: false, error: "value" });
assert.deepEqual(buildCampaignPayload({ code: "ABCD", kind: "fixed", value: "500" }), { ok: false, error: "currency" });
r = buildCampaignPayload({ code: "FIX5", kind: "fixed", value: "500", currency: "try" });
assert.equal(r.body.currency, "TRY");
assert.equal(r.body.value, 500);
assert.deepEqual(buildCampaignPayload({ code: "ABCD", kind: "free_membership", planLimit: "plus", durationDays: "7", startDate: "2026-12-10", endDate: "2026-12-01" }), { ok: false, error: "endBeforeStart" });

// ---- plans: never a price
r = buildPlanPatch({ name: " Descall+ ", description: "x", features: "mini_mode, focus_mode\nmini_mode", visible: 1, status: "active", price_minor: 999 });
assert.deepEqual(r.body, { name: "Descall+", description: "x", features: ["mini_mode", "focus_mode"], visible: true, status: "active" });
assert.ok(!("price_minor" in r.body));
assert.deepEqual(buildPlanPatch({ name: "", status: "active" }), { ok: false, error: "name" });
assert.deepEqual(buildPlanPatch({ name: "x", status: "deleted" }), { ok: false, error: "status" });

// ---- request_id idempotency
assert.equal(stableJson({ b: 1, a: [2, { d: 1, c: 2 }] }), stableJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
let n = 0;
const idem = createIdempotency(() => `r${++n}`, () => NOW);
const body = { op: "grant", plan: "plus", days: 30 };
const id1 = idem.idFor("user:a", body);
assert.match(id1, /^pa-[a-z0-9]+-r1$/);
assert.equal(idem.idFor("user:a", { days: 30, plan: "plus", op: "grant" }), id1, "retry of the same body keeps the id");
assert.notEqual(idem.idFor("user:b", body), id1, "another user is another request");
const id3 = idem.idFor("user:a", { ...body, days: 7 });
assert.notEqual(id3, id1, "changed body = new id");
assert.equal(idem.peek(), id3);
idem.succeeded();
assert.equal(idem.peek(), null);
assert.notEqual(idem.idFor("user:a", { ...body, days: 7 }), id3, "after success the same body is a new submit");
assert.match(newRequestId(() => "ab-cd", 0), /^pa-0-abcd$/);
assert.ok(newRequestId().length > 10, "default random works in node");

// ---- previewChange
let p = previewChange(active, { op: "extend", days: 5 }, NOW);
assert.equal(p.before.endsAt, active.ends_at);
assert.equal(p.after.endsAt, iso(NOW + 15 * DAY));
p = previewChange(null, { op: "grant", plan: "ultra", unlimited: true, is_free: true }, NOW);
assert.deepEqual(p.before, { plan: null, state: "none", endsAt: null, unlimited: false, isFree: null });
assert.deepEqual(p.after, { plan: "ultra", state: "active", endsAt: null, unlimited: true, isFree: true });
p = previewChange(active, { op: "cancel" }, NOW);
assert.equal(p.after.state, "cancelled");
p = previewChange(active, { op: "change_plan", plan: "ultra" }, NOW);
assert.equal(p.after.plan, "ultra");
assert.equal(p.after.endsAt, active.ends_at);
p = previewChange(active, { op: "set_unlimited", unlimited: true }, NOW);
assert.equal(p.after.unlimited, true);
assert.equal(p.after.endsAt, null);

// ---- analytics range + query strings + metrics
let rr = resolveRange("30d", {}, NOW);
assert.deepEqual(rr, { ok: true, from: iso(NOW - 30 * DAY), to: iso(NOW), bucket: "day" });
assert.equal(resolveRange("90d", {}, NOW).bucket, "week");
assert.equal(resolveRange("12m", {}, NOW).bucket, "month");
rr = resolveRange("custom", { from: "2026-10-01", to: "2026-10-10" }, NOW);
assert.equal(rr.ok, true);
assert.equal(rr.bucket, "day");
assert.deepEqual(resolveRange("custom", { from: "2026-10-10", to: "2026-10-01" }, NOW), { ok: false, error: "range" });
assert.equal(qs({ user: "a b", kind: "", plan: null, from: "x" }), "?user=a+b&from=x");
assert.equal(qs({}), "");
assert.equal(metric(null), null);
assert.equal(metric("12"), 12);
assert.equal(metric("x"), null);
assert.equal(metric(0), 0);

// ---- analytics: real rows or null, never invented
const an = normalizeAnalytics({
  acquisitions: [{ bucket: "2026-10-01", plus: 2, ultra: 1 }, { bucket: "2026-10-02", plus: null, ultra: 3 }],
  active: [],
  cancellations: [{ bucket: "2026-10-02", n: 1 }],
  renewals: [{ bucket: "2026-10-01", n: 3 }],
  plan_split: { plus: 4, ultra: null },
  free_paid: { free: 7, paid: null },
  upgrades_downgrades: { upgrades: 1, downgrades: 0 },
  avg_duration_days: 31.5,
  conversion: null,
  campaigns: [{ id: "c1", code: "LAUNCH", redemptions: 3, unique_users: 3 }],
});
assert.deepEqual(an.acquisitions, [{ label: "2026-10-01", values: [2, 1] }, { label: "2026-10-02", values: [0, 3] }]);
assert.equal(an.active, null, "empty series = no data");
assert.deepEqual(an.cancelRenew, [{ label: "2026-10-01", values: [0, 3] }, { label: "2026-10-02", values: [1, 0] }]);
assert.deepEqual(an.planSplit, { plus: 4, ultra: null });
assert.deepEqual(an.freePaid, { free: 7, paid: null }, "paid stays null without payments");
assert.deepEqual(an.upDown, { upgrades: 1, downgrades: 0 });
assert.deepEqual(an.avgDuration, { all: 31.5, plus: null, ultra: null });
assert.equal(an.conversion, null);
assert.deepEqual(an.campaigns, [{ id: "c1", code: "LAUNCH", redemptions: 3, users: 3, stillActive: null }]);
const none = normalizeAnalytics({});
for (const [k, v] of Object.entries(none)) assert.equal(v, null, `${k} is null without data`);
assert.deepEqual(normalizeAnalytics({ conversion: { rate: 0.1, numerator: 1, denominator: 10, denominator_label: "granted" } }).conversion, { rate: 0.1, numerator: 1, denominator: 10, denominatorLabel: "granted" });

// the server's active series is one total per bucket (all plans)
assert.deepEqual(normalizeAnalytics({ active: [{ bucket: "2026-10-01T00:00:00+00:00", total: 5 }] }).active, [{ label: "2026-10-01T00:00:00+00:00", values: [5] }]);

console.log("premiumModel.selftest ok");
