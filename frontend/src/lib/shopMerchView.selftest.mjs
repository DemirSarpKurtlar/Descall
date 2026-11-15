// User shop merchandising helpers: node src/lib/shopMerchView.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as v from "./shopMerchView.js";

const NOW = Date.parse("2026-11-14T12:00:00Z");
assert.deepEqual(v.saleOf({ price_descoin: 840, list_price_descoin: 1200, discount_pct: 30 }), { onSale: true, pct: 30, price: 840, list: 1200 });
assert.equal(v.saleOf({ price_descoin: 600 }).onSale, false, "old catalog without list price");
assert.equal(v.saleOf({ price_descoin: 600, list_price_descoin: 600, discount_pct: 0 }).onSale, false);
assert.deepEqual(v.stockOf({ stock_limit: 500, stock_left: 188 }), { limited: true, left: 188, limit: 500, low: false, soldOut: false });
assert.equal(v.stockOf({ stock_limit: 100, stock_left: 12 }).low, true);
assert.equal(v.stockOf({ stock_limit: 3, stock_left: 0, sold_out: true }).soldOut, true);
assert.equal(v.stockOf({}).limited, false);
assert.equal(v.endOf({ available_until: "2026-11-20T00:00:00Z", sale_ends_at: "2026-11-15T00:00:00Z" }), Date.parse("2026-11-15T00:00:00Z"));
assert.equal(v.endOf({}), null);
const c = v.countdown(NOW + 2 * 86400000 + 4 * 3600000, NOW);
assert.deepEqual([c.d, c.h, c.urgent], [2, 4, false]);
assert.deepEqual(v.countdownLabel(c), { key: "shopMerch.leftDays", vars: { d: 2, h: 4 } });
assert.equal(v.countdownLabel(v.countdown(NOW + 3 * 3600000 + 5 * 60000, NOW)).key, "shopMerch.leftHours");
assert.deepEqual(v.countdownLabel(v.countdown(NOW + 65000, NOW)), { key: "shopMerch.leftMinutes", vars: { m: 1, s: "05" } });
assert.equal(v.countdown(NOW - 1, NOW), null);
assert.equal(v.countdown(NOW + 3600000, NOW).urgent, true);
const items = [{ id: "a" }, { id: "b" }];
assert.deepEqual(v.resolveStorefront([{ id: "s1", itemIds: ["b", "x", "a"] }, { id: "s2", itemIds: ["x"] }], items).map((s) => [s.id, s.items.map((i) => i.id)]), [["s1", ["b", "a"]]]);
assert.equal(v.purchasable({ stock_limit: 1, stock_left: 0, sold_out: true }, NOW), false);
assert.equal(v.purchasable({ available_until: "2026-11-14T11:00:00Z" }, NOW), false);
assert.equal(v.purchasable({ price_descoin: 1 }, NOW), true);
assert.equal(v.latestUpdate([{ id: "u", body: "price_drop", itemIds: ["a", "zz"] }], items).items.length, 1);
assert.equal(v.latestUpdate([{ id: "u", body: "price_change", itemIds: ["zz"] }], items), null);

// the user shop wires every admin feature in
const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(here, "../components/settings/ShopPanel.jsx"), "utf8");
for (const needle of ["ShopStorefront", "ShopMerchTags", "ShopPriceTag", "expectedPrice", "descall:shop-catalog-changed", "sold_out", "price_changed"]) {
  assert.ok(panel.includes(needle), `ShopPanel uses ${needle}`);
}
const modal = readFileSync(join(here, "../components/shop/purchase/StorePurchaseModal.jsx"), "utf8");
assert.ok(modal.includes("spm-list-price") && modal.includes("canBuyNow"), "purchase modal shows the struck price and blocks sold out");
console.log("shopMerchView.selftest.mjs: ok");
