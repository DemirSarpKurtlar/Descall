"use strict";

/**
 * Market 2.0 purchases: single items (storefront / set piece / night market card), sets (all
 * missing pieces at the set rate, or chosen pieces), refunds inside the 10-minute window.
 *
 * Money safety (same pattern as lib/shopPurchase.js): everything for one buyer runs inside
 * descoin.runSerialized, the debit is one ledger row (shop_purchase), grants are idempotent
 * upserts, a failed grant refunds the whole debit (shop_refund) before the error surfaces,
 * and an idempotency key (holdToken / Idempotency-Key) makes a double tap return the first
 * result instead of charging twice.
 */

const db = require("./db");
const time = require("./time");
const catalog = require("./catalog");
const config = require("./config");
const people = require("./people");
const actions = require("./actions");
const events = require("./events");
const sets = require("./sets");
const pricing = require("./pricing");
const { shopError } = require("./storefrontService");
const shop = require("../shop");
const descoin = require("../descoin");

function cleanKey(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[A-Za-z0-9._:-]{8,100}$/.test(s) ? s : null;
}

async function findByKey(userId, key) {
  if (!key) return null;
  await db.ready();
  return db.one(db.from("shop2_purchases").select("*").eq("user_id", userId).eq("idempotency_key", key).maybeSingle()).catch(() => null);
}

/** Reserve one unit of a set's stock (CAS). */
async function reserveSetStock(set) {
  if (set.stockLimit == null || set.source !== "db") return { ok: true, reserved: false };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const row = await db.one(db.from("shop2_sets").select("set_key, stock_limit, stock_sold").eq("set_key", set.key).maybeSingle());
    if (!row) return { ok: true, reserved: false };
    const sold = Number(row.stock_sold) || 0;
    if (row.stock_limit != null && sold >= Number(row.stock_limit)) return { ok: false };
    const up = await db.rows(db.from("shop2_sets").update({ stock_sold: sold + 1 }).eq("set_key", set.key).eq("stock_sold", sold).select("stock_sold"));
    if (up.length) return { ok: true, reserved: true };
  }
  return { ok: false };
}

async function releaseSetStock(setKey) {
  try {
    const row = await db.one(db.from("shop2_sets").select("stock_sold").eq("set_key", setKey).maybeSingle());
    if (row) await db.rows(db.from("shop2_sets").update({ stock_sold: Math.max(0, (Number(row.stock_sold) || 0) - 1) }).eq("set_key", setKey).select("set_key"));
  } catch (err) {
    console.error(`[shop2] set stock release failed for ${setKey}:`, err?.message || err);
  }
}

function mapDebitError(err) {
  if (err?.message === "INSUFFICIENT_BALANCE") return shopError("insufficient_balance", 402);
  if (err?.message === "WALLET_FROZEN" || err?.code === "WALLET_FROZEN") return shopError("wallet_frozen", 403);
  return err;
}

/** Split `amount` over items proportionally to list prices (receipt rows for the old desk). */
function splitAmount(items, amount) {
  const list = items.reduce((a, it) => a + it.price, 0);
  let left = amount;
  return items.map((it, i) => {
    const share = i === items.length - 1 ? left : list > 0 ? Math.round((amount * it.price) / list) : Math.floor(amount / items.length);
    left -= share;
    return { item: it, amount: Math.max(0, share) };
  });
}

/**
 * Core: charge `price` once and grant `items` to `grantTo` (default the buyer).
 * opts: { kind, source, setKey, idempotencyKey, listAmount, meta, set (for stock), lockDiscount,
 *         opensLock, refundable (default true), giftId }
 */
