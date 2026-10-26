"use strict";
/** Kayıt İstatistikleri aggregation: Istanbul days, KPIs, funnel, D1/D7, countries. */
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";
const assert = require("assert/strict");
const ss = require("../lib/signupStats");

const now = new Date("2026-10-26T18:00:00.000Z"); // 21:00 Istanbul
assert.equal(ss.istDay("2026-10-25T21:30:00.000Z"), "2026-10-26", "00:30 Istanbul is the next day");
assert.equal(ss.istDay("2026-10-25T20:59:00.000Z"), "2026-10-25");
const range = ss.resolveRange({}, now);
assert.deepEqual([range.from, range.to, range.granularity], ["2026-09-27", "2026-10-26", "day"]);
assert.equal(ss.resolveRange({ from: "2026-13-01", to: "2027-01-01", granularity: "x" }, now).to, "2026-10-26", "future / bad dates clamp to today");
assert.equal(ss.resolveRange({ from: "2026-10-20", to: "2026-10-10" }, now).from, "2026-10-10");

const at = (day, hh = "12") => `${day}T${hh}:00:00.000Z`;
const users = [
  { id: "a", created_at: at("2026-10-26"), auth_method: "email", first_touch_source: "direct", signup_country: "TR", first_app_opened_at: at("2026-10-26") },
  { id: "b", created_at: at("2026-10-26"), auth_method: "google", first_touch_source: "discord", signup_country: "DE" },
  { id: "c", created_at: at("2026-10-25"), auth_method: "email", first_touch_source: "referral", signup_country: null, first_app_opened_at: at("2026-10-25") },
  { id: "d", created_at: at("2026-10-18"), auth_method: null, first_touch_source: null, signup_country: "TR", first_app_opened_at: at("2026-10-18") },
  { id: "e", created_at: at("2026-04-18"), auth_method: "apple", first_touch_source: "weird", deleted_at: at("2026-05-01") },
  { id: "f", created_at: "2026-10-25T21:30:00.000Z", auth_method: "email" }, // 00:30 on the 26th in Istanbul
];
const attempts = [
  { created_at: at("2026-10-26"), status: "failed", attempt_key: "k1" },
  { created_at: at("2026-10-26"), status: "completed", attempt_key: "k1" },
  { created_at: at("2026-10-25"), status: "failed", attempt_key: "k2" },
  { created_at: at("2026-10-25"), status: "failed", attempt_key: "k2" },
  { created_at: at("2026-08-01"), status: "failed", attempt_key: "old" },
];
const activeDays = [
  { user_id: "d", day: "2026-10-18" }, { user_id: "d", day: "2026-10-19" }, { user_id: "d", day: "2026-10-25" },
  { user_id: "c", day: "2026-10-25" },
];
const startedDays = ["2026-10-26", "2026-10-26", "2026-10-26", "2026-10-25", "2026-10-25", "2026-10-25", "2026-10-18", "2026-10-18", "2026-10-01", "2026-08-01"];
const s = ss.computeSignupStats({ users, attempts, activeDays, startedDays, range, now });

assert.equal(s.kpis.today.value, 3, "a, b, f (Istanbul day)");
assert.deepEqual(s.kpis.today.delta, { dir: "up", value: 2 }, "3 today vs 1 yesterday");
assert.equal(s.kpis.week.value, 4);
assert.equal(s.kpis.month.value, 5);
assert.equal(s.kpis.total.value, 6);
assert.equal(s.kpis.total.deleted, 1);
assert.equal(s.kpis.total.sinceLabel, "18 Nis 2026");
assert.equal(s.series.length, 30);
assert.equal(s.series.at(-1).count, 3);
assert.equal(s.series.at(-1).tip, "26 Eki 2026 · Pzt");
assert.equal(s.series.at(-1).avg, Math.round(((3 + 1) / 7) * 100) / 100, "7 day trailing average");
assert.equal(s.funnel.started, 9);
assert.equal(s.funnel.completed, 5);
assert.equal(s.funnel.appOpened, 3);
assert.equal(s.funnel.failed, 1, "k1 completed later, k2 counted once, old is out of range");
assert.equal(s.funnel.abandoned, 3);
assert.equal(s.funnel.completedPct, 56);
const src = Object.fromEntries(s.sources.map((x) => [x.key, x.count]));
assert.deepEqual(src, { direct: 1, discord: 1, referral: 1, other: 1, unknown: 2 });
assert.equal(s.sources.find((x) => x.key === "referral").label, "Arkadaş daveti");
assert.deepEqual(s.authMethods, { email: 3, google: 1, other: 1, unknown: 1 });
// tracking starts 2026-10-18 → only d (18th) has a finished D1 and D7 day.
assert.deepEqual(s.retention.d1, { returned: 1, eligible: 1 }, "d came back on the 19th; c's D1 is today (not over) so not eligible");
assert.deepEqual(s.retention.d7, { returned: 1, eligible: 1 });
assert.deepEqual(s.countries, [{ code: "TR", count: 2 }, { code: "DE", count: 1 }, { code: "unknown", count: 3 }]);
assert.equal(s.countrySince, "18 Eki 2026");

const w = ss.computeSignupStats({ users, attempts, activeDays, startedDays, range: ss.resolveRange({ granularity: "week" }, now), now });
assert.equal(w.series[0].key, "2026-09-21", "weeks start on Monday");
assert.equal(w.series.reduce((n, x) => n + x.count, 0), 5, "partial first/last weeks only count days inside the range");
const m = ss.computeSignupStats({ users, attempts, activeDays, startedDays, range: ss.resolveRange({ granularity: "month", from: "2026-04-01" }, now), now });
assert.deepEqual(m.series.map((x) => x.key), ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
assert.equal(m.series[0].tip, "Nis 2026");

const csv = ss.statsCsv(s);
assert.ok(csv.startsWith("\uFEFFdonem;kayit;ortalama\r\n2026-09-27;0;"));
const k1 = ss.attemptKey("1.2.3.4", "UA", "2026-10-26");
assert.equal(k1.length, 32);
assert.notEqual(k1, ss.attemptKey("1.2.3.4", "UA", "2026-10-27"), "rotates daily");
assert.ok(!k1.includes("1.2.3.4"));
console.log("signupStats.unit.test ok");
