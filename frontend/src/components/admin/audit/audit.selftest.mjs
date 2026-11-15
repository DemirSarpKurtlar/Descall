// İşlem kaydı (Draft B "Konsol"): pure model + text helpers with the real catalogs,
// locale parity in 7 languages, and that every audit code the server writes has
// a category (no code falls into "other") and a label here.
// Run: node src/components/admin/audit/audit.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as M from "./auditModel.js";
import { detailText, relText, sentenceText } from "./auditText.js";
import { formatMessage } from "../../../i18n/message.js";

const here = dirname(fileURLToPath(import.meta.url));
const locDir = join(here, "..", "..", "..", "i18n", "locales");
const backend = join(here, "..", "..", "..", "..", "backend");
const require = createRequire(import.meta.url);

/* ---- catalogs ---- */
const LOCALES = { tr: "AUDIT_LOG_TR", en: "AUDIT_LOG_EN", de: "AUDIT_LOG_DE", es: "AUDIT_LOG_ES", fr: "AUDIT_LOG_FR", "pt-BR": "AUDIT_LOG_PT_BR", ru: "AUDIT_LOG_RU" };
const flat = (o, p = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object") flat(v, p ? `${p}.${k}` : k, out);
    else out[p ? `${p}.${k}` : k] = v;
  }
  return out;
};
const cats = {};
for (const [id, name] of Object.entries(LOCALES)) {
  const mod = await import(pathToFileURL(join(locDir, `auditLog.${id}.js`)).href);
  cats[id] = flat(mod[name]);
  const main = readFileSync(join(locDir, `${id}.js`), "utf8");
  assert.ok(main.includes(`from "./auditLog.${id}.js"`) && new RegExp(`["']?auditLog["']?:\\s*${name}`).test(main), `${id}: auditLog registered`);
}
const tFor = (id) => (key, vars) => {
  const k = String(key).replace(/^auditLog\./, "");
  const raw = cats[id][k];
  if (raw == null) return key;
  return formatMessage(raw, vars || {}, id);
};
const t = tFor("tr");
const en = tFor("en");

/* ---- catalog / classify ---- */
assert.deepEqual(M.actionInfo("ban"), { icon: "ban", tone: "red", labelKey: "auditLog.act.ban", known: true, family: null });
assert.equal(M.actionInfo("premium_extend").labelKey, "auditLog.act.premium_extend");
assert.equal(M.actionInfo("premium_whatever").labelKey, "auditLog.fam.premium");
assert.equal(M.actionInfo("antibot_trust").labelKey, "auditLog.fam.antibot");
assert.equal(M.actionInfo("totally_new", "system").labelKey, "auditLog.cat.system");
assert.equal(M.actionInfo("totally_new", "system").tone, "cyan");
assert.equal(M.actionInfo("totally_new", "bogus").labelKey, "auditLog.cat.other");

/* ---- sentences (Turkish cases) ---- */
const KAAN = "00000000-0000-4000-8000-000000000010";
const users = { [KAAN]: { id: KAAN, username: "kaan" } };
const at = "2026-11-14T20:41:18.584Z";
const ban = { id: "1", at, actorUsername: "demir", action: "ban", target: KAAN, targetUserId: KAAN, category: "sanctions", meta: { category: "harassment", expiresAt: "2026-11-21T20:41:18.584Z" } };
assert.equal(sentenceText(ban, users, {}, t, "tr"), "@demir, @kaan'ı 7 gün yasakladı");
assert.equal(sentenceText(ban, users, {}, en, "en"), "@demir banned @kaan for 7 days");
assert.equal(sentenceText({ ...ban, meta: {} }, users, {}, t, "tr"), "@demir, @kaan'ı kalıcı olarak yasakladı");
assert.equal(sentenceText({ ...ban, action: "unban", meta: {} }, users, {}, t, "tr"), "@demir, @kaan'ın yasağını kaldırdı");
assert.equal(sentenceText({ ...ban, action: "descoin_grant", meta: { amount: 50000 } }, users, {}, t, "tr"), "@demir, @kaan'a 50000 DesCoin verdi");
assert.equal(sentenceText({ ...ban, action: "chat_freeze", target: "true", targetUserId: null }, users, {}, t, "tr"), "@demir, genel sohbeti dondurdu");
assert.equal(sentenceText({ id: "x", at, actorUsername: "demir", action: "agent_run", count: 5, tools: [] }, {}, {}, t, "tr"), "Ajan çalışması · @demir adına 5 araç çalıştı");
assert.equal(sentenceText({ id: "x", at, actorUsername: "baran", action: "access_denied", target: "premium" }, {}, {}, t, "tr"), "@baran, yetkisi olmayan Descall+ bölümüne girmeye çalıştı");
assert.equal(sentenceText({ id: "x", at, actorUsername: "ece", action: "brand_new_code", category: "system", target: "abc" }, {}, {}, t, "tr"), "@ece: Sistem ayarları · abc");
assert.equal(sentenceText({ id: "x", at, actorUsername: "ece", action: "brand_new_code", category: "system" }, {}, {}, t, "tr"), "@ece: Sistem ayarları");
assert.equal(sentenceText({ id: "x", at, actorUsername: "ece", action: "popup_schedule", target: "c1" }, {}, {}, t, "tr"), "@ece: Canlı popup işlemi · c1");

