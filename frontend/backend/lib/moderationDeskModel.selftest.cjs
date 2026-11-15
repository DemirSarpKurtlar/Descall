"use strict";

/** node backend/lib/moderationDeskModel.selftest.cjs */
const assert = require("assert");
const m = require("./moderationDeskModel");

const now = Date.parse("2026-11-14T20:00:00Z");
const ago = (d) => new Date(now - d * 86400000).toISOString();
const rule = { id: "r1", name: "", enabled: true, categories: ["language", "spam"], window_days: 30, steps: m.SUGGESTED_RULE.steps, discount_early_lift: true };

// stepFor clamps to the last step
assert.strictEqual(m.stepFor(rule.steps, 1).kind, "warn");
assert.strictEqual(m.stepFor(rule.steps, 3).kind, "ban");
assert.strictEqual(m.stepFor(rule.steps, 9).seconds, 7 * 86400);
assert.strictEqual(m.stepFor([], 1), null);

// weights: ban > kick > timeout (longer heavier) > warn; permanent ban heaviest
assert.ok(m.stepWeight({ kind: "ban", seconds: 3600 }) > m.stepWeight({ kind: "kick" }));
assert.ok(m.stepWeight({ kind: "timeout", seconds: 86400 }) > m.stepWeight({ kind: "timeout", seconds: 3600 }));
assert.ok(m.stepWeight({ kind: "ban", seconds: null }) > m.stepWeight({ kind: "ban", seconds: 365 * 86400 }));

// counting: category, window and early-lift discount
const rows = [
  { action_type: "timeout", category: "language", created_at: ago(2) },
  { action_type: "timeout", category: "language", created_at: ago(40) },
  { action_type: "timeout", category: "harassment", created_at: ago(1) },
  { action_type: "kick", category: "spam", created_at: ago(3), meta: { earlyLift: true, discount: true } },
  { action_type: "untimeout", category: "language", created_at: ago(1) },
];
assert.strictEqual(m.countingSanctions(rows, rule, now).length, 1);
assert.strictEqual(m.countingSanctions(rows, { ...rule, discount_early_lift: false }, now).length, 2);

// escalation preview (before) and after the sanction was saved
let e = m.escalationFor([rule], rows, { category: "language", action: "timeout", seconds: 3600, now });
assert.strictEqual(e.nth, 2);
assert.strictEqual(e.step.kind, "timeout");
assert.strictEqual(e.stronger, false);
e = m.escalationFor([rule], [...rows, { action_type: "timeout", category: "language", created_at: ago(0) }], { category: "language", action: "timeout", seconds: 3600, now });
assert.strictEqual(e.nth, 3);
assert.strictEqual(e.step.kind, "ban");
assert.strictEqual(e.stronger, true);
assert.strictEqual(e.suggestOnly, true);
e = m.escalationFor([rule], [...rows, { action_type: "timeout", category: "language", created_at: ago(0) }], { category: "language", action: "timeout", now, includeCurrent: true });
assert.strictEqual(e.nth, 2);
assert.strictEqual(m.escalationFor([rule], rows, { category: "nsfw", action: "timeout", now }), null);
assert.strictEqual(m.escalationFor([{ ...rule, enabled: false }], rows, { category: "language", now }), null);

// validation
const cats = new Set(["language", "spam"]);
assert.throws(() => m.validateRule({ categories: [], steps: [{ kind: "warn" }] }, cats), /category/);
assert.throws(() => m.validateRule({ categories: ["spam"], steps: [{ kind: "timeout", seconds: 5 }] }, cats), /minute/);
const clean = m.validateRule({ name: " x ", categories: ["spam", "spam", "nope"], windowDays: 999, steps: [{ kind: "kick", seconds: 50 }, { kind: "ban", seconds: 10 }] }, cats);
assert.deepStrictEqual(clean.categories, ["spam"]);
assert.strictEqual(clean.window_days, 365);
assert.deepStrictEqual(clean.steps, [{ kind: "kick", seconds: null }, { kind: "ban", seconds: null }]);
assert.strictEqual(clean.ban_suggest_only, true);
assert.throws(() => m.validateTemplate({ action: "timeout", category: "spam" }, cats), /length/);
assert.strictEqual(m.validateTemplate({ action: "kick", category: "spam", durationSeconds: 60 }, cats).duration_seconds, null);

// history status
assert.strictEqual(m.historyStatus({ action_type: "kick" }, { now }), "done");
assert.strictEqual(m.historyStatus({ action_type: "timeout", expires_at: ago(-1) }, { now, currentlyActive: true }), "active");
assert.strictEqual(m.historyStatus({ action_type: "timeout", expires_at: ago(1) }, { now }), "ended");
assert.strictEqual(m.historyStatus({ action_type: "timeout", revoked_at: ago(0) }, { now, currentlyActive: true }), "lifted");
assert.strictEqual(m.historyStatus({ action_type: "ban", expires_at: null }, { now, appeal: "pending", currentlyActive: true }), "appeal_pending");
assert.strictEqual(m.historyStatus({ action_type: "ban", expires_at: null }, { now, currentlyActive: true }), "active");

// chart buckets + CSV safety
const buckets = m.dailyBuckets([{ action_type: "ban", created_at: ago(0) }, { action_type: "timeout", createdAt: ago(1) }, { action_type: "unban", created_at: ago(0) }], { days: 3, now });
assert.strictEqual(buckets.length, 3);
assert.deepStrictEqual(buckets[2], { day: "2026-11-14", timeout: 0, ban: 1, kick: 0 });
assert.strictEqual(buckets[1].timeout, 1);
assert.strictEqual(m.csvCell("=HYPERLINK(1)"), "\"'=HYPERLINK(1)\"");
assert.strictEqual(m.csvCell('a "b", c'), '"a ""b"", c"');
assert.ok(m.historyCsv([{ createdAt: "x", action: "ban", target: { username: "u" }, auto: true }]).split("\n")[1].includes(",auto,"));

console.log("moderationDeskModel selftest ok");
