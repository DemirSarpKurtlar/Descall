// Ajan > Operasyon modu (Taslak B): pure plan-panel helpers, the BanDialog bulk-mode form
// mapping and agentOps.<locale>.js key parity. Run: node src/components/admin/agent/agentOps.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ageKey, actionLabelParts, banFormFromParams, buildGroups, canUndoAny, clockToMinutes, compactNumber, countdown, diffChips,
  dryBar, groupCheckState, joinLabel, matchesQuery, minutesToClock, normalizeMode, onCount, planCode, promptForPlan,
  queueBar, queueItems, riskClass, rowDiffMark, rowState, scopeLimit, toolChips,
} from "./agentOpsModel.js";
import { buildBanPayload } from "../banDialogModel.js";

const here = dirname(fileURLToPath(import.meta.url));

// Codes, modes, risk colours.
assert.equal(planCode(412), "P-0412");
assert.equal(normalizeMode("apply"), "apply");
assert.equal(normalizeMode("nope"), "dry");
assert.deepEqual([94, 61, 30, null].map(riskClass), ["h", "m", "l", "l"]);

// Action chip label: "Yasakla · Spam · 30 gün".
const t = (k, v) => (v && Object.keys(v).length ? `${k}${JSON.stringify(v)}` : k);
const parts = actionLabelParts("ban", { category: "spam", presetId: "30d" }, (id) => (id === "spam" ? "Spam" : id));
assert.deepEqual(parts.map((p) => p.key || p.text), ["agentOps.act.ban", "Spam", "agentOps.dur.30d"]);
assert.equal(joinLabel(parts, t), "agentOps.act.ban · Spam · agentOps.dur.30d");
assert.equal(actionLabelParts("descoin_grant", { amount: -500 })[0].key, "agentOps.act.descoin_revoke");
assert.equal(actionLabelParts("timeout", { category: "spam", durationSeconds: 5400 }, (x) => x)[2].vars.n, 90);

// Groups: same action + same params together; excluded rows separate; search folds Turkish.
const I = (id, action, params, extra = {}) => ({ id, seq: Number(id), action, params, selected: true, status: "proposed", username: `u${id}`, evidence: { signals: [] }, ...extra });
const items = [
  I("1", "ban", { presetId: "30d" }, { risk: 94, cluster: "coin" }),
  I("2", "ban", { presetId: "30d" }, { risk: 50, cluster: "coin", username: "ayşe.k" }),
  I("3", "timeout", { presetId: "24h" }, { risk: 70 }),
  I("4", "ban", { presetId: "7d" }, { risk: 99, selected: false }),
  I("5", "ban", { presetId: "30d" }, { status: "excluded", excludedReason: "premium", selected: false }),
];
const g = buildGroups(items);
assert.equal(g.groups.length, 3);
assert.deepEqual(g.groups[0].items.map((i) => i.id), ["1", "2"]);
assert.equal(g.excluded.length, 1);
assert.equal(g.total, 4);
assert.equal(g.selected, 3);
assert.deepEqual(buildGroups(items, { mode: "risk" }).groups[0].items.map((i) => i.id), ["4", "1", "3", "2"]);
assert.equal(buildGroups(items, { mode: "cluster" }).groups[0].cluster, "coin");
assert.equal(matchesQuery(items[1], "AYSE"), true, "search folds ş/İ");
assert.equal(matchesQuery(items[1], "@ayşe"), true);
assert.equal(buildGroups(items, { query: "zzz" }).groups.length, 0);
assert.equal(groupCheckState([{ selected: true }, { selected: false }]), "mix");
assert.equal(groupCheckState([{ selected: true }]), "on");
assert.equal(groupCheckState([{ selected: false }]), "off");

// Age, bars, countdown.
const now = Date.parse("2026-11-15T12:00:00Z");
assert.deepEqual(ageKey("2026-11-13T11:00:00Z", now), { key: "agentOps.age.days", count: 2 });
assert.deepEqual(ageKey("2026-11-15T11:30:00Z", now), { key: "agentOps.age.minutes", count: 30 });
assert.equal(ageKey("bad", now), null);
assert.deepEqual(dryBar({ apply: 11, warn: 1, skip: 1, block: 0, total: 13 }), { g: 84.6, a: 7.7, r: 7.7 });
assert.deepEqual(dryBar(null), { g: 0, a: 0, r: 0 });
assert.deepEqual(queueBar({ done: 4, skipped: 1, running: 1, total: 13 }), { g: 30.8, r: 7.7, b: 7.7 });
assert.equal(countdown(new Date(now + (29 * 60 + 12) * 1000).toISOString(), now), "29:12");
assert.equal(countdown(new Date(now - 1000).toISOString(), now), null);

// Queue rows and the undo window.
assert.deepEqual(["done", "skipped", "running", "queued", "undone", "cancelled"].map((s) => rowState({ status: s })), ["ok", "fail", "run", "q", "undo", "cancel"]);
assert.equal(queueItems([{ status: "proposed" }, { status: "done" }, { status: "excluded" }]).length, 1);
const plan = { undoUntil: new Date(now + 60000).toISOString() };
assert.equal(canUndoAny(plan, [{ status: "done", action: "ban" }], now), true);
assert.equal(canUndoAny(plan, [{ status: "done", action: "kick" }], now), false, "a kick cannot be undone");
assert.equal(canUndoAny({ undoUntil: new Date(now - 1).toISOString() }, [{ status: "done", action: "ban" }], now), false);

