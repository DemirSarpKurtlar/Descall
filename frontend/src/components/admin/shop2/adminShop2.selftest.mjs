// Vitrin ve Setler (admin, Market 2.0): pure model, every adminShop2.* key the page uses
// exists, locale parity in 7 languages (same keys, same placeholders, no emoji), type
// scale tokens only, opaque menus / dialogs, no retired feature names.
//   node src/components/admin/shop2/adminShop2.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as M from "./shop2Model.js";

const here = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-11-15T13:17:42.000Z"); // Paz 15 Kas 16:17 Istanbul

/* ---- time ---- */
assert.equal(M.istDay(NOW), "2026-11-15");
assert.equal(M.istDay(Date.parse("2026-11-15T21:30:00Z")), "2026-11-16", "00:30 Istanbul is the next day");
assert.equal(new Date(M.nextReset(NOW)).toISOString(), "2026-11-15T21:00:00.000Z", "reset = 00:00 Istanbul");
assert.equal(M.clock(M.nextReset(NOW) - NOW), "07:42:18", "draft A1 header countdown");
assert.equal(M.addDays("2026-11-30", 1), "2026-12-01");
assert.equal(M.weekdayMon("2026-11-15"), 6, "Sunday");
assert.equal(M.weekdayMon("2026-11-17"), 1, "Tuesday");
assert.equal(M.timelineStart(NOW), "2026-11-09", "two weeks from this Monday (9–22 Kasım)");
assert.deepEqual(M.waitLabel(2 * 86400000 + 5 * 3600000), { key: "adminShop2.dur.dh", vars: { d: 2, h: "05" } }, "2g 05s");
assert.equal(M.waitLabel(7 * 3600000).vars.c, "07:00:00");
assert.equal(M.undoLeft(new Date(NOW + 28 * 60000 + 14000).toISOString(), NOW), 28 * 60 + 14);
assert.equal(M.undoLeft(new Date(NOW - 1000).toISOString(), NOW), 0);
assert.equal(M.mmss(28 * 60 + 14), "28:14");

/* ---- weights ---- */
const live = { common: 38, rare: 30, epic: 16, legendary: 9, mythic: 3 };
const w = M.normalizeWeights(live);
assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 100);
const moved = M.setWeight(w, "epic", 20);
assert.equal(moved.epic, 20);
assert.equal(Object.values(moved).reduce((a, b) => a + b, 0), 100, "the bar stays at 100");
assert.equal(M.weightDiff({ ...live, epic: 20, common: 34 }, live).epic, 4, "+4 next to Epik");
assert.equal(M.ruleChanges({ weights: { ...live, epic: 20, common: 34 }, bands: [[150, 600]], toggles: { noRepeatDays: 7 } }, { weights: live, bands: [[150, 600]], toggles: { noRepeatDays: 5 } }), 3, "3 değişiklik");
assert.ok(M.validBands([[150, 600], [600, 1500], [1500, 3000], [3000, null]]));
assert.ok(!M.validBands([[150, 600], [100, 1500], [1500, 3000], [3000, null]]));
assert.ok(!M.validBands([[150, 100], [600, 1500], [1500, 3000], [3000, null]]));
const arcs = M.donutArcs(live);
assert.equal(arcs.length, 5);
assert.ok(Math.abs(arcs[arcs.length - 1].to - 1) < 1e-9);
assert.match(M.arcPath(50, 50, 38, 0, 0.5), /^M[\d.]+ [\d.]+ A38 38 0 0 1/);

