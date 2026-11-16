"use strict";

/**
 * "Tüm ürünler" is browse only (owner, 16 Nov 2026): POST /api/shop/purchase sells only items
 * an admin allowed (shop_items.direct_sale), with a translated `not_direct_sale` error for the
 * rest; Market 2.0 purchases are not affected; the catalog carries direct_sale, set_key and the
 * 7-language text of s2 items; the admin panel (GET / PUT /api/admin/shop2/direct-sale) toggles
 * one item or many (reason required), audits shop2_direct_sale and tells open shops; before
 * 20261116_shop_direct_sale.sql every s2 item is not directly buyable, flags and older rows are.
 * Run: node frontend/backend/test/shopDirectSale.integration.test.cjs
 */

const assert = require("node:assert/strict");
const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const { seed, harness, U, I } = require("./shop2Fixture.cjs");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

const { check, finish } = harness("shopDirectSale.integration.test.cjs");

const MISTY = { name: { tr: "Sisli Rıhtım", en: "Misty Pier", de: "Nebliger Pier", es: "Muelle brumoso", fr: "Jetée brumeuse", "pt-BR": "Cais enevoado", ru: "Туманный причал" }, description: { tr: "Sisli bir rıhtım.", en: "A misty pier." } };

async function run() {
  const now = Date.now();
  const data = seed(now);
  const byId = (id) => data.shop_items.find((r) => r.id === id);
  byId(I(18)).direct_sale = false; // s2 single, explicitly off
  byId(I(18)).i18n = MISTY;
  byId(I(19)).direct_sale = true; // s2 single, allowed by an admin
  byId(I(21)).direct_sale = false;
  byId(I(22)).direct_sale = false;
  // I(20) (s2) and I(92) (old banner) have no value: the column-missing fallback.
  data.shop_items.push({ id: I(95), sku: "country-tr", name: "Turkey", category: "countries", country_code: "TR", price_descoin: 100, rarity: "common", active: true, sort_order: 950, direct_sale: true });

  const fake = createFakeSupabase(data);
  const supabasePath = require.resolve("../db/supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

  // Simulate the migration not applied: any select / update touching direct_sale fails 42703.
  let columnMissing = false;
  const origFrom = fake.from.bind(fake);
  fake.from = (name) => {
    const q = origFrom(name);
    if (name !== "shop_items") return q;
    const missing = () => {
      const err = { data: null, error: { code: "42703", message: "column shop_items.direct_sale does not exist" } };
      const chain = new Proxy({}, { get: (_t, k) => (k === "then" ? (res) => Promise.resolve(err).then(res) : () => chain) });
      return chain;
    };
    const sel = q.select.bind(q);
    q.select = (cols, o) => (columnMissing && String(cols || "").includes("direct_sale") ? missing() : sel(cols, o));
    const upd = q.update.bind(q);
    q.update = (obj) => (columnMissing && obj && "direct_sale" in obj ? missing() : upd(obj));
    return q;
  };

  const express = require("express");
  const { signToken } = require("../config/jwt");
  const state = require("../runtime/sharedState");
  const shop = require("../lib/shop");
  const emitted = [];
  const io = {
    emit: (ev, p) => emitted.push({ to: "all", ev, p }),
    to: (room) => ({ emit: (ev, p) => emitted.push({ to: room, ev, p }) }),
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
  };
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/shop", require("../routes/shop"));
  app.use("/shop2", require("../routes/shop2"));
  const adminRouter = require("../routes/adminShop2");
  app.use("/admin/shop2", (req, _res, next) => {
    req.user = { id: U(9), username: "admin" };
    next();
  }, adminRouter.routes || adminRouter);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, { method = "GET", body, user = 1 } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: U(user), username: `u${user}`, sid: `s${user}` })}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  };
  const rows = (t) => fake._tables[t]?.rows || [];
  const balance = (u) => rows("users").find((r) => r.id === U(u)).descoin_balance;
  const owns = (u, item) => rows("user_inventory").some((r) => r.user_id === U(u) && r.item_id === item);
  const buy = (item, user = 1) => call("/api/shop/purchase", { method: "POST", body: { itemId: item, themeEngine: "scenes-1" }, user });
  const catalogItem = async (id) => {
    shop.invalidateCatalogCache();
    const r = await call("/api/shop/catalog");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.items.find((it) => it.id === id);
  };

  try {
    await check("catalog: direct_sale per item, set_key and the 7-language text of s2 items", async () => {
      const misty = await catalogItem(I(18));
      assert.equal(misty.direct_sale, false);
      assert.equal(misty.i18n?.name?.tr, "Sisli Rıhtım");
      assert.equal(misty.i18n?.name?.ru, "Туманный причал");
      assert.equal((await catalogItem(I(19))).direct_sale, true);
      assert.equal((await catalogItem(I(20))).direct_sale, false, "s2 without a value is not directly buyable");
      assert.equal((await catalogItem(I(95))).direct_sale, true, "country flag stays buyable");
      assert.equal((await catalogItem(I(92))).direct_sale, true, "older row keeps the old behaviour");
      const piece = await catalogItem(I(2));
      assert.equal(piece.set_key, "gece-limani");
      assert.equal(piece.direct_sale, false);
    });

    await check("purchase: a non-allowed item is refused with not_direct_sale (translated), nothing charged", async () => {
      const before = balance(1);
      const r = await buy(I(18));
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.equal(r.body.code, "not_direct_sale");
      assert.equal(r.body.error, "This item is sold in the storefront and in sets, not directly.");
      assert.equal(balance(1), before);
      assert.ok(!owns(1, I(18)));
      assert.equal((await buy(I(20))).body.code, "not_direct_sale", "s2 without a value");
      assert.equal((await buy(I(2))).body.code, "not_direct_sale", "set piece");
    });

    await check("purchase: allowed s2 item, country flag and older row still sell directly", async () => {
      const before = balance(1);
      const a = await buy(I(19));
      assert.equal(a.status, 200, JSON.stringify(a.body));
      assert.ok(owns(1, I(19)));
      assert.equal(balance(1), before - byId(I(19)).price_descoin);
      assert.equal((await buy(I(95))).status, 200);
      assert.equal((await buy(I(92))).status, 200);
    });

    await check("Market 2.0 purchase of the same non-allowed item is not affected", async () => {
      // Market 2.0 sells singles from the user's storefront: a card there sells with direct_sale off.
      const sf = await call("/shop2/storefront", { user: 2 });
      assert.equal(sf.status, 200, JSON.stringify(sf.body));
      const card = sf.body.slots.find((x) => !x.owned && rows("shop_items").find((r) => r.id === x.item.id)?.direct_sale !== true);
      assert.ok(card, "a storefront card that is not open for direct sale");
      const r = await call(`/shop2/items/${card.item.id}/buy`, { method: "POST", body: {}, user: 2 });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(owns(2, card.item.id));
    });

    await check("admin: overview lists every item with its state and totals", async () => {
      shop.invalidateCatalogCache();
      const r = await call("/admin/shop2/direct-sale");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.installed, true);
      const misty = r.body.items.find((it) => it.id === I(18));
      assert.equal(misty.direct_sale, false);
      assert.equal(misty.stored, false);
      assert.ok(r.body.totals.allowed >= 3 && r.body.totals.blocked >= 1);
      const sold = r.body.items.find((it) => it.id === I(19));
      assert.equal(sold.sales7, 1, "the direct sale above is counted");
    });

    await check("admin: one switch allows an item, audited, open shops told, then it sells", async () => {
      emitted.length = 0;
      const r = await call("/admin/shop2/direct-sale", { method: "PUT", body: { itemIds: [I(18)], allowed: true } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.changedIds, [I(18)]);
      assert.equal(byId(I(18)).direct_sale, false, "seed object untouched");
      assert.equal(rows("shop_items").find((x) => x.id === I(18)).direct_sale, true);
      const entry = state.auditLog.find((e) => e.action === "shop2_direct_sale");
      assert.ok(entry, "audit entry");
      assert.equal(entry.target, "true");
      assert.equal(entry.meta.count, 1);
      assert.ok(emitted.some((e) => e.to === "all" && e.ev === "shop:catalog:changed" && e.p.reason === "direct_sale"));
      assert.equal((await catalogItem(I(18))).direct_sale, true);
      assert.equal((await buy(I(18))).status, 200);
      const again = await call("/admin/shop2/direct-sale", { method: "PUT", body: { itemIds: [I(18)], allowed: true } });
      assert.deepEqual(again.body.changedIds, [], "no change, nothing to undo");
    });

    await check("admin: bulk needs a reason; with one it flips only what changes; empty is refused", async () => {
      const no = await call("/admin/shop2/direct-sale", { method: "PUT", body: { itemIds: [I(21), I(22)], allowed: true } });
      assert.equal(no.status, 400);
      assert.equal(no.body.code, "reason_required");
      const ok = await call("/admin/shop2/direct-sale", { method: "PUT", body: { itemIds: [I(21), I(22), I(19)], allowed: true, reason: "Weekend promo" } });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.deepEqual(ok.body.changedIds.sort(), [I(21), I(22)].sort());
      const e = state.auditLog.find((x) => x.action === "shop2_direct_sale");
      assert.equal(e.meta.reason, "Weekend promo");
      assert.equal(e.meta.bulk, true);
      const undo = await call("/admin/shop2/direct-sale", { method: "PUT", body: { itemIds: ok.body.changedIds, allowed: false, reason: "Undone", undo: true } });
      assert.equal(undo.body.count, 2);
      assert.equal((await buy(I(21))).body.code, "not_direct_sale");
      const empty = await call("/admin/shop2/direct-sale", { method: "PUT", body: { itemIds: [], allowed: true } });
      assert.equal(empty.status, 400);
      assert.equal(empty.body.code, "no_items");
    });

    await check("before the migration: s2 items are not directly buyable, flags are; admin writes refused", async () => {
      columnMissing = true;
      // The real table has no such column: no row carries a value either.
      const saved = rows("shop_items").map((x) => [x, x.direct_sale]);
      for (const [x] of saved) delete x.direct_sale;
      assert.equal((await catalogItem(I(19))).direct_sale, false, "s2 item, column missing");
      assert.equal((await catalogItem(I(95))).direct_sale, true, "country flag, column missing");
      const r = await buy(I(23));
      assert.equal(r.body.code, "not_direct_sale");
      const flag = await buy(I(95), 3);
      assert.equal(flag.status, 200, JSON.stringify(flag.body));
      const ov = await call("/admin/shop2/direct-sale");
      assert.equal(ov.status, 200);
      assert.equal(ov.body.installed, false);
      const put = await call("/admin/shop2/direct-sale", { method: "PUT", body: { itemIds: [I(23)], allowed: true } });
      assert.equal(put.status, 409);
      assert.equal(put.body.code, "direct_sale_unavailable");
      columnMissing = false;
      for (const [x, v] of saved) if (v !== undefined) x.direct_sale = v;
    });
  } finally {
    srv.close();
  }
  finish();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
