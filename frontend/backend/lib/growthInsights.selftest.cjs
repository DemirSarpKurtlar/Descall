"use strict";
// node backend/lib/growthInsights.selftest.cjs
// Faz 3 (3.7.5): retention + DesCoin economy math.
const assert = require("assert");
const g = require("./growthInsights");

const today = "2026-10-31"; // Saturday
const t = g.dayNum(today);
const d = (off) => g.dayStr(t + off);
assert.equal(g.dayStr(g.weekStart(t)), "2026-10-26", "weeks start on Monday");

// --- retention ---
const users = [
  { id: "a", signupDay: d(-40) }, // returns on day 1, week 2, month 2
  { id: "b", signupDay: d(-40) }, // never returns
  { id: "c", signupDay: d(-3) },  // too young for week 2
  { id: "x", signupDay: d(-40), isAdmin: true }, // ignored
];
const activity = [
  { user_id: "a", day: d(-40) }, { user_id: "a", day: d(-39) }, { user_id: "a", day: d(-30) }, { user_id: "a", day: d(-5) }, { user_id: "a", day: d(0) },
  { user_id: "b", day: d(-40) },
  { user_id: "c", day: d(-3) }, { user_id: "c", day: d(-2) }, { user_id: "c", day: d(0) },
  { user_id: "x", day: d(0) },
  { user_id: "ghost", day: d(0) }, // unknown account, ignored
];
const r = g.retentionReport({ activity, users, today, days: 30 });
assert.equal(r.kpis.dau, 2, "admin and unknown accounts left out");
assert.equal(r.kpis.wau, 2);
assert.equal(r.kpis.mau, 2);
assert.equal(r.kpis.accounts, 3);
assert.equal(r.kpis.newInRange, 1);
assert.deepEqual(r.returns.d1, { eligible: 3, kept: 2, pct: 66.7 }, "a and c came back the next day");
assert.deepEqual(r.returns.w2, { eligible: 2, kept: 1, pct: 50 }, "c is too young for week 2");
assert.deepEqual(r.returns.m2, { eligible: 0, kept: 0, pct: null }, "nobody is 59 days old yet");
assert.equal(r.series.length, 30);
const last = r.series[r.series.length - 1];
assert.deepEqual([last.active, last.new, last.returning], [2, 0, 2]);
const cSignup = r.series.find((s) => s.day === d(-3));
assert.deepEqual([cSignup.active, cSignup.new, cSignup.signups], [1, 1, 1]);
assert.equal(r.cohorts.length, 10);
const cw = r.cohorts[r.cohorts.length - 1];
assert.equal(cw.weekStart, "2026-10-26");
assert.equal(cw.size, 1);
assert.deepEqual(cw.cells, [{ week: 0, active: 1, pct: 100, partial: true }]);
const old = r.cohorts.find((c) => c.size === 2);
assert.ok(old, "the 40-day cohort is in range");
assert.equal(old.cells[0].pct, 100, "both active in the signup week");
assert.ok(old.cells.some((c) => c.week > 0 && c.pct === 50), "a comes back later");

// --- economy ---
const flow = [
  { day: d(0), reason: "voice_activity", minted: 100, spent: 0 },
  { day: d(-1), reason: "daily_claim", minted: 50, spent: 0 },
  { day: d(-1), reason: "shop_purchase", minted: 0, spent: 120 },
  { day: d(-2), reason: "admin_grant", minted: 2000000000, spent: 0 },
  { day: d(-60), reason: "promo", minted: 999, spent: 0 }, // outside 30 days
];
const balances = [
  { id: "a", username: "a", balance: 600 },
  { id: "t", username: "tester", balance: 1000000050, granted: 1000000000 },
  { id: "b", username: "b", balance: 300 },
  { id: "c", username: "c", balance: 100, frozen: true },
  { id: "z", username: "z", balance: 0 },
  { id: "x", username: "admin", balance: 2000000000, isAdmin: true },
];
const purchases = [
  { item_id: "i1", amount_descoin: 250, status: "paid", created_at: d(-1) },
  { item_id: "i1", amount_descoin: 250, status: "paid", created_at: d(-2) },
  { item_id: "i2", amount_descoin: 500, status: "refunded", created_at: d(-2) },
  { item_id: "i3", amount_descoin: 80, status: "paid", created_at: d(-50) },
];
const items = [{ id: "i1", name: "Türkiye", category: "countries" }, { id: "i2", name: "Çerçeve", category: "frame" }];
const e = g.economyReport({ flow, balances, purchases, items, today, days: 30 });
assert.equal(e.kpis.supply, 1050, "admin balances and admin-granted coins are not supply");
assert.equal(e.kpis.grantedHeld, 1000000000);
assert.equal(e.kpis.holders, 4);
assert.equal(e.kpis.median, 100, "lower median of 50, 100, 300, 600");
assert.equal(e.kpis.top10Share, 57.1, "top 10% = 1 holder of 4 → 600 of 1050");
assert.deepEqual(e.grantedTop.map((x) => x.username), ["tester"]);
assert.equal(e.kpis.minted, 150, "admin grants and out-of-range rows are left out");
assert.equal(e.kpis.spent, 120);
assert.equal(e.kpis.net, 30);
assert.equal(e.kpis.sinkRatio, 80);
assert.equal(e.kpis.adminGranted, 2000000000);
assert.equal(e.kpis.frozen, 1);
assert.deepEqual(e.sources, [{ key: "activity", amount: 100 }, { key: "daily", amount: 50 }]);
assert.deepEqual(e.sinks, [{ key: "shop", amount: 120 }]);
assert.equal(e.daily.length, 30);
assert.deepEqual(e.daily.find((x) => x.day === d(-1)), { day: d(-1), minted: 50, spent: 120 });
assert.equal(e.topHolders[0].username, "a");
assert.equal(e.topHolders[0].share, 57.1);
assert.ok(!e.topHolders.some((h) => h.username === "admin"));
assert.deepEqual(e.bestSellers, [{ itemId: "i1", name: "Türkiye", category: "countries", count: 2, descoin: 500 }], "refunded and old sales left out");
assert.equal(g.groupOf("screenshare_activity"), "activity");
assert.equal(g.groupOf("something_new"), "other");
console.log("growthInsights.selftest: ok");