/* ---- set pricing (A2 numbers) ---- */
const P = (id, price, category, rarity = "epic") => ({ id, price_descoin: price, category, rarity });
const kor = [P(1, 1800, "avatar_frame"), P(2, 2200, "banner"), P(9, 600, "profile_aura", "epic"), P(3, 1400, "profile_color", "rare"), P(4, 3100, "profile_badge", "legendary"), P(5, 4200, "avatar_effect", "legendary"), P(6, 1500, "chat_bubble", "rare"), P(7, 2100, "voice_tile"), P(8, 1500, "join_sound", "rare")];
const pr = M.setPricing(kor, 13800);
assert.equal(pr.sum, 18400, "Parça toplamı 18.400");
assert.equal(pr.maxSingle, 4200, "en pahalı tek ürün 4.200");
assert.equal(Math.round(pr.discountPct), 25, "%25");
assert.ok(pr.inBand);
assert.equal(pr.timesMax, 3.3, "tek ürünün 3,3 katı");
assert.equal(M.suggestedPrice(18400), 13980, "Önerilen 13.980 D · %24");
assert.equal(M.priceAtDiscount(18400, 25), 13800);
assert.equal(M.springDiscount(34), 30, "springs back into the band");
assert.equal(M.springDiscount(12), 20);
const owner = M.priceForOwner(kor, 13800, [3, 6]);
assert.equal(owner.owned, 2);
assert.ok(owner.price < 13800 && owner.price > 10000, "owned pieces are deducted");
assert.equal(M.priceForOwner(kor, 13800, kor.map((p) => p.id)).hidden, true, "Hepsi sende → gizlenir");
const tiers = M.priceTiers(kor, 13800, { none: 61, few: 27, many: 9, all: 3 });
assert.deepEqual(tiers.map((x) => x.key), ["none", "few", "many", "all"]);
assert.equal(tiers[0].price, 13800);
assert.ok(tiers[1].price > tiers[2].price, "more owned → cheaper");
assert.equal(tiers[3].hidden, true);
assert.equal(tiers[0].share, 61);
const fc = M.forecast({ stock: 500, discountPct: 25 });
assert.ok(fc.firstDayLo <= fc.firstDayHi && fc.soldOutDays >= 1);
assert.equal(M.forecast({ stock: null, discountPct: 25 }).soldOutDays, null);

/* ---- palette ---- */
assert.deepEqual(M.hexToRgb("#fff"), [255, 255, 255]);
assert.equal(M.hexToRgb("nope"), null);
const ember = ["#1a0705", "#a3220f", "#ff6a2b", "#ffd27a"];
const hot = M.paletteScore(["#ff6a2b", "#ffb36b", "#a3220f"], ember);
const cold = M.paletteScore(["#35d0e0", "#1e4b8f", "#e8f6ff"], ember);
assert.ok(hot >= 85, `matching colours score high (${hot})`);
assert.ok(cold < hot - 30, `other palette scores low (${cold})`);
assert.equal(M.paletteScore([], ember), null);
const svg = `data:image/svg+xml;utf8,${encodeURIComponent('<svg><rect fill="#ff6a2b"/><circle fill="#ffd27a"/></svg>')}`;
assert.deepEqual(M.itemColors({ asset_url: svg }), ["#ff6a2b", "#ffd27a"], "colours read from the SVG art");
assert.ok(M.itemPaletteScore({ set_key: "kor-bahcesi", palette: ["#35d0e0"] }, ember, "kor-bahcesi") >= 90, "own set piece ≥ 90");

/* ---- checklist ---- */
const piecesObj = Object.fromEntries(kor.map((p) => [p.category, { ...p, palette: ["#ff6a2b", "#a3220f"] }]));
const set = { key: "kor-bahcesi", palette: ember, pieces: piecesObj, price: 13800, partialSale: true, translations: { ready: 5, total: 7 } };
const ck = M.checklist(set, { clashes: [], phoneChecked: true });
assert.equal(ck.total, 6);
assert.equal(ck.ready, 5, "5 / 6 hazır");
assert.ok(ck.canPublish, "missing translations warn, they do not block");
assert.ok(!M.checklist({ ...set, price: 17000 }, { phoneChecked: true }).canPublish, "out of band blocks");
assert.equal(M.checklist(set, { clashes: [{ key: "x" }], phoneChecked: true }).rows.find((r) => r.key === "clash").ok, false);

