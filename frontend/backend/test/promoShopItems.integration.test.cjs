"use strict";

/**
 * Promo admin "Mağaza eşyası" picker: GET /promo-codes/shop-items lists every item on sale
 * (Market 2.0 s2- rows plus country flags, past the old 500-row cut, paged past 1000), with the
 * fields the picker draws; retired rows (old catalog, items taken off sale) stay out. promo.adminCreate refuses a
 * retired item before the database is asked.
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows = [];
for (let i = 0; i < 1100; i += 1) {
  rows.push({
    id: uuid(i + 1), sku: `s2-banner-x${i}`, name: `Banner ${String(i).padStart(4, "0")}`, category: i % 2 ? "banner" : "avatar_frame",
    rarity: "rare", set_key: i < 4 ? "gece-limani" : null, price_descoin: 300, active: true, sort_order: i,
    i18n: { name: { tr: `Afiş ${i}`, en: `Banner ${i}` } }, asset_url: "data:image/svg+xml;utf8,%3Csvg/%3E", preview_url: null,
  });
}
rows.push({ id: uuid(5001), sku: "country-tr", name: "TR Türkiye", category: "countries", price_descoin: 250, active: true, sort_order: 0 });
rows.push({ id: uuid(5002), sku: "old-frame", name: "Old frame", category: "avatar_frame", price_descoin: 100, active: false, retired_at: "2026-11-16T00:00:00.000Z", sort_order: 0 });
rows.push({ id: uuid(5003), sku: "s2-banner-retired", name: "Retired", category: "banner", price_descoin: 100, active: false, sort_order: 0 });

const fake = createFakeSupabase({ users: [], shop_items: rows });
const created = [];
fake.rpc = async (name, args) => {
  if (name === "promo_admin_create") {
    created.push(args.p);
    return { data: { ok: true, id: uuid(9999), code: args.p.code }, error: null };
  }
  return { data: null, error: { message: "unexpected rpc " + name } };
};
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const promo = require("../lib/promo");
const router = require("../routes/adminPromo");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function run() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${base}/api/admin/promo-codes/shop-items`);
    assert(res.status === 200, "list ok");
    const { items } = await res.json();
    assert(items.length === 1101, `1100 s2 items + 1 flag, past the old 500 cap and one 1000-row page (${items.length})`);
    assert(!items.some((i) => i.sku === "old-frame" || i.sku === "s2-banner-retired"), "old catalog and retired rows left out");
    const one = items.find((i) => i.sku === "s2-banner-x1");
    assert(one && one.i18n?.name?.tr === "Afiş 1" && one.rarity === "rare" && one.asset_url && "set_key" in one, "picker fields present");
    assert(items[0].category <= items[items.length - 1].category, "grouped by category");

    let code = "ok";
    try {
      await promo.adminCreate("admin", { code: "AAAABBBBCCCCDDDD", rewardType: "shop_item", rewardRef: uuid(5003) });
    } catch (err) {
      code = err.code;
    }
    assert(code === "reward_item" && created.length === 0, "retired item refused before the database");
    await promo.adminCreate("admin", { code: "AAAABBBBCCCCDDDE", rewardType: "shop_item", rewardRef: uuid(2) });
    assert(created.length === 1 && created[0].rewardRef === uuid(2), "item on sale accepted");
  } finally {
    server.close();
  }
  console.log("promoShopItems.integration.test: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
