"use strict";
// node backend/lib/bugHunter/model.selftest.cjs
// Bug Avcısı rules (model.js) and the retroactive candidate list (candidates.js).
const assert = require("assert");
const m = require("./model");
const c = require("./candidates");
const { formatReport, formatCsv } = require("../../scripts/bugHunterCandidates");

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Tiers: I at 1, II at 5, III at 15.
assert.deepStrictEqual([0, 1, 4, 5, 14, 15, 99].map(m.levelFor), [0, 1, 1, 2, 2, 3, 3]);
assert.deepStrictEqual(m.nextTier(0), { level: 1, min: 1, left: 1 });
assert.deepStrictEqual(m.nextTier(3), { level: 2, min: 5, left: 2 });
assert.deepStrictEqual(m.nextTier(12), { level: 3, min: 15, left: 3 });
assert.strictEqual(m.nextTier(15), null);
assert.strictEqual(m.levelFor(-3), 0);

// Rewards by severity; also-found is smaller.
assert.deepStrictEqual(m.SEVERITIES.map((s) => m.rewardFor("first", s)), [25, 50, 100, 250]);
assert.deepStrictEqual(m.SEVERITIES.map((s) => m.rewardFor("also", s)), [10, 20, 40, 100]);
for (const s of m.SEVERITIES) assert(m.rewardFor("also", s) < m.rewardFor("first", s), `also < first for ${s}`);
assert.strictEqual(m.rewardFor("first", "nope"), 50, "unknown severity reads as medium");
assert.strictEqual(m.rewardKey(U(1), 2), `bug_bounty:${U(1)}:2`);
assert.strictEqual(m.rewardKey(U(1), 2, "revoke"), `bug_bounty:${U(1)}:2:revoke`);

// Input.
assert.deepStrictEqual(m.sanitizeConfirm({ severity: "high", note: "  menü   açılmıyor " }), { severity: "high", note: "menü açılmıyor", duplicateOf: null });
assert.strictEqual(m.sanitizeConfirm({}).error, "BAD_SEVERITY");
assert.strictEqual(m.sanitizeConfirm({ severity: "urgent" }).error, "BAD_SEVERITY");
assert.strictEqual(m.sanitizeConfirm({ severity: "low", duplicateOf: "x" }).error, "BAD_DUPLICATE");
assert.deepStrictEqual(m.sanitizeConfirm({ duplicateOf: U(9) }), { severity: null, note: null, duplicateOf: U(9) }, "a duplicate may inherit the severity");
assert.strictEqual(m.sanitizeConfirm({ severity: "low", note: "x".repeat(400) }).note.length, 280);
assert.strictEqual(m.sanitizeReason("  a "), null);
assert.strictEqual(m.sanitizeReason("yanlış kişi"), "yanlış kişi");
assert.strictEqual(m.sanitizeReason("y".repeat(500)).length, 300);

// Tally / leaderboard / totals: first and also are counted apart, undone rows are ignored.
const rows = [
  { feedback_id: U(11), user_id: U(1), severity: "high", credit: "first", confirmed_at: "2026-11-02T10:00:00Z", reward: 100, reward_state: "paid" },
  { feedback_id: U(12), user_id: U(1), severity: "critical", credit: "first", confirmed_at: "2026-11-05T10:00:00Z", reward: 250, reward_state: "paid", fixed_at: "2026-11-06T10:00:00Z" },
  { feedback_id: U(13), user_id: U(2), severity: "high", credit: "also", duplicate_of: U(11), confirmed_at: "2026-11-03T10:00:00Z", reward: 40, reward_state: "paid" },
  { feedback_id: U(14), user_id: U(2), severity: "low", credit: "first", confirmed_at: "2026-11-04T10:00:00Z", reward: 25, reward_state: "reversed", undone_at: "2026-11-04T11:00:00Z" },
  { feedback_id: U(15), user_id: U(3), severity: "medium", credit: "first", confirmed_at: "2026-11-01T10:00:00Z", reward: 50, reward_state: "kept" },
];
const t = m.tally(rows);
assert.deepStrictEqual({ ...t.get(U(1)), bySeverity: undefined }, { first: 2, also: 0, critical: 1, since: "2026-11-02T10:00:00Z", last: "2026-11-05T10:00:00Z", level: 1, bySeverity: undefined });
assert.strictEqual(t.get(U(2)).first, 0, "undone row ignored");
assert.strictEqual(t.get(U(2)).also, 1);
assert.strictEqual(t.get(U(2)).level, 0, "also-found does not level the badge");
const users = new Map([[U(1), { username: "ayse" }], [U(2), { username: "mert" }], [U(3), { username: "deniz", display_name: "Deniz" }]]);
const lb = m.leaderboard(rows, users);
assert.deepStrictEqual(lb.map((r) => r.username), ["ayse", "deniz", "mert"], "most first credits, then also-found");
assert.strictEqual(lb[1].displayName, "Deniz");
assert.deepStrictEqual(lb[0].bySeverity, { low: 0, medium: 0, high: 1, critical: 1 });
const tot = m.totals(rows);
assert.deepStrictEqual({ first: tot.first, also: tot.also, critical: tot.critical, paid: tot.paid, fixed: tot.fixed, people: tot.people }, { first: 3, also: 1, critical: 1, paid: 440, fixed: 1, people: 3 });