/* ---- lifecycle and filters ---- */
const iso = (ms) => new Date(ms).toISOString();
const S = (key, extra) => ({ key, name: key, status: "live", startsAt: iso(NOW - 3 * 86400000), endsAt: iso(NOW + 4 * 86400000), stock: { total: 500, left: 188 }, pieces: {}, ...extra });
assert.equal(M.lifecycle(S("a"), NOW), "live");
assert.equal(M.lifecycle(S("a", { startsAt: iso(NOW + 86400000) }), NOW), "upcoming");
assert.equal(M.lifecycle(S("a", { endsAt: iso(NOW + 3600000) }), NOW), "last24");
assert.equal(M.lifecycle(S("a", { stock: { total: 400, left: 0 } }), NOW), "soldout");
assert.equal(M.lifecycle(S("a", { status: "recalled" }), NOW), "recalled");
assert.equal(M.lifecycle(S("a", { status: "draft", startsAt: null }), NOW), "draft");
const all = [S("kor"), S("gece", { stock: { total: null, left: null }, endsAt: null }), S("buzul", { startsAt: iso(NOW + 3 * 86400000), status: "scheduled" }), S("neon", { status: "recalled" }), S("altin", { status: "draft", startsAt: null }), S("mor", { stock: { total: 400, left: 0 } })];
assert.deepEqual(M.setCounts(all, NOW), { live: 2, scheduled: 1, draft: 1, archive: 2 }, "2 satışta · 1 planlı");
assert.deepEqual(M.filterSets(all, "live", NOW).map((s) => s.key), ["kor", "gece"]);
assert.deepEqual(M.filterSets(all, "archive", NOW).map((s) => s.key), ["neon", "mor"]);
assert.deepEqual(M.leftParts(iso(NOW + 2 * 86400000 + 14 * 3600000 + 60000), NOW), { d: 2, h: 14, m: 1 }, "2 gün 14 saat kaldı");

/* ---- timeline ---- */
const from = "2026-11-09";
const bars = M.setBars(all, from, 14, NOW);
assert.ok(bars.every((b) => b.x0 >= 0 && b.x1 <= 14 && b.x1 > b.x0));
const lanes = new Map();
for (const b of bars) {
  for (const o of lanes.get(b.lane) || []) assert.ok(b.x0 >= o.x1 - 0.02 || b.x1 <= o.x0, "bars in one lane never overlap");
  lanes.set(b.lane, [...(lanes.get(b.lane) || []), b]);
}
assert.equal(M.dayPos("2026-11-09T21:00:00.000Z", from), 1, "00:00 Istanbul of 10 Nov");
const same = [S("x", { startsAt: "2026-11-18T17:00:00.000Z" }), S("y", { startsAt: "2026-11-18T19:00:00.000Z" })];
const cl = M.findClashes(same, from, 14);
assert.ok(cl.some((c) => c.kind === "sameDay" && c.day === "2026-11-18"), "18 Kas 2 set aynı anda");
const planned = { key: "buzul", status: "scheduled", startsAt: "2026-11-18T17:00:00.000Z", endsAt: "2026-11-25T20:59:00.000Z" };
const others = [S("kor", { startsAt: "2026-11-12T17:00:00.000Z", endsAt: "2026-11-19T21:00:00.000Z" }), S("gece", { startsAt: "2026-11-10T17:00:00.000Z", endsAt: "2026-11-20T00:00:00.000Z" })];
const lc = M.launchClash(planned, others);
assert.deepEqual(lc.with.map((s) => s.key).sort(), ["gece", "kor"], "İlk 2 gün Kor Bahçesi ve Gece Kıyısı ile çakışır");
assert.equal(lc.suggest, "2026-11-20", "Açılışı 20 Kas'a almak önerilir");
assert.equal(M.moveToDay(planned.startsAt, "2026-11-20"), "2026-11-20T17:00:00.000Z", "same 20:00");
assert.deepEqual(M.launchClash({ ...planned, startsAt: "2026-11-22T17:00:00.000Z" }, others).with, []);

/* ---- charts ---- */
assert.equal(M.niceMax([1020, 1284]), 1500);
assert.equal(M.niceMax([]), 10);
assert.equal(M.linePath([0, 50, null, 100], 300, 100, 100, 4), "M0.0 100.0 L100.0 50.0 M300.0 0.0");
assert.ok(M.areaPath([0, 50, 100], 200, 100, 100).endsWith("Z"));
assert.equal(M.lastIndex([1, 2, null, null]), 1);
assert.equal(M.sparkPath([3]), "");
assert.equal(M.trend([1, 2, 3, 6, 7, 9]), "up");
assert.equal(M.trend([9, 7, 5, 3, 2, 1]), "down");

