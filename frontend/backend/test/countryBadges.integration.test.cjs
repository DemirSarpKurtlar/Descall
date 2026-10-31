"use strict";

/**
 * Country flags (2.13.0): `countries` is sold and equipped like any cosmetic,
 * one flag at a time; profile titles are retired (not sold, not equipped, not
 * returned); a free-country voucher grants one flag at 0 DesCoin without
 * touching the balance or the ledger, exactly once.
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const country = (code, name, emoji, order) => ({
  id: `item-country-${code.toLowerCase()}`,
  sku: `country-${code.toLowerCase()}`,
  name: `${emoji} ${name}`,
  description: `${name} bayrağı rozeti.`,
  category: "countries",
  asset_url: "data:,",
  preview_url: "data:,",
  price_descoin: 250,
  badge_icon: emoji,
  country_code: code,
  country_region: "europe",
  country_kind: "sovereign",
  active: true,
  rarity: "common",
  sort_order: order,
});

const supabasePath = require.resolve("../db/supabase");
const fakeSupabase = createFakeSupabase({
  users: [
    { id: "u-pay", username: "payer", active_sessions: [{ id: "s-pay" }], descoin_balance: 300, equipped_title_id: "item-title", equipped_country_id: null },
    { id: "u-gift", username: "gifted", active_sessions: [{ id: "s-gift" }], descoin_balance: 100, equipped_title_id: null, equipped_country_id: null },
  ],
  shop_items: [
    {
      id: "item-color-ocean",
      sku: "profile-color-ocean",
      name: "Ocean",
      category: "profile_color",
      asset_url: "data:,",
      price_descoin: 50,
      effect_key: "ocean",
      active: true,
      rarity: "common",
      sort_order: 1502,
    },
    country("TR", "Türkiye", "🇹🇷", 5100),
    country("DE", "Almanya", "🇩🇪", 5003),
    country("JP", "Japonya", "🇯🇵", 5050),
    {
      id: "item-title",
      sku: "title-legend",
      name: "Legend",
      category: "profile_title",
      asset_url: "data:,",
      price_descoin: 500,
      title_text: "⚡ Legend",
      active: true,
      rarity: "legendary",
      sort_order: 1,
    },
  ],
  user_inventory: [
    { id: "inv-1", user_id: "u-pay", item_id: "item-title", acquired_via: "purchase", acquired_at: "2026-09-01T00:00:00Z" },
    { id: "inv-2", user_id: "u-gift", item_id: "item-title", acquired_via: "gift", acquired_at: "2026-09-01T00:00:00Z" },
  ],
  shop_vouchers: [
    { id: "v-1", user_id: "u-pay", category: "countries", reason: "title_retired_2026_10", granted_at: "2026-10-19T12:00:00Z", redeemed_at: null, redeemed_item_id: null },
  ],
  descoin_ledger: [],
  shop_purchases: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fakeSupabase };

const express = require("express");
const { signToken } = require("../config/jwt");
const shopRouter = require("../routes/shop");
const shop = require("../lib/shop");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function req(base, method, urlPath, { body, token } = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function run() {
  const app = express();
  app.use(express.json());
  app.use("/api/shop", shopRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const users = fakeSupabase._tables.users.rows;
  const payer = users.find((u) => u.id === "u-pay");
  const gifted = users.find((u) => u.id === "u-gift");
  try {
    const pay = signToken({ id: "u-pay", username: "payer", sid: "s-pay" });
    const gift = signToken({ id: "u-gift", username: "gifted", sid: "s-gift" });

    let r = await req(base, "GET", "/api/shop/catalog", { token: pay });
    assert(r.status === 200, "catalog loads");
    assert(r.body.retiredCategories.includes("profile_title"), "titles are announced as retired to installed apps");
    assert(r.body.retiredCategories.includes("profile_badge"), "shop profile badges are announced as retired to installed apps");
    assert(!r.body.items.some((i) => i.category === "profile_title"), "no titles in the catalog");
    const tr = r.body.items.find((i) => i.sku === "country-tr");
    assert(tr && tr.country_code === "TR" && tr.price_descoin === 250 && tr.badge_icon === "🇹🇷", "country items carry code + emoji + price");

    r = await req(base, "GET", "/api/shop/inventory", { token: pay });
    assert(!r.body.inventory.some((row) => row.item?.category === "profile_title"), "owned titles are hidden, not deleted");
    assert(fakeSupabase._tables.user_inventory.rows.some((row) => row.item_id === "item-title"), "title rows stay in the database");

    r = await req(base, "POST", "/api/shop/equip", { token: pay, body: { category: "profile_title", itemId: "item-title" } });
    assert(r.status === 410, "titles cannot be equipped: " + JSON.stringify(r.body));
    const equippedBefore = await shop.getEquippedCosmeticsForUser("u-pay");
    assert(equippedBefore.title === null, "a stored title id is never returned");

    r = await req(base, "GET", "/api/shop/vouchers", { token: pay });
    assert(r.body.vouchers.countries === 1, "the paying user has one free country: " + JSON.stringify(r.body));
    r = await req(base, "GET", "/api/shop/vouchers", { token: gift });
    assert(!r.body.vouchers.countries, "gift-only users get nothing");

    // Voucher: 0 DesCoin, no ledger row, balance unchanged
    r = await req(base, "POST", "/api/shop/purchase", { token: pay, body: { itemId: "item-country-jp", useVoucher: true } });
    assert(r.status === 200 && r.body.voucher === true, "voucher redeems: " + JSON.stringify(r.body));
    assert(payer.descoin_balance === 300 && r.body.balance === 300, "voucher does not change the balance");
    assert(fakeSupabase._tables.descoin_ledger.rows.length === 0, "voucher writes no ledger row");
    const jpRow = fakeSupabase._tables.user_inventory.rows.find((row) => row.user_id === "u-pay" && row.item_id === "item-country-jp");
    assert(jpRow && jpRow.acquired_via === "voucher", "inventory row marks the voucher");
    r = await req(base, "POST", "/api/shop/purchase", { token: pay, body: { itemId: "item-country-de", useVoucher: true } });
    assert(r.status === 409 && r.body.code === "no_voucher", "a voucher is spent once: " + JSON.stringify(r.body));
    r = await req(base, "POST", "/api/shop/purchase", { token: gift, body: { itemId: "item-country-de", useVoucher: true } });
    assert(r.status === 409 && r.body.code === "no_voucher", "no voucher, no free flag");
    assert(gifted.descoin_balance === 100, "failed voucher attempt costs nothing");

    // Paid purchase: 250 DesCoin
    r = await req(base, "POST", "/api/shop/purchase", { token: pay, body: { itemId: "item-country-tr" } });
    assert(r.status === 200 && payer.descoin_balance === 50, "a country costs 250 DesCoin: " + JSON.stringify(r.body));
    r = await req(base, "POST", "/api/shop/purchase", { token: gift, body: { itemId: "item-country-tr" } });
    assert(r.status === 402, "not enough DesCoin is refused");

    // One flag at a time, category must match
    r = await req(base, "POST", "/api/shop/equip", { token: pay, body: { category: "countries", itemId: "item-country-tr" } });
    assert(r.status === 200 && payer.equipped_country_id === "item-country-tr", "equip a flag");
    r = await req(base, "POST", "/api/shop/equip", { token: pay, body: { category: "countries", itemId: "item-country-jp" } });
    assert(r.status === 200 && payer.equipped_country_id === "item-country-jp", "the second flag replaces the first");
    r = await req(base, "POST", "/api/shop/equip", { token: pay, body: { category: "theme", itemId: "item-country-jp" } });
    assert(r.status === 400 && r.body.code === "category_mismatch", "a flag cannot go into another slot");
    r = await req(base, "POST", "/api/shop/equip", { token: gift, body: { category: "countries", itemId: "item-country-jp" } });
    assert(r.status === 403, "cannot equip a flag you do not own");
    const eq = await shop.getEquippedCosmeticsForUser("u-pay");
    assert(eq.country?.country_code === "JP", "equipped record resolves the flag");
    r = await req(base, "POST", "/api/shop/equip", { token: pay, body: { category: "countries", itemId: null } });
    assert(r.status === 200 && payer.equipped_country_id === null, "unequip");

    // Profile card colour (3.7.10): its own slot, bought and worn like any cosmetic.
    r = await req(base, "POST", "/api/shop/purchase", { token: pay, body: { itemId: "item-color-ocean" } });
    assert(r.status === 200 && payer.descoin_balance === 0, "buy a card colour: " + JSON.stringify(r.body));
    r = await req(base, "POST", "/api/shop/equip", { token: pay, body: { category: "profile_color", itemId: "item-color-ocean" } });
    assert(r.status === 200 && payer.equipped_profile_color_id === "item-color-ocean", "equip a card colour: " + JSON.stringify(r.body));
    r = await req(base, "POST", "/api/shop/equip", { token: pay, body: { category: "countries", itemId: "item-color-ocean" } });
    assert(r.status === 400 && r.body.code === "category_mismatch", "a colour cannot go into another slot");
    const eqColor = await shop.getEquippedCosmeticsForUser("u-pay");
    assert(eqColor.profileColor?.effect_key === "ocean", "equipped record resolves the colour");
    r = await req(base, "POST", "/api/shop/equip", { token: pay, body: { category: "profile_color", itemId: null } });
    assert(r.status === 200 && payer.equipped_profile_color_id === null, "unequip the colour");

    console.log("countryBadges.integration.test.cjs: ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
