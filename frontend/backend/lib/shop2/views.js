"use strict";

/** Response shapes of the user API (docs/shop2-api.md). */

const db = require("./db");
const time = require("./time");
const catalog = require("./catalog");
const config = require("./config");
const people = require("./people");
const events = require("./events");
const sets = require("./sets");
const pricing = require("./pricing");
const sfs = require("./storefrontService");
const night = require("./night");
const { PIECE_GROUPS } = require("./themes");
const { hash01 } = require("./rng");
const descoin = require("../descoin");

const USER_VISIBLE = new Set(["live", "last24h", "soldout", "scheduled"]);

function slotBadges(reasons) {
  const keep = new Set(["wishlist", "set_progress", "new_item", "epic_floor", "locked"]);
  return (reasons || []).map((r) => r.code).filter((c) => keep.has(c));
}

async function nightSummary(userId, now) {
  try {
    const { open, next } = await night.current(now);
    if (!open) return { open: false, nextStartsAt: next?.startsAt || null, nextEndsAt: next?.endsAt || null };
    const limits = await config.getLimits();
    const flips = await db.rows(db.from("shop2_night_flips").select("card_index").eq("night_id", String(open.id)).eq("user_id", userId)).catch(() => []);
    return { open: true, id: open.id, startsAt: open.startsAt, endsAt: open.endsAt, cards: open.cards, flipsLeft: Math.max(0, open.flips - flips.length), keepMax: limits.nightMarket.keepMax, nextStartsAt: next?.startsAt || null };
  } catch {
    return { open: false, nextStartsAt: null };
  }
}

/** 3 featured sets: started-but-incomplete sets first, then a daily rotation of live sets. */
function pickFeatured(list, quotes, userId, day, n = 3) {
  const live = list.filter((s) => sets.onSale(s));
  const scored = live.map((s) => {
    const q = quotes.get(s.key);
    const started = q && q.ownedCount > 0 && !q.complete ? 1 : 0;
    return { s, started, r: hash01("shop2-featured", userId, day, s.key) };
  });
  scored.sort((a, b) => b.started - a.started || a.r - b.r);
  return scored.filter((x) => !quotes.get(x.s.key)?.complete).slice(0, n).map((x) => x.s);
}

async function storefront(userId, { base = "", now = Date.now() } = {}) {
  events.sawViewer(userId, now);
  const { row } = await sfs.ensureToday(userId, { now });
  const [cat, owned, limits, ctx, wish, balance, nightInfo] = await Promise.all([
    catalog.getCatalog(),
    people.ownedIds(userId),
    config.getLimits(),
    sets.contextFor(userId, now),
    db.rows(db.from("shop2_wishlist").select("item_id").eq("user_id", userId)).catch(() => []),
    descoin.getBalance(userId).catch(() => null),
    nightSummary(userId, now),
  ]);
  const wished = new Set(wish.map((w) => String(w.item_id)));
  const refresh = await sfs.refreshQuote(userId, row, limits);
  const setByKey = new Map(ctx.sets.map((s) => [s.key, s]));
  const slots = (row.slots || []).map((s) => {
    const item = cat.byId.get(String(s.itemId));
    const set = item?.setKey ? setByKey.get(item.setKey) : null;
    const prog = set ? { setKey: set.key, owned: set.items.filter((it) => owned.has(String(it.id))).length, total: set.items.length } : null;
    return {
      slot: s.slot,
      item: item ? catalog.publicItem(item, base) : null,
      price: item ? item.price : null,
      owned: item ? owned.has(String(item.id)) : false,
      available: Boolean(item && catalog.sellable(item)),
      locked: String(row.lock_item_id || "") === String(s.itemId),
      wishlisted: wished.has(String(s.itemId)),
      badges: slotBadges(s.reasons),
      setProgress: prog,
    };
  });
  const quotes = new Map(ctx.sets.map((s) => [s.key, sets.quoteFor(s, { userId, owned: ctx.owned, lock: ctx.locks.get(s.key), tests: ctx.tests, limits: ctx.limits, now })]));
  const featured = pickFeatured(ctx.sets, quotes, userId, row.day).map((s) => sets.setCard(s, quotes.get(s.key), { base, now }));
  const yesterdayRow = await sfs.readRow(userId, time.addDays(row.day, -1)).catch(() => null);
  const yesterday = (yesterdayRow?.slots || []).map((s) => {
    const it = cat.byId.get(String(s.itemId));
    return it ? { slot: s.slot, item: catalog.publicItem(it, base), owned: owned.has(String(it.id)), available: catalog.sellable(it), wishlisted: wished.has(String(it.id)) } : null;
  }).filter(Boolean);
  const wishlistHits = slots.filter((s) => s.wishlisted && !s.owned).map((s) => s.item?.id);
  return {
    day: row.day,
    serverTime: time.iso(now),
    resetsAt: time.iso(time.nextMidnightMs(now)),
    slots,
    lock: row.lock_item_id ? { itemId: row.lock_item_id, slot: row.lock_slot || null } : null,
    refresh: { available: refresh.available, price: refresh.price, free: refresh.free, used: refresh.used, perDay: refresh.perDay, usedAt: refresh.usedAt, freeGrants: refresh.freeGrants },
    streak: { days: refresh.streakDays, rewardEvery: refresh.streakEvery },
    nightMarket: nightInfo,
    featuredSets: featured,
    yesterday,
    wishlistHits,
    balance,
    viewers: events.liveViewers(now),
    legacyPool: cat.legacyPool,
  };
}

