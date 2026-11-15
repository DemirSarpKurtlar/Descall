"use strict";

/**
 * Night market (service): nights = admin rows in shop2_night_markets + the default weekly
 * windows (an admin row with the same id overrides or skips a default night). Personal decks,
 * flips, kept cards, purchases at the revealed discount until the night closes.
 */

const db = require("./db");
const time = require("./time");
const catalog = require("./catalog");
const config = require("./config");
const people = require("./people");
const { deckFor, defaultWindows, nightState } = require("./nightMarket");
const { shopError } = require("./storefrontService");

function fromRow(r) {
  return {
    id: String(r.id),
    auto: false,
    status: r.status || "scheduled",
    mode: r.mode || "scheduled",
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    cards: r.cards ?? null,
    flips: r.flips ?? null,
    discountMin: r.discount_min ?? null,
    discountMax: r.discount_max ?? null,
    skew: r.skew ?? null,
    eligibility: r.eligibility || null,
    note: r.note || null,
    undoUntil: r.undo_until || null,
    createdBy: r.created_by || null,
    createdAt: r.created_at || null,
    overrides: r.overrides || null,
  };
}

/** All nights overlapping [fromMs, toMs] (rows + defaults), with the limits' defaults filled in. */
async function nights(fromMs, toMs) {
  await db.ready();
  const limits = await config.getLimits();
  const nm = limits.nightMarket;
  const rows = (await db.rows(db.from("shop2_night_markets").select("*")).catch(() => [])).map(fromRow);
  const byOverride = new Map(rows.filter((r) => r.overrides).map((r) => [r.overrides, r]));
  const out = [];
  for (const d of defaultWindows(fromMs, toMs, nm)) {
    const o = byOverride.get(d.id);
    if (o) continue;
    out.push({ ...d, status: "scheduled", mode: "scheduled" });
  }
  for (const r of rows) {
    const s = time.ms(r.startsAt);
    const e = time.ms(r.endsAt);
    if (s == null || e == null || e < fromMs || s > toMs) continue;
    out.push(r);
  }
  return out
    .map((n) => ({
      ...n,
      cards: n.cards ?? nm.cards,
      flips: n.flips ?? nm.flips,
      discountMin: n.discountMin ?? nm.discountMin,
      discountMax: n.discountMax ?? nm.discountMax,
      skew: n.skew ?? nm.skew,
    }))
    .sort((a, b) => time.ms(a.startsAt) - time.ms(b.startsAt));
}

async function current(now = Date.now()) {
  const list = await nights(now - 2 * time.DAY_MS, now + 21 * time.DAY_MS);
  return { ...nightState(list, now), list };
}

/** Eligibility rule of a night: { minAccountDays?, minLevel? (unused), premiumOnly? }. */
async function eligible(userId, night) {
  const rule = night?.eligibility || {};
  if (!rule || !Object.keys(rule).length) return true;
  if (rule.minAccountDays) {
    const u = await people.getUser(userId);
    const age = u?.created_at ? (Date.now() - time.ms(u.created_at)) / time.DAY_MS : Infinity;
    if (age < Number(rule.minAccountDays)) return false;
  }
  if (rule.premiumOnly && !(await people.premiumPlan(userId))) return false;
  return true;
}

async function flipsOf(nightId, userId) {
  await db.ready();
  return db.rows(db.from("shop2_night_flips").select("*").eq("night_id", String(nightId)).eq("user_id", userId)).catch(() => []);
}

/** +coOpenBonus flips when an accepted friend has flipped a card the same night. */
async function coOpenBonus(nightId, userId, bonus) {
  if (!bonus) return 0;
  const friends = await people.friendIds(userId);
  if (!friends.length) return 0;
  const rows = await db.rows(db.from("shop2_night_flips").select("user_id").eq("night_id", String(nightId)).in("user_id", friends.slice(0, 500)).limit(1)).catch(() => []);
  return rows.length ? bonus : 0;
}

