// Duyurular remake: model helpers, member store helpers, icon set, locale parity, keys used by the UI,
// type scale and no emojis in the new files.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./announcementsModel.js";
import { ANN_ICON_KEYS, ANN_ICON_QUICK, ANN_SVG, LEGACY_EMOJI_ICON, announcementIconKey } from "../../../lib/announcementIcons.js";
import { ctaKind, normLang, sortItems, unreadOf, visibleItems, detectPlatform } from "../../../lib/announcementsFeed.js";
import { ANNC_TR } from "../../../i18n/locales/annc.tr.js";
import { ANNC_EN } from "../../../i18n/locales/annc.en.js";
import { ANNC_DE } from "../../../i18n/locales/annc.de.js";
import { ANNC_ES } from "../../../i18n/locales/annc.es.js";
import { ANNC_FR } from "../../../i18n/locales/annc.fr.js";
import { ANNC_PT_BR } from "../../../i18n/locales/annc.pt-BR.js";
import { ANNC_RU } from "../../../i18n/locales/annc.ru.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../../..");

/* ---------- model ---------- */
const now = Date.parse("2026-11-15T12:00:00Z");
assert.equal(M.fmtPct(76, "tr"), "%76");
assert.equal(M.fmtPct(76, "en"), "76%");
assert.deepEqual(M.timeLeft(new Date(now + 2 * 86400000 + 13 * 3600000 + 5 * 60000).toISOString(), now), { days: 2, hours: 13, minutes: 5 });
assert.equal(M.timeLeft(new Date(now - 1000).toISOString(), now), null);
assert.equal(M.agoParts(new Date(now - 2 * 3600000).toISOString(), now).unit, "hour");
assert.equal(M.agoParts(new Date(now - 26 * 3600000).toISOString(), now).unit, "yesterday");

const item = { audienceSize: 24310, ctaUrl: "/status", stats: { delivered: 23980, seen: 18420, read: 15120, clicked: 1204, platforms: { desktop: { delivered: 100, seen: 81 } } } };
assert.equal(Math.round(M.seenRate(item)), 76);
const f = M.funnel(item);
assert.deepEqual(f.map((r) => r.id), ["audience", "delivered", "seen", "read", "clicked"]);
assert.equal(f[0].pct, 100);
assert.equal(M.funnel({ ...item, ctaUrl: "" }).length, 4, "no button row without a CTA");
assert.equal(M.platformRates(item).find((p) => p.id === "desktop").rate, 81);
assert.equal(M.platformRates(item).find((p) => p.id === "ios").rate, null);

const draft = M.emptyDraft({ title: "Planlı bakım", content: "Sesli kanallar", sourceLang: "tr", translations: { en: { title: "Maintenance", content: "Voice", state: "ready" }, fr: { title: "Maintenance", content: "Salons", state: "auto" } } });
const st = M.langStates(draft);
assert.equal(st.tr, "source");
assert.equal(st.en, "ready");
assert.equal(st.fr, "auto");
assert.equal(st.ru, "missing");
const sum = M.langSummary(st);
assert.equal(sum.ready, 2);
assert.deepEqual(sum.missing, ["de", "es", "pt-BR", "ru"]);
assert.equal(M.localizedText(draft, "de").lang, "en", "missing language falls back to English");
assert.equal(M.localizedText(draft, "de").fallback, true);
assert.equal(M.localizedText(draft, "tr").title, "Planlı bakım");
assert.equal(M.localizedText({ ...draft, translations: {} }, "ru").lang, "tr", "then the source");

