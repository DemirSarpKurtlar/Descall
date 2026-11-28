// Bug Avcısı (27 Nov 2026), frontend: the existing Bug Hunter art with its level pips, the İlk
// Selam art, the profile chip tooltip ("12 gerçek bug buldu · Kasım 2026'dan beri" + severity
// mix), the sender's thread card, the live toast copy, and the admin workspace pieces (confirm
// button, side panel with outcome + live preview, banner, undo dialog, leaderboard, past
// candidates). Pure helpers (bhModel.js, bugHunterText.js) too. Bundled with esbuild, rendered
// with react-dom/server; no network.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../../..");
const out = mkdtempSync(join(tmpdir(), "bhr-"));
const J = (p) => JSON.stringify(join(src, p));
const entry = `
import { renderToString } from "react-dom/server";
import { createElement as h } from "react";
import ReactDOM from "react-dom";
ReactDOM.createPortal = (children) => children;
import { LocaleProvider } from ${J("context/LocaleContext.jsx")};
import { loadI18nCatalogs, translate } from ${J("i18n/index.js")};
import { SpecialBadgeIcon, ART_BY_ID, LEVEL_PIPS } from ${J("components/badges/specialBadgeArt.jsx")};
import { SpecialBadgeChip, SpecialBadgeMark } from ${J("components/badges/SpecialBadge.jsx")};
import { bugHuntToast } from ${J("components/badges/bugHuntToast.js")};
import BugHuntCard from ${J("components/feedback/BugHuntCard.jsx")};
import * as P from ${J("components/admin/feedback3/BugHunterPanel.jsx")};
import * as bh from ${J("components/admin/feedback3/bhModel.js")};
import * as txt from ${J("lib/bugHunterText.js")};
import * as store from ${J("lib/specialBadges.js")};
import { setRuntimeLocale } from ${J("i18n/runtime.js")};
export { ART_BY_ID, LEVEL_PIPS, bugHuntToast, bh, txt, store, loadI18nCatalogs, translate, setRuntimeLocale };
const wrap = (el, lang) => h(LocaleProvider, { meLanguage: lang || "tr" }, el);
export const r = {
  icon: (p) => renderToString(h(SpecialBadgeIcon, p)),
  chip: (p, lang) => renderToString(wrap(h(SpecialBadgeChip, p), lang)),
  mark: (p, lang) => renderToString(wrap(h(SpecialBadgeMark, p), lang)),
  card: (m, lang) => renderToString(wrap(h(function C() { return h(BugHuntCard, { m, t: (k, v) => translate(lang || "tr", k, v) }); }), lang)),
  confirmBtn: (p, lang) => renderToString(wrap(h(P.ConfirmButton, p), lang)),
  sheet: (p, lang) => renderToString(wrap(h(P.ConfirmSheet, p), lang)),
  banner: (p, lang) => renderToString(wrap(h(P.BugBanner, p), lang)),
  undo: (p, lang) => renderToString(wrap(h(P.UndoDialog, p), lang)),
  lead: (p, lang) => renderToString(wrap(h(P.LeaderCard, p), lang)),
  cands: (p, lang) => renderToString(wrap(h(P.CandidatesSheet, p), lang)),
  adm: (p, lang) => renderToString(wrap(h(P.AdminBugCard, p), lang)),
};
`;
const file = join(out, "bundle.mjs");
await build({
  stdin: { contents: entry, resolveDir: src, loader: "jsx" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: file,
  jsx: "automatic",
  logLevel: "silent",
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /\?(url|raw|worker|inline|worker&url)$/ }, (args) => ({ path: args.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default 'stub';", loader: "js" }));
      b.onResolve({ filter: /api\/adminHttp(\.js)?$/ }, () => ({ path: "fake-admin", namespace: "fakeadmin" }));
      b.onLoad({ filter: /.*/, namespace: "fakeadmin" }, () => ({ loader: "js", contents: "export const adminFetch = (...a) => globalThis.__adminFetch(...a); export const adminStepUpRequest = async () => ({});" }));
    },
  }],
  loader: { ".css": "empty", ".png": "empty", ".svg": "empty", ".mp3": "empty", ".webp": "empty", ".gif": "empty", ".woff2": "empty" },
  define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: false, PROD: true }) },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});

