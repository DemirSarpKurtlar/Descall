"use strict";

/**
 * Market 2.0 storefront ("Vitrin") and night market edge cases found in the bug hunt:
 *  - the real 630-item s2 catalog: 4 distinct cards in their price bands, epic floor, never owned
 *    / retired / mythic / countries, deterministic, refresh never repeats today's cards;
 *  - the Istanbul day boundary (21:00 UTC): a new storefront, yesterday's cards, resetsAt;
 *  - a lock on a card the user bought is not reported and is dropped by the refresh;
 *  - lastSeenDays per card and refreshes left (daily + granted);
 *  - the face-down night deck does not reshuffle when the user buys elsewhere that night.
 * Run: node frontend/backend/test/shop2Vitrin.integration.test.cjs
 */

const assert = require("node:assert/strict");
const crypto = require("crypto");
const { boot, harness, U, I, DAY } = require("./shop2Fixture.cjs");

const { check, finish } = harness("shop2Vitrin.integration.test.cjs");

function realCatalogPool() {
  const { catalogRows } = require("../lib/shop2/catalogSeed");
  return catalogRows().map((r) => ({
    id: crypto.createHash("md5").update(r.sku).digest("hex"),
    sku: r.sku,
    category: r.category,
    rarity: r.rarity,
    price: r.price_descoin,
    setKey: r.set_key || null,
    createdAt: "2026-10-01T00:00:00Z",
    active: true,
    retired: false,
  }));
}