// Thread line: English text + i18n refs; the sender never needs the admin's name.
const e = m.threadEntry({ event: "confirmed", severity: "high", level: 2, badge: "up", count: 5, reward: 100, fixedNow: true, adminUsername: "demir" });
assert.strictEqual(e.type, "bughunt");
assert.strictEqual(e.text, "The bug you reported was real, and we fixed it.");
assert.strictEqual(e.i18n.text.key, "bot.bughunt.confirmedFixed");
assert.strictEqual(e.badgeLine, "Your badge leveled up to Bug Hunter II.");
assert.deepStrictEqual(e.i18n.badgeLine, { key: "bot.bughunt.badgeUp", vars: { level: "II", count: 5 } });
assert.strictEqual(e.rewardLine, "+100 DesCoin");
assert.strictEqual(e.badgeId, "bughunter");
const crit = m.threadEntry({ event: "confirmed", severity: "critical", level: 1, badge: "new", count: 1, critical: true, reward: 250 });
assert.strictEqual(crit.badgeId, "kritikbug");
assert.strictEqual(crit.i18n.text.key, "bot.bughunt.confirmed");
assert.strictEqual(crit.criticalLine, "You also earned the rare Critical Bug Hunter badge.");
const also = m.threadEntry({ event: "also", severity: "low", reward: 10 });
assert.strictEqual(also.i18n.text.key, "bot.bughunt.also");
assert.strictEqual(also.badgeLine, undefined);
assert.strictEqual(also.badgeId, null);
const fixed = m.threadEntry({ event: "fixed", severity: "low" });
assert.strictEqual(fixed.text, "Fixed: the bug you reported is gone in the latest version. Thank you!");
assert.strictEqual(fixed.rewardLine, undefined);
assert.deepStrictEqual(m.notifyCopy(e), { titleKey: "bot.notify.bugConfirmedTitle", bodyKey: "bot.notify.bugLevelUpBody", vars: { level: "II" } });
assert.strictEqual(m.notifyCopy(fixed).bodyKey, "bot.notify.bugFixedBody");
assert.strictEqual(m.notifyCopy(also).vars.amount, 10);
const u = m.undoLine({ adminUsername: "demir", reason: "kopya değilmiş" });
assert.strictEqual(u.type, "system");
assert.strictEqual(u.internal, true, "undo line stays admin-only");
assert.strictEqual(u.text, "demir undid the bug confirmation: kopya değilmiş");
assert.deepStrictEqual(m.badgeStats({ level: 2, first_count: 7, also_count: 1, critical_count: 0, since: "2026-11-01T00:00:00Z" }), { level: 2, bugs: 7, also: 1, critical: 0, since: "2026-11-01T00:00:00Z" });

// Retroactive candidates: read-only scoring.
const fb = (n, extra) => ({ id: U(100 + n), user_id: U(n % 3 + 1), username: `u${n}`, category: "bug", status: "new", subject: `Konu ${n}`, admin_replies: [], created_at: `2026-0${(n % 9) + 1}-01T00:00:00Z`, ...extra });
const team = (text) => ({ id: "r", type: "reply", isAdmin: true, text });
const list = [
  fb(1, { status: "resolved", admin_replies: [team("Düzelttik, 3.8.1 ile geliyor")] }),
  fb(2, { status: "resolved" }),
  fb(3, { status: "closed", admin_replies: [{ type: "system", status: "resolved", text: "demir set the status to Resolved" }] }),
  fb(4, { status: "in_progress", admin_replies: [team("https://github.com/acme/descall/pull/812 ile çözüldü")] }),
  fb(5, { status: "in_progress", admin_replies: [team("Bakıyoruz")] }),
  fb(6, { status: "resolved", category: "feature" }),
  fb(7, { status: "resolved", kind: "bug", category: "improvement" }),
  fb(8, { status: "resolved", user_id: U(9) }),
  fb(9, { status: "resolved", admin_replies: [{ type: "reply", isAdmin: false, text: "düzelttim sanırım" }] }),
];
const people = new Map([[U(1), { username: "ayse" }], [U(2), { username: "mert" }], [U(3), { username: "deniz" }], [U(9), { username: "silindi", deleted_at: "2026-10-01" }]]);
const r = c.findCandidates(list, people, new Set([U(102)]));
const ids = r.items.map((i) => i.feedbackId);
assert(!ids.includes(U(102)), "already confirmed items are left out");
assert(!ids.includes(U(105)), "an open item with no fix signal is left out");
assert(!ids.includes(U(106)), "feature requests are not bugs");
assert(ids.includes(U(107)), "kind bug counts even with another category");
assert(!ids.includes(U(108)), "deleted accounts are left out");
assert.deepStrictEqual(c.signalsOf(list[0]), ["resolved", "fix_reply"]);
assert.deepStrictEqual(c.signalsOf(list[3]), ["fix_link", "fix_reply"]);
assert.deepStrictEqual(c.signalsOf(list[2]), ["resolved"], "resolved before it was closed");
assert.deepStrictEqual(c.signalsOf(list[8]), ["resolved"], "the sender's own words are not a team fix");
assert.strictEqual(r.items.find((i) => i.feedbackId === U(101)).confidence, "high");
assert.strictEqual(r.items.find((i) => i.feedbackId === U(104)).confidence, "high");
assert.strictEqual(r.items.find((i) => i.feedbackId === U(103)).confidence, "medium");
assert.strictEqual(r.items[0].confidence, "high", "high confidence first");
assert(r.people.every((p) => p.username), "usernames for the owner");
assert.strictEqual(r.counts.items, r.items.length);
const text = formatReport({ ...r, scanned: list.length });
assert(/Bug Avcısı geçmiş adayları \(yalnızca okuma, hiçbir şey verilmedi\)/.test(text));
assert(/@ayse/.test(text) && /düzeltme bağlantısı/.test(text));
assert(!/Valorant|takim bul/i.test(text));
const csv = formatCsv(r).split("\n");
assert.strictEqual(csv[0], "feedback_id,user_id,username,created_at,status,confidence,signals,subject");
assert.strictEqual(csv.length, r.items.length + 1);

console.log("bugHunter model selftest: ok");