async function charge(userId, items, price, opts = {}) {
  const now = opts.now ?? Date.now();
  const limits = await config.getLimits();
  const grantTo = opts.grantTo || userId;
  return descoin.runSerialized(userId, async () => {
    const dup = await findByKey(userId, opts.idempotencyKey);
    if (dup) return { duplicate: true, purchase: dup, balance: await descoin.getBalance(userId) };
    const owned = await people.ownedIds(grantTo);
    const missing = items.filter((it) => !owned.has(String(it.id)));
    if (!missing.length) throw shopError("already_owned", 409);
    if (missing.length !== items.length && !opts.allowPartialOwned) throw shopError("price_changed", 409);

    let stock = { ok: true, reserved: false };
    if (opts.set) {
      stock = await reserveSetStock(opts.set);
      if (!stock.ok) throw shopError("sold_out", 409);
    }
    const release = async () => {
      if (stock.reserved) await releaseSetStock(opts.set.key);
    };
    const purchaseId = require("crypto").randomUUID();
    const meta = { shop2: opts.kind, purchaseId, itemIds: items.map((it) => it.id), setKey: opts.setKey || null, source: opts.source || null, ...(opts.meta || {}) };
    let balance = null;
    if (price > 0) {
      try {
        balance = (await descoin.debit(userId, price, "shop_purchase", meta)).balance;
      } catch (err) {
        await release();
        throw mapDebitError(err);
      }
    } else balance = await descoin.getBalance(userId);

    const granted = [];
    if (!opts.deferGrant) {
      try {
        for (const it of items) {
          const row = await shop.grantItem(grantTo, it.id, { acquiredVia: grantTo === userId ? "purchase" : "gift", giftedBy: grantTo === userId ? null : userId, giftMessage: opts.giftMessage || null });
          if (row) granted.push(it);
        }
      } catch (grantError) {
        try {
          if (price > 0) await descoin.credit(userId, price, "shop_refund", { ...meta, reason: "grant_failed" });
          for (const it of granted) await db.rows(db.real().from("user_inventory").delete().eq("user_id", grantTo).eq("item_id", it.id).select("id"));
        } catch (refundError) {
          console.error(`[shop2] CRITICAL: grant failed and refund failed for user ${userId}, purchase ${purchaseId}`, refundError);
        }
        await release();
        throw grantError;
      }
      if (!granted.length) {
        if (price > 0) balance = (await descoin.credit(userId, price, "shop_refund", { ...meta, reason: "already_owned" })).balance;
        await release();
        throw shopError("already_owned", 409);
      }
    }

    const refundable = opts.refundable !== false && grantTo === userId && limits.purchases.refundMinutes > 0;
    const row = {
      id: purchaseId,
      user_id: userId,
      kind: opts.kind,
      set_key: opts.setKey || null,
      item_ids: items.map((it) => it.id),
      amount: price,
      list_amount: opts.listAmount ?? items.reduce((a, it) => a + it.price, 0),
      source: opts.source || null,
      idempotency_key: opts.idempotencyKey || null,
      status: "paid",
      refundable_until: refundable ? new Date(now + limits.purchases.refundMinutes * 60_000).toISOString() : null,
      recipient_id: grantTo === userId ? null : grantTo,
      gift_id: opts.giftId || null,
      ab_test_id: opts.abTestId || null,
      ab_arm: opts.abArm || null,
      owned_deducted: opts.ownedDeducted || 0,
      stock_reserved: stock.reserved,
      meta: opts.meta || {},
      created_at: new Date(now).toISOString(),
    };
    try {
      await db.one(db.from("shop2_purchases").insert(row).select("*").single());
    } catch (err) {
      console.error(`[shop2] purchase row insert failed (${purchaseId}):`, err?.message || err);
    }
    // Receipt rows for the existing shop desk analytics (amount split by list price).
    if (!opts.deferGrant) {
      const receipts = splitAmount(items, price).map((x) => ({ user_id: userId, item_id: x.item.id, amount_descoin: x.amount, status: "paid" }));
      const { error } = await db.real().from("shop_purchases").insert(receipts);
      if (error) console.error(`[shop2] receipt insert failed (${purchaseId}):`, error.message);
    }

    let lockUntil = null;
    if (opts.opensLock && opts.setKey) {
      lockUntil = await sets.openLock(userId, opts.setKey, opts.lockDiscount || 0, { days: limits.purchases.partialLockDays, purchaseId, now });
    }
    if (refundable) {
      await actions.log(userId, "purchase", { purchaseId, kind: opts.kind, setKey: opts.setKey || null, itemIds: row.item_ids, amount: price }, { undo: { type: "refund", purchaseId }, undoMinutes: limits.purchases.refundMinutes, now });
    }
    const sale = { id: purchaseId, kind: opts.kind, userId, setKey: row.set_key, itemIds: row.item_ids, amount: price, listAmount: row.list_amount, ownedDeducted: row.owned_deducted, source: row.source, gift: grantTo !== userId, at: row.created_at };
    events.toAdmins("shop2:admin:sale", { sale });
    // A set completes however its last piece arrives (set buy, single piece, night card), so the
    // completion title is recorded here for every set a granted item belongs to.
    const completed = granted.length ? await completionsFor(grantTo, granted, [opts.setKey]) : [];
    return { duplicate: false, purchase: row, balance, granted: granted.map((it) => it.id), lockUntil, completed };
  });
}