/* ---- night market ---- */
assert.equal(M.nightHours("22:00", "02:00"), 4, "22:00 – 02:00 · 4 saat");
assert.equal(M.nightHours("20:30", "23:00"), 2.5);
const dist = M.discountBuckets(25, 60);
assert.equal(dist.buckets.length, 13);
assert.ok(dist.buckets.filter((b) => b.inside).every((b) => b.from >= 25 && b.from <= 60));
assert.ok(dist.mean >= 25 && dist.mean <= 45, `mean leans low (${dist.mean})`);
const peak = dist.buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
assert.ok(peak.from < 45, "high discounts are rare");
assert.deepEqual(M.nightsInMonth(2026, 10, [1, 4]).slice(0, 4), ["2026-11-03", "2026-11-06", "2026-11-10", "2026-11-13"], "Tue + Fri in Nov 2026");
const grid = M.monthGrid(2026, 10);
assert.equal(grid.indexOf("2026-11-01"), 6, "1 Kasım is a Sunday");
assert.equal(M.nextNight({ mode: "calendar", weekdays: [1, 4], openFrom: "22:00" }, NOW), "2026-11-17T19:00:00.000Z", "Sonraki: Sal 17 Kas 22:00");
assert.equal(M.nextNight({ mode: "manual", dates: ["2026-11-16"], openFrom: "22:00" }, NOW), null, "manual opens nothing on its own");

/* ---- misc ---- */
assert.deepEqual(M.changedPaths({ gift: { a: 1, b: 2 }, r: { c: true } }, { gift: { a: 1, b: 3 }, r: { c: true } }), ["gift.b"]);
assert.ok(M.reasonOk("Afiş telefonda yanlış"));
assert.ok(!M.reasonOk("kısa"));
assert.equal(M.nameOf({ name: { tr: "Kor Halkası", en: "Ember Ring" } }, "en"), "Ember Ring");
assert.equal(M.nameOf({ name: "Düz" }), "Düz");
assert.equal(M.groupByDay([{ at: "2026-11-15T10:00:00Z" }, { at: "2026-11-15T09:00:00Z" }, { at: "2026-11-14T09:00:00Z" }]).length, 2);

/* ---- API normalizers ---- */
const api = await import("./adminShop2Api.js").catch(() => null);
if (api) {
  const n = api.normSet({ set_key: "k", name: "K", pieces: [{ slot: "banner", item: { id: 9, price: 2200, category: "banner" } }], stock_total: 300, stock_left: 120 });
  assert.equal(n.key, "k");
  assert.equal(n.pieces.banner.price_descoin, 2200);
  assert.deepEqual(n.stock, { total: 300, left: 120 });
  assert.equal(api.errKey({ code: "STEP_UP_REQUIRED" }), "adminShop2.err.stepUp");
  assert.equal(api.errKey({ status: 404 }), "adminShop2.err.notReady", "routes not mounted yet");
}

