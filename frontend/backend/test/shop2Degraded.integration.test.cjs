"use strict";

/**
 * Market 2.0 before supabase/migrations/20261115_shop2.sql is applied: every shop2_* table and
 * the new shop_items columns answer like an unapplied migration. The shop must still work:
 * storefront, set quote, purchase (real wallet + inventory), refund, gifts, night market,
 * admin dashboard and rule simulation (shop2 state lives in process memory).
 * Run: node frontend/backend/test/shop2Degraded.integration.test.cjs
 */

const assert = require("node:assert/strict");
const { boot, harness, U, I, skipOpenScheduledNight } = require("./shop2Fixture.cjs");
const { TABLES } = require("../lib/shop2/db");

const { check, finish } = harness("shop2Degraded.integration.test.cjs");

async function run() {
  const h = await boot({ missingTables: TABLES });
  const { call, rows, fake } = h;
  // shop_items without the new columns: the fake ignores column lists, so strip them.
  for (const r of fake._tables.shop_items.rows) {
    delete r.retired_at;
  }
  const balance = (u) => rows("users").find((r) => r.id === U(u)).descoin_balance;

  try {
    await check("storefront works from memory, no shop2 rows written to the database", async () => {
      const r = await call("/shop2/storefront");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.slots.length, 4);
      const again = await call("/shop2/storefront");
      assert.deepEqual(again.body.slots.map((s) => s.item.id), r.body.slots.map((s) => s.item.id));
      assert.equal(rows("shop2_storefronts").length, 0);
      const mem = require("../lib/shop2/db").mem._store.get("shop2_storefronts") || [];
      assert.equal(mem.length, 1);
    });

    await check("purchase, refund and set purchase use the real wallet and inventory", async () => {
      const before = balance(1);
      rows("shop_items").find((x) => x.id === I(30)).direct_sale = true; // a single off the storefront sells only with direct_sale
      const b = await call(`/shop2/items/${I(30)}/buy`, { method: "POST", body: {} });
      assert.equal(b.status, 200, JSON.stringify(b.body));
      assert.ok(rows("user_inventory").some((x) => x.user_id === U(1) && x.item_id === I(30)));
      const r = await call(`/shop2/purchases/${b.body.purchaseId}/refund`, { method: "POST", body: {} });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(balance(1), before);
      const s = await call("/shop2/sets/gece-limani/buy", { method: "POST", body: { all: true, holdToken: "hold-degraded-001" } });
      assert.equal(s.status, 200, JSON.stringify(s.body));
      assert.equal(s.body.paid, 3750);
      assert.equal(balance(1), before - 3750);
    });

    await check("gifts and night market work in memory", async () => {
      const g = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(2), itemId: I(31) } });
      assert.equal(g.status, 200, JSON.stringify(g.body));
      const o = await call(`/shop2/gifts/${g.body.giftId}/open`, { method: "POST", body: {}, user: 2 });
      assert.equal(o.status, 200, JSON.stringify(o.body));
      await skipOpenScheduledNight(call);
      const n = await call("/admin/shop2/night-markets/open-now", { method: "POST", body: { reason: "degraded test" } });
      assert.equal(n.status, 200, JSON.stringify(n.body));
      const f = await call("/shop2/night-market/flip", { method: "POST", body: { cardIndex: 1 } });
      assert.equal(f.status, 200, JSON.stringify(f.body));
    });

    await check("admin dashboard reports migrated = false; simulate runs", async () => {
      const d = await call("/admin/shop2/dashboard");
      assert.equal(d.status, 200, JSON.stringify(d.body));
      assert.equal(d.body.migrated, false);
      assert.equal(d.body.tiles.salesToday, 1);
      assert.equal(d.body.tiles.refundsToday, 1);
      const s = await call("/admin/shop2/rules/simulate", { method: "POST", body: { sample: 100 } });
      assert.equal(s.status, 200, JSON.stringify(s.body));
    });
  } finally {
    h.close();
  }
  finish();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