/* ---- time ---- */
const now = Date.parse("2026-11-14T21:11:18.000Z");
assert.equal(relText(ban.at, now, t), "30 dk");
assert.equal(relText(ban.at, Date.parse(ban.at) + 10000, t), "şimdi");
assert.equal(M.relTime(ban.at, Date.parse(ban.at) + 3 * 86400e3).key, "auditLog.rel.days");
assert.equal(M.utcStamp(ban.at), "20:41:18.584");
assert.equal(M.secondsOf(ban), 7 * 86400);
assert.equal(M.secondsOf({ at, meta: { until: "2026-11-14T21:41:20.000Z" } }), 3600, "rounded to the preset");
assert.equal(M.secondsOf({ at, meta: { durationSeconds: 600 } }), 600);
assert.deepEqual(M.durationOf(0), { key: "auditLog.dur.permanent", n: 0 });
assert.deepEqual(M.durationOf(7200), { key: "auditLog.dur.hours", n: 2 });

/* ---- details line ---- */
const cat = (id) => ({ harassment: "Taciz / Zorbalık", spam: "Spam" })[id] || id;
assert.equal(detailText(ban, t, cat), "7 gün · Taciz / Zorbalık");
assert.equal(detailText({ ...ban, meta: { category: "spam" } }, t, cat, { series: { index: 9, count: 9 } }), "Kalıcı · Spam · dizide 9/9");
assert.equal(detailText({ action: "premium_denied", target: "/premium/bulk", meta: { method: "POST", path: "/premium/bulk", status: 403 } }, t, cat), "POST /premium/bulk · 403 · yetkisi yok");
assert.equal(detailText({ action: "agent_run", count: 5, ok: true, meta: {} }, t, cat), "5 araç · hepsi başarılı");
assert.equal(M.mergedCount({ merged: [{}], twins: [{}] }), 3);

/* ---- before / after ---- */
const diff = M.diffRows({ ...ban, meta: { ...ban.meta, sessionsRevoked: 2, accessBan: 0 } });
assert.deepEqual(diff.map((r) => r.field), ["status", "banEnd", "reason", "sessions", "accessBan"]);
assert.equal(diff[4].same, true);
assert.deepEqual(M.diffRows({ action: "admin_permissions", meta: { before: "all", after: ["moderation"] } })[0].after, { sections: ["moderation"] });
assert.deepEqual(M.diffRows({ action: "wallet_freeze", meta: {} })[0].after, { key: "auditLog.diff.frozen" });
assert.equal(M.diffRows({ action: "dm_view", meta: {} }).length, 0);

/* ---- tokens <-> query ---- */
const toks = [
  { kind: "actor", value: ["baran"] },
  { kind: "cat", value: ["sanctions"] },
  { kind: "range", value: "24h" },
  { kind: "sev", value: ["critical", "high"] },
  { kind: "text", value: "kaan" },
];
const q = M.tokensToQuery(toks);
assert.deepEqual(q, { actor: "baran", cat: "sanctions", range: "24h", sev: "critical,high", q: "kaan" });
assert.deepEqual(M.queryToTokens(q), toks);
assert.equal(M.tokensToQuery(toks, { merge: false }).merge, "0");
assert.deepEqual(M.tokensToQuery([{ kind: "flag", value: "undo" }]), { undo: "1" });
assert.deepEqual(M.queryToTokens({ undo: "1" }), [{ kind: "flag", value: "undo" }]);
const custom = M.tokensToQuery([{ kind: "range", value: "custom", from: "2026-11-14T20:00:00.000Z", to: "2026-11-14T20:59:59.999Z" }]);
assert.deepEqual(custom, { from: "2026-11-14T20:00:00.000Z", to: "2026-11-14T20:59:59.999Z" });
assert.equal(M.queryToTokens(custom)[0].value, "custom");
assert.equal(M.setToken(toks, { kind: "actor", value: ["ece"] }).filter((x) => x.kind === "actor").length, 1);
assert.deepEqual(M.addTokenValue([{ kind: "sev", value: ["high"] }], "sev", "critical")[0].value, ["high", "critical"]);
assert.ok(M.sameQuery({ sev: "critical" }, { sev: "critical", merge: undefined }));
assert.ok(M.sameQuery({ sev: "high,critical" }, { sev: "critical,high" }));
assert.ok(!M.sameQuery({ sev: "critical" }, {}));
assert.equal(M.qs({ a: "1", b: "", c: null }), "?a=1");
assert.equal(M.tokenText({ kind: "cat", value: ["sanctions"] }, t).valueLabel, "Yaptırımlar");
assert.equal(M.tokenText({ kind: "range", value: "24h" }, t).kindLabel, "tarih");
const sugg = M.suggestionsFor("@bar", { admins: [{ username: "baran" }, { username: "demir" }], t });
assert.equal(sugg[0].kind, "actor");
assert.equal(sugg[0].value, "baran");
assert.ok(sugg.some((s) => s.kind === "target") && sugg[sugg.length - 1].kind === "text");
assert.ok(M.suggestionsFor("yaptır", { admins: [], t }).some((s) => s.kind === "cat" && s.value === "sanctions"), "category by its Turkish name");
assert.ok(M.suggestionsFor("kritik", { admins: [], t }).some((s) => s.kind === "sev" && s.value === "critical"));

