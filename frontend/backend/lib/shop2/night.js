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
  // A flipped card is fixed by its flip row (item, discount, price); the rest of the deck is drawn
  // against what the user owned before tonight's cards, so buying elsewhere never reshuffles it.
  const flips = await flipsOf(night.id, userId);
  const flippedIds = new Set(flips.map((f) => String(f.item_id)));
  const ownedBefore = new Set([...owned].filter((id) => !flippedIds.has(id)));
  const d = deckFor({ userId, night, pool: cat.items, owned: ownedBefore });
  const byIndex = new Map(flips.map((f) => [Number(f.card_index), f]));
  const cards = d.cards.map((c) => {
    const f = byIndex.get(c.index);
    if (!f) return c;
    const it = cat.byId.get(String(f.item_id));
    return { ...c, itemId: f.item_id, discountPct: Number(f.discount_pct), price: Number(f.price), listPrice: Number(f.list_price), hint: it?.category || c.hint, rarity: it?.rarity || c.rarity };
  });
  return { ...d, cards, flips, owned, cat };
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

/**
 * Flip a card. Runs in the user's queue (parallel flips cannot all pass the allowance check) and
 * recounts after the insert, so two instances cannot exceed it either (the extra row is removed).
 */
async function flip(userId, cardIndex, opts = {}) {
  return require("../descoin").runSerialized(userId, () => flipNow(userId, cardIndex, opts));
}

async function flipNow(userId, cardIndex, { now = Date.now() } = {}) {
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
  const after = await flipsOf(open.id, userId);
  if (after.length > open.flips + bonus) {
    await db.rows(db.from("shop2_night_flips").delete().eq("night_id", String(open.id)).eq("user_id", userId).eq("card_index", idx).select("night_id")).catch(() => []);
    throw shopError("no_flips_left", 409);
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

/**
 * Claim a revealed card for one purchase or gift (conditional update on bought_at, so a buy and
 * a gift, or two gifts, sent together cannot both use the discount). True when this call won.
 */
async function claimCard(userId, nightId, cardIndex, now = Date.now()) {
  await db.ready();
  const won = await db.rows(db.from("shop2_night_flips").update({ bought_at: new Date(now).toISOString() }).eq("night_id", String(nightId)).eq("user_id", userId).eq("card_index", Number(cardIndex)).is("bought_at", null).select("night_id"));
  return won.length > 0;
}

async function releaseCard(userId, nightId, cardIndex) {
  await db.rows(db.from("shop2_night_flips").update({ bought_at: null }).eq("night_id", String(nightId)).eq("user_id", userId).eq("card_index", Number(cardIndex)).select("night_id")).catch(() => []);
}

async function buy(userId, cardIndex, { idempotencyKey = null, expectedPrice = null, now = Date.now() } = {}) {
  const purchases = require("./purchases");
  const key = purchases.cleanKey(idempotencyKey);
  if (key) {
    const dup = await db.one(db.from("shop2_purchases").select("*").eq("user_id", userId).eq("idempotency_key", key).maybeSingle()).catch(() => null);
    if (dup) return { duplicate: true, purchase: dup, balance: await require("../descoin").getBalance(userId), card: null, item: { id: (dup.item_ids || [])[0] } };
  }
  const { night, card, item } = await revealedCard(userId, cardIndex, { now });
  if (expectedPrice != null && Number.isFinite(Number(expectedPrice)) && card.price > Number(expectedPrice)) throw shopError("price_changed", 409, { price: card.price });
  if (!(await claimCard(userId, night.id, card.index, now))) throw shopError("card_bought", 409);
  let res;
  try {
    res = await purchases.charge(userId, [item], card.price, {
      kind: "night",
      source: "night_market",
      idempotencyKey: key,
      listAmount: card.listPrice,
      meta: { nightId: night.id, cardIndex: card.index, discountPct: card.discountPct },
    });
  } catch (err) {
    await releaseCard(userId, night.id, card.index);
    throw err;
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

/* ---------------------------------------------------------------- reminder */

const REMIND_MINUTES = 10;

function reminderText(lang, minutes) {
  const copy = require("../../i18n/shop2").nightReminder;
  const [title, body] = copy[lang] || copy.en;
  return { title, body: body.replace("{minutes}", String(minutes)) };
}

/**
 * Scheduler: 10 minutes before a night opens, remind everyone who asked (shop2_user_state
 * .notify_night) with an in-app notification, a socket event and a web push, in their app
 * language. One reminder per night across instances (claimed with a shop2_settings row).
 */
async function remindDue({ now = Date.now(), io = null } = {}) {
  await db.ready();
  const { list } = await current(now);
  const night = list.find((n) => !["skipped", "cancelled"].includes(n.status) && time.ms(n.startsAt) > now && time.ms(n.startsAt) - now <= REMIND_MINUTES * time.MIN_MS);
  if (!night) return { night: null, reminded: 0 };
  const claimKey = `night_reminder:${night.id}`;
  if (await db.one(db.from("shop2_settings").select("key").eq("key", claimKey).maybeSingle()).catch(() => null)) return { night: night.id, reminded: 0, already: true };
  // The primary key makes the insert the cross-instance claim.
  const claim = await db.from("shop2_settings").insert({ key: claimKey, value: { at: time.iso(now) }, version: 1, updated_at: time.iso(now) }).select("key").single();
  if (claim.error) return { night: night.id, reminded: 0, already: true };
  const rows = await db.rows(db.from("shop2_user_state").select("user_id").eq("notify_night", true)).catch(() => []);
  const ids = [...new Set(rows.map((r) => String(r.user_id)))];
  if (!ids.length) return { night: night.id, reminded: 0 };
  const minutes = Math.max(1, Math.round((time.ms(night.startsAt) - now) / time.MIN_MS));
  const langs = new Map();
  try {
    const { data } = await db.real().from("users").select("id, language").in("id", ids);
    for (const u of data || []) langs.set(String(u.id), u.language);
  } catch {
    /* English */
  }
  const { pickLang } = require("../i18n");
  const byLang = new Map();
  let handlers = null;
  try {
    handlers = require("../../socket/handlers");
  } catch {
    handlers = null;
  }
  let reminded = 0;
  for (const id of ids) {
    if (!(await eligible(id, night).catch(() => false))) continue;
    const lang = pickLang([langs.get(id)], "en");
    const t = reminderText(lang, minutes);
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang).push(id);
    require("./events").toUser(id, "shop2:night_reminder", { nightId: night.id, startsAt: night.startsAt, minutes, title: t.title, body: t.body });
    try {
      if (io && handlers?.pushNotification) handlers.pushNotification(io, id, { type: "shop2_night", title: t.title, body: t.body, meta: { nightId: night.id, startsAt: night.startsAt, deepLink: "/shop?tab=night" } });
    } catch {
      /* in-app list optional */
    }
    reminded += 1;
  }
  try {
    const { sendWebPushToUsers } = require("../webPush");
    await Promise.allSettled(
      [...byLang].map(([lang, list]) => {
        const t = reminderText(lang, minutes);
        return sendWebPushToUsers(list, { type: "shop2-night", title: t.title, body: t.body, tag: `shop2-night-${night.id}`, deepLink: "/shop?tab=night" });
      })
    );
  } catch (err) {
    console.warn("[shop2] night reminder push failed:", err?.message || err);
  }
  return { night: night.id, reminded };
}

module.exports = { REMIND_MINUTES, remindDue, reminderText, fromRow, nights, current, eligible, view, flip, keep, buy, claimCard, releaseCard, revealedCard, setNotify, report, deck };
