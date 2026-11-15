/**
 * node src/components/admin/moderation/modDesk.selftest.mjs
 * Moderasyon İşlem masası: pure model helpers, export cells, locale key parity
 * across the seven languages, every key the components use exists, no emoji,
 * no retired-game words, only --fs-* type sizes in the stylesheet.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as m from "./modDeskModel.js";
import { csvCell, historyCsv, historyTsv } from "./modDeskExport.js";
import { MOD_DESK_TR } from "../../../i18n/locales/modDesk.tr.js";
import { MOD_DESK_EN } from "../../../i18n/locales/modDesk.en.js";
import { MOD_DESK_DE } from "../../../i18n/locales/modDesk.de.js";
import { MOD_DESK_ES } from "../../../i18n/locales/modDesk.es.js";
import { MOD_DESK_FR } from "../../../i18n/locales/modDesk.fr.js";
import { MOD_DESK_PT_BR } from "../../../i18n/locales/modDesk.pt-BR.js";
import { MOD_DESK_RU } from "../../../i18n/locales/modDesk.ru.js";

const here = dirname(fileURLToPath(import.meta.url));
let n = 0;
const t = (name, fn) => {
  fn();
  n += 1;
};

t("durations and pills", () => {
  assert.equal(m.durationSecondsOf("1h"), 3600);
  assert.equal(m.durationSecondsOf("custom", "90"), 5400);
  assert.equal(m.durationSecondsOf("custom", "x"), 0);
  assert.equal(m.pillForSeconds(1800), "30m");
  assert.equal(m.pillForSeconds(5400), "custom");
  assert.deepEqual(m.durationParts(3600), { n: 1, unit: "h" });
  assert.deepEqual(m.durationParts(86400), { n: 24, unit: "h" });
  assert.equal(m.fillMessage("için {duration} sustur", { duration: "" }, {}), "için sustur");
  assert.deepEqual(m.durationParts(7 * 86400), { n: 7, unit: "d" });
  assert.deepEqual(m.durationParts(5400), { n: 90, unit: "m" });
});

t("time left like the draft", () => {
  assert.deepEqual(m.remainingParts(252000), { kind: "mmss", text: "04:12" });
  assert.deepEqual(m.remainingParts((2 * 3600 + 6 * 60) * 1000), { kind: "hm", h: 2, m: "06" });
  assert.deepEqual(m.remainingParts((6 * 86400 + 23 * 3600) * 1000), { kind: "dh", d: 6, h: 23 });
  assert.deepEqual(m.remainingParts(29 * 86400 * 1000), { kind: "d", d: 29 });
  assert.deepEqual(m.remainingParts(-5), { kind: "over" });
});

t("progress and lanes", () => {
  const now = Date.parse("2026-11-14T20:00:00Z");
  assert.equal(m.elapsedShare("2026-11-14T19:00:00Z", "2026-11-14T21:00:00Z", now), 0.5);
  assert.equal(m.elapsedShare("2026-11-14T19:00:00Z", null, now), 1);
  const items = [
    { key: "a", type: "timeout", endsAt: "2026-11-14T20:30:00Z" },
    { key: "b", type: "timeout", endsAt: "2026-11-15T08:00:00Z" },
    { key: "c", type: "ban", endsAt: "2026-11-20T08:00:00Z" },
    { key: "d", type: "ban", endsAt: null },
    { key: "e", type: "ban", endsAt: "2026-11-14T20:10:00Z" },
  ];
  const lanes = m.groupLanes(items, now);
  assert.deepEqual(lanes.soon.map((x) => x.key), ["e", "a"]);
  assert.deepEqual(lanes.timeouts.map((x) => x.key), ["b"]);
  assert.deepEqual(lanes.tempBans.map((x) => x.key), ["c"]);
  assert.deepEqual(lanes.permBans.map((x) => x.key), ["d"]);
});

t("user chips and facts", () => {
  assert.deepEqual(m.userChip({ sanctions30d: 2 }), { kind: "nth", n: 3 });
  assert.deepEqual(m.userChip({ bans: 1 }), { kind: "repeat" });
  assert.deepEqual(m.userChip({ timedOut: true, sanctions30d: 5 }), { kind: "muted" });
  assert.deepEqual(m.userChip({ banned: true }), { kind: "banned" });
  assert.equal(m.userChip({}), null);
  assert.deepEqual(m.userFacts({ reports: 5, timeouts: 2 }), [{ key: "reports", n: 5 }, { key: "timeouts", n: 2 }]);
  assert.deepEqual(m.userFacts({}), [{ key: "clean" }]);
});

t("message variables in the admin's words", () => {
  const names = { user: "kullanıcı", duration: "süre", category: "kategori", until: "bitiş" };
  const local = "Merhaba {kullanıcı}, {süre} susturuldun ({kategori}).";
  const canonical = m.toCanonicalTokens(local, names);
  assert.equal(canonical, "Merhaba {user}, {duration} susturuldun ({category}).");
  assert.equal(m.toLocalTokens(canonical, names), local);
  assert.equal(m.fillMessage(local, { user: "Troll 42", duration: "1 saat", category: "Spam" }, names), "Merhaba Troll 42, 1 saat susturuldun (Spam).");
  assert.equal(m.fillMessage("{user} {until}", { user: "x" }, names), "x {until}");
});

t("bulk payload per user", () => {
  const users = [{ id: "u1", username: "troll42", displayName: "Troll 42" }, { id: "u2", username: "mert.k" }];
  const body = m.buildBulkPayload({
    action: "timeout",
    users,
    category: "spam",
    durationId: "1h",
    message: "Merhaba {user}",
    names: {},
    labelFor: (u) => ({ user: u.displayName || u.username }),
    templateId: "tpl",
  });
  assert.deepEqual(body, { action: "timeout", category: "spam", items: [{ userId: "u1", message: "Merhaba Troll 42" }, { userId: "u2", message: "Merhaba mert.k" }], presetId: "1h", templateId: "tpl" });
  const custom = m.buildBulkPayload({ action: "timeout", users, category: "other", otherText: " x ", durationId: "custom", customMinutes: "45", message: "", names: {} });
  assert.equal(custom.durationSeconds, 2700);
  assert.equal(custom.otherText, "x");
  assert.deepEqual(custom.items, [{ userId: "u1" }, { userId: "u2" }]);
  const kick = m.buildBulkPayload({ action: "kick", users, category: "raid", durationId: "1h", message: "", names: {} });
  assert.equal(kick.presetId, undefined);
  assert.equal(m.composerError({ action: "timeout", users: [], category: "spam", durationId: "1h" }), "noUsers");
  assert.equal(m.composerError({ action: "timeout", users, category: "other", otherText: "", durationId: "1h" }), "otherText");
  assert.equal(m.composerError({ action: "timeout", users, category: "spam", durationId: "custom", customMinutes: "0" }), "duration");
  assert.equal(m.composerError({ action: "ban", users, category: "spam", durationId: "custom" }), null);
});

t("escalation, ban preset, selection", () => {
  const top = m.topEscalation([
    { userId: "a", stronger: true, step: { kind: "timeout", seconds: 86400 } },
    { userId: "b", stronger: true, step: { kind: "ban", seconds: 86400 } },
    { userId: "c", stronger: false, step: { kind: "ban", seconds: null } },
  ]);
  assert.equal(top.userId, "b");
  assert.equal(m.topEscalation([{ stronger: false, step: { kind: "ban" } }]), null);
  assert.equal(m.banPresetFor(86400), "24h");
  assert.equal(m.banPresetFor(6 * 86400), "7d");
  assert.equal(m.banPresetFor(null), "permanent");
  let sel = m.toggleSelection([], { id: "a" });
  sel = m.toggleSelection(sel, { id: "b" });
  assert.deepEqual(sel.map((u) => u.id), ["a", "b"]);
  assert.deepEqual(m.toggleSelection(sel, { id: "a" }).map((u) => u.id), ["b"]);
});

t("highlights merge overlaps, strongest wins", () => {
  const text = "selam bedava nitro al aptallar";
  const segs = m.highlightSegments(text, [
    { start: 6, end: 18, severity: "high" },
    { start: 13, end: 18, severity: "low" },
    { start: 22, end: 30, severity: "medium" },
  ]);
  assert.deepEqual(segs, [
    { text: "selam ", sev: null },
    { text: "bedava nitro", sev: "high" },
    { text: " al ", sev: null },
    { text: "aptallar", sev: "medium" },
  ]);
  assert.equal(segs.map((s) => s.text).join(""), text);
  assert.deepEqual(m.highlightSegments("", []), []);
});

t("word filter helpers", () => {
  assert.equal(m.detectKind("aptal*"), "prefix");
  assert.equal(m.detectKind("/bedava\\s*nitro/"), "regex");
  assert.equal(m.detectKind("salak"), "word");
  assert.deepEqual(m.languageTabs({ tr: 64, en: 38, de: 9, es: 7, all: 8 }).map((x) => x.id), ["tr", "en", "de", "es", "all"]);
  assert.deepEqual(m.languageTabs({}).map((x) => x.id), ["tr", "en", "all"]);
  assert.deepEqual(m.sparkHeights([0, 5, 10]), [8, 50, 100]);
  assert.equal(m.sevTone("high"), "hi");
  assert.equal(m.sevTone("low"), "lo");
  assert.deepEqual(m.oldestParts("2026-11-14T17:00:00Z", Date.parse("2026-11-14T20:00:00Z")), { n: 3, unit: "h" });
});

t("history helpers", () => {
  const q = new URLSearchParams(m.historyQuery({ q: " troll ", type: "ban", days: "30", offset: 40, limit: 40 }));
  assert.equal(q.get("q"), "troll");
  assert.equal(q.get("type"), "ban");
  assert.equal(q.get("days"), "30");
  assert.equal(q.get("offset"), "40");
  assert.equal(new URLSearchParams(m.historyQuery({ type: "nope", days: "5" })).get("days"), "14");
  assert.equal(new URLSearchParams(m.historyQuery({ type: "nope" })).get("type"), null);
  assert.deepEqual(m.statusChip("lifted"), { tone: "blue", key: "lifted" });
  assert.equal(m.actionTone("unban"), "green");
  const bars = m.chartBars([{ day: "a", timeout: 2, ban: 2, kick: 0 }, { day: "b", timeout: 1, ban: 0, kick: 1 }]);
  assert.equal(bars[0].timeout + bars[0].ban, 100);
  assert.equal(bars[1].total, 2);
});

t("export is formula-safe", () => {
  assert.equal(csvCell("=SUM(A1)"), "\"'=SUM(A1)\"");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(null), "");
  const rows = [{ createdAt: "2026-11-14", action: "ban", target: { username: "spammer_99" }, category: "scam", durationSeconds: null, actor: { username: "demir" }, status: "active", message: "+1 hi" }];
  assert.equal(historyCsv(rows).split("\n")[1], "2026-11-14,ban,spammer_99,scam,,demir,active,\"'+1 hi\"");
  assert.ok(historyTsv(rows).split("\n")[1].endsWith("\t'+1 hi"));
});

function keys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}
function placeholders(s) {
  return [...String(s).matchAll(/\{(\w+)(?:,|\})/g)].map((x) => x[1]).filter((x, i, a) => a.indexOf(x) === i).sort();
}
const LOCALES = { tr: MOD_DESK_TR, en: MOD_DESK_EN, de: MOD_DESK_DE, es: MOD_DESK_ES, fr: MOD_DESK_FR, "pt-BR": MOD_DESK_PT_BR, ru: MOD_DESK_RU };

t("locale key parity and placeholders", () => {
  const base = keys(MOD_DESK_EN).sort();
  const flatEn = Object.fromEntries(keys(MOD_DESK_EN).map((k) => [k, k.split(".").reduce((o, p) => o[p], MOD_DESK_EN)]));
  for (const [id, cat] of Object.entries(LOCALES)) {
    assert.deepEqual(keys(cat).sort(), base, `${id} has the same keys as en`);
    for (const k of base) {
      const v = k.split(".").reduce((o, p) => o[p], cat);
      assert.equal(typeof v, "string", `${id}.${k} is a string`);
      assert.ok(v.trim(), `${id}.${k} is not empty`);
      // Template messages use the language's own variable names; everything else keeps en's placeholders.
      if (!k.startsWith("tplMsg.")) assert.deepEqual(placeholders(v), placeholders(flatEn[k]), `${id}.${k} placeholders`);
    }
    // A template message only uses that language's variable names.
    const names = Object.values(cat.var);
    for (const msg of Object.values(cat.tplMsg)) for (const p of placeholders(msg)) assert.ok(names.includes(p), `${id} tplMsg uses ${p}`);
  }
});

t("every key the components use exists", () => {
  const files = readdirSync(here).filter((f) => f.endsWith(".jsx"));
  const flat = new Set(keys(MOD_DESK_EN));
  const dynamicPrefixes = new Set();
  for (const f of files) {
    const src = readFileSync(join(here, f), "utf8");
    for (const mm of src.matchAll(/t\("modDesk\.([\w.]+)"/g)) assert.ok(flat.has(mm[1]), `${f}: modDesk.${mm[1]} missing`);
    for (const mm of src.matchAll(/t\(`modDesk\.([\w.]+?)\.\$\{/g)) dynamicPrefixes.add(mm[1]);
    for (const mm of src.matchAll(/"modDesk\.([\w.]+)"/g)) {
      if (mm[1].endsWith(".")) continue;
      assert.ok(flat.has(mm[1]) || [...flat].some((k) => k.startsWith(`${mm[1]}.`)), `${f}: modDesk.${mm[1]} missing`);
    }
  }
  for (const p of dynamicPrefixes) assert.ok([...flat].some((k) => k.startsWith(`${p}.`)), `prefix modDesk.${p}.* exists`);
  for (const id of m.TIMEOUT_PILLS) assert.ok(flat.has(`pill.${id}`));
  for (const id of m.LIFT_REASONS) assert.ok(flat.has(`liftReason.${id}`));
  for (const id of m.RULE_ACTIONS) assert.ok(flat.has(`ruleAction.${id}`) && flat.has(`ruleActionSub.${id}`) && flat.has(`outcome.${id}`));
  for (const id of m.HISTORY_TYPES) assert.ok(flat.has(`action.${id}`));
  for (const id of m.STEP_KINDS) assert.ok(flat.has(`step.${id}`) && flat.has(`rules.stepHint.${id}`));
  for (const id of [...m.FILTER_LANGS, "all"]) assert.ok(flat.has(`lang.${id}`));
  for (const id of ["timeout", "kick"]) assert.ok(flat.has(`esc.title30.${id}`) && flat.has(`esc.title.${id}`));
  for (const c of ["RULE_EMPTY", "RULE_TOO_LONG", "RULE_TOO_SHORT", "RULE_BACKREFERENCE", "RULE_NESTED_QUANTIFIER", "RULE_INVALID", "RULE_EXISTS"]) assert.ok(flat.has(`wf.err.${c}`));
});

t("all 30 server categories have a short label", () => {
  const ids = ["harassment", "hate_speech", "threats", "self_harm", "child_safety", "extremism", "spam", "scam", "fraud", "malware", "advertising", "raid", "impersonation", "multi_account", "ban_evasion", "underage", "nsfw", "illegal", "doxxing", "copyright", "language", "voice_abuse", "screenshare_abuse", "feature_abuse", "report_abuse", "disruptive", "tos", "guidelines", "suspicious", "other"];
  for (const cat of Object.values(LOCALES)) for (const id of ids) assert.ok(cat.cat[id], id);
  for (const id of m.FEATURED_CATEGORIES) assert.ok(ids.includes(id));
});

t("no emoji, no retired game words, type scale only", () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
  const retired = /valorant|takım bul|\blfg\b/i;
  const sources = [
    ...readdirSync(here).filter((f) => /\.(jsx|js)$/.test(f)).map((f) => readFileSync(join(here, f), "utf8")),
    ...Object.values(LOCALES).map((c) => JSON.stringify(c)),
  ];
  for (const s of sources) {
    assert.ok(!emoji.test(s), "no emoji");
    assert.ok(!retired.test(s), "no retired game words");
  }
  const css = readFileSync(join(here, "../../../styles/admin-moddesk.css"), "utf8");
  const sizes = [...css.matchAll(/font-size:\s*([^;!]+)/g)].map((x) => x[1].trim());
  for (const s of sizes) assert.match(s, /^var\(--fs-(11|12|13|15|17|20|28)\)$/, `font-size ${s}`);
});

console.log(`modDesk selftest: ${n} groups passed`);
