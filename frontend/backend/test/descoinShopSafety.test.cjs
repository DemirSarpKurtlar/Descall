"use strict";

/**
 * DesCoin / shop code-level safety (server audit 2026-10-19, Grok #10-#12). Balances,
 * prices and the ledger format are unchanged; only the races / missing checks are closed.
 *   #10 daily claim: compare-and-swap on descoin_last_daily_claim (another instance that
 *       claimed between our read and write used to let both credit)
 *   #11 purchase: a grant that throws refunds the debit (coins were kept, nothing given)
 *   #12 /shop/equip: the item must belong to the slot it is equipped into
 * Run: node frontend/backend/test/descoinShopSafety.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const fake = createFakeSupabase({
  users: [
    { id: "u-race", username: "race", active_sessions: [{ id: "s-u-race" }], descoin_balance: 0, descoin_streak: 1, descoin_last_daily_claim: yesterday },
    { id: "u-buy", username: "buy", active_sessions: [{ id: "s-u-buy" }], descoin_balance: 500 },
    { id: "u-eq", username: "eq", active_sessions: [{ id: "s-u-eq" }], descoin_balance: 0 },
  ],
  descoin_ledger: [],
  shop_items: [
    { id: "item-banner", sku: "banner-a", name: "Banner", category: "banner", price_descoin: 200, active: true },
    { id: "item-badge", sku: "badge-a", name: "Badge", category: "theme", price_descoin: 100, active: true },
  ],
  user_inventory: [{ user_id: "u-eq", item_id: "item-banner", acquired_via: "purchase" }],
  shop_purchases: [],
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
    failures.push(`${name}: ${String(err.message).split("\n")[0].slice(0, 200)}`);
    if (process.env.TEST_VERBOSE) console.log(`FAIL | ${name}`);
  }
}

async function run() {
  const descoin = require("../lib/descoin");
  const shop = require("../lib/shop");
  const { purchaseItem } = require("../lib/shopPurchase");

  await check("#10 a claim that another instance already made does not credit twice", async () => {
    const user = rows("users").find((u) => u.id === "u-race");
    // Another backend instance claims between our read and our write.
    const origFrom = fake.from.bind(fake);
    let fired = false;
    fake.from = (name) => {
      const q = origFrom(name);
      if (name === "users" && !fired) {
        const u = q.update.bind(q);
        q.update = (payload) => {
          if (payload && payload.descoin_last_daily_claim && !fired) {
            fired = true;
            user.descoin_last_daily_claim = new Date().toISOString().slice(0, 10);
            user.descoin_balance += 10; // what the other instance credited
          }
          return u(payload);
        };
      }
      return q;
    };
    try {
      const res = await descoin.claimDaily("u-race");
      assert.equal(res.claimed, false, JSON.stringify(res));
      assert.equal(rows("descoin_ledger").filter((l) => l.user_id === "u-race").length, 0, "no second ledger row");
      assert.equal(user.descoin_balance, 10, "only the other instance's credit");
    } finally {
      fake.from = origFrom;
    }
  });
  await check("#10 a normal claim still works once", async () => {
    const user = rows("users").find((u) => u.id === "u-race");
    user.descoin_last_daily_claim = yesterday;
    const a = await descoin.claimDaily("u-race");
    const b = await descoin.claimDaily("u-race");
    assert.equal(a.claimed, true, JSON.stringify(a));
    assert.equal(b.claimed, false);
  });

  await check("#11 a grant that throws refunds the purchase", async () => {
    const before = rows("users").find((u) => u.id === "u-buy").descoin_balance;
    const orig = shop.grantItem;
    shop.grantItem = async () => { throw new Error("inventory write failed"); };
    try {
      await assert.rejects(() => purchaseItem("u-buy", { id: "item-badge", sku: "badge-a", price_descoin: 100 }), /inventory write failed/);
    } finally {
      shop.grantItem = orig;
    }
    assert.equal(rows("users").find((u) => u.id === "u-buy").descoin_balance, before, "balance restored");
    const reasons = rows("descoin_ledger").filter((l) => l.user_id === "u-buy").map((l) => l.reason);
    assert.deepEqual(reasons, ["shop_purchase", "shop_refund"]);
  });

  await check("#12 /shop/equip refuses an item of another category", async () => {
    const express = require("express");
    const app = express();
    app.use(express.json());
    app.set("io", null);
    app.use("/shop", require("../routes/shop"));
    const srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, r));
    const { signToken } = require("../config/jwt");
    const post = async (body) => {
      const res = await fetch(`http://127.0.0.1:${srv.address().port}/shop/equip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: "u-eq", username: "eq", sid: "s-u-eq" })}` },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };
    try {
      const bad = await post({ category: "theme", itemId: "item-banner" });
      assert.equal(bad.status, 400, JSON.stringify(bad.body));
      assert.ok(!rows("users").find((u) => u.id === "u-eq").equipped_theme_id);
      const ok = await post({ category: "banner", itemId: "item-banner" });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(rows("users").find((u) => u.id === "u-eq").equipped_banner_id, "item-banner");
    } finally {
      srv.close();
    }
  });

  console.log(`descoinShopSafety: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error("  FAIL " + f);
    process.exit(1);
  }
  console.log("descoinShopSafety.test.cjs: ok");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