const checks = M.composerChecks({ ...draft, priority: "urgent", ctaLabel: "Aç", ctaUrl: "https://example.org" }, { now });
const ids = checks.map((c) => c.id);
assert.ok(ids.includes("title") && ids.includes("cta_external") && ids.includes("missing") && ids.includes("auto") && ids.includes("approval"));
assert.equal(M.hasBlocking(checks), false);
assert.equal(M.hasBlocking(M.composerChecks({ ...draft, title: "" })), true);
assert.equal(M.hasBlocking(M.composerChecks({ ...draft, startsAt: "2026-11-20T00:00:00Z", endsAt: "2026-11-19T00:00:00Z" }, { now })), true);
assert.equal(M.needsApproval({ priority: "urgent", audience: {} }), true);
assert.equal(M.needsApproval({ priority: "urgent", audience: { langs: ["tr"] } }), false);
assert.ok(M.composerChecks({ ...draft, content: "Selam 💙" }).some((c) => c.id === "emoji"));
assert.equal(M.stripEmoji("Selam! 💙 Yeni"), "Selam! Yeni");
assert.equal(M.plainText("a **b** *c* [d](https://x.io)"), "a b c d");

const tc = M.translationChecks({ ...draft, ctaUrl: "/status", content: "Descall kısa", translations: { fr: { title: "x", content: "Descall est un texte beaucoup plus long que la source", state: "auto" } } }, "fr");
assert.ok(tc.some((c) => c.id === "longer" && c.pct > 15));
assert.ok(tc.some((c) => c.id === "glossary"));
assert.ok(M.translationChecks({ ...draft, content: "Descall+ hediye", translations: { fr: { title: "x", content: "cadeau", state: "auto" } } }, "fr").some((c) => c.id === "glossary_lost"));

assert.equal(M.ctaKind("/settings/shop"), "app");
assert.equal(M.ctaKind("https://descall.com/status"), "own");
assert.equal(M.ctaKind("descall.com/status"), "own");
assert.equal(M.ctaKind("https://example.org"), "external");
assert.equal(M.ctaKind("javascript:alert(1)"), "bad");

// board drag rules
assert.equal(M.dropAction("live", "ended"), "end");
assert.equal(M.dropAction("draft", "live"), "publish");
assert.equal(M.dropAction("draft", "live", { needsApproval: true }), "submit");
assert.equal(M.dropAction("draft", "scheduled"), "schedule");
assert.equal(M.dropAction("pending", "live"), "approve");
assert.equal(M.dropAction("pending", "draft"), "reject");
assert.equal(M.dropAction("scheduled", "draft"), "unschedule");
assert.equal(M.dropAction("ended", "live"), "reopen");
assert.equal(M.dropAction("draft", "ended"), null);
assert.equal(M.dropAction("live", "draft"), null);

const items = [
  { id: "a", status: "live", pinned: true, pinOrder: 2, title: "Bakım", content: "", audience: {}, langStates: { en: "ready" } },
  { id: "b", status: "live", pinned: true, pinOrder: 1, title: "Sahte mesaj", content: "", audience: { langs: ["tr"] }, langStates: { en: "missing" } },
  { id: "c", status: "draft", title: "Yarışma", content: "kazananlar", audience: {}, langStates: {} },
  { id: "d", status: "ended", title: "Eski", content: "", audience: {}, endedAt: "2026-11-01T00:00:00Z", langStates: {} },
];
const cols = M.byColumn(items);
assert.deepEqual(cols.live.map((i) => i.id), ["b", "a"]);
assert.deepEqual(M.pinnedOrder(items).map((i) => i.id), ["b", "a"]);
assert.deepEqual(M.filterItems(items, { q: "kazanan" }).map((i) => i.id), ["c"]);
assert.deepEqual(M.filterItems(items, { audience: "targeted" }).map((i) => i.id), ["b"]);
assert.deepEqual(M.filterItems(items, { lang: "en" }).map((i) => i.id), ["a"]);
assert.deepEqual(M.reorder(["a", "b", "c"], "c", 0), ["c", "a", "b"]);
assert.deepEqual(M.splitVars("Planlı bakım: {date} {start}"), [{ text: "Planlı bakım: " }, { v: "date" }, { text: " " }, { v: "start" }]);
assert.equal(M.minutesBetween("03:00", "04:30"), 90);
assert.equal(M.minutesBetween("23:00", "01:00"), 120);
assert.equal(M.trTimeSuffix(new Date(2026, 10, 16, 2, 30).toISOString()), "'da");
assert.equal(M.trTimeSuffix(new Date(2026, 10, 16, 14, 15).toISOString()), "'te");
assert.equal(M.trTimeSuffix(new Date(2026, 10, 16, 14, 0).toISOString()), "'te");
assert.equal(M.trTimeSuffix(new Date(2026, 10, 16, 16, 0).toISOString()), "'da");
assert.equal(M.trTimeSuffix(new Date(2026, 10, 16, 9, 40).toISOString()), "'ta");
const local = M.toLocalInput("2026-11-16T02:30:00.000Z");
assert.equal(M.fromLocalInput(local), "2026-11-16T02:30:00.000Z");
const p = M.draftPayload(M.draftFromItem({ id: "x", status: "live", title: "t", content: "c", audience: { langs: ["de"] } }));
assert.deepEqual(p.audience.langs, ["de"]);
assert.equal(M.errorKey({ code: "SECOND_ADMIN_REQUIRED" }), "annc.err.secondAdmin");
assert.equal(M.errorKey({ code: "X" }), null);