const mem = new Map();
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.navigator ??= { userAgent: "node", vibrate() {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.location ??= { hostname: "descall.com", href: "https://descall.com/", pathname: "/", search: "", hash: "", origin: "https://descall.com", protocol: "https:" };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.dispatchEvent ??= () => true;
const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, dataset: {} });
globalThis.document ??= { documentElement: el(), body: el(), head: el(), createElement: el, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, removeEventListener() {}, visibilityState: "visible", hidden: false, cookie: "" };
for (const k of ["HTMLElement", "SVGElement", "Element", "Node", "Event", "CustomEvent", "Image", "ResizeObserver", "IntersectionObserver", "MutationObserver"]) globalThis[k] ??= class { observe() {} disconnect() {} unobserve() {} addEventListener() {} };
globalThis.__adminFetch = async () => ({});
const origError = console.error;
console.error = (...a) => { if (/useLayoutEffect does nothing on the server/.test(String(a[0]))) return; origError(...a); };

const text = (html) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const has = (html, re, msg) => { if (!re.test(text(html)) && !re.test(html)) assert.fail(`${msg || re}: not found in ${text(html).slice(0, 700)}`); };
const hasNot = (html, re, msg) => { if (re.test(text(html))) assert.fail(`${msg || re}: unexpectedly found`); };
const m = await import(pathToFileURL(file).href);
const { r, bh, txt } = m;
await m.loadI18nCatalogs?.();
m.setRuntimeLocale("tr"); // server text (i18n refs) resolves in the runtime language, as in the app
const tr = (k, v) => m.translate("tr", k, v);
const en = (k, v) => m.translate("en", k, v);

/* ---- art: the existing Bug Hunter glyph stays, the level is a pip overlay ---- */
assert.equal(m.ART_BY_ID.bughunter.tier, "epik", "same tier");
assert.equal(m.ART_BY_ID.bughunter.leveled, true);
assert.equal(m.ART_BY_ID.bughunter.g.length, 4, "same four-part glyph as before (crosshair + bug)");
assert.equal(m.ART_BY_ID.kritikbug, undefined, "no separate critical badge");
for (const lv of [1, 2, 3]) {
  const svg = r.icon({ id: "bughunter", size: 48, level: lv });
  assert.equal((svg.match(/<circle[^>]*cx="[\d.]+" cy="52.4"/g) || []).length, lv, `level ${lv}: ${lv} pips`);
  has(svg, new RegExp(`data-level="${lv}"`));
}
assert(!/sb-pips/.test(r.icon({ id: "bughunter", size: 48 })), "no level, no pips (promo holders before any confirm)");
assert(!/sb-pips/.test(r.icon({ id: "bughunter", size: 12, level: 3 })), "too small for pips");
assert(!/sb-pips/.test(r.icon({ id: "beta", size: 48, level: 3 })), "only the leveled badge draws pips");
assert(/sb-pips/.test(r.icon({ id: "bughunter", size: 18, level: 2 })), "chip size keeps the pips (bigger dots)");
// İlk Selam (#38) has real art now.
assert.equal(m.ART_BY_ID.ilkselam.tier, "nadir");
const ilk = r.icon({ id: "ilkselam", size: 48, label: "İlk Selam" });
has(ilk, /sb-nadir/);
assert((ilk.match(/<path/g) || []).length >= 6, "bubbles drawn");