// Diff chips under the chat message and row marks.
const diff = { removed: [{ username: "selinsu", action: "ban" }], changed: [{ username: "tuana.pxl", userId: "u7", action: "timeout", from: { action: "ban" } }], added: [{ username: "yeni", userId: "u9", action: "ban" }] };
const chips = diffChips(diff, (a) => a);
assert.deepEqual(chips.map((c) => c.tone), ["hot", "am", "gr"]);
assert.deepEqual(chips[1].vars, { name: "tuana.pxl", from: "ban", to: "timeout" });
assert.equal(rowDiffMark({ userId: "u7", action: "timeout" }, diff), "changed");
assert.equal(rowDiffMark({ userId: "u9", action: "ban" }, diff), "added");
assert.equal(rowDiffMark({ userId: "u1", action: "ban" }, diff), null);

// Tool chips: "Dosya ×14".
assert.deepEqual(toolChips([{ name: "a" }, { name: "d" }, { name: "d", status: "start" }, { name: "a" }]).map((c) => [c.name, c.count, c.status]), [["a", 1, "done"], ["d", 2, "start"], ["a", 1, "done"]]);

// Scopes.
assert.equal(onCount({ read: { on: true }, moderation: { on: true }, dm: { on: false } }), 2);
assert.deepEqual(scopeLimit("wallet", { limit: 100000 }), { key: "agentOps.scopes.lim.wallet", vars: { n: "100K" } });
assert.deepEqual(scopeLimit("dm", { on: false }).key, "agentOps.scopes.lim.dm");
assert.equal(scopeLimit("announcements", { on: false }), null);
assert.equal(compactNumber(1500000), "1,5M");
assert.equal(compactNumber(50), "50");

// Saved prompt source and clocks.
const msgs = [{ role: "user", text: "ilk" }, { role: "assistant", plans: [{ planId: "p1" }] }, { role: "user", text: "ikinci" }, { role: "assistant", plans: [{ planId: "p2" }] }];
assert.equal(promptForPlan(msgs, "p2"), "ikinci");
assert.equal(promptForPlan(msgs, "p1"), "ilk");
assert.equal(minutesToClock(545), "09:05");
assert.equal(clockToMinutes("09:05"), 545);
assert.equal(clockToMinutes("25:00"), null);

// BanDialog bulk mode: the plan group's params round-trip through the dialog's form.
const params = { category: "spam", presetId: "30d", message: "Toplu reklam", revokeSessions: true, notifyEmail: false, alsoAccessBan: true };
const body = buildBanPayload(banFormFromParams(params));
assert.deepEqual(body, { category: "spam", otherText: undefined, message: "Toplu reklam", revokeSessions: true, notifyEmail: false, alsoAccessBan: true, presetId: "30d" });
const custom = buildBanPayload(banFormFromParams({ category: "other", otherText: "Bot", durationSeconds: 7200 }));
assert.equal(custom.durationSeconds, 7200);
assert.equal(custom.otherText, "Bot");

// Locale parity: every agentOps.<locale>.js has the same keys and placeholders.
const locDir = join(here, "../../../i18n/locales");
const files = readdirSync(locDir).filter((f) => /^agentOps\.[A-Za-z-]+\.js$/.test(f));
assert.equal(files.length, 7, "tr, en, de, es, fr, pt-BR, ru");
const flat = (o, p = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object") flat(v, `${p}${k}.`, out);
    else out[`${p}${k}`] = String(v);
  }
  return out;
};
const vars = (s) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort().join(",");
const catalogs = {};
for (const f of files) {
  const mod = await import(pathToFileURL(join(locDir, f)).href);
  catalogs[f] = flat(Object.values(mod)[0]);
}
const base = catalogs["agentOps.tr.js"];
for (const [f, cat] of Object.entries(catalogs)) {
  assert.deepEqual(Object.keys(cat).sort(), Object.keys(base).sort(), `${f}: same keys as tr`);
  for (const k of Object.keys(base)) assert.equal(vars(cat[k]), vars(base[k]), `${f}: ${k} placeholders`);
  for (const v of Object.values(cat)) assert.equal(/\p{Extended_Pictographic}/u.test(v), false, `${f}: no emoji`);
}
// Each main locale file registers the namespace.
for (const loc of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
  const src = readFileSync(join(locDir, `${loc}.js`), "utf8");
  assert.match(src, new RegExp(`agentOps\\.${loc.replace("-", "\\-")}\\.js`), `${loc}.js imports agentOps`);
  assert.match(src, /["']?agentOps["']?:\s*AGENT_OPS_/, `${loc}.js registers agentOps`);
}

// Every agentOps.* key used by the page exists in the catalog.
const used = new Set();
for (const f of readdirSync(here).filter((x) => /\.jsx?$/.test(x))) {
  for (const m of readFileSync(join(here, f), "utf8").matchAll(/["'`]agentOps\.([A-Za-z0-9_.]+)["'`]/g)) used.add(m[1]);
}
for (const k of used) assert.ok(k in base, `agentOps.${k} is in the catalog`);

console.log(`agentOps.selftest: ok (${Object.keys(base).length} strings x ${files.length} locales, ${used.size} static keys checked)`);