/** Completion rows (title reward) for the sets of `items` the user now owns fully. */
async function completionsFor(userId, items, extraKeys = []) {
  const keys = new Set([...items.map((it) => it?.setKey), ...extraKeys].filter(Boolean));
  if (!keys.size) return [];
  try {
    const touched = (await catalog.getSets()).filter((s) => keys.has(s.key));
    return await sets.recordCompletions(userId, await people.ownedIds(userId), touched);
  } catch (err) {
    console.error(`[shop2] completion record failed for ${userId}:`, err?.message || err);
    return [];
  }
}

/** Equip what was just bought; the previous look is saved as an automatic outfit (undoable). */
async function equipBought(userId, itemIds, { io = null } = {}) {
  const look = await people.equippedSnapshot(userId);
  const cat = await catalog.getCatalog();
  const next = {};
  for (const id of itemIds) {
    const it = cat.byId.get(String(id));
    if (it && it.category in look) next[it.category] = it.id;
  }
  if (!Object.keys(next).length) return null;
  const outfits = require("./outfits");
  const saved = await outfits.saveSnapshot(userId, look, { name: null, kind: "previous" });
  const applied = await people.applyLook(userId, next);
  const limits = await config.getLimits();
  await actions.log(userId, "equip", { applied, outfitId: saved?.id || null }, { undo: { type: "restore_look", look }, undoMinutes: Math.max(limits.purchases.actionUndoMinutes, 10) });
  if (io) await people.broadcastProfile(io, userId);
  return { applied, previousOutfitId: saved?.id || null };
}

/**
 * A later purchase used the 7-day partial price that `lock` (opened by a single piece) gave:
 * the opening piece can no longer be refunded, otherwise buy one piece, buy the rest at the set
 * rate, refund the first = the set rate without the set.
 */
async function closeLockOpenerRefund(userId, lock, now = Date.now()) {
  const pid = lock && lock.purchaseId;
  if (!pid) return;
  try {
    await db.rows(db.from("shop2_purchases").update({ refundable_until: new Date(now).toISOString() }).eq("id", pid).eq("user_id", userId).eq("status", "paid").select("id"));
    await actions.closeUndo(userId, { type: "refund", purchaseId: pid });
  } catch (err) {
    console.error(`[shop2] closing the refund of ${pid} failed:`, err?.message || err);
  }
}

/* ---------------------------------------------------------------- public operations */

async function todayStorefrontIds(userId) {
  const row = await require("./storefrontService").readRow(userId, time.dayKey());
  return new Set((row?.slots || []).map((s) => String(s.itemId)));
}

/**
 * Buy one item. A set piece goes through the set rules (partial price / opens the 7-day
 * window); otherwise the list price. Allowed: any sellable s2 item.
 */
async function duplicateOf(userId, key) {
  const dup = await findByKey(userId, key);
  return dup ? { duplicate: true, purchase: dup, balance: await descoin.getBalance(userId) } : null;
}

async function buyItem(userId, itemId, { expectedPrice = null, idempotencyKey = null, source = null, equip = false, io = null } = {}) {
  const early = await duplicateOf(userId, cleanKey(idempotencyKey));
  if (early) return { ...early, item: { id: itemId }, price: Number(early.purchase.amount) || 0 };
  const cat = await catalog.getCatalog();
  const item = cat.byId.get(String(itemId));
  if (!item || !catalog.sellable(item)) throw shopError("not_found", 404);
  let price = item.price;
  let kind = "item";
  let setKey = null;
  let opensLock = false;
  let lockDiscount = 0;
  let usedLock = null;
  if (item.setKey) {
    const ctx = await sets.contextFor(userId);
    const set = ctx.sets.find((s) => s.key === item.setKey);
    if (set) {
      if (set.status === "recalled") throw shopError("not_available", 410);
      const q = sets.quoteFor(set, { userId, owned: ctx.owned, lock: ctx.locks.get(set.key), tests: ctx.tests, limits: ctx.limits });
      const inStorefront = (await todayStorefrontIds(userId)).has(String(item.id));
      if (!q.setRateOpen && !inStorefront) throw shopError("not_available", 410);
      const pq = pricing.piecesQuote(q, set.items, [item.id]);
      if (!pq.ids.length) throw shopError("already_owned", 409);
      price = pq.price;
      kind = "piece";
      setKey = set.key;
      opensLock = pq.opensLock && q.setRateOpen;
      lockDiscount = q.discountPct;
      if (q.partialPriceUntil) usedLock = ctx.locks.get(set.key) || null;
    }
  }
  if (expectedPrice != null && Number.isFinite(Number(expectedPrice)) && price > Number(expectedPrice)) throw shopError("price_changed", 409, { price });
  const res = await charge(userId, [item], price, { kind, source: source || (setKey ? "set" : "storefront"), setKey, idempotencyKey: cleanKey(idempotencyKey), opensLock, lockDiscount, listAmount: item.price });
  if (!res.duplicate && usedLock) await closeLockOpenerRefund(userId, usedLock);
  let equipped = null;
  if (!res.duplicate && equip) equipped = await equipBought(userId, [item.id], { io });
  if (!res.duplicate) events.toUser(userId, "shop2:storefront", { reason: "purchase" });
  return { ...res, item, price, equipped, completed: res.completed || [] };
}