async function deck(userId, night) {
  const [cat, owned] = await Promise.all([catalog.getCatalog(), people.ownedIds(userId)]);
  // Deck is drawn against what the user owned before tonight's purchases: keep bought cards in place.
  const flips = await flipsOf(night.id, userId);
  const boughtIds = new Set(flips.filter((f) => f.bought_at).map((f) => String(f.item_id)));
  const ownedBefore = new Set([...owned].filter((id) => !boughtIds.has(id)));
  const d = deckFor({ userId, night, pool: cat.items, owned: ownedBefore });
  return { ...d, flips, owned, cat };
}

/** The user's night market view. */
async function view(userId, { now = Date.now(), base = "" } = {}) {
  const limits = await config.getLimits();
  const { open, next } = await current(now);
  const st = await people.getState(userId);
  if (!open) return { open: false, next: next ? { id: next.id, startsAt: next.startsAt, endsAt: next.endsAt } : null, notify: Boolean(st.notify_night) };
  if (!(await eligible(userId, open))) return { open: true, eligible: false, night: { id: open.id, startsAt: open.startsAt, endsAt: open.endsAt }, next: null, notify: Boolean(st.notify_night) };
  const d = await deck(userId, open);
  const flipped = new Map(d.flips.map((f) => [Number(f.card_index), f]));
  const bonus = await coOpenBonus(open.id, userId, limits.nightMarket.coOpenBonus);
  const total = open.flips + bonus;
  const used = d.flips.length;
  let savings = 0;
  const cards = d.cards.map((c) => {
    const f = flipped.get(c.index);
    if (!f) return { index: c.index, flipped: false, hint: c.hint };
    const item = d.cat.byId.get(String(c.itemId));
    if (f.bought_at) savings += c.listPrice - c.price;
    return {
      index: c.index,
      flipped: true,
      hint: c.hint,
      item: catalog.publicItem(item, base),
      rarity: c.rarity,
      discountPct: c.discountPct,
      listPrice: c.listPrice,
      price: c.price,
      kept: Boolean(f.kept),
      bought: Boolean(f.bought_at),
      owned: d.owned.has(String(c.itemId)),
      flippedAt: f.flipped_at || f.created_at,
    };
  });
  const log = d.flips
    .map((f) => ({ at: f.flipped_at || f.created_at, cardIndex: Number(f.card_index), kind: "flip" }))
    .concat(d.flips.filter((f) => f.bought_at).map((f) => ({ at: f.bought_at, cardIndex: Number(f.card_index), kind: "buy" })))
    .concat(d.flips.filter((f) => f.kept).map((f) => ({ at: f.kept_at || f.flipped_at, cardIndex: Number(f.card_index), kind: "keep" })))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return {
    open: true,
    eligible: true,
    night: { id: open.id, startsAt: open.startsAt, endsAt: open.endsAt },
    flips: { total, used, left: Math.max(0, total - used), coOpenBonus: bonus },
    keepMax: limits.nightMarket.keepMax,
    cards,
    savings,
    log,
    notify: Boolean(st.notify_night),
    next: next ? { id: next.id, startsAt: next.startsAt } : null,
  };
}

async function openNightOrThrow(userId, now) {
  const { open } = await current(now);
  if (!open) throw shopError("night_closed", 409);
  if (!(await eligible(userId, open))) throw shopError("night_not_eligible", 403);
  return open;
}

async function flip(userId, cardIndex, { now = Date.now() } = {}) {
  const idx = Number(cardIndex);
  const limits = await config.getLimits();
  const open = await openNightOrThrow(userId, now);
  const d = await deck(userId, open);
  const card = d.cards.find((c) => c.index === idx);
  if (!card) throw shopError("card_not_found", 404);
  if (d.flips.some((f) => Number(f.card_index) === idx)) throw shopError("card_flipped", 409);
  const bonus = await coOpenBonus(open.id, userId, limits.nightMarket.coOpenBonus);
  if (d.flips.length >= open.flips + bonus) throw shopError("no_flips_left", 409);
  const row = { night_id: String(open.id), user_id: userId, card_index: idx, item_id: card.itemId, discount_pct: card.discountPct, price: card.price, list_price: card.listPrice, flipped_at: new Date(now).toISOString(), kept: false };
  const { error } = await db.from("shop2_night_flips").insert(row).select("*").single();
  if (error) {
    if (String(error.code) === "23505") throw shopError("card_flipped", 409);
    throw error;
  }
  return { card: { ...card, flipped: true }, nightId: open.id };
}

