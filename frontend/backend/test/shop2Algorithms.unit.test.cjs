"use strict";

/**
 * Market 2.0 pure algorithms: storefront (determinism, never owned / retired, rarity floor,
 * bands, no repeats, lock), set pricing math, night market deck, gift limits + ring
 * detection, clash detection, rule normalization, Istanbul clock, simulation.
 * Run: node frontend/backend/test/shop2Algorithms.unit.test.cjs
 */

const assert = require("node:assert/strict");
const time = require("../lib/shop2/time");
const { generateStorefront, storefrontSeed } = require("../lib/shop2/storefront");
const pricing = require("../lib/shop2/pricing");
const { deckFor, defaultWindows, nightState, drawDiscount, discountDistribution } = require("../lib/shop2/nightMarket");
const { checkGift, detectRing, impactOf } = require("../lib/shop2/giftRules");
const { detectClashes, setLifecycle } = require("../lib/shop2/timeline");
const { normalizeRules, normalizeLimits, diff, EPIC_PLUS } = require("../lib/shop2/rules");
const { simulate, paletteScore, colorsIn } = require("../lib/shop2/simulate");
const { createMemDb } = require("../lib/shop2/memdb");

const failures = [];
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}: ${String(err.stack || err.message).split("\n").slice(0, 6).join(" | ")}`);
  }
}

const CATS = ["banner", "avatar_frame", "chat_bubble", "name_effect", "profile_aura", "theme", "avatar_effect", "profile_color"];
const RAR = ["common", "rare", "epic", "legendary"];
const PRICE = { common: 200, rare: 420, epic: 700, legendary: 1200 };
function pool(n = 120) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = RAR[i % 4];
    out.push({ id: `item-${String(i).padStart(3, "0")}`, category: CATS[i % CATS.length], rarity: r, price: PRICE[r] + (i % 5) * 20, active: true, retired: false, setKey: i % 17 === 0 ? "gece-limani" : null, createdAt: "2026-09-01T00:00:00Z" });
  }
  return out;
}
const DAY = "2026-11-16";
const base = { userId: "u1", day: DAY, ruleVersion: 3, pool: pool() };

async function run() {
  await check("time: Istanbul day boundary is 21:00 UTC", () => {
    assert.equal(time.dayKey(Date.parse("2026-11-15T20:59:59Z")), "2026-11-15");
    assert.equal(time.dayKey(Date.parse("2026-11-15T21:00:00Z")), "2026-11-16");
    assert.equal(time.iso(time.nextMidnightMs(Date.parse("2026-11-15T12:00:00Z"))), "2026-11-15T21:00:00.000Z");
    assert.equal(time.addDays("2026-11-30", 1), "2026-12-01");
    assert.equal(time.daysBetween("2026-11-10", "2026-11-16"), 6);
  });

  await check("storefront: deterministic per (user, day, rule version, refresh)", () => {
    const a = generateStorefront(base);
    const b = generateStorefront({ ...base, pool: [...base.pool].reverse() });
    assert.equal(a.seed, b.seed);
    assert.deepEqual(a.slots.map((s) => s.itemId), b.slots.map((s) => s.itemId), "pool order does not matter");
    assert.equal(a.slots.length, 4);
    const c = generateStorefront({ ...base, refreshCount: 1 });
    const d = generateStorefront({ ...base, userId: "u2" });
    const e = generateStorefront({ ...base, ruleVersion: 4 });
    assert.notEqual(c.seed, a.seed);
    assert.notEqual(d.seed, a.seed);
    assert.notEqual(e.seed, a.seed);
    assert.equal(storefrontSeed(base), a.seed);
  });

  await check("storefront: never owned, retired or inactive", () => {
    const p = pool(40);
    p[0].retired = true;
    p[1].active = false;
    const owned = p.slice(2, 30).map((x) => x.id);
    for (let k = 0; k < 50; k += 1) {
      const sf = generateStorefront({ ...base, userId: `u${k}`, pool: p, owned });
      for (const s of sf.slots) {
        assert.ok(!owned.includes(s.itemId), "owned shown");
        assert.notEqual(s.itemId, p[0].id);
        assert.notEqual(s.itemId, p[1].id);
      }
      assert.equal(sf.excluded.owned, owned.length);
      assert.equal(sf.excluded.retired, 2);
    }
  });

  await check("storefront: at least one epic+ card (rarity floor) and floor can be turned off", () => {
    // Wide bands: rarity is not implied by the slot's price band, so only the floor guarantees it.
    const wide = [0, 1, 2, 3].map(() => ({ min: 0, max: 5000 }));
    const rules = { weights: { rarity: { common: 1, rare: 1, epic: 0.0001, legendary: 0.0001 } }, bands: wide };
    let forced = 0;
    for (let k = 0; k < 200; k += 1) {
      const sf = generateStorefront({ ...base, userId: `u${k}`, rules });
      const byId = new Map(base.pool.map((x) => [x.id, x]));
      assert.ok(sf.slots.some((s) => EPIC_PLUS.has(byId.get(s.itemId).rarity)), "no epic+");
      if (sf.epicFloorApplied) forced += 1;
    }
    assert.ok(forced > 150, `floor applied ${forced}`);
    let none = 0;
    for (let k = 0; k < 50; k += 1) {
      const sf = generateStorefront({ ...base, userId: `u${k}`, rules: { ...rules, toggles: { epicFloor: false } } });
      const byId = new Map(base.pool.map((x) => [x.id, x]));
      if (!sf.slots.some((s) => EPIC_PLUS.has(byId.get(s.itemId).rarity))) none += 1;
    }
    assert.ok(none > 0);
  });

  await check("storefront: slot price bands, distinct items, reasons", () => {
    const sf = generateStorefront(base);
    const byId = new Map(base.pool.map((x) => [x.id, x]));
    const ids = sf.slots.map((s) => s.itemId);
    assert.equal(new Set(ids).size, 4);
    const bands = normalizeRules({}).bands;
    for (const s of sf.slots) {
      const band = s.reasons.find((r) => r.code === "band");
      if (band) {
        const price = byId.get(s.itemId).price;
        assert.ok(price >= bands[s.slot - 1].min && price <= bands[s.slot - 1].max);
      }
      assert.ok(s.reasons.some((r) => r.code === "rarity"));
      assert.equal(typeof s.why, "string");
    }
  });

  await check("storefront: no repeats within N days, relaxed when the pool is too small", () => {
    const first = generateStorefront(base);
    const lastShown = new Map(first.slots.map((s) => [s.itemId, time.addDays(DAY, -2)]));
    const next = generateStorefront({ ...base, refreshCount: 5, lastShown });
    for (const s of next.slots) assert.ok(!lastShown.has(s.itemId));
    assert.equal(next.excluded.repeat, 4);
    const old = new Map(first.slots.map((s) => [s.itemId, time.addDays(DAY, -9)]));
    const later = generateStorefront({ ...base, refreshCount: 5, lastShown: old });
    assert.equal(later.excluded.repeat, 0, "older than 7 days may repeat");
    const tiny = pool(5);
    const shown = tiny.slice(0, 3).map((x) => x.id);
    const sf = generateStorefront({ ...base, pool: tiny, shownToday: shown, rules: { toggles: { epicFloor: false } } });
    assert.ok(sf.relaxed.includes("repeat"));
    assert.equal(sf.slots.length, 4);
  });

  await check("storefront: locked card survives a refresh in its slot", () => {
    const first = generateStorefront(base);
    const keep = first.slots[2];
    const after = generateStorefront({ ...base, refreshCount: 1, lock: { itemId: keep.itemId, slot: keep.slot }, shownToday: first.slots.map((s) => s.itemId).filter((id) => id !== keep.itemId) });
    assert.equal(after.slots[2].itemId, keep.itemId);
    assert.ok(after.slots[2].locked);
    for (const s of after.slots) if (!s.locked) assert.ok(!first.slots.some((f) => f.itemId === s.itemId), "refresh repeats a card");
    const owned = generateStorefront({ ...base, refreshCount: 1, owned: [keep.itemId], lock: { itemId: keep.itemId, slot: 3 } });
    assert.ok(!owned.slots.some((s) => s.itemId === keep.itemId), "a lock never shows an owned item");
  });

  await check("storefront: new accounts get a price cap, wishlist boost works", () => {
    const byId = new Map(base.pool.map((x) => [x.id, x]));
    for (let k = 0; k < 30; k += 1) {
      const sf = generateStorefront({ ...base, userId: `n${k}`, newAccount: true, rules: { toggles: { epicFloor: false } } });
      for (const s of sf.slots) assert.ok(byId.get(s.itemId).price <= 600);
    }
    const target = base.pool.find((x) => x.rarity === "rare" && x.price <= 450);
    let hits = 0;
    let plain = 0;
    for (let k = 0; k < 300; k += 1) {
      if (generateStorefront({ ...base, userId: `w${k}`, wishlist: [target.id] }).slots.some((s) => s.itemId === target.id)) hits += 1;
      if (generateStorefront({ ...base, userId: `w${k}` }).slots.some((s) => s.itemId === target.id)) plain += 1;
    }
    assert.ok(hits > plain, `wishlist ${hits} vs ${plain}`);
  });

  await check("pricing: set price 20-30 % below the sum, rounded to 10", () => {
    assert.equal(pricing.round10(3754), 3750);
    assert.equal(pricing.clampDiscount(50), 30);
    assert.equal(pricing.clampDiscount(5), 20);
    const pieces = [700, 800, 450, 400, 900, 650, 600, 500].map((p, i) => ({ id: `p${i}`, price: p }));
    const q = pricing.setQuote({ pieces, discountPct: 25 });
    assert.equal(q.sum, 5000);
    assert.equal(q.setPrice, 3750);
    assert.equal(q.yourPrice, 3750);
    assert.equal(q.ownedDeducted, 0);
    assert.ok(q.setPrice < q.sum * 0.8 && q.setPrice > q.sum * 0.7);
  });

  await check("pricing: owned pieces are deducted at the set rate", () => {
    const pieces = [700, 800, 450, 400, 900, 650, 600, 500].map((p, i) => ({ id: `p${i}`, price: p }));
    const q = pricing.setQuote({ pieces, ownedIds: ["p0", "p4"], discountPct: 25 });
    assert.equal(q.remainingSum, 3400);
    assert.equal(q.yourPrice, 2550);
    assert.equal(q.ownedDeducted, 1200);
    assert.deepEqual(q.missingIds, ["p1", "p2", "p3", "p5", "p6", "p7"]);
    const all = pricing.setQuote({ pieces, ownedIds: pieces.map((p) => p.id), discountPct: 25 });
    assert.equal(all.complete, true);
    assert.equal(all.yourPrice, 0);
  });

  await check("pricing: single piece opens a 7-day window, then the rest costs the set rate", () => {
    const pieces = [700, 800, 450, 400, 900, 650, 600, 500].map((p, i) => ({ id: `p${i}`, price: p }));
    const now = Date.parse("2026-11-16T10:00:00Z");
    const q = pricing.setQuote({ pieces, discountPct: 25, now });
    const one = pricing.piecesQuote(q, pieces, ["p1"]);
    assert.equal(one.mode, "pieces");
    assert.equal(one.price, 800);
    assert.equal(one.opensLock, true);
    const lock = { discountPct: 25, until: new Date(now + 7 * time.DAY_MS).toISOString() };
    const q2 = pricing.setQuote({ pieces, ownedIds: ["p1"], discountPct: 22, lock, onSale: false, now: now + 3 * time.DAY_MS });
    assert.equal(q2.discountPct, 25, "better of locked and live");
    assert.ok(q2.setRateOpen, "window keeps the set rate after the set ends");
    const two = pricing.piecesQuote(q2, pieces, ["p0", "p2"]);
    assert.equal(two.mode, "partial");
    assert.equal(two.price, pricing.round10((700 + 450) * 0.75));
    assert.equal(pricing.piecesQuote(q2, pieces, q2.missingIds).mode, "set");
    const expired = pricing.setQuote({ pieces, ownedIds: ["p1"], discountPct: 25, lock, onSale: false, now: now + 8 * time.DAY_MS });
    assert.equal(expired.setRateOpen, false);
    assert.equal(expired.yourPrice, null);
  });

  await check("pricing: A/B arm is stable and splits about evenly", () => {
    const t = { id: "t1", split: 50 };
    assert.equal(pricing.abArm("u1", t), pricing.abArm("u1", t));
    let b = 0;
    for (let i = 0; i < 2000; i += 1) if (pricing.abArm(`user-${i}`, t) === "B") b += 1;
    assert.ok(b > 900 && b < 1100, `B ${b}`);
  });

  await check("pricing: 30-day history with lowest price", () => {
    const now = Date.parse("2026-11-16T10:00:00Z");
    const h = pricing.priceHistory([{ at: "2026-10-01T00:00:00Z", price: 4000 }, { at: "2026-11-05T00:00:00Z", price: 3600 }, { at: "2026-11-10T00:00:00Z", price: 3800 }], { now, current: 3750 });
    assert.equal(h.days.length, 30);
    assert.equal(h.days[0].price, 4000);
    assert.equal(h.days[h.days.length - 1].price, 3750);
    assert.equal(h.lowest30d, 3600);
    assert.equal(h.isLowest, false);
    const ladder = pricing.priceLadder({ pieces: [{ price: 700 }, { price: 800 }], setPrice: 3750 });
    assert.equal(ladder.farAboveSingles, true);
  });

  await check("night market: deterministic deck, owned excluded, discounts skewed low", () => {
    const night = { id: "auto-2026-11-20", cards: 6, discountMin: 15, discountMax: 60, skew: 2.2 };
    const a = deckFor({ userId: "u1", night, pool: base.pool, owned: [base.pool[0].id] });
    const b = deckFor({ userId: "u1", night, pool: [...base.pool].reverse(), owned: [base.pool[0].id] });
    assert.deepEqual(a.cards, b.cards);
    assert.equal(a.cards.length, 6);
    assert.ok(!a.cards.some((c) => c.itemId === base.pool[0].id));
    for (const c of a.cards) {
      assert.ok(c.discountPct >= 15 && c.discountPct <= 60);
      assert.ok(c.price < c.listPrice);
    }
    const other = deckFor({ userId: "u2", night, pool: base.pool });
    assert.notDeepEqual(other.cards.map((c) => c.itemId), a.cards.map((c) => c.itemId));
    const dist = discountDistribution({ discountMin: 15, discountMax: 60 });
    const mean = dist.reduce((s, x) => s + x.pct * x.share, 0) / 100;
    assert.ok(mean < 37.5, `mean ${mean}`);
    assert.equal(drawDiscount(0, 15, 60), 15);
    assert.equal(drawDiscount(0.9999, 15, 60), 60);
  });

  await check("night market: default windows Fri + Sat 22:00 Istanbul for 4 hours", () => {
    const from = Date.parse("2026-11-16T00:00:00Z");
    const w = defaultWindows(from, from + 7 * time.DAY_MS, {});
    assert.deepEqual(w.map((x) => x.id), ["auto-2026-11-20", "auto-2026-11-21"]);
    assert.equal(w[0].startsAt, "2026-11-20T19:00:00.000Z");
    assert.equal(w[0].endsAt, "2026-11-20T23:00:00.000Z");
    const st = nightState(w, Date.parse("2026-11-20T20:00:00Z"));
    assert.equal(st.open.id, "auto-2026-11-20");
    assert.equal(st.next.id, "auto-2026-11-21");
    assert.equal(nightState([{ ...w[0], status: "skipped" }], Date.parse("2026-11-20T20:00:00Z")).open, null);
  });

  await check("gifts: caps, new accounts, schedule window", () => {
    const now = Date.parse("2026-11-16T10:00:00Z");
    const ok = { now, senderId: "a", recipientId: "b", senderCreatedAt: "2026-01-01T00:00:00Z", kind: "item" };
    assert.deepEqual(checkGift(ok), { ok: true });
    assert.equal(checkGift({ ...ok, recipientId: "a" }).code, "gift_self");
    assert.equal(checkGift({ ...ok, sentToday: 3 }).code, "gift_daily_cap");
    assert.equal(checkGift({ ...ok, sentToRecipientToday: 1 }).code, "gift_recipient_cap");
    assert.equal(checkGift({ ...ok, recipientReceivedToday: 5 }).code, "gift_receive_cap");
    assert.equal(checkGift({ ...ok, senderCreatedAt: new Date(now - 2 * time.DAY_MS).toISOString() }).code, "gift_new_account");
    assert.equal(checkGift({ ...ok, limits: { minAccountDaysSend: 1 }, kind: "set", senderCreatedAt: new Date(now - 2 * time.DAY_MS).toISOString() }).code, "gift_new_account_set");
    assert.equal(checkGift({ ...ok, sendAt: new Date(now + 40 * time.DAY_MS).toISOString() }).code, "gift_too_far");
    assert.equal(checkGift({ ...ok, message: "x".repeat(141) }).code, "gift_message_long");
    assert.equal(checkGift({ ...ok, limits: { frozen: true } }).code, "gifts_paused");
  });

  await check("gifts: ring detection (cycle and ping-pong)", () => {
    const now = Date.parse("2026-11-16T10:00:00Z");
    const at = new Date(now - time.DAY_MS).toISOString();
    const ring = detectRing([{ from: "b", to: "c", at, amount: 500 }, { from: "c", to: "a", at, amount: 500 }], { from: "a", to: "b", amount: 500 }, { now });
    assert.equal(ring.ring, true);
    assert.deepEqual(ring.cycle, ["a", "b", "c", "a"]);
    const none = detectRing([{ from: "b", to: "c", at }], { from: "a", to: "b" }, { now });
    assert.equal(none.ring, false);
    const old = detectRing([{ from: "b", to: "a", at: new Date(now - 30 * time.DAY_MS).toISOString() }], { from: "a", to: "b" }, { now });
    assert.equal(old.ring, false, "outside the window");
    const pp = detectRing([{ from: "a", to: "b", at }, { from: "b", to: "a", at }, { from: "b", to: "a", at }], { from: "a", to: "b" }, { now, maxDepth: 0 });
    assert.equal(pp.pingPong, true);
    const imp = impactOf([{ from: "a", to: "b", at, amount: 100 }, { from: "a", to: "c", at, amount: 100 }, { from: "a", to: "d", at, amount: 100 }], { perDay: 2 });
    assert.equal(imp.blocked, 1);
    assert.equal(imp.blockedAmount, 100);
  });

  await check("timeline: clash detection and set lifecycle", () => {
    const c = detectClashes({
      from: "2026-11-16",
      days: 14,
      sets: [
        { key: "a", status: "live", startsAt: "2026-11-18T09:00:00Z", endsAt: "2026-11-25T09:00:00Z", topRarityCount: 2 },
        { key: "b", status: "scheduled", startsAt: "2026-11-18T12:00:00Z", endsAt: "2026-11-25T09:00:00Z", topRarityCount: 1 },
      ],
      nights: [{ id: "n1", status: "scheduled", startsAt: "2026-11-20T19:00:00Z", endsAt: "2026-11-20T23:00:00Z" }],
      rules: [{ version: 5, status: "scheduled", applyAt: "2026-11-20T21:00:00Z", weights: { rarity: { legendary: 0.5 } } }],
    });
    const codes = c.map((x) => x.code);
    assert.ok(codes.includes("two_sets_same_day"));
    assert.ok(codes.includes("legendary_density"));
    assert.ok(codes.includes("rule_switch_during_night"));
    const now = Date.parse("2026-11-16T10:00:00Z");
    assert.equal(setLifecycle({ status: "live", startsAt: "2026-11-17T00:00:00Z" }, now), "scheduled");
    assert.equal(setLifecycle({ status: "live", endsAt: "2026-11-16T20:00:00Z" }, now), "last24h");
    assert.equal(setLifecycle({ status: "live", stockLimit: 5, stockSold: 5 }, now), "soldout");
    assert.equal(setLifecycle({ status: "recalled" }, now), "recalled");
  });

  await check("rules: normalization clamps and diff lists leaves", () => {
    const r = normalizeRules({ weights: { rarity: { epic: 99 } }, bands: [{ min: 900, max: 100 }, {}, {}, {}], toggles: { noRepeatDays: -4 } });
    assert.equal(r.weights.rarity.epic, 10);
    assert.deepEqual(r.bands[0], { slot: 1, min: 100, max: 900 });
    assert.equal(r.toggles.noRepeatDays, 0);
    const d = diff(normalizeRules({}), normalizeRules({ weights: { rarity: { epic: 0.6 } } }));
    assert.deepEqual(d, [{ path: "weights.rarity.epic", from: 0.45, to: 0.6 }]);
    const l = normalizeLimits({ refresh: { price: -5 }, nightMarket: { discountMin: 70, discountMax: 20 } });
    assert.equal(l.refresh.price, 0);
    assert.equal(l.nightMarket.discountMin, 20);
    assert.equal(l.nightMarket.discountMax, 70);
  });

  await check("simulate: sample run reports floor, never-shown and baseline delta", async () => {
    const s = await simulate({ pool: pool(60), sample: 300, day: DAY, ruleVersion: 1, baseline: { weights: { rarity: { epic: 0.1 } } } });
    assert.equal(s.sample, 300);
    assert.equal(s.withEpicPct, 100);
    assert.ok(Array.isArray(s.heatmap) && s.heatmap.length === 60);
    assert.ok(typeof s.delta.avgStorefrontValue === "number");
    const again = await simulate({ pool: pool(60), sample: 300, day: DAY, ruleVersion: 1 });
    assert.equal(again.avgStorefrontValue, s.avgStorefrontValue, "deterministic");
  });

  await check("palette: score from SVG colours", () => {
    const svg = "data:image/svg+xml;utf8,<svg><rect fill='%230b1b3a'/><circle fill='#35d0e0'/><path fill='#1e4b8f'/></svg>";
    const cols = colorsIn(svg);
    assert.ok(cols.includes("#35d0e0") && cols.includes("#0b1b3a"));
    const good = paletteScore(["#0b1b3a", "#1e4b8f", "#35d0e0", "#e8f6ff"], cols);
    const badScore = paletteScore(["#ff3d00", "#ffb000", "#5a0e0e", "#120404"], cols);
    assert.ok(good > badScore, `${good} vs ${badScore}`);
  });

  await check("memdb: degraded tables behave like the client subset", async () => {
    const m = createMemDb();
    await m.from("shop2_wishlist").insert({ user_id: "u", item_id: "i1" });
    const dup = await m.from("shop2_wishlist").insert({ user_id: "u", item_id: "i1" });
    assert.equal(dup.error.code, "23505");
    await m.from("shop2_wishlist").upsert({ user_id: "u", item_id: "i1" }, { onConflict: "user_id,item_id", ignoreDuplicates: true });
    const { data } = await m.from("shop2_wishlist").select("*").eq("user_id", "u");
    assert.equal(data.length, 1);
    const up = await m.from("shop2_sets").insert({ set_key: "x", stock_sold: 0 }).select("*").single();
    assert.equal(up.data.set_key, "x");
    const cas = await m.from("shop2_sets").update({ stock_sold: 1 }).eq("set_key", "x").eq("stock_sold", 0).select("stock_sold");
    assert.equal(cas.data.length, 1);
    const cas2 = await m.from("shop2_sets").update({ stock_sold: 1 }).eq("set_key", "x").eq("stock_sold", 0).select("stock_sold");
    assert.equal(cas2.data.length, 0);
    const { count } = await m.from("shop2_sets").select("*", { count: "exact", head: true });
    assert.equal(count, 1);
  });

  if (failures.length) {
    console.error(`shop2Algorithms: ${failures.length} failed, ${passed} passed`);
    for (const f of failures) console.error(`  FAIL ${f}`);
    process.exit(1);
  }
  console.log(`shop2Algorithms.unit.test.cjs: ${passed} passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