/**
 * Buy a set: `all` = every missing piece at the set quote; `pieceIds` = those pieces (the set
 * quote when they are all the missing ones). `holdToken` (hold-to-confirm gesture id) is the
 * idempotency key and is required.
 */
async function buySet(userId, setKey, { pieceIds = null, all = false, holdToken = null, expectedPrice = null, equip = null, io = null } = {}) {
  const key = cleanKey(holdToken);
  if (!key) throw shopError("hold_token_required", 400);
  const early = await duplicateOf(userId, key);
  if (early) return { ...early, completed: [] };
  const limits = await config.getLimits();
  const user = await people.getUser(userId);
  const ageDays = user?.created_at ? (Date.now() - time.ms(user.created_at)) / time.DAY_MS : Infinity;
  if (ageDays < limits.gifts.minAccountDaysSetBuy) throw shopError("new_account_set", 403, { days: limits.gifts.minAccountDaysSetBuy });
  const ctx = await sets.contextFor(userId);
  const set = ctx.sets.find((s) => s.key === setKey);
  if (!set || !set.items.length) throw shopError("not_found", 404);
  if (set.status === "recalled") throw shopError("not_available", 410);
  const q = sets.quoteFor(set, { userId, owned: ctx.owned, lock: ctx.locks.get(set.key), tests: ctx.tests, limits: ctx.limits });
  if (!q.setRateOpen) throw shopError("not_available", 410);
  if (q.complete) throw shopError("already_owned", 409);
  const wanted = all || !Array.isArray(pieceIds) || !pieceIds.length ? q.missingIds : pieceIds.map(String);
  const pq = pricing.piecesQuote(q, set.items, wanted);
  if (!pq.ids.length) throw shopError("already_owned", 409);
  if (expectedPrice != null && Number.isFinite(Number(expectedPrice)) && pq.price > Number(expectedPrice)) throw shopError("price_changed", 409, { price: pq.price });
  const items = pq.ids.map((id) => set.items.find((it) => String(it.id) === id)).filter(Boolean);
  const res = await charge(userId, items, pq.price, {
    kind: pq.mode === "set" ? "set" : "pieces",
    source: "set",
    setKey: set.key,
    idempotencyKey: key,
    set: pq.mode === "set" ? set : null,
    opensLock: pq.opensLock,
    lockDiscount: q.discountPct,
    listAmount: pq.list,
    ownedDeducted: pq.mode === "set" ? q.ownedDeducted : 0,
    abTestId: q.abTestId,
    abArm: q.abArm,
    meta: { mode: pq.mode, discountPct: q.discountPct },
  });
  let equipped = null;
  let completed = [];
  if (!res.duplicate && q.partialPriceUntil) await closeLockOpenerRefund(userId, ctx.locks.get(set.key));
  if (!res.duplicate) {
    completed = res.completed || [];
    if (equip) equipped = await equipBought(userId, equip === "all" || equip === true ? pq.ids : (Array.isArray(equip) ? equip : []).map(String).filter((id) => pq.ids.includes(id)), { io });
    events.toUser(userId, "shop2:storefront", { reason: "purchase" });
  }
  return { ...res, set, quote: q, priced: pq, equipped, completed };
}