/* ---- tooltip text ---- */
const st = { id: "bughunter", serial: 3, level: 2, bugs: 12, also: 1, severity: { critical: 2, high: 4, medium: 6, low: 0 }, since: "2026-11-03T10:00:00.000Z" };
const tl = txt.tipLines(m.store.bugStatsOf(st), { t: tr, locale: "tr", name: "Bug Hunter" });
assert.equal(tl.title, "Bug Hunter II");
assert.equal(tl.line, "12 gerçek bug buldu · Kasım 2026'dan beri", "the owner's tooltip text");
assert.equal(tl.mix, "2 kritik · 4 yüksek · 6 orta · +1 o da buldu");
assert.equal(txt.yearAblative(2025), "ten");
assert.equal(txt.yearAblative(2030), "dan");
const ten = txt.tipLines(m.store.bugStatsOf({ ...st, bugs: 1, also: 0, severity: { low: 1 } }), { t: en, locale: "en", name: "Bug Hunter" });
assert.equal(ten.line, "Found 1 real bug · since November 2026");
const chip = r.chip({ id: "bughunter", entry: st });
has(chip, /Bug Hunter II/);
has(chip, /12 gerçek bug buldu · Kasım 2026'dan beri/);
has(chip, /role="tooltip"/);
has(chip, /tabindex="0"/i, "keyboard reachable");
hasNot(r.chip({ id: "beta" }), /gerçek bug/, "other badges unchanged");
const mark = r.mark({ id: "bughunter", entry: st });
has(mark, /title="Bug Hunter II\n12 gerçek bug buldu/);
// The store keeps the numbers from the profile payload.
m.store.noteEquipped("u-1", st);
assert.equal(m.store.equippedFor({ id: "u-1" }).level, 2);
m.store.noteEquipped("u-1", { id: "bughunter", serial: 3 });
assert.equal(m.store.equippedFor({ id: "u-1" }).bugs, 12, "an equip event without numbers keeps them");

/* ---- the sender's card ---- */
const ref = (key, vars) => (vars ? { key, vars } : { key });
const confirmed = { id: "x", type: "bughunt", event: "confirmed", severity: "high", level: 1, badge: "new", count: 1, reward: 100, badgeId: "bughunter", text: "The bug you reported was real, and we fixed it.", badgeLine: "You earned the Bug Hunter badge.", rewardLine: "+100 DesCoin", i18n: { text: ref("bot.bughunt.confirmedFixed"), badgeLine: ref("bot.bughunt.badgeNew"), rewardLine: ref("bot.bughunt.reward", { amount: 100 }) } };
let card = r.card(confirmed);
has(card, /Bildirdiğin hata gerçek bir bugmış, düzelttik\./, "the owner's sentence");
has(card, /Bug Hunter rozetini kazandın\./);
has(card, /\+100 DesCoin/);
has(card, /Önem: Yüksek/);
has(card, /data-level="1"/, "badge art with its level");
card = r.card({ ...confirmed, event: "fixed", badgeId: null, i18n: { text: ref("bot.bughunt.fixed") }, text: "Fixed", badgeLine: null, rewardLine: null });
has(card, /Düzeltildi: bildirdiğin hata son sürümde giderildi\./);
has(card, /bhc-fixed/);
m.setRuntimeLocale("en");
card = r.card({ ...confirmed, badge: "up", level: 2, i18n: { ...confirmed.i18n, badgeLine: ref("bot.bughunt.badgeUp", { level: "II", count: 5 }) } }, "en");
has(card, /Your badge leveled up to Bug Hunter II\./);
m.setRuntimeLocale("tr");
card = r.card({ ...confirmed, glitchLine: "x", i18n: { ...confirmed.i18n, glitchLine: ref("bot.bughunt.badgeGlitch") } });
has(card, /Glitch rozetini de kazandın\./);
hasNot(r.card({ ...confirmed }), /Valorant|takim bul/i);

/* ---- live toast ---- */
const nameOf = () => "Bug Hunter";
assert.deepEqual(m.bugHuntToast({ entry: { event: "confirmed", level: 2, badge: "up" }, reward: 50 }, tr, nameOf), { id: "bughunter", level: 2, text: "Gerçek bir bug buldun · Bug Hunter II · +50 DesCoin" });
assert.equal(m.bugHuntToast({ entry: { event: "fixed" } }, tr, nameOf).text, "Düzeltildi: bildirdiğin hata giderildi");
assert.equal(m.bugHuntToast({ entry: { event: "also" }, reward: 20 }, tr, nameOf).text, "Hata bildirimin doğrulandı · +20 DesCoin");

/* ---- pure admin model ---- */
const rules = bh.DEFAULT_RULES;
const roots = [{ feedbackId: "r1", severity: "critical", live: true, credit: "first", createdAt: "2026-11-10T00:00:00Z" }];
let o = bh.outcome({ severity: "high", person: null, holds: false, rules });
assert.deepEqual([o.credit, o.reward, o.badge, o.from, o.to, o.next.left], ["first", 100, "new", 0, 1, 4]);
o = bh.outcome({ severity: "low", person: { bugs: 4, level: 1 }, holds: true, rules });
assert.deepEqual([o.badge, o.from, o.to, o.reward], ["up", 1, 2, 25], "5th bug levels up");
o = bh.outcome({ severity: "low", person: { bugs: 1, level: 1 }, holds: true, rules });
assert.equal(o.badge, "more");
o = bh.outcome({ duplicateOf: "r1", roots, person: { bugs: 3 }, holds: true, rules });
assert.deepEqual([o.credit, o.severity, o.reward, o.badge, o.count], ["also", "critical", 100, "none", 3], "also-found inherits severity, does not level");
o = bh.outcome({ severity: "high", previous: { rewardState: "kept", reward: 100 }, rules });
assert.deepEqual([o.carried, o.reward], [true, 0], "a kept bonus is carried");
assert.equal(bh.outcome({ severity: "high", visual: true, rules }).glitch, true);
assert.equal(bh.outcome({ duplicateOf: "r1", roots, visual: true, rules }).glitch, false);
assert.equal(bh.reportedEarlier({ created_at: "2026-11-01T00:00:00Z" }, roots[0]), true);
const pe = bh.previewEntry(bh.outcome({ severity: "high", holds: false, rules }), { fixedNow: true });
assert.equal(pe.i18n.text.key, "bot.bughunt.confirmedFixed");
assert.equal(pe.i18n.badgeLine.key, "bot.bughunt.badgeNew");
const items = [{ id: "f1", subject: "Ses kesiliyor", user: { username: "ayse" }, created_at: "2026-11-01T00:00:00Z" }, { id: "f2", subject: "Menü", user: { username: "mert" } }];
const confs = [{ feedbackId: "f1", live: true, credit: "first", severity: "high", confirmedAt: "2026-11-20T00:00:00Z" }, { feedbackId: "f2", live: false, credit: "first", severity: "low" }];
assert.deepEqual(bh.rootOptions(confs, items).map((x) => x.title), ["Ses kesiliyor"], "only live first credits can be linked");
assert.deepEqual(bh.rootOptions(confs, items, { q: "mert" }), []);
assert.deepEqual(bh.onlyConfirmed(items, bh.byFeedback(confs)).map((f) => f.id), ["f1"]);
assert.deepEqual(bh.mixSegments({ critical: 1, high: 3 }).map(([s]) => s), ["critical", "high"]);
assert.equal(bh.errorKey("SAME_REPORTER"), "bhunt.errSAME_REPORTER");
assert.equal(bh.errorKey("weird"), "bhunt.errGeneric");

/* ---- admin pieces ---- */
has(r.confirmBtn({ confirmed: null, onClick() {} }), /Gerçek bug olarak doğrula/);
has(r.confirmBtn({ confirmed: { live: true } }), /Gerçek bug/);
const f = { id: "f9", subject: "Mikrofon", message: "Mikrofon kırmızı", status: "new", created_at: "2026-11-25T10:00:00Z", user: { id: "u9", username: "ayse" }, replies: [] };
const data = { confirmations: confs, people: { u9: { level: 1, bugs: 4 } }, rules, leaderboard: [], totals: {} };
let html = r.sheet({ f, items: [...items, f], data, map: bh.byFeedback(confs), onClose() {}, onConfirm: async () => ({ ok: true }) });
has(html, /ayse bu hatayı bildirdi/);
for (const s of ["Düşük", "Orta", "Yüksek", "Kritik"]) has(html, new RegExp(s));
has(html, /25 DesCoin/); has(html, /250 DesCoin/);
has(html, /Görsel \/ arayüz hatası/); has(html, /Glitch rozeti de verilir/);
has(html, /Kullanıcının göreceği/); has(html, /Masaüstü/); has(html, /Telefon/);
has(html, /Bildirdiğin hata gerçek bir bugmış, ekibimiz düzeltiyor\./, "live preview of the sender's card");
has(html, /Doğrula/); has(html, /disabled=""[^>]*data-bh="confirm-send"|data-bh="confirm-send"[^>]*disabled/, "no severity yet: disabled");
html = r.banner({ f, c: { live: true, severity: "critical", credit: "first", reward: 250, rewardState: "paid", levelAfter: 2, confirmedAt: "2026-11-25T10:00:00Z", visual: true, note: "iOS 18" }, items: [f], onUndo() {} });
has(html, /Kritik/); has(html, /İlk bildiren/); has(html, /250 DesCoin ödendi/); has(html, /Bug Hunter II/); has(html, /Çözüldü yapınca/); has(html, /Doğrulamayı geri al|Geri al/);
has(r.banner({ f, c: { live: false, undoReason: "Kopya değil" }, items: [] }), /Geri alındı: Kopya değil/);
html = r.undo({ f, c: { reward: 100 }, onClose() {}, onUndo: async () => ({ ok: true }) });
has(html, /Sebep \(zorunlu/); has(html, /harcanmadıysa geri alınır/); has(html, /role="alertdialog"/);
html = r.lead({ data: { totals: { first: 7, also: 2, critical: 1, paid: 600 }, leaderboard: [{ userId: "u9", username: "ayse", bugs: 6, first: 5, legacy: 1, also: 1, level: 2, bySeverity: { high: 3, critical: 1, low: 1 } }] }, loaded: true, candidateCount: 4, onCandidates() {} });
has(html, /Bug Avcıları/); has(html, /6 bug/); has(html, /\+1 o da buldu/); has(html, /1 önceki/); has(html, /Geçmiş adaylar \(4\)/);
has(r.lead({ data: { totals: {}, leaderboard: [] }, loaded: true }), /Henüz doğrulanmış bug yok/);
html = r.cands({ list: { items: [{ feedbackId: "c1", username: "deniz", subject: "Ekran donuyor", createdAt: "2026-06-01T00:00:00Z", signals: ["fix_link", "resolved"], confidence: "high", holdsBadge: true }] }, onClose() {}, onOpen() {} });
has(html, /Ekran donuyor/); has(html, /Yüksek güven/); has(html, /Rozeti var/); has(html, /düzeltme bağlantısı/);
html = r.adm({ r: { ...confirmed, void: true, adminUsername: "demir", created_at: "2026-11-25T10:00:00Z" }, now: Date.parse("2026-11-25T11:00:00Z") });
has(html, /Geri alındı \(kullanıcı görmüyor\)/);
for (const lang of ["en", "de", "es", "fr", "pt-BR", "ru"]) {
  m.setRuntimeLocale(lang);
  const s = r.sheet({ f, items: [f], data, map: new Map(), onClose() {}, onConfirm: async () => ({ ok: true }) }, lang);
  hasNot(s, /bhunt\.|bot\.bughunt/, `${lang}: every string translated`);
}

console.log("bugHunter.render.selftest ok");
