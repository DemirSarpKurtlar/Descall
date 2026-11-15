// Mağaza masası: pure model + locale parity. node src/components/admin/shopdesk/shopDesk.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as m from "./shopDeskModel.js";

const here = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-11-14T12:00:00Z");

// price ops match the backend rule (draft A3 numbers)
const op = { type: "percent", value: -15, rounding: "50" };
assert.deepEqual([3500, 2800, 1800].map((p) => m.applyPriceOp(p, op)), [2950, 2400, 1550]);
assert.equal(m.applyPriceOp(100, { type: "fixed", value: 75 }), 75);
assert.equal(m.applyPriceOp(100, { type: "delta", value: -500 }), 0);
assert.equal(m.applyPriceOp(100, { type: "percent", value: -100 }), null);
assert.equal(m.discounted(1200, 30), 840);
assert.equal(m.discounted(3, 95), 1);
assert.equal(m.parseSignedNumber("-%15"), -15);
assert.equal(m.parseSignedNumber("%-15"), -15);
assert.equal(m.parseSignedNumber("20"), 20);
assert.equal(m.parseSignedNumber(""), null);
const pv = m.bulkPreview([{ id: "a", name: "A", price_descoin: 1000 }], "sale", { pct: 20 });
assert.deepEqual([pv[0].now, pv[0].next, pv[0].up], [1000, 800, false]);

// status, filters, sort, pages
const items = [
  { id: "1", name: "Gece Ormanı", sku: "banner-gece", category: "banner", rarity: "epic", active: true, price_descoin: 1200, pricing: { price: 840, pct: 30 }, availability: { state: "live", stockLeft: null, endsAt: null }, sales: { n7: 184 }, created_at: "2026-11-01" },
  { id: "2", name: "Altın Işıltı", sku: "name-gold", category: "name_effect", rarity: "legendary", active: true, price_descoin: 3500, pricing: { price: 3500, pct: 0 }, availability: { state: "soldout", stockLeft: 0, endsAt: null }, stock_limit: 500, stock_sold: 500, sales: { n7: 142 }, created_at: "2026-10-01" },
  { id: "3", name: "Cam", sku: "bubble-glass", category: "chat_bubble", active: false, price_descoin: 600, availability: { state: "live" }, sales: { n7: 0 }, created_at: "2026-11-10" },
  { id: "4", name: "Eski", sku: "badge-old", category: "profile_badge", active: false, retired: true, price_descoin: 10, sales: { n7: 0 } },
];
assert.deepEqual(items.map(m.itemStatus), ["active", "soldout", "inactive", "retired"]);
assert.deepEqual(m.filterItems(items, {}).map((i) => i.id), ["1", "2", "3"], "retired hidden by default");
assert.deepEqual(m.filterItems(items, { status: "retired" }).map((i) => i.id), ["4"]);
assert.deepEqual(m.filterItems(items, { sale: true }).map((i) => i.id), ["1"]);
assert.deepEqual(m.filterItems(items, { q: "isilti" }).map((i) => i.id), ["2"], "accent-insensitive search");
assert.deepEqual(m.filterItems(items, { status: "limited" }).map((i) => i.id), ["2"]);
assert.deepEqual(m.sortItems(items, "best7").map((i) => i.id).slice(0, 2), ["1", "2"]);
assert.deepEqual(m.sortItems(items, "newest")[0].id, "3");
assert.deepEqual(m.pageList(97, 1), [1, 2, 3, "…", 97]);
assert.deepEqual(m.pageList(97, 50), [1, 2, 3, "…", 49, 50, 51, "…", 97]);
assert.deepEqual(m.pageList(4, 2), [1, 2, 3, 4]);
const sl = m.pageSlice(Array.from({ length: 23 }, (_, i) => i), 3, 10);
assert.deepEqual([sl.rows.length, sl.from, sl.to, sl.pages], [3, 21, 23, 3]);
const counts = m.categoryCounts(items);
assert.equal(counts.get("profile_badge"), undefined);
const chips = m.splitChips(new Map([["banner", 196], ["theme", 30], ["countries", 245], ["name_effect", 24], ["avatar_effect", 24], ["chat_bubble", 64], ["typing_flare", 16]]));
assert.deepEqual(chips.inline, ["banner", "theme", "countries", "name_effect", "chat_bubble"]);
assert.deepEqual(chips.more, ["avatar_effect", "typing_flare"]);
assert.deepEqual(m.stockInfo({ stock_limit: 500, stock_sold: 312 }), { limit: 500, sold: 312, left: 188, pct: 62 });
assert.equal(m.stockInfo({}), null);
assert.deepEqual(m.timeLeft("2026-11-16T16:00:00Z", NOW), { d: 2, h: 4, m: 0, ms: 2 * 86400000 + 4 * 3600000 });
assert.equal(m.timeLeft("2026-11-14T11:00:00Z", NOW), null);

// calendar geometry
const r = m.calendarRange(NOW, 7);
assert.equal((r.end - r.start) / 86400000, 49);
const g = m.barGeometry(new Date(r.start - 86400000).toISOString(), new Date(r.start + 7 * 86400000).toISOString(), r);
assert.equal(g.left, 0);
assert.equal(g.clippedStart, true);
assert.equal(m.barGeometry("2020-01-01", "2020-01-02", r), null);
assert.ok(m.nowLinePct(r, NOW) > 0 && m.nowLinePct(r, NOW) < 20);