/** Clear every equip slot of `userId` that holds one of `itemIds` (conditional per slot). */
async function unequipIds(userId, itemIds) {
  const ids = new Set((itemIds || []).map(String));
  if (!ids.size) return;
  const look = await people.equippedSnapshot(userId).catch(() => ({}));
  const cols = people.equipColumns();
  for (const [cat, v] of Object.entries(look)) {
    if (!v || !ids.has(String(v)) || !cols[cat]) continue;
    await db.rows(db.real().from("users").update({ [cols[cat]]: null }).eq("id", userId).eq(cols[cat], v).select("id")).catch(() => []);
    if (cat === "voice_tile" || cat === "join_sound") require("../voiceCosmetics").resetAvailability();
  }
}

/** Refund inside the window: the purchase is paid, nothing from it is equipped or gifted. */
async function refund(userId, purchaseId, { now = Date.now(), io = null } = {}) {
  await db.ready();
  return descoin.runSerialized(userId, async () => {
    const p = await db.one(db.from("shop2_purchases").select("*").eq("id", purchaseId).eq("user_id", userId).maybeSingle());
    if (!p) throw shopError("not_found", 404);
    if (p.status !== "paid") throw shopError("already_refunded", 409);
    if (p.recipient_id || p.gift_id) throw shopError("refund_gift", 409);
    if (!p.refundable_until || time.ms(p.refundable_until) <= now) throw shopError("refund_window_closed", 409);
    const ids = (p.item_ids || []).map(String);
    const look = await people.equippedSnapshot(userId);
    if (Object.values(look).some((v) => v && ids.includes(String(v)))) throw shopError("refund_equipped", 409);
    const inv = await db.rows(db.real().from("user_inventory").select("id, item_id, acquired_via").eq("user_id", userId).in("item_id", ids));
    if (inv.some((r) => r.acquired_via !== "purchase")) throw shopError("refund_not_purchase", 409);
    const [claimed] = await db.rows(db.from("shop2_purchases").update({ status: "refunded", refunded_at: new Date(now).toISOString() }).eq("id", p.id).eq("status", "paid").select("*"));
    if (!claimed) throw shopError("already_refunded", 409);
    for (const r of inv) await db.rows(db.real().from("user_inventory").delete().eq("id", r.id).select("id"));
    // An equip that landed after the check above must not leave a refunded item on.
    await unequipIds(userId, ids);
    let balance = await descoin.getBalance(userId);
    if (Number(p.amount) > 0) balance = (await descoin.credit(userId, Number(p.amount), "shop_refund", { shop2: "refund", purchaseId: p.id, itemIds: ids, setKey: p.set_key || null })).balance;
    await db.rows(db.real().from("shop_purchases").update({ status: "refunded" }).eq("user_id", userId).in("item_id", ids).eq("status", "paid").select("id")).catch(() => []);
    if (p.stock_reserved && p.set_key) await releaseSetStock(p.set_key);
    if (p.set_key) {
      await sets.dropLock(userId, p.set_key, p.id);
      // The set is no longer complete: its completion title goes with the refund.
      const set = await catalog.getSet(p.set_key).catch(() => null);
      const ownedNow = await people.ownedIds(userId);
      if (set && set.items.some((it) => !ownedNow.has(String(it.id)))) {
        await db.rows(db.from("shop2_set_completions").delete().eq("user_id", userId).eq("set_key", p.set_key).select("set_key")).catch(() => []);
      }
    }
    if (p.kind === "night" && p.meta?.nightId != null) {
      await db.rows(db.from("shop2_night_flips").update({ bought_at: null }).eq("night_id", String(p.meta.nightId)).eq("user_id", userId).eq("card_index", Number(p.meta.cardIndex)).select("night_id")).catch(() => []);
    }
    await actions.closeUndo(userId, { type: "refund", purchaseId: p.id });
    await actions.log(userId, "refund", { purchaseId: p.id, amount: Number(p.amount) || 0, itemIds: ids });
    events.toAdmins("shop2:admin:sale", { sale: { id: p.id, kind: "refund", userId, setKey: p.set_key, itemIds: ids, amount: -(Number(p.amount) || 0), at: new Date(now).toISOString() } });
    events.toUser(userId, "shop2:storefront", { reason: "refund" });
    if (io) await people.broadcastProfile(io, userId);
    return { purchaseId: p.id, refunded: Number(p.amount) || 0, balance };
  });
}

async function listPurchases(userId, { limit = 50 } = {}) {
  await db.ready();
  return db.rows(db.from("shop2_purchases").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)).catch(() => []);
}

module.exports = { cleanKey, charge, completionsFor, buyItem, buySet, refund, equipBought, unequipIds, listPurchases, splitAmount, reserveSetStock, releaseSetStock };