/* ---------- member store helpers ---------- */
assert.equal(normLang("pt"), "pt-BR");
assert.equal(normLang("de-AT"), "de");
assert.equal(normLang("xx"), null);
assert.equal(unreadOf([{ read: false }, { read: true }, {}]), 2);
assert.deepEqual(sortItems([{ id: 1, createdAt: "2026-01-01" }, { id: 2, pinned: true, pinOrder: 2 }, { id: 3, pinned: true, pinOrder: 1 }, { id: 4, createdAt: "2026-02-01" }]).map((x) => x.id), [3, 2, 4, 1]);
assert.deepEqual(visibleItems([{ id: 1, endsAt: "2026-11-14T00:00:00Z" }, { id: 2, endsAt: null }], now).map((x) => x.id), [2]);
assert.equal(ctaKind("/feedback?type=bug"), "app");
assert.equal(ctaKind("https://apps.apple.com/app/id1"), "external");
assert.equal(detectPlatform({ navigator: { userAgent: "Electron" } }), "desktop");
assert.equal(detectPlatform({ navigator: { userAgent: "x" }, Capacitor: { getPlatform: () => "ios" } }), "ios");

/* ---------- icons ---------- */
for (const k of ANN_ICON_KEYS) assert.ok(ANN_SVG[k], `svg for ${k}`);
for (const k of ANN_ICON_QUICK) assert.ok(ANN_ICON_KEYS.includes(k));
for (const k of Object.values(LEGACY_EMOJI_ICON)) assert.ok(ANN_ICON_KEYS.includes(k), `legacy maps to a real key: ${k}`);
assert.equal(announcementIconKey({ emoji: "📌" }), "pin");
assert.equal(announcementIconKey({ emoji: "⚠️" }), "alert");
assert.equal(announcementIconKey({ emoji: "🚨" }), "siren");
assert.equal(announcementIconKey({ icon: "wrench", emoji: "📢" }), "wrench");
assert.equal(announcementIconKey({ emoji: "??" }), "megaphone");
// same keys as the backend
const backendModel = readFileSync(join(src, "../backend/lib/announcements/model.js"), "utf8");
const backendIcons = [...backendModel.match(/const ICONS = Object\.freeze\((\[[\s\S]*?\])\);/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
assert.deepEqual(backendIcons, [...ANN_ICON_KEYS], "frontend and backend icon keys match");

/* ---------- locale parity ---------- */
function keys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}
const base = keys(ANNC_TR).sort();
for (const [name, cat] of Object.entries({ en: ANNC_EN, de: ANNC_DE, es: ANNC_ES, fr: ANNC_FR, "pt-BR": ANNC_PT_BR, ru: ANNC_RU })) {
  const k = keys(cat).sort();
  assert.deepEqual(k.filter((x) => !base.includes(x)), [], `${name}: extra keys`);
  assert.deepEqual(base.filter((x) => !k.includes(x)), [], `${name}: missing keys`);
  for (const key of k) {
    const v = key.split(".").reduce((o, p2) => o[p2], cat);
    assert.ok(typeof v === "string" && v.trim(), `${name}.${key} empty`);
    const want = (key.split(".").reduce((o, p2) => o[p2], ANNC_TR).match(/\{(\w+)\}/g) || []).filter((x) => !/^\{#/.test(x));
    for (const ph of want) if (!/plural/.test(v)) assert.ok(v.includes(ph) || /\{\w+, plural/.test(v), `${name}.${key} lost ${ph}`);
  }
}
for (const loc of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
  const main = readFileSync(join(src, `i18n/locales/${loc}.js`), "utf8");
  assert.match(main, new RegExp(`from "\\./annc\\.${loc.replace("-", "\\-")}\\.js"`), `${loc}.js imports annc`);
}

/* ---------- keys used by the UI exist ---------- */
const uiFiles = [
  ...readdirSync(here).filter((f2) => f2.endsWith(".jsx")).map((f2) => join(here, f2)),
  ...readdirSync(join(src, "components/announcements")).filter((f2) => f2.endsWith(".jsx")).map((f2) => join(src, "components/announcements", f2)),
  join(src, "components/social/AnnouncementsModal.jsx"),
];
const has = (key) => key.split(".").slice(1).reduce((o, p2) => (o && typeof o === "object" ? o[p2] : undefined), ANNC_TR) != null;
for (const file of uiFiles) {
  const s = readFileSync(file, "utf8");
  for (const m of s.matchAll(/["'](annc\.[a-zA-Z0-9_.]+)["']/g)) assert.ok(has(m[1]), `${file}: ${m[1]} missing in annc.tr.js`);
  assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s.replace(/LEGACY_EMOJI_ICON[\s\S]*?\}\);/, "")), false, `${file}: no emojis`);
}
for (const k of ["checks.title", "checks.cta", "checks.cta_external", "checks.missing", "checks.auto", "checks.stale", "checks.langs", "checks.emoji", "checks.expiry", "checks.past", "checks.approval", "checks.title_bad", "checks.cta_bad"]) assert.ok(has(`annc.${k}`), k);
for (const c of ["date", "link", "glossary", "glossary_lost", "longer", "length", "stale", "missing"]) assert.ok(has(`annc.tcheck.${c}`), c);
for (const c of ANN_ICON_KEYS) assert.ok(has(`annc.icon.${c}`), c);
for (const c of M.COLORS) assert.ok(has(`annc.color.${c.slice(1)}`), c);
for (const c of [...M.LIST_TABS]) {
  assert.ok(has(`annc.tab.${c}`), c);
  assert.ok(has(`annc.list.empty.${c}`), c);
  assert.ok(has(`annc.col.${c}`), c);
}
for (const r of M.END_REASONS) assert.ok(has(`annc.end.reason.${r}`), r);
for (const r of M.DELETE_REASONS) assert.ok(has(`annc.del.reason.${r}`), r);
for (const c of M.TEMPLATE_CATEGORIES) assert.ok(has(`annc.tplcat.${c}`), c);
const varIds = [...backendModel.matchAll(/\{ id: "(\w+)", type:/g)].map((m) => m[1]);
for (const v of varIds) assert.ok(has(`annc.var.${v}`), `var ${v}`);

/* ---------- CSS type scale ---------- */
for (const css of ["styles/admin-announcements.css", "styles/announcements.css"]) {
  const s = readFileSync(join(src, css), "utf8");
  for (const m of s.matchAll(/font-size:\s*([^;]+);/g)) assert.match(m[1], /^var\(--fs-(11|12|13|15|17|20|28)\)( !important)?$/, `${css}: ${m[1]}`);
  assert.equal(/\bfont:\s*\d/.test(s), false, `${css}: no font shorthand sizes`);
}

console.log("announcements.selftest ok");
