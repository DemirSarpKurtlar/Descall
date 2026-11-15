"use strict";

/**
 * Sets for users: per-user quote (owned deduction, 7-day partial price window, A/B arm),
 * 30-day price history, sale state, completion title.
 */

const db = require("./db");
const time = require("./time");
const catalog = require("./catalog");
const config = require("./config");
const pricing = require("./pricing");
const { setLifecycle } = require("./timeline");
const { RARITY_RANK } = require("./rules");

const ON_SALE = new Set(["live", "last24h"]);

function onSale(set, now = Date.now()) {
  return ON_SALE.has(setLifecycle(set, now)) && set.items.length > 0;
}

async function liveAbTests(now = Date.now()) {
  await db.ready();
  const list = await db.rows(db.from("shop2_ab_tests").select("*").eq("status", "running")).catch(() => []);
  return list.filter((t) => (!t.starts_at || time.ms(t.starts_at) <= now) && (!t.ends_at || time.ms(t.ends_at) > now));
}

/** Live discount of a set for a user: the A/B arm overrides the set discount. */
function discountFor(set, userId, tests, limits) {
  const p = limits.purchases;
  const test = (tests || []).find((t) => t.set_key === set.key);
  let pct = set.discountPct;
  let arm = null;
  if (test) {
    arm = pricing.abArm(userId, test);
    pct = arm === "B" ? Number(test.discount_b) : Number(test.discount_a ?? set.discountPct);
  }
  return { pct: pricing.clampDiscount(pct, p.setDiscountMin, p.setDiscountMax), arm, testId: test ? test.id : null };
}

async function locksOf(userId) {
  await db.ready();
  const list = await db.rows(db.from("shop2_set_locks").select("*").eq("user_id", userId)).catch(() => []);
  return new Map(list.map((r) => [r.set_key, { discountPct: Number(r.discount_pct) || 0, until: r.until, purchaseId: r.purchase_id || null }]));
}

async function openLock(userId, setKey, discountPct, { days = 7, purchaseId = null, now = Date.now() } = {}) {
  await db.ready();
  const until = new Date(now + days * time.DAY_MS).toISOString();
  await db.one(
    db.from("shop2_set_locks").upsert({ user_id: userId, set_key: setKey, discount_pct: discountPct, until, purchase_id: purchaseId, created_at: new Date(now).toISOString() }, { onConflict: "user_id,set_key" }).select("*").maybeSingle()
  );
  return until;
}

async function dropLock(userId, setKey, purchaseId = null) {
  await db.ready();
  let q = db.from("shop2_set_locks").delete().eq("user_id", userId).eq("set_key", setKey);
  if (purchaseId) q = q.eq("purchase_id", purchaseId);
  await db.rows(q.select("set_key")).catch(() => []);
}

function quoteFor(set, { userId, owned, lock, tests, limits, now = Date.now() }) {
  const d = discountFor(set, userId, tests, limits);
  const q = pricing.setQuote({
    pieces: set.items.map((it) => ({ id: it.id, price: it.price })),
    ownedIds: owned,
    discountPct: d.pct,
    lock: lock || null,
    onSale: onSale(set, now),
    now,
  });
  return { ...q, abArm: d.arm, abTestId: d.testId };
}

async function pricePoints(setKey, sinceMs) {
  await db.ready();
  return db
    .rows(db.from("shop2_price_points").select("*").eq("set_key", setKey).gte("at", new Date(sinceMs).toISOString()).order("at", { ascending: true }))
    .catch(() => []);
}

async function recordPrice(setKey, price, { at = Date.now(), reason = null } = {}) {
  await db.ready();
  await db.one(db.from("shop2_price_points").insert({ set_key: setKey, price, reason, at: new Date(at).toISOString() }).select("*").single()).catch(() => null);
}

async function completions(userId) {
  await db.ready();
  return db.rows(db.from("shop2_set_completions").select("*").eq("user_id", userId)).catch(() => []);
}

/** Insert completion rows for every set the user now owns fully. Returns the new ones. */
async function recordCompletions(userId, owned, sets) {
  const done = new Set((await completions(userId)).map((r) => r.set_key));
  const fresh = [];
  for (const s of sets) {
    if (done.has(s.key) || !s.items.length) continue;
    if (s.items.length < 2) continue;
    if (s.items.every((it) => owned.has(String(it.id)))) {
      await db.one(db.from("shop2_set_completions").upsert({ user_id: userId, set_key: s.key, completed_at: new Date().toISOString() }, { onConflict: "user_id,set_key" }).select("*").maybeSingle()).catch(() => null);
      fresh.push({ setKey: s.key, title: titleOf(s) });
    }
  }
  return fresh;
}

/** Set completion title: "<set name>" per locale, shown with a gold-rimmed badge by the UI. */
function titleOf(set) {
  return { id: `set:${set.key}`, setKey: set.key, name: set.name, palette: set.palette };
}

function topRarity(set) {
  let best = "common";
  for (const it of set.items) if ((RARITY_RANK[it.rarity] ?? 0) > (RARITY_RANK[best] ?? 0)) best = it.rarity;
  return best;
}

/** Card payload for lists (storefront banner, sets tab). */
function setCard(set, q, { base = "", now = Date.now() } = {}) {
  const state = setLifecycle(set, now);
  return {
    key: set.key,
    name: set.name,
    palette: set.palette,
    state,
    onSale: onSale(set, now),
    startsAt: set.startsAt,
    endsAt: set.endsAt,
    stockLimit: set.stockLimit,
    stockLeft: set.stockLimit == null ? null : Math.max(0, set.stockLimit - set.stockSold),
    pieceCount: set.items.length,
    topRarity: topRarity(set),
    cover: catalog.publicItem(set.items.find((it) => it.category === "banner") || set.items[0], base),
    sum: q.sum,
    setPrice: q.setPrice,
    discountPct: q.discountPct,
    yourPrice: q.yourPrice,
    owned: q.ownedCount,
    total: q.total,
    complete: q.complete,
    partialPriceUntil: q.partialPriceUntil,
  };
}

async function contextFor(userId, now = Date.now()) {
  const people = require("./people");
  const [sets, owned, locks, tests, limits] = await Promise.all([catalog.getSets(), people.ownedIds(userId), locksOf(userId), liveAbTests(now), config.getLimits()]);
  return { sets, owned, locks, tests, limits, now };
}

module.exports = { ON_SALE, onSale, liveAbTests, discountFor, locksOf, openLock, dropLock, quoteFor, pricePoints, recordPrice, completions, recordCompletions, titleOf, topRarity, setCard, contextFor };
