"use strict";
// Run: node lib/auditConsoleModel.selftest.cjs
// İşlem kaydı console model: catalog, filters, merging (twins, duplicates, agent
// bursts), multi-source paging, anomaly windows, summary, CSV export.
const assert = require("node:assert/strict");
const m = require("./auditConsoleModel");

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const T1 = "00000000-0000-4000-8000-000000000101";
const base = Date.parse("2026-11-14T20:12:00.000Z");
const at = (sec) => new Date(base + sec * 1000).toISOString();
const e = (id, sec, action, target, extra = {}) => ({ id, at: at(sec), actorId: A, actorUsername: "baran", action, target, meta: {}, source: "admin_audit", ...extra });

// catalog
assert.deepEqual(m.classify("ban"), { category: "sanctions", severity: "critical", known: true });
assert.equal(m.classify("premium_extend").category, "economy");
assert.equal(m.classify("antibot_trust").category, "sanctions");
assert.equal(m.classify("error_500").category, "system");
assert.equal(m.classify("popup_schedule").category, "content");
assert.deepEqual(m.classify("totally_new_code"), { category: "other", severity: "low", known: false });
assert.equal(m.severityOf({ action: "descoin_grant", meta: { amount: 50000 } }), "critical");
assert.equal(m.severityOf({ action: "descoin_grant", meta: { amount: 100 } }), "high");
assert.equal(m.isUndoable("ban"), true);
assert.equal(m.isUndoable("message_delete"), false);
const econ = m.codesForCategories(["economy"]);
assert.ok(econ.codes.includes("wallet_freeze") && econ.prefixes.includes("premium_"));

// filters
const f = m.parseFilter({ actor: "@baran,demir", cat: "sanctions,bogus", sev: "critical", range: "24h", q: " kaan " }, { now: base });
assert.deepEqual(f.actors, ["baran", "demir"]);
assert.deepEqual(f.categories, ["sanctions"]);
assert.deepEqual(f.severities, ["critical"]);
assert.equal(f.q, "kaan");
assert.equal(f.from, new Date(base - 86400e3).toISOString());
assert.equal(m.parseFilter({ from: "2026-11-01T00:00:00Z" }).range, "custom");
assert.equal(m.parseFilter({ merge: "0" }).merge, false);
const ban = e("1", 0, "ban", T1, { targetUsername: "kaan", meta: { reason: "Spam" } });
assert.equal(m.matchesFilter(ban, f), true);
assert.equal(m.matchesFilter({ ...ban, actorUsername: "ece", actorId: B }, f), false);
assert.equal(m.matchesFilter(ban, m.parseFilter({ target: T1 })), true);
assert.equal(m.matchesFilter(ban, m.parseFilter({ target: "kaan" }), { targetIds: [T1] }), true);
assert.equal(m.matchesFilter(ban, m.parseFilter({ q: "spam" })), true);
assert.equal(m.matchesFilter(ban, m.parseFilter({ q: "yok" })), false);
assert.equal(m.matchesFilter(e("x", 0, "agent_tool", "user_lookup"), m.parseFilter({ actor: "agent" })), true);
assert.equal(m.matchesFilter(ban, m.parseFilter({ source: "agent" })), false);
assert.equal(m.matchesFilter(ban, m.parseFilter({ after: at(0) })), false);

// normalize moderation_actions
const mod = m.normalize({ id: "m1", action_type: "ban", target_user_id: T1, actor_user_id: A, created_at: at(0.4), category: "spam", reason: "Spam", expires_at: null }, "mod");
assert.equal(mod.source, "moderation_actions");
assert.equal(mod.meta.category, "spam");