/* ---- misc ---- */
assert.equal(M.deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Descall/3.4.0 Chrome/124.0 Electron/30.0.1 Safari/537.36"), "Descall Desktop 3.4 · Windows");
assert.equal(M.deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1"), "Safari 17.0 · iOS");
assert.deepEqual(M.timelineDots("2026-11-14T20:12:02Z", "2026-11-14T20:13:02Z", ["2026-11-14T20:12:02Z", "2026-11-14T20:13:02Z"]), [4, 96]);
assert.equal(M.parseEntryLink("#audit/agentrun%3A123"), "agentrun:123");
assert.equal(M.entryLink("https://descall.com/", "a b"), "https://descall.com/admin/panel#audit/a%20b");
assert.equal(M.parseEntryLink("#games/x"), null);
assert.equal(M.chartScale([{ counts: [2, 3], other: 1 }, { counts: [1], other: 0 }]), 6);
assert.equal(M.undoFamily("wallet_freeze"), "wallet");
assert.equal(M.undoFamily("message_delete"), null);
assert.equal(M.errorKey({ code: "ALREADY_UNDONE" }), "auditLog.err.ALREADY_UNDONE");
assert.equal(M.errorKey({ code: "WHATEVER" }), null);
assert.deepEqual(M.reviewChoices({ action: "ban", section: "moderation", actor: { owner: false } }).map((c) => c.id), ["reviewed", "undo", "suspend"]);
assert.deepEqual(M.reviewChoices({ action: "dm_view", section: "dmReview", actor: { owner: true } }).map((c) => c.id), ["reviewed"]);
assert.equal(M.avatarStyle("kaan").background, M.avatarStyle("kaan").background);

/* ---- locales: same keys + placeholders in 7 languages ---- */
const placeholders = (s) =>
  [...String(s).matchAll(/\{\s*(\w+)\s*[,}]/g)]
    .map((m) => m[1])
    .filter((x, i, a) => a.indexOf(x) === i)
    .sort();
const enKeys = Object.keys(cats.en).sort();
for (const [id, c] of Object.entries(cats)) {
  assert.deepEqual(Object.keys(c).sort(), enKeys, `${id}: same keys as en`);
  for (const k of enKeys) {
    assert.ok(String(c[k]).trim().length > 0, `${id}.${k} empty`);
    assert.deepEqual(placeholders(c[k]), placeholders(cats.en[k]), `${id}.${k} placeholders`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(String(c[k])), `${id}.${k} has an emoji`);
  }
}
// Every literal key the code asks for exists.
const code = readdirSync(here)
  .filter((f) => /\.(jsx|js)$/.test(f) && !f.includes("selftest"))
  .map((f) => readFileSync(join(here, f), "utf8"))
  .join("\n");
for (const m of code.matchAll(/["'`]auditLog\.([A-Za-z0-9_.]+)["'`]/g)) {
  assert.ok(m[1] in cats.en, `missing key auditLog.${m[1]}`);
}
// Dynamic keys.
const backendModel = require(join(backend, "lib", "auditConsoleModel.js"));
const dynamic = [
  ...M.ACTION_CODES.map((c) => `act.${c}`),
  ...[...M.SENTENCE].map((c) => `s.${c}`),
  ...M.PREFIX_FAMILIES().map((f) => `fam.${f}`),
  ...M.CATEGORIES.map((c) => `cat.${c}`),
  ...M.SEVERITIES.map((s) => `sev.${s}`),
  ...[...M.RANGES, "custom"].map((r) => `range.${r}`),
  ...M.TOKEN_KINDS.map((k) => `token.${k}`),
  ...["agent", "panel"].map((s) => `source.${s}`),
  ...M.BUILTIN_VIEWS.map((v) => `views.${v.id}`),
  ...["total", "critical", "agent", "denied", "undone"].map((k) => `kpi.${k}`),
  ...backendModel.DEFAULT_RULES.flatMap((r) => [`rules.${r.key}`, `rules.${r.key}Desc`, `review.title.${r.key}`, `anomaly.${r.key}`]),
  ...["ban", "timeout", "wallet", "access", "premium", "badge", "directory"].flatMap((f) => [`undo.titles.${f}`, `undo.buttons.${f}`, `undo.list.${f}`]),
  ...["ALREADY_UNDONE", "ALREADY_REVERSED", "SUPERSEDED", "NO_PERMISSION", "NOT_UNDOABLE"].map((c) => `drawer.undoBlocked.${c}`),
  ...["open", "ALREADY_REVERSED", "ALREADY_UNDONE", "SUPERSEDED", "NO_PERMISSION", "closed"].map((c) => `review.state.${c}`),
  ...["summary", "change", "request", "related", "raw"].map((c) => `drawer.tabs.${c}`),
  ...["admin_audit", "memory", "moderation_actions"].map((c) => `drawer.src.${c}`),
  ...["status", "banEnd", "muteEnd", "reason", "sessions", "accessBan", "wallet", "sections", "value", "active", "banned", "muted", "none", "added", "open", "frozen", "allSections", "unknown"].map((c) => `diff.${c}`),
  ...["permanent", "days", "hours", "minutes"].flatMap((c) => [`dur.${c}`, `durS.${c}`]),
  ...["unknown", "now", "min", "hour", "yesterday", "days"].map((c) => `rel.${c}`),
  ...["report", "security", "legal", "other"].map((c) => `d.purpose.${c}`),
];
for (const k of dynamic) assert.ok(k in cats.en, `missing dynamic key auditLog.${k}`);
// Error keys the model can return.
for (const c of ["ALREADY_UNDONE", "ALREADY_REVERSED", "SUPERSEDED", "NO_PERMISSION", "NOT_UNDOABLE", "TARGET_MISSING", "REASON_REQUIRED", "ANOMALY_CLOSED", "VIEWS_UNAVAILABLE", "VIEWS_LIMIT", "RULES_UNAVAILABLE", "NOTES_UNAVAILABLE", "OWNER_ONLY", "SELF", "OWNER_PROTECTED", "STEP_UP_REQUIRED"]) {
  assert.ok(`err.${c}` in cats.en, `err.${c}`);
}
// Every admin section has a name (access_denied sentences, review chips).
const nav = await import(pathToFileURL(join(here, "..", "adminNav.js")).href);
for (const s of nav.menuSections()) assert.ok(`sec.${s}` in cats.en || ["signupStats", "retention", "economy", "premium", "promo"].includes(s), `sec.${s}`);
for (const s of Object.values(backendModel.ACTION_SECTION)) assert.ok(`sec.${s}` in cats.en, `sec.${s}`);

/* ---- server parity: every code the backend writes has a category and a label ---- */
for (const c of Object.keys(backendModel.CATALOG)) {
  assert.ok(M.actionInfo(c).known || M.actionInfo(c).family, `frontend label for ${c}`);
}
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === "test" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.js$/.test(f) && !/selftest|\.test\./.test(f)) out.push(p);
  }
  return out;
}
const codes = new Set();
for (const file of walk(backend)) {
  const src = readFileSync(file, "utf8");
  // audit(req.user, "code", ...), appendAudit(id, name, "code", ...), audit(req, "code", ...), writeAudit(req, id, "code"), audit(admin, "code")
  // lib/maintenanceService.js has its own audit() for maintenance_audit (not the admin log).
  if (/maintenanceService\.js$/.test(file)) continue;
  // appendAudit(actorId, actorUsername, "code", ...) and the routes' audit(actor, "code", ...)
  for (const m of src.matchAll(/\bappendAudit\(\s*[^,()]+,\s*[^,()]+,\s*["'`]([a-z0-9_]+)["'`]/g)) codes.add(m[1]);
  for (const m of src.matchAll(/\baudit\(\s*[\w.?]+\s*,\s*["'`]([a-z0-9_]+)["'`]/g)) codes.add(m[1]);
  for (const m of src.matchAll(/\baction:\s*"(agent_tool)"/g)) codes.add(m[1]);
}
const unknown = [...codes].filter((c) => backendModel.classify(c).category === "other");
assert.deepEqual(unknown, [], `audit codes without a category: ${unknown.join(", ")}`);
const unlabeled = [...codes].filter((c) => !M.actionInfo(c).known && !M.actionInfo(c).family);
assert.deepEqual(unlabeled, [], `audit codes without a label: ${unlabeled.join(", ")}`);
assert.ok(codes.size > 80, `found ${codes.size} audit codes`);

console.log(`audit.selftest: ok (${codes.size} server codes covered)`);