async function setsList(userId, { base = "", now = Date.now() } = {}) {
  const ctx = await sets.contextFor(userId, now);
  const out = [];
  for (const s of ctx.sets) {
    const q = sets.quoteFor(s, { userId, owned: ctx.owned, lock: ctx.locks.get(s.key), tests: ctx.tests, limits: ctx.limits, now });
    const card = sets.setCard(s, q, { base, now });
    if (!USER_VISIBLE.has(card.state) && !q.partialPriceUntil && !q.ownedCount) continue;
    out.push(card);
  }
  const done = new Set((await sets.completions(userId)).map((r) => r.set_key));
  return { sets: out.map((c) => ({ ...c, completedTitle: done.has(c.key) })) };
}

async function ownersCount(setKey) {
  try {
    const { count } = await db.from("shop2_set_completions").select("user_id", { count: "exact", head: true }).eq("set_key", setKey);
    return count ?? 0;
  } catch {
    return null;
  }
}

async function setDetail(userId, key, { base = "", now = Date.now() } = {}) {
  const ctx = await sets.contextFor(userId, now);
  const set = ctx.sets.find((s) => s.key === key);
  if (!set || set.status === "draft" || set.status === "archived") return null;
  events.sawSet(key, userId, now);
  const lock = ctx.locks.get(set.key);
  const q = sets.quoteFor(set, { userId, owned: ctx.owned, lock, tests: ctx.tests, limits: ctx.limits, now });
  if (q.abTestId) {
    await db.one(db.from("shop2_ab_exposures").upsert({ test_id: q.abTestId, user_id: userId, arm: q.abArm, created_at: time.iso(now) }, { onConflict: "test_id,user_id", ignoreDuplicates: true }).select("*").maybeSingle()).catch(() => null);
  }
  const points = await sets.pricePoints(set.key, now - 40 * time.DAY_MS);
  const history = pricing.priceHistory(points.map((p) => ({ at: p.at, price: p.price })), { now, days: 30, current: q.setPrice });
  const wish = new Set((await db.rows(db.from("shop2_wishlist").select("item_id").eq("user_id", userId)).catch(() => [])).map((w) => String(w.item_id)));
  const pieces = set.pieces.map((p) => {
    const it = p.item;
    if (!it) return { category: p.category, item: null };
    const single = pricing.piecesQuote(q, set.items, [it.id]);
    return {
      category: p.category,
      item: catalog.publicItem(it, base),
      price: it.price,
      owned: ctx.owned.has(String(it.id)),
      priceNow: ctx.owned.has(String(it.id)) ? 0 : single.price,
      mode: single.mode,
      wishlisted: wish.has(String(it.id)),
    };
  });
  const friends = await people.friendIds(userId);
  let friendOwners = 0;
  if (friends.length) {
    const rows = await db.rows(db.from("shop2_set_completions").select("user_id").eq("set_key", set.key).in("user_id", friends.slice(0, 1000))).catch(() => []);
    friendOwners = rows.length;
  }
  const done = (await sets.completions(userId)).some((r) => r.set_key === set.key);
  return {
    ...sets.setCard(set, q, { base, now }),
    pieces,
    groups: PIECE_GROUPS.map(([k, cats]) => ({ key: k, categories: cats })),
    sum: q.sum,
    setPrice: q.setPrice,
    yourPrice: q.yourPrice,
    ownedDeducted: q.ownedDeducted,
    savings: q.savings,
    missingIds: q.missingIds,
    partialPriceUntil: q.partialPriceUntil,
    partialLockDays: ctx.limits.purchases.partialLockDays,
    priceHistory30d: history.days,
    lowest30d: history.lowest30d,
    isLowest30d: history.isLowest,
    lookingNow: events.setLookingNow(set.key, now),
    ownersCount: await ownersCount(set.key),
    friendOwners,
    title: sets.titleOf(set),
    titleUnlocked: done,
    wishlisted: wish.has(`set:${set.key}`),
    refundMinutes: ctx.limits.purchases.refundMinutes,
  };
}

/** Live s2 catalog for try-on / tabs, with owned flags. */
async function catalogView(userId, { base = "", category = null } = {}) {
  const [cat, owned] = await Promise.all([catalog.getCatalog(), people.ownedIds(userId)]);
  const items = cat.items
    .filter((it) => catalog.sellable(it) && (!category || it.category === category))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => catalog.publicItem(it, base, { owned: owned.has(String(it.id)) }));
  return { items, legacyPool: cat.legacyPool };
}

/** Friend feed: which friend completed which set (last 30 days). */
async function friendFeed(userId, { now = Date.now() } = {}) {
  const friends = (await people.friendIds(userId)).slice(0, 1000);
  if (!friends.length) return { entries: [] };
  const since = time.iso(now - 30 * time.DAY_MS);
  const rows = await db.rows(db.from("shop2_set_completions").select("*").in("user_id", friends).gte("completed_at", since)).catch(() => []);
  const [usersById, allSets] = await Promise.all([people.getUsers(rows.map((r) => r.user_id)), catalog.getSets()]);
  const setByKey = new Map(allSets.map((s) => [s.key, s]));
  return {
    entries: rows
      .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))
      .slice(0, 50)
      .map((r) => ({ kind: "set_completed", at: r.completed_at, user: people.publicUser(usersById.get(String(r.user_id))), setKey: r.set_key, setName: setByKey.get(r.set_key)?.name || null, palette: setByKey.get(r.set_key)?.palette || [] })),
  };
}

module.exports = { friendFeed, storefront, setsList, setDetail, catalogView, nightSummary, slotBadges };