// merge: twin + duplicate + agent burst
const rows = [
  e("1", 0, "ban", T1, { meta: { reason: "Spam" } }),
  e("1", 0, "ban", T1), // same id twice (memory + durable)
  mod,
  e("2", 1.2, "ban", T1), // duplicate within 2 s
  e("3", 1.5, "dm_view", "a::b"),
  e("t1", 30, "agent_tool", "user_lookup", { meta: { path: "/admin/people/x", status: 200, threadId: "th" } }),
  e("t2", 40, "agent_tool", "suspicious", { meta: { path: "/admin/antibot", status: 200, threadId: "th" } }),
  e("t3", 50, "agent_tool", "clusters", { meta: { path: "/admin/antibot/c", status: 403, threadId: "th" } }),
  e("t4", 500, "agent_tool", "user_lookup", { meta: { path: "/admin/people/y", status: 200, threadId: "th" } }),
];
const merged = m.mergeEntries(rows);
const banRow = merged.find((r) => r.action === "ban");
assert.equal(merged.filter((r) => r.action === "ban").length, 1, "one ban row");
assert.equal(banRow.twins.length, 1, "moderation_actions twin folded");
assert.equal(banRow.merged.length, 1, "duplicate merged");
assert.equal(banRow.severity, "critical");
assert.equal(banRow.undoable, true);
const runs = merged.filter((r) => r.action === "agent_run");
assert.equal(runs.length, 2, "two bursts (gap > 90 s)");
const burst = runs.find((r) => r.count === 3);
assert.deepEqual(burst.tools.map((t) => t.tool), ["user_lookup", "suspicious", "clusters"], "oldest first");
assert.equal(burst.ok, false);
assert.equal(m.mergeEntries(rows, { merge: false }).filter((r) => r.action === "ban").length, 2);
// A different action between two copies still merges.
const between = m.mergeEntries([e("a", 0, "timeout", T1), e("b", 0.5, "dm_view", "k"), e("c", 1, "timeout", T1)]);
assert.equal(between.filter((r) => r.action === "timeout").length, 1);
// moderation_actions row without a twin stays.
assert.equal(m.mergeEntries([mod]).length, 1);

// paging cut-off
assert.equal(m.pageCutoff([{ rows: [e("1", 10, "ban", T1), e("2", 5, "ban", T1)], full: true }, { rows: [e("3", 1, "ban", T1)], full: false }]), at(5));
assert.equal(m.pageCutoff([{ rows: [e("1", 10, "ban", T1)], full: false }]), null);

// anomalies: 9 bans in 60 s by one admin
const burstBans = Array.from({ length: 9 }, (_, i) => e(`b${i}`, i * 7, "ban", `00000000-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`, { meta: { category: "spam" } }));
const history = burstBans.concat([e("h1", -3600 * 5, "ban", T1), e("h2", -3600 * 30, "dm_view", "k")]);
const rules = m.effectiveRules([]);
const found = m.detectAnomalies(burstBans, rules, { history });
assert.equal(found.length, 1);
assert.equal(found[0].rule, "ban_burst");
assert.equal(found[0].count, 9);
assert.equal(found[0].entryIds.length, 9);
assert.equal(found[0].usualPerHour, 0.3, "1 other ban over 3 active hours");
assert.equal(m.detectAnomalies(burstBans, rules, { reviewedKeys: [found[0].key] }).length, 0, "reviewed alert hidden");
assert.equal(m.detectAnomalies(burstBans.slice(0, 5), rules).length, 0, "5 is the limit, not over it");
assert.equal(m.detectAnomalies(burstBans, m.effectiveRules([{ key: "ban_burst", enabled: false, threshold: 5, window_sec: 60 }])).length, 0);
assert.equal(m.effectiveRules([{ key: "ban_burst", threshold: 99999, window_sec: 1 }])[0].limit, 1000);

// summary
const now = base + 3600e3;
const sum = m.summarize(m.mergeEntries(rows.concat(burstBans, [e("u1", 100, "unban", T1, { meta: { undoOf: "1" } }), e("d1", 200, "premium_denied", "/premium/bulk")])), { now, anomalies: found });
assert.equal(sum.kpis.agent.value, 4);
assert.equal(sum.kpis.agent.runs, 2);
assert.equal(sum.kpis.denied.value, 1);
assert.equal(sum.kpis.denied.top, "baran");
assert.equal(sum.kpis.undone.value, 1);
assert.equal(sum.kpis.undone.people, 1);
assert.ok(sum.kpis.critical.value >= 10);
assert.equal(sum.chart.buckets.length, 24);
assert.ok(sum.chart.buckets.some((b) => b.hot), "hot bucket marked");
assert.ok(sum.chart.series.includes("baran"));
assert.ok(sum.leaderboard.find((r) => r.key === "agent"), "agent row on the board");
const lb = sum.leaderboard.find((r) => r.key === "baran");
assert.equal(lb.days.length, 7);
assert.ok(lb.hotDay >= 0);

// CSV: formula injection guarded, quoting
const csv = m.toCsv([{ ...banRow, meta: { reason: "=HYPERLINK(1)", _req: { ip: "1.2.x.x" } } }], { [T1]: { username: "kaan" } });
assert.ok(csv.startsWith("id,at_utc,at_istanbul,actor,action"));
assert.ok(csv.includes("kaan"));
assert.ok(!csv.includes("_req"), "request facts never exported");
assert.ok(csv.includes(",3,"), "1 + merged + twin");

console.log("auditConsoleModel.selftest ok");
