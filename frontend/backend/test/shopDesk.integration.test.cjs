"use strict";

/**
 * Mağaza remake end to end on the fake database:
 *   user shop: sale price in the catalog and at checkout, limited stock (sold out refused),
 *   expired / scheduled items hidden and refused, price_changed guard, storefront sections
 *   admin desk: bulk price, gift to many + undo (unequips), reconciliation fix modes
 * Run: node frontend/backend/test/shopDesk.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const H = 3_600_000;
const iso = (t) => new Date(t).toISOString();
const NOW = Date.now();
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const fake = createFakeSupabase({
  users: [
    { id: U(1), username: "buyer", active_sessions: [{ id: "s1" }], descoin_balance: 5000 },
    { id: U(2), username: "second", active_sessions: [{ id: "s2" }], descoin_balance: 5000 },
    { id: U(3), username: "giftee", active_sessions: [{ id: "s3" }], descoin_balance: 0, equipped_banner_id: null },
    { id: U(4), username: "drift", active_sessions: [{ id: "s4" }], descoin_balance: 8400 },
    { id: U(9), username: "admin", active_sessions: [{ id: "s9" }], descoin_balance: 0, is_admin: true },
  ],
  descoin_ledger: [
    { id: "l1", user_id: U(4), amount: 10700, reason: "admin_grant", balance_after: 10700, created_at: iso(NOW - 3 * H) },
    { id: "l2", user_id: U(4), amount: -1800, reason: "shop_purchase", balance_after: 8900, created_at: iso(NOW - 2 * H) },
  ],
  shop_items: [
    { id: U(101), sku: "banner-sale", name: "Gece Ormani", category: "banner", price_descoin: 1200, active: true, rarity: "epic", sort_order: 1, sale_pct: 30, sale_starts_at: iso(NOW - H), sale_ends_at: iso(NOW + 24 * H), stock_sold: 0, created_at: iso(NOW - 2 * 86400000) },
    { id: U(102), sku: "name-limited", name: "Altin Isilti", category: "name_effect", effect_key: "gold-shimmer", price_descoin: 3500, active: true, rarity: "legendary", sort_order: 2, stock_limit: 1, stock_sold: 0, created_at: iso(NOW - 40 * 86400000) },
    { id: U(103), sku: "burst-expired", name: "Konfeti", category: "reaction_burst", effect_key: "confetti-storm", price_descoin: 1800, active: true, rarity: "rare", sort_order: 3, available_until: iso(NOW - H), stock_sold: 0, created_at: iso(NOW - 40 * 86400000) },
    { id: U(104), sku: "aura-later", name: "Kuzey", category: "profile_aura", effect_key: "aurora-wall", price_descoin: 4200, active: true, rarity: "mythic", sort_order: 4, available_from: iso(NOW + H), stock_sold: 0, created_at: iso(NOW - 40 * 86400000) },
    { id: U(105), sku: "bubble-plain", name: "Cam", category: "chat_bubble", effect_key: "glass", price_descoin: 600, active: true, rarity: "common", sort_order: 5, stock_sold: 0, created_at: iso(NOW - 40 * 86400000) },
  ],
  user_inventory: [],
  shop_purchases: [],
  shop_campaigns: [
    { id: U(201), name: "Kara Cuma", kind: "discount", discount_pct: 50, scope: { categories: ["chat_bubble"] }, starts_at: iso(NOW - H), ends_at: iso(NOW + H), enabled: true },
  ],
  shop_storefront_sections: [
    { id: U(301), title: "Haftanin one cikanlari", kind: "manual", item_ids: [U(105), U(101), U(103)], config: {}, sort_order: 10, enabled: true, created_at: iso(NOW - H) },
    { id: U(302), title: "Sinirli sure", kind: "limited", item_ids: [], config: {}, sort_order: 20, enabled: true, created_at: iso(NOW - H) },
  ],
  shop_updates: [],
  descoin_reconcile_actions: [],
  descoin_reconciliation_runs: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
const rows = (t) => fake._tables[t]?.rows || [];

const failures = [];
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    if (process.env.TEST_VERBOSE) console.log(`PASS | ${name}`);
  } catch (err) {
    failures.push(`${name}: ${String(err.stack || err.message).split("\n").slice(0, 8).join(" | ").slice(0, 900)}`);
    if (process.env.TEST_VERBOSE) console.log(`FAIL | ${name}`);
  }
}

async function run() {
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const emitted = [];
  const io = {
    emit: (ev, p) => emitted.push({ to: "all", ev, p }),
    to: (room) => ({ emit: (ev, p) => emitted.push({ to: room, ev, p }) }),
    sockets: { adapter: { rooms: new Map() } },
  };
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/shop", require("../routes/shop"));
  const admin = express.Router();
  admin.use((req, _res, next) => {
    req.user = { id: U(9), username: "admin" };
    next();
  });
  admin.use(require("../routes/adminShopDesk"));
  app.use("/admin", admin);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, { method = "GET", body, user = 1 } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: U(user), username: `u${user}`, sid: `s${user}` })}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  try {
    await check("catalog shows sale price, list price, hides expired + scheduled, keeps limited", async () => {
      const { status, body } = await call("/shop/catalog");
      assert.equal(status, 200);
      const ids = body.items.map((i) => i.id);
      assert.ok(!ids.includes(U(103)), "expired hidden");
      assert.ok(!ids.includes(U(104)), "scheduled hidden");
      const sale = body.items.find((i) => i.id === U(101));
      assert.equal(sale.price_descoin, 840);
      assert.equal(sale.list_price_descoin, 1200);
      assert.equal(sale.discount_pct, 30);
      const camp = body.items.find((i) => i.id === U(105));
      assert.equal(camp.price_descoin, 300, "campaign discount");
      const lim = body.items.find((i) => i.id === U(102));
      assert.equal(lim.stock_left, 1);
      assert.deepEqual(body.sections.map((s) => s.title), ["Haftanin one cikanlari", "Sinirli sure"]);
      assert.deepEqual(body.sections[0].itemIds, [U(105), U(101)], "admin order, expired dropped");
    });

    await check("purchase charges the sale price and writes it on the receipt and ledger", async () => {
      const { status, body } = await call("/shop/purchase", { method: "POST", body: { itemId: U(101), expectedPrice: 840 } });
      assert.equal(status, 200, JSON.stringify(body));
      assert.equal(body.balance, 5000 - 840);
      assert.equal(body.paid, 840);
      const receipt = rows("shop_purchases").find((r) => r.item_id === U(101));
      assert.equal(receipt.amount_descoin, 840);
      const led = rows("descoin_ledger").find((r) => r.user_id === U(1) && r.reason === "shop_purchase");
      assert.equal(led.amount, -840);
      assert.equal(led.meta.listPrice, 1200);
      assert.equal(led.meta.discountPct, 30);
    });

    await check("price_changed when the shown price is lower than the real one", async () => {
      const { status, body } = await call("/shop/purchase", { method: "POST", user: 2, body: { itemId: U(101), expectedPrice: 500 } });
      assert.equal(status, 409);
      assert.equal(body.code, "price_changed");
      assert.equal(body.price, 840);
    });

    await check("limited stock: last unit sells once, the next buyer gets sold_out", async () => {
      const a = await call("/shop/purchase", { method: "POST", user: 1, body: { itemId: U(102) } });
      assert.equal(a.status, 200, JSON.stringify(a.body));
      assert.equal(rows("shop_items").find((r) => r.id === U(102)).stock_sold, 1);
      assert.ok(emitted.some((e) => e.ev === "shop:catalog:changed"), "live stock update");
      const b = await call("/shop/purchase", { method: "POST", user: 2, body: { itemId: U(102) } });
      assert.equal(b.status, 409);
      assert.equal(b.body.code, "sold_out");
      assert.equal(rows("users").find((u) => u.id === U(2)).descoin_balance, 5000, "no charge");
    });

    await check("racing buyers never oversell (CAS fallback without the RPC)", async () => {
      rows("shop_items").find((r) => r.id === U(105)).stock_limit = 1;
      const merchStore = require("../lib/shopMerchStore");
      const results = await Promise.all([merchStore.reserveStock(U(105)), merchStore.reserveStock(U(105)), merchStore.reserveStock(U(105))]);
      assert.equal(results.filter((r) => r.ok).length, 1);
      await merchStore.releaseStock(U(105));
      assert.equal(rows("shop_items").find((r) => r.id === U(105)).stock_sold, 0);
      rows("shop_items").find((r) => r.id === U(105)).stock_limit = null;
    });

    await check("insufficient balance releases the reserved unit", async () => {
      const item = rows("shop_items").find((r) => r.id === U(105));
      item.stock_limit = 5;
      item.price_descoin = 999999;
      const r = await call("/shop/purchase", { method: "POST", user: 3, body: { itemId: U(105) } });
      assert.equal(r.status, 402);
      assert.equal(item.stock_sold, 0);
      item.stock_limit = null;
      item.price_descoin = 600;
    });

    await check("expired and scheduled items are refused at checkout", async () => {
      const a = await call("/shop/purchase", { method: "POST", user: 2, body: { itemId: U(103) } });
      assert.equal(a.status, 410);
      assert.equal(a.body.code, "not_available");
      const b = await call("/shop/purchase", { method: "POST", user: 2, body: { itemId: U(104) } });
      assert.equal(b.status, 410);
    });

    await check("admin desk lists items with sales, pricing, availability and KPIs", async () => {
      const { status, body } = await call("/admin/shop/desk");
      assert.equal(status, 200, JSON.stringify(body).slice(0, 300));
      const it = body.items.find((i) => i.id === U(101));
      assert.equal(it.sales.n7, 1);
      assert.equal(it.pricing.price, 840);
      assert.equal(body.items.find((i) => i.id === U(102)).availability.state, "soldout");
      assert.equal(body.kpis.sales7, 2);
      assert.equal(body.kpis.activeCampaigns, 1);
    });

    await check("bulk percent price change with rounding, audited, needs a reason", async () => {
      const noReason = await call("/admin/shop/desk/bulk", { method: "POST", body: { action: "price", itemIds: [U(102)], op: { type: "percent", value: -15, rounding: "50" } } });
      assert.equal(noReason.status, 400);
      const r = await call("/admin/shop/desk/bulk", { method: "POST", body: { action: "price", itemIds: [U(102), U(103)], op: { type: "percent", value: -15, rounding: "50" }, reason: "Kasim fiyat ayari", announce: true } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(rows("shop_items").find((x) => x.id === U(102)).price_descoin, 2950);
      assert.equal(rows("shop_items").find((x) => x.id === U(103)).price_descoin, 1550);
      assert.equal(rows("shop_updates").length, 1);
      assert.equal(rows("shop_updates")[0].body, "price_drop");
    });

    await check("drawer save writes stock, sale window and section membership", async () => {
      const r = await call(`/admin/shop/desk/items/${U(105)}`, { method: "PATCH", body: { name: "Cam 2", stockLimit: 50, salePct: 25, saleEndsAt: iso(NOW + 5 * H), sectionIds: [U(301)] } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const row = rows("shop_items").find((x) => x.id === U(105));
      assert.equal(row.name, "Cam 2");
      assert.equal(row.stock_limit, 50);
      assert.equal(row.sale_pct, 25);
      const low = await call(`/admin/shop/desk/items/${U(102)}`, { method: "PATCH", body: { stockLimit: 0 } });
      assert.equal(low.status, 400, "cannot go under sold");
    });

    await check("gift to many users skips owners; undo removes and unequips", async () => {
      const r = await call("/admin/shop/gifts", { method: "POST", body: { itemId: U(101), userIds: [U(1), U(3)], message: "Tesekkurler" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.granted.length, 1);
      assert.equal(r.body.skipped[0].reason, "owned");
      const inv = rows("user_inventory").find((x) => x.user_id === U(3) && x.item_id === U(101));
      rows("users").find((u) => u.id === U(3)).equipped_banner_id = U(101);
      const list = await call("/admin/shop/gifts");
      assert.equal(list.body.gifts[0].equipped, true);
      const undo = await call(`/admin/shop/gifts/${inv.id}`, { method: "DELETE" });
      assert.equal(undo.status, 200);
      assert.equal(undo.body.unequipped, true);
      assert.equal(rows("users").find((u) => u.id === U(3)).equipped_banner_id, null);
      assert.ok(!rows("user_inventory").some((x) => x.id === inv.id));
      assert.ok(emitted.some((e) => e.ev === "shop:inventory:changed" && e.to === `user:${U(3)}`));
    });

    await check("reconcile: a correcting ledger row closes the gap without touching the balance", async () => {
      const chk = await call(`/admin/descoin/users/${U(4)}/reconcile`);
      assert.equal(chk.body.drift, -500);
      assert.equal(chk.body.gap.kind, "after_last");
      const stale = await call("/admin/descoin/reconciliation/fix", { method: "POST", body: { userId: U(4), mode: "ledger_to_balance", expectedDrift: -1, reason: "test" } });
      assert.equal(stale.status, 409);
      const r = await call("/admin/descoin/reconciliation/fix", { method: "POST", body: { userId: U(4), mode: "ledger_to_balance", expectedDrift: -500, reason: "Destek talebi 4821" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.drift, 0);
      assert.equal(rows("users").find((u) => u.id === U(4)).descoin_balance, 8400);
      const adj = rows("descoin_ledger").find((x) => x.reason === "reconcile_adjust");
      assert.equal(adj.amount, -500);
      assert.equal(adj.balance_after, 8400);
      assert.equal(rows("descoin_reconcile_actions").length, 1);
    });

    await check("reconcile: balance set to the ledger sum, no ledger row", async () => {
      rows("users").find((u) => u.id === U(4)).descoin_balance = 9000; // drift +600 again
      const ledgerBefore = rows("descoin_ledger").length;
      const r = await call("/admin/descoin/reconciliation/fix", { method: "POST", body: { userId: U(4), mode: "balance_to_ledger", expectedDrift: 600, reason: "Fazla bakiye", notify: true } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(rows("users").find((u) => u.id === U(4)).descoin_balance, 8400);
      assert.equal(rows("descoin_ledger").length, ledgerBefore);
      assert.ok(emitted.some((e) => e.ev === "descoin:balance" && e.to === `user:${U(4)}` && e.p.balance === 8400));
      const again = await call("/admin/descoin/reconciliation/fix", { method: "POST", body: { userId: U(4), mode: "balance_to_ledger", reason: "again" } });
      assert.equal(again.status, 400, "nothing to fix");
    });

    await check("campaign create validates and goes live in the catalog", async () => {
      const bad = await call("/admin/shop/campaigns", { method: "POST", body: { name: "x", kind: "discount", startsAt: iso(NOW), endsAt: iso(NOW + H), scope: { all: true } } });
      assert.equal(bad.status, 400);
      const ok = await call("/admin/shop/campaigns", { method: "POST", body: { name: "Hafta sonu", kind: "discount", discountPct: 20, startsAt: iso(NOW - 1000), endsAt: iso(NOW + H), scope: { itemIds: [U(102)] } } });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.campaign.status, "active");
      const cat = await call("/shop/catalog");
      const lim = cat.body.items.find((i) => i.id === U(102));
      assert.equal(lim.price_descoin, 2360, "20% off 2950");
      assert.equal(lim.sold_out, true);
    });

    await check("sections: create, reorder, preview", async () => {
      const c = await call("/admin/shop/sections", { method: "POST", body: { title: "Yeni gelenler", kind: "new", config: { days: 14 } } });
      assert.equal(c.status, 200, JSON.stringify(c.body));
      const o = await call("/admin/shop/sections/order", { method: "POST", body: { ids: [c.body.section.id, U(301), U(302)] } });
      assert.equal(o.status, 200);
      const cat = await call("/shop/catalog");
      assert.equal(cat.body.sections[0].title, "Yeni gelenler");
      const pv = await call("/admin/shop/sections/preview");
      assert.ok(pv.body.preview[U(301)].itemIds.length >= 1);
    });
  } finally {
    srv.close();
  }

  if (failures.length) {
    console.error(`shopDesk: ${failures.length} failed, ${passed} passed`);
    for (const f of failures) console.error(`  FAIL ${f}`);
    process.exit(1);
  }
  console.log(`shopDesk.integration.test.cjs: ${passed} passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