// reconciliation helpers
assert.deepEqual(m.fixPlan("balance_to_ledger", { balance: 8400, ledgerSum: 8900 }), { drift: -500, balanceAfter: 8900, ledgerAmount: 0, ok: true });
assert.deepEqual(m.fixPlan("ledger_to_balance", { balance: 8400, ledgerSum: 8900 }), { drift: -500, balanceAfter: 8400, ledgerAmount: -500, ok: true });
assert.equal(m.fixPlan("balance_to_ledger", { balance: 5, ledgerSum: 5 }).ok, false);
const bars = m.runBars([{ mismatch_count: 3, started_at: "c" }, { error: "x", started_at: "b" }, { mismatch_count: 0, started_at: "a" }]);
assert.deepEqual(bars.map((b) => b.value), [0, null, 3], "oldest first, failed run = null");
assert.equal(m.runSeconds({ started_at: "2026-11-14T04:00:00Z", finished_at: "2026-11-14T04:00:41Z" }), 41);
assert.equal(m.accountDays("2026-04-14T12:00:00Z", NOW), 214);
assert.match(m.reconcileCsv([{ user_id: "u", user: { username: "a,b" }, balance: 1, ledger_sum: 2, drift: -1, ledger_rows: 3 }]), /"a,b"/);
assert.match(m.catalogCsv(items).split("\n")[0], /^id,sku,name/);
assert.deepEqual(m.salesSpeed(504), { unit: "hour", value: 3 });
assert.deepEqual(m.salesSpeed(7), { unit: "day", value: 1 });

// campaign form
const form = { name: "Kara Cuma", kind: "discount", pct: "40", scope: "all", startsAt: "2026-11-27T00:00", endsAt: "2026-12-01T00:00", enabled: true };
assert.equal(m.campaignError(form), "");
assert.equal(m.campaignError({ ...form, pct: "0" }), "pct");
assert.equal(m.campaignError({ ...form, endsAt: "2026-11-20T00:00" }), "window");
assert.equal(m.campaignError({ ...form, kind: "storefront" }), "section");
assert.equal(m.campaignError({ ...form, kind: "drop", scope: "items", itemIds: [] }), "items");
const body = m.campaignBody({ ...form, kind: "drop", scope: "items", itemIds: ["x"], stockPerItem: "500" });
assert.deepEqual(body.scope, { itemIds: ["x"] });
assert.equal(body.stockPerItem, 500);
assert.equal(m.campaignBody(form).discountPct, 40);
assert.deepEqual(m.moveId(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
assert.equal(m.searchLocal({ items, campaigns: [{ id: "k", name: "Kara Cuma" }] }, "kara").campaigns.length, 1);

// locale parity: shopDesk + shopMerch have the same leaf keys and placeholders in every language
const locDir = join(here, "../../../i18n/locales");
function leaves(obj, p = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") leaves(v, `${p}${k}.`, out);
    else out[`${p}${k}`] = v;
  }
  return out;
}
const vars = (s) => [...String(s).replace(/\{\w+, plural,[^]*$/, (x) => x.match(/^\{(\w+)/)[0] + "}").matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
for (const ns of ["shopDesk", "shopMerch"]) {
  const files = readdirSync(locDir).filter((f) => f.startsWith(`${ns}.`) && f.endsWith(".js"));
  assert.equal(files.length, 7, `${ns}: 7 locale files`);
  const loaded = {};
  for (const f of files) {
    const mod = await import(pathToFileURL(join(locDir, f)).href);
    loaded[f] = leaves(Object.values(mod)[0]);
  }
  const base = loaded[`${ns}.tr.js`];
  for (const [f, l] of Object.entries(loaded)) {
    assert.deepEqual(Object.keys(l).sort(), Object.keys(base).sort(), `${f}: same keys as tr`);
    for (const k of Object.keys(base)) assert.ok(String(l[k]).trim(), `${f}: ${k} not empty`);
  }
  for (const [f, l] of Object.entries(loaded)) {
    for (const k of Object.keys(base)) {
      const want = new Set(vars(base[k]));
      for (const v of vars(l[k])) assert.ok(want.has(v), `${f}: ${k} uses {${v}} that tr does not`);
    }
  }
  for (const main of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
    const src = readFileSync(join(locDir, `${main}.js`), "utf8");
    assert.match(src, new RegExp(`from "\\./${ns}\\.${main.replace("-", "\\-")}\\.js"`), `${main}.js imports ${ns}`);
  }
}

// every static key the UI uses exists in tr
const tr = leaves((await import(pathToFileURL(join(locDir, "shopDesk.tr.js")).href)).SHOP_DESK_TR);
const ui = readdirSync(here).filter((f) => f.endsWith(".jsx")).map((f) => readFileSync(join(here, f), "utf8")).join("\n");
for (const [, k] of ui.matchAll(/"shopDesk\.([A-Za-z0-9_.]+)"/g)) assert.ok(typeof tr[k] === "string", `missing shopDesk.${k}`);

// no emoji, no retired game words in the desk
const all = ui + readFileSync(join(here, "shopDeskModel.js"), "utf8");
assert.equal(/\p{Extended_Pictographic}/u.test(all), false, "no emoji in the shop desk");
console.log("shopDesk.selftest.mjs: ok");
