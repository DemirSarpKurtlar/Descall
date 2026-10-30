// Run: node src/components/admin/adminOverviewModel.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  presenceSegments, signupTrend, signedDelta, buildTodo, pendingCount, auditVerb, auditTargetLabel,
} from "./adminOverviewModel.js";

// Presence bar: fixed order, zeros dropped, junk = 0.
assert.deepEqual(presenceSegments({ dnd: 2, online: 5, idle: 0, invisible: "x" }), [["online", 5], ["dnd", 2]]);
assert.deepEqual(presenceSegments(null), []);

// Signups: today vs yesterday + 7-day mean.
const week = [1, 2, 3, 4, 5, 6, 7].map((signups) => ({ signups }));
assert.deepEqual(signupTrend(week), { delta: 1, avg: 4 });
assert.deepEqual(signupTrend(week, 3), { delta: -3, avg: 4 }, "live today count wins over the sparkline");
assert.deepEqual(signupTrend([{ signups: 4 }]), { delta: null, avg: 4 });
assert.deepEqual(signupTrend(undefined), { delta: null, avg: null });
assert.equal(signedDelta(3), "+3");
assert.equal(signedDelta(-2), "−2");
assert.equal(signedDelta(0), "±0");
assert.equal(signedDelta(null), "");

// To-do: quiet day = only green checks, nothing pending.
const calm = buildTodo({ product: {}, safety: {}, system: {} });
assert.ok(calm.length >= 3 && calm.every((x) => x.level === "ok"));
assert.equal(pendingCount(calm), 0);
assert.ok(calm.every((x) => !x.tab), "green rows have no Aç button");

// Busy day: bad first, then warn, then ok; every action row names its tab.
const busy = buildTodo({
  product: { feedbackInProgress: 2, feedbackFocus: { username: "a", excerpt: "x" }, newFeedback: 4 },
  safety: { openReports: 3, hotTargets: [{ id: 1 }] },
  system: { flaggedMessages: 1, errorsLastHour: 5, maintenance: true, rssMb: 900 },
  health: { alerts: [{ id: "errors" }, { id: "memory" }] },
});
const rank = { bad: 0, warn: 1, ok: 2 };
for (let i = 1; i < busy.length; i++) assert.ok(rank[busy[i - 1].level] <= rank[busy[i].level], "sorted bad → warn → ok");
assert.equal(busy[0].level, "bad");
assert.ok(busy.filter((x) => x.level !== "ok").every((x) => x.tab), "every open item links to its section");
assert.equal(busy.find((x) => x.id === "reports-hot")?.tab, "reports");
assert.equal(busy.find((x) => x.id === "errors")?.level, "bad", "error alert escalates");
assert.ok(busy.some((x) => x.id === "memory"));
assert.equal(busy.filter((x) => x.id === "maintenance").length, 1, "maintenance listed once");
assert.equal(pendingCount(busy), busy.filter((x) => x.level !== "ok").length);
assert.deepEqual(busy.find((x) => x.id === "feedback-active").sub, { focus: { username: "a", excerpt: "x" } });

// Every todo key exists in both locales.
const here = dirname(fileURLToPath(import.meta.url));
const tr = readFileSync(join(here, "../../i18n/locales/tr.js"), "utf8");
const en = readFileSync(join(here, "../../i18n/locales/en.js"), "utf8");
const keys = new Set();
for (const item of [...calm, ...busy, ...buildTodo({ safety: { openReports: 2 }, system: { chatFrozen: true } })]) {
  keys.add(item.title[0]);
  if (Array.isArray(item.sub)) keys.add(item.sub[0]);
}
for (const k of keys) {
  const leaf = k.split(".").pop();
  assert.ok(tr.includes(`"${leaf}":`) && en.includes(`"${leaf}":`), `locale key ${k}`);
}

// Audit: readable verbs, never raw codes or ids.
assert.equal(auditVerb("ban", "tr"), "banladı");
assert.equal(auditVerb("ban", "en"), "banned");
assert.equal(auditVerb("antibot_rule_update", "tr"), "bot denetimi: rule update");
assert.equal(auditVerb("shop_item.update", "en"), "shop item update");
assert.equal(auditVerb("", "tr"), "bir işlem yaptı");
assert.equal(auditTargetLabel("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), "");
assert.equal(auditTargetLabel("1234567890"), "");
assert.equal(auditTargetLabel("null"), "");
assert.equal(auditTargetLabel("demir"), "demir");
assert.equal(auditTargetLabel("x".repeat(60)).length, 40);

console.log(`adminOverviewModel.selftest ok (${keys.size} todo keys)`);