/* ---- locales ---- */
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
function flat(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") flat(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const packs = {};
for (const code of LOCALES) {
  const mod = await import(pathToFileURL(join(here, `../../../i18n/locales/adminShop2.${code}.js`)).href);
  packs[code] = flat(Object.values(mod)[0]);
}
const base = packs.tr;
for (const code of LOCALES) {
  assert.deepEqual(Object.keys(packs[code]).sort(), Object.keys(base).sort(), `${code}: same keys as tr`);
  for (const [k, v] of Object.entries(packs[code])) {
    assert.equal(typeof v, "string", `${code}.${k} is text`);
    assert.ok(v.trim().length > 0, `${code}.${k} not empty`);
    assert.equal(vars(v), vars(base[k]), `${code}.${k} placeholders`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(v), `${code}.${k}: no emoji`);
    assert.ok(!/valorant|takım bul|team finder/i.test(v), `${code}.${k}: retired feature`);
  }
  // Registration is the coordinator's job; report it instead of failing before it lands.
  const main = readFileSync(join(here, `../../../i18n/locales/${code}.js`), "utf8");
  if (!main.includes(`adminShop2.${code}.js`)) console.log(`note: ${code}.js does not import adminShop2.${code}.js yet (coordinator)`);
}

/* ---- every key the page uses exists ---- */
const files = readdirSync(here).filter((f) => /\.jsx?$/.test(f) && !f.includes("selftest"));
const used = new Set();
const dynamic = [];
for (const f of files) {
  const src = readFileSync(join(here, f), "utf8");
  assert.ok(!/\p{Extended_Pictographic}/u.test(src), `${f}: no emoji`);
  assert.ok(!/valorant|takım bul|\blfg\b/i.test(src), `${f}: retired feature`);
  for (const m of src.matchAll(/["'`](adminShop2\.[A-Za-z0-9_.]+)["'`]/g)) used.add(m[1]);
  for (const m of src.matchAll(/`(adminShop2\.[^`]*\$\{[^`]+)`/g)) dynamic.push(m[1]);
}
const has = (k) => k in base || Object.keys(base).some((b) => b.startsWith(`${k}.`));
for (const k of used) {
  if (k.endsWith(".") || k.endsWith(".js")) continue;
  assert.ok(has(k.slice("adminShop2.".length)), `missing locale key ${k}`);
}
// Dynamic families.
for (const r of M.RARITIES) assert.ok(has(`rarity.${r}`), r);
for (const s of M.SET_SLOTS) assert.ok(has(`cat.${s}`) && has(`catShort.${s}`), s);
for (const [g] of M.SLOT_GROUPS) assert.ok(has(`b.group.${g}`), g);
for (const k of ["pieces", "band", "phone", "clash", "single", "locales"]) assert.ok(has(`b.ck.${k}`), k);
for (const k of ["draft", "scheduled", "upcoming", "live", "last24", "recalled", "soldout", "ended"]) assert.ok(has(`status.${k}`), k);
for (const k of ["upcoming", "live", "last24", "soldout"]) assert.ok(has(`pv.stage.${k}`), k);
for (const k of ["none", "few", "many", "all"]) assert.ok(has(`pv.tier.${k}`), k);
for (const k of ["none", "few", "many"]) assert.ok(has(`pv.sample.${k}`), k);
for (const k of ["keep", "refund", "swap"]) assert.ok(has(`recall.mode.${k}.t`) && has(`recall.mode.${k}.d`), k);
for (const k of ["sameDay", "crowded", "legendary"]) assert.ok(has(`tl.clash.${k}`), k);
for (const k of ["storefront", "sets", "gifts", "yesterday"]) assert.ok(has(`sales.${k}`), k);
for (const k of ["all", "set", "rules", "night", "limits", "user"]) assert.ok(has(`audit.f.${k}`), k);
for (const k of ["rules", "night", "set", "refreshPrice", "limits", "event"]) assert.ok(has(`q.kind.${k}`), k);
for (const k of ["hideOwned", "noRepeat", "minEpic", "lockSurvives", "featureSetPieces"]) assert.ok(has(`algo.tgName.${k}`) && has(`algo.rule.${k}.t`), k);
for (const c of ["all", ...M.SET_SLOTS]) assert.ok(c === "all" ? has("rack.all") : has(`catShort.${c}`), c);
assert.ok(dynamic.length > 0, "dynamic keys are covered above");

/* ---- styles ---- */
const css = readFileSync(join(here, "../../../styles/admin-shop2.css"), "utf8");
for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
  assert.match(m[1].trim(), /^var\(--fs-(11|12|13|15|17|20|28)\)( !important)?$/, `admin-shop2.css font-size ${m[1]}`);
}
assert.ok(!/\p{Extended_Pictographic}/u.test(css));
assert.match(css, /\.as2-pop \{[^}]*background: #1d1e2b/, "menus are opaque");
assert.match(css, /\.as2-dlg \{[^}]*#1b1c28/, "dialogs are opaque");
assert.match(css, /\.as2-drawer \{[^}]*#1a1b27/, "drawers are opaque");
assert.match(css, /html\.glass-desktop :is\(\.as2, \.as2-scrim, \.as2-pop\)/, "focus ring wins over glass-desktop");
assert.match(css, /prefers-reduced-motion/);
for (const f of files) {
  const src = readFileSync(join(here, f), "utf8");
  assert.ok(!/fontSize\s*:/.test(src), `${f}: no inline font sizes`);
}

console.log("adminShop2.selftest ok");