async function keep(userId, cardIndex, on = true, { now = Date.now() } = {}) {
  const limits = await config.getLimits();
  const open = await openNightOrThrow(userId, now);
  const flips = await flipsOf(open.id, userId);
  const f = flips.find((x) => Number(x.card_index) === Number(cardIndex));
  if (!f) throw shopError("card_not_flipped", 409);
  if (on && !f.kept && flips.filter((x) => x.kept).length >= limits.nightMarket.keepMax) throw shopError("keep_limit", 409, { max: limits.nightMarket.keepMax });
  await db.rows(db.from("shop2_night_flips").update({ kept: Boolean(on), kept_at: on ? new Date(now).toISOString() : null }).eq("night_id", String(open.id)).eq("user_id", userId).eq("card_index", Number(cardIndex)).select("night_id"));
  return { kept: Boolean(on) };
}

/** Revealed card for a purchase or a gift: { night, card, item }. */
async function revealedCard(userId, cardIndex, { now = Date.now() } = {}) {
  const open = await openNightOrThrow(userId, now);
  const d = await deck(userId, open);
  const card = d.cards.find((c) => c.index === Number(cardIndex));
  const f = d.flips.find((x) => Number(x.card_index) === Number(cardIndex));
  if (!card) throw shopError("card_not_found", 404);
  if (!f) throw shopError("card_not_flipped", 409);
  if (f.bought_at) throw shopError("card_bought", 409);
  const item = d.cat.byId.get(String(card.itemId));
  if (!item || !catalog.sellable(item)) throw shopError("not_available", 410);
  return { night: open, card, item, flip: f };
}

async function buy(userId, cardIndex, { idempotencyKey = null, expectedPrice = null, now = Date.now() } = {}) {
  const purchases = require("./purchases");
  const { night, card, item } = await revealedCard(userId, cardIndex, { now });
  if (expectedPrice != null && Number.isFinite(Number(expectedPrice)) && card.price > Number(expectedPrice)) throw shopError("price_changed", 409, { price: card.price });
  const res = await purchases.charge(userId, [item], card.price, {
    kind: "night",
    source: "night_market",
    idempotencyKey: purchases.cleanKey(idempotencyKey),
    listAmount: card.listPrice,
    meta: { nightId: night.id, cardIndex: card.index, discountPct: card.discountPct },
  });
  if (!res.duplicate) {
    await db.rows(db.from("shop2_night_flips").update({ bought_at: new Date(now).toISOString() }).eq("night_id", String(night.id)).eq("user_id", userId).eq("card_index", card.index).select("night_id"));
  }
  return { ...res, card, item };
}

async function setNotify(userId, on) {
  await people.patchState(userId, { notify_night: Boolean(on) });
  return { notify: Boolean(on) };
}

/** Admin report of a past (or open) night. */
async function report(nightId) {
  await db.ready();
  const flips = await db.rows(db.from("shop2_night_flips").select("*").eq("night_id", String(nightId))).catch(() => []);
  const users = new Set(flips.map((f) => f.user_id));
  const bought = flips.filter((f) => f.bought_at);
  const revenue = bought.reduce((a, f) => a + (Number(f.price) || 0), 0);
  const discountGiven = bought.reduce((a, f) => a + ((Number(f.list_price) || 0) - (Number(f.price) || 0)), 0);
  const byHour = {};
  for (const f of flips) {
    const h = time.localParts(f.flipped_at || f.created_at).hour;
    byHour[h] = (byHour[h] || 0) + 1;
  }
  return {
    nightId: String(nightId),
    participants: users.size,
    flips: flips.length,
    purchases: bought.length,
    revenue,
    discountGiven,
    conversionPct: flips.length ? Math.round((bought.length / flips.length) * 1000) / 10 : 0,
    avgDiscountPct: bought.length ? Math.round(bought.reduce((a, f) => a + (Number(f.discount_pct) || 0), 0) / bought.length) : null,
    byHour,
  };
}

module.exports = { fromRow, nights, current, eligible, view, flip, keep, buy, revealedCard, setNotify, report, deck };