async function run() {
  // ---------------------------------------------------------------- pure, real catalog
  await check("real catalog (630): 4 distinct cards in bands, epic floor, never owned / mythic, no repeat after refresh", () => {
    const { generateStorefront } = require("../lib/shop2/storefront");
    const { EPIC_PLUS, DEFAULT_RULES } = require("../lib/shop2/rules");
    const time = require("../lib/shop2/time");
    const pool = realCatalogPool();
    assert.ok(pool.length >= 600, `catalog has ${pool.length} items`);
    const byId = new Map(pool.map((it) => [it.id, it]));
    const retired = new Set(pool.filter((_, k) => k % 50 === 0).map((it) => it.id));
    const poolR = pool.map((it) => (retired.has(it.id) ? { ...it, retired: true } : it));
    const t0 = Date.now();
    let n = 0;
    for (let u = 0; u < 40; u += 1) {
      const owned = new Set(pool.filter((_, k) => (k + u) % 7 === 0).map((it) => it.id));
      const lastShown = new Map();
      for (let d = 0; d < 8; d += 1) {
        const day = time.addDays("2026-11-01", d);
        const args = { userId: `u${u}`, day, ruleVersion: 0, pool: poolR, owned, lastShown: new Map(lastShown) };
        const a = generateStorefront(args);
        const b = generateStorefront(args);
        assert.deepEqual(a.slots.map((s) => s.itemId), b.slots.map((s) => s.itemId), "deterministic");
        assert.equal(a.slots.length, 4);
        const items = a.slots.map((s) => byId.get(s.itemId));
        assert.equal(new Set(a.slots.map((s) => s.itemId)).size, 4, "distinct");
        for (const it of items) {
          assert.ok(!owned.has(it.id), "never owned");
          assert.ok(!retired.has(it.id), "never retired");
          assert.notEqual(it.rarity, "mythic", "mythic weight is 0");
        }
        items.forEach((it, k) => {
          const band = DEFAULT_RULES.bands[k];
          const floored = a.slots[k].reasons.some((r) => r.code === "epic_floor");
          if (!floored) assert.ok(it.price >= band.min && it.price <= band.max, `slot ${k + 1} price ${it.price} in ${band.min}-${band.max}`);
        });
        assert.ok(items.some((it) => EPIC_PLUS.has(it.rarity)), "epic floor");
        for (const it of items) for (const [id, seen] of lastShown) if (id === it.id) assert.ok(time.daysBetween(seen, day) >= 7, "no repeat inside 7 days");
        const lock = { itemId: a.slots[2].itemId, slot: 3 };
        const r = generateStorefront({ ...args, refreshCount: 1, shownToday: a.slots.map((s) => s.itemId), lock });
        assert.equal(r.slots[2].itemId, lock.itemId, "lock keeps its slot");
        assert.ok(r.slots.filter((s) => s.slot !== 3).every((s) => !a.slots.some((x) => x.itemId === s.itemId)), "refresh never repeats today's cards");
        for (const s of a.slots) lastShown.set(s.itemId, day);
        n += 2;
      }
    }
    assert.ok(Date.now() - t0 < 15000, `${n} storefronts took ${Date.now() - t0} ms`);
  });

  // ---------------------------------------------------------------- service, fake database
  const h = await boot();
  const { call, rows } = h;
  const views = require("../lib/shop2/views");
  const sfs = require("../lib/shop2/storefrontService");
  const time = require("../lib/shop2/time");
  const db = require("../lib/shop2/db");

  try {
    await check("Istanbul day boundary: 20:59:59 UTC is still today, 21:00 UTC is a new storefront with yesterday's cards", async () => {
      const day = time.dayKey();
      const before = time.dayStartMs(time.addDays(day, 1)) - 1000; // 23:59:59 Istanbul today
      const after = before + 1000; // 00:00:00 Istanbul tomorrow
      const a = await views.storefront(U(5), { now: before });
      assert.equal(a.day, day);
      assert.equal(a.resetsAt, new Date(after).toISOString());
      assert.equal(new Date(a.resetsAt).getUTCHours(), 21);
      const b = await views.storefront(U(5), { now: after });
      assert.equal(b.day, time.addDays(day, 1));
      assert.deepEqual(b.yesterday.map((y) => y.item.id).sort(), a.slots.map((s) => s.item.id).sort(), "yesterday = the cards of the day before");
      assert.ok(b.slots.every((s) => !a.slots.some((x) => x.item.id === s.item.id)), "no card of yesterday comes back the next day");
      assert.equal(b.resetsAt, new Date(after + DAY).toISOString());
    });

    await check("a lock on a card the user bought is not reported and the refresh drops it", async () => {
      const sf = (await call("/shop2/storefront")).body;
      const target = sf.slots.find((s) => !s.owned);
      assert.equal((await call("/shop2/storefront/lock", { method: "POST", body: { itemId: target.item.id } })).status, 200);
      const locked = (await call("/shop2/storefront")).body;
      assert.equal(locked.lock.itemId, target.item.id);
      assert.ok(locked.slots.find((s) => s.item.id === target.item.id).locked);
      const buy = await call(`/shop2/items/${target.item.id}/buy`, { method: "POST", body: { expectedPrice: target.price } });
      assert.equal(buy.status, 200, JSON.stringify(buy.body));
      const afterBuy = (await call("/shop2/storefront")).body;
      assert.equal(afterBuy.lock, null, "owned card is not a lock any more");
      assert.ok(afterBuy.slots.every((s) => !s.locked));
      const ref = await call("/shop2/storefront/refresh", { method: "POST", body: {} });
      assert.equal(ref.status, 200, JSON.stringify(ref.body));
      const row = rows("shop2_storefronts").find((r) => r.user_id === U(1) && r.day === time.dayKey());
      assert.equal(row.lock_item_id, null, "refresh dropped the stale lock");
      assert.ok(ref.body.storefront.slots.every((s) => s.item.id !== target.item.id || s.owned));
    });

    await check("refresh left counts the daily refresh and granted ones; lastSeenDays comes from earlier storefronts", async () => {
      const sf = (await call("/shop2/storefront", { user: 2 })).body;
      assert.equal(sf.refresh.left, 1);
      await sfs.grantFreeRefresh(U(2), 2);
      const g = (await call("/shop2/storefront", { user: 2 })).body;
      assert.equal(g.refresh.left, 3);
      assert.equal(g.refresh.freeGrants, 2);
      assert.ok(g.slots.every((s) => s.lastSeenDays === null), "first storefront: never seen before");
      // Day 1 + 8: an item shown 8 days ago is "unseen 8 days" when it comes back.
      const day = time.dayKey();
      const old = time.addDays(day, -8);
      const pool = (await require("../lib/shop2/catalog").getCatalog()).items.filter((it) => it.active && !it.retired);
      await db.one(db.from("shop2_storefronts").insert({ user_id: U(3), day: old, rule_version: 0, refresh_count: 0, regen: 0, seed: "x", slots: pool.map((it, k) => ({ slot: k + 1, itemId: it.id })), shown: pool.map((it) => it.id), excluded: {}, meta: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select("*").single());
      const s3 = (await call("/shop2/storefront", { user: 3 })).body;
      assert.ok(s3.slots.length > 0);
      assert.ok(s3.slots.every((s) => s.lastSeenDays === 8), JSON.stringify(s3.slots.map((s) => s.lastSeenDays)));
    });

    await check("night deck: buying elsewhere during the night never reshuffles the face-down cards", async () => {
      const open = await call("/admin/shop2/night-markets/open-now", { method: "POST", body: { reason: "Deck stability test", durationHours: 2 } });
      assert.equal(open.status, 200, JSON.stringify(open.body));
      const v0 = (await call("/shop2/night-market", { user: 5 })).body;
      assert.equal(v0.open, true);
      const f0 = await call("/shop2/night-market/flip", { method: "POST", body: { cardIndex: 0 }, user: 5 });
      assert.equal(f0.status, 200, JSON.stringify(f0.body));
      const night = require("../lib/shop2/night");
      const { open: on } = await night.current();
      const d0 = await night.deck(U(5), on);
      const faceDown = (v) => v.cards.filter((c) => !c.flipped).map((c) => `${c.index}:${c.hint}`).join(",");
      const before = faceDown((await call("/shop2/night-market", { user: 5 })).body);
      // Buy every face-down card's item elsewhere (as a plain item) and a few more singles. Singles
      // off the storefront sell only with direct_sale (the admin list), so those rows get it.
      for (const id of [...d0.cards.map((c) => c.itemId), ...Array.from({ length: 14 }, (_, k) => I(17 + k))]) {
        const row = rows("shop_items").find((r) => r.id === id);
        if (row) row.direct_sale = true;
      }
      for (const c of d0.cards.filter((x) => x.index !== 0)) await call(`/shop2/items/${c.itemId}/buy`, { method: "POST", body: {}, user: 5 });
      for (let n = 17; n <= 30; n += 1) await call(`/shop2/items/${I(n)}/buy`, { method: "POST", body: {}, user: 5 });
      const v1 = (await call("/shop2/night-market", { user: 5 })).body;
      assert.equal(faceDown(v1), before, "hints and positions unchanged");
      const d1 = await night.deck(U(5), on);
      assert.deepEqual(d1.cards.map((c) => c.itemId), d0.cards.map((c) => c.itemId), "same items behind the cards");
      const f1 = await call("/shop2/night-market/flip", { method: "POST", body: { cardIndex: 1 }, user: 5 });
      assert.equal(f1.status, 200);
      const c1 = f1.body.nightMarket.cards.find((c) => c.index === 1);
      assert.equal(c1.item.id, d0.cards[1].itemId);
      assert.equal(c1.owned, true, "a card bought elsewhere tonight shows as owned");
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
