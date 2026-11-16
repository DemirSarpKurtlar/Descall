"use strict";

/**
 * Gifts: an item, a whole set (minus what the recipient already owns) or a revealed night
 * market card, with a message, an optional delivery time, anonymous sender, hidden contents.
 *
 * The sender pays when sending (one debit). The gift is `scheduled` until send_at, then
 * `delivered` (socket shop2:gift to the recipient). Opening grants the items. Until it is
 * opened the sender can recall it for a full refund. Recipient must be an accepted friend,
 * not blocked either way, and accept gifts (shop2_user_state.gift_privacy). Daily caps,
 * new-account limits and ring detection come from lib/shop2/giftRules.js.
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
const { checkGift, detectRing } = require("./giftRules");
const { shopError } = require("./storefrontService");
const shop = require("../shop");
const descoin = require("../descoin");

const OPEN_STATUSES = new Set(["scheduled", "delivered"]);

function cleanMessage(v, max) {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  if (!s) return null;
  return s.slice(0, Math.max(0, max));
}

/** Status at `now`: a scheduled gift whose time has come reads as delivered. */
function liveStatus(g, now = Date.now()) {
  if (g.status === "scheduled" && time.ms(g.send_at) != null && time.ms(g.send_at) <= now) return "delivered";
  return g.status;
}

function publicGift(g, { viewer, usersById = new Map(), cat = null, base = "", now = Date.now() } = {}) {
  const status = liveStatus(g, now);
  const isSender = viewer === g.from_user;
  const hidden = Boolean(g.hidden) && !isSender && !["opened", "equipped", "thanked"].includes(status);
  const from = g.anonymous && !isSender ? null : people.publicUser(usersById.get(String(g.from_user)));
  const items = (g.item_ids || []).map((id) => cat?.byId.get(String(id))).filter(Boolean);
  return {
    id: g.id,
    direction: isSender ? "sent" : "received",
    status,
    from,
    anonymous: Boolean(g.anonymous),
    to: people.publicUser(usersById.get(String(g.to_user))),
    kind: g.kind,
    setKey: hidden ? null : g.set_key || null,
    items: hidden ? [] : items.map((it) => catalog.publicItem(it, base)),
    itemCount: (g.item_ids || []).length,
    hidden: Boolean(g.hidden),
    message: g.message || null,
    amount: isSender ? Number(g.amount) || 0 : undefined,
    sendAt: g.send_at,
    createdAt: g.created_at,
    deliveredAt: g.delivered_at || (status === "delivered" ? g.send_at : null),
    openedAt: g.opened_at || null,
    equippedAt: g.equipped_at || null,
    thankedAt: g.thanked_at || null,
    recalledAt: g.recalled_at || null,
    canRecall: isSender && OPEN_STATUSES.has(status),
    canOpen: !isSender && status === "delivered",
  };
}

async function countSince(field, userId, sinceIso, extra = null) {
  let q = db.from("shop2_gifts").select("id, to_user, from_user, status").eq(field, userId).gte("created_at", sinceIso);
  const list = await db.rows(q).catch(() => []);
  return list.filter((g) => g.status !== "recalled" && g.status !== "blocked" && (!extra || extra(g))).length;
}

/** What `toUserId` would get and what it costs: item, set (recipient-owned pieces deducted) or night card. */
async function resolveGift(senderId, toUserId, { itemId, setKey, nightCardIndex }) {
  const cat = await catalog.getCatalog();
  const recipientOwned = await people.ownedIds(toUserId);
  if (nightCardIndex != null) {
    const night = require("./night");
    const { night: n, card, item } = await night.revealedCard(senderId, nightCardIndex);
    if (recipientOwned.has(String(item.id))) throw shopError("recipient_owns", 409);
    return { kind: "night", items: [item], price: card.price, list: card.listPrice, setKey: null, meta: { nightId: n.id, cardIndex: card.index, discountPct: card.discountPct } };
  }
  if (setKey) {
    const ctx = await sets.contextFor(senderId);
    const set = ctx.sets.find((s) => s.key === setKey);
    if (!set || !set.items.length) throw shopError("not_found", 404);
    const live = sets.discountFor(set, senderId, ctx.tests, ctx.limits);
    const q = pricing.setQuote({ pieces: set.items.map((it) => ({ id: it.id, price: it.price })), ownedIds: recipientOwned, discountPct: live.pct, onSale: sets.onSale(set) });
    if (!q.setRateOpen) throw shopError("not_available", 410);
    if (q.complete) throw shopError("recipient_owns", 409);
    const items = set.items.filter((it) => q.missingIds.includes(String(it.id)));
    return { kind: "set", items, price: q.yourPrice, list: q.remainingSum, setKey: set.key, ownedDeducted: q.ownedDeducted, meta: { discountPct: q.discountPct } };
  }
  const item = cat.byId.get(String(itemId));
  if (!item || !catalog.sellable(item)) throw shopError("not_found", 404);
  if (recipientOwned.has(String(item.id))) throw shopError("recipient_owns", 409);
  return { kind: "item", items: [item], price: item.price, list: item.price, setKey: item.setKey || null, meta: {} };
}

/** Pre-check for the gift sheet: price for this recipient, what they own, whether it is allowed. */
async function quote(senderId, body) {
  const toUserId = String(body?.toUserId || "");
  const check = await allowed(senderId, toUserId, body);
  if (!check.ok) return { ok: false, code: check.code, vars: check.vars || null };
  const r = await resolveGift(senderId, toUserId, body);
  return { ok: true, kind: r.kind, price: r.price, listPrice: r.list, itemIds: r.items.map((it) => it.id), ownedDeducted: r.ownedDeducted || 0 };
}

async function allowed(senderId, toUserId, body, now = Date.now()) {
  const limits = await config.getLimits();
  if (!toUserId || toUserId === senderId) return { ok: false, code: "gift_self" };
  const [sender, recipient] = await Promise.all([people.getUser(senderId), people.getUser(toUserId)]);
  if (!recipient) return { ok: false, code: "recipient_not_found" };
  if (await people.blockedEitherWay(senderId, toUserId)) return { ok: false, code: "recipient_unavailable" };
  if (!(await people.isFriend(senderId, toUserId))) return { ok: false, code: "recipient_not_friend" };
  const st = await people.getState(toUserId);
  if (st.gift_privacy === "nobody") return { ok: false, code: "recipient_no_gifts" };
  const day = time.dayKey(now);
  const since = time.iso(time.dayStartMs(day));
  const [sentToday, pairToday, recvToday] = await Promise.all([
    countSince("from_user", senderId, since),
    countSince("from_user", senderId, since, (g) => g.to_user === toUserId),
    countSince("to_user", toUserId, since),
  ]);
  const kind = body?.setKey ? "set" : body?.nightCardIndex != null ? "night" : "item";
  return checkGift({
    limits: limits.gifts,
    now,
    senderId,
    recipientId: toUserId,
    senderCreatedAt: sender?.created_at || null,
    kind,
    sentToday,
    sentToRecipientToday: pairToday,
    recipientReceivedToday: recvToday,
    message: typeof body?.message === "string" ? body.message.trim() : null,
    sendAt: body?.sendAt || null,
  });
}

async function send(senderId, body, { now = Date.now(), base = "" } = {}) {
  const limits = await config.getLimits();
  const toUserId = String(body?.toUserId || "");
  const idempotencyKey = require("./purchases").cleanKey(body?.idempotencyKey);
  if (idempotencyKey) {
    const dup = await db.one(db.from("shop2_gifts").select("*").eq("from_user", senderId).eq("idempotency_key", idempotencyKey).maybeSingle()).catch(() => null);
    if (dup) return { duplicate: true, gift: dup };
  }
  if (!body?.itemId && !body?.setKey && body?.nightCardIndex == null) throw shopError("item_required", 400);
  const check = await allowed(senderId, toUserId, body, now);
  if (!check.ok) {
    if (["gift_daily_cap", "gift_recipient_cap", "gift_receive_cap", "gift_new_account", "gift_new_account_set"].includes(check.code)) {
      await logBlocked(senderId, toUserId, check.code, now);
    }
    throw shopError(check.code, check.code === "recipient_not_found" ? 404 : 403, check.vars);
  }
  const sendAt = body?.sendAt ? Math.max(now, time.ms(body.sendAt)) : now;
  const r = await resolveGift(senderId, toUserId, body);
  const message = cleanMessage(body?.message, limits.gifts.maxMessage);
  const giftId = require("crypto").randomUUID();

  // Pay now (one debit), grant on open.
  const res = await descoin.runSerialized(senderId, async () => {
    let balance = null;
    if (r.price > 0) {
      try {
        balance = (await descoin.debit(senderId, r.price, "shop_purchase", { shop2: "gift", giftId, to: toUserId, itemIds: r.items.map((it) => it.id), setKey: r.setKey })).balance;
      } catch (err) {
        if (err.message === "INSUFFICIENT_BALANCE") throw shopError("insufficient_balance", 402);
        if (err.code === "WALLET_FROZEN") throw shopError("wallet_frozen", 403);
        throw err;
      }
    }
    const row = {
      id: giftId,
      from_user: senderId,
      to_user: toUserId,
      kind: r.kind,
      set_key: r.setKey,
      item_ids: r.items.map((it) => it.id),
      amount: r.price,
      list_amount: r.list,
      message,
      anonymous: Boolean(body?.anonymous),
      hidden: Boolean(body?.hidden),
      send_at: new Date(sendAt).toISOString(),
      status: sendAt > now ? "scheduled" : "delivered",
      delivered_at: sendAt > now ? null : new Date(now).toISOString(),
      idempotency_key: idempotencyKey,
      meta: r.meta || {},
      flags: {},
      created_at: new Date(now).toISOString(),
    };
    try {
      await db.one(db.from("shop2_gifts").insert(row).select("*").single());
    } catch (err) {
      if (r.price > 0) await descoin.credit(senderId, r.price, "shop_refund", { shop2: "gift", giftId, reason: "gift_insert_failed" }).catch(() => {});
      throw err;
    }
    return { row, balance };
  });
  const row = res.row;
  if (r.kind === "night" && r.meta?.nightId) {
    await db.rows(db.from("shop2_night_flips").update({ bought_at: new Date(now).toISOString() }).eq("night_id", String(r.meta.nightId)).eq("user_id", senderId).eq("card_index", Number(r.meta.cardIndex)).select("night_id")).catch(() => []);
  }
  // Ring detection.
  let ring = null;
  if (limits.gifts.ringDetection) {
    const since = time.iso(now - limits.gifts.ringWindowDays * time.DAY_MS);
    const recent = await db.rows(db.from("shop2_gifts").select("id, from_user, to_user, amount, created_at, status").gte("created_at", since)).catch(() => []);
    const edges = recent.filter((g) => g.id !== giftId && g.status !== "recalled").map((g) => ({ from: g.from_user, to: g.to_user, at: g.created_at, amount: g.amount }));
    ring = detectRing(edges, { from: senderId, to: toUserId, amount: r.price }, { windowDays: limits.gifts.ringWindowDays, now });
    if (ring.ring) {
      await db.rows(db.from("shop2_gifts").update({ flags: { ring: true, cycle: ring.cycle, pingPong: ring.pingPong } }).eq("id", giftId).select("id")).catch(() => []);
      await db.one(db.from("shop2_gift_flags").insert({ gift_id: giftId, kind: ring.pingPong && !ring.cycle ? "ping_pong" : "ring", users: ring.cycle || [senderId, toUserId], amount: ring.amount, status: "open", created_at: new Date(now).toISOString() }).select("*").single()).catch(() => null);
      events.toAdmins("shop2:admin:sale", { flag: { kind: "gift_ring", giftId, users: ring.cycle || [senderId, toUserId] } });
    }
  }
  await actions.log(senderId, "gift_send", { giftId, to: toUserId, kind: r.kind, amount: r.price, sendAt: row.send_at }, { undo: { type: "gift_recall", giftId }, undoMinutes: limits.purchases.actionUndoMinutes });
  events.toAdmins("shop2:admin:sale", { sale: { id: giftId, kind: "gift", userId: senderId, setKey: r.setKey, itemIds: row.item_ids, amount: r.price, listAmount: r.list, ownedDeducted: r.ownedDeducted || 0, gift: true, at: row.created_at } });
  if (row.status === "delivered") await notifyDelivered(row, { base });
  return { duplicate: false, gift: row, balance: res.balance, ring: ring && ring.ring ? { flagged: true } : null };
}

async function logBlocked(senderId, toUserId, code, now) {
  await db.one(db.from("shop2_gifts").insert({ from_user: senderId, to_user: toUserId, kind: "blocked", item_ids: [], amount: 0, status: "blocked", meta: { code }, flags: {}, send_at: new Date(now).toISOString(), created_at: new Date(now).toISOString() }).select("id").single()).catch(() => null);
}

async function notifyDelivered(row, { base = "" } = {}) {
  const [cat, usersById] = await Promise.all([catalog.getCatalog(), people.getUsers([row.from_user, row.to_user])]);
  events.toUser(row.to_user, "shop2:gift", { kind: "received", gift: publicGift(row, { viewer: row.to_user, usersById, cat, base }) });
}

async function getGift(id) {
  await db.ready();
  return db.one(db.from("shop2_gifts").select("*").eq("id", id).maybeSingle());
}

async function list(userId, { base = "", now = Date.now() } = {}) {
  await db.ready();
  const [sent, received] = await Promise.all([
    db.rows(db.from("shop2_gifts").select("*").eq("from_user", userId).order("created_at", { ascending: false }).limit(100)),
    db.rows(db.from("shop2_gifts").select("*").eq("to_user", userId).order("created_at", { ascending: false }).limit(100)),
  ]);
  const visibleReceived = received.filter((g) => g.status !== "blocked" && g.status !== "recalled" && liveStatus(g, now) !== "scheduled");
  const visibleSent = sent.filter((g) => g.status !== "blocked");
  const ids = [...visibleSent, ...visibleReceived].flatMap((g) => [g.from_user, g.to_user]);
  const [usersById, cat] = await Promise.all([people.getUsers(ids), catalog.getCatalog()]);
  const limits = await config.getLimits();
  const since = time.iso(time.dayStartMs(time.dayKey(now)));
  const sentToday = visibleSent.filter((g) => g.created_at >= since && g.status !== "recalled").length;
  return {
    sent: visibleSent.map((g) => publicGift(g, { viewer: userId, usersById, cat, base, now })),
    received: visibleReceived.map((g) => publicGift(g, { viewer: userId, usersById, cat, base, now })),
    limits: { perDay: limits.gifts.perDay, sentToday, left: Math.max(0, limits.gifts.perDay - sentToday), maxMessage: limits.gifts.maxMessage, maxScheduleDays: limits.gifts.maxScheduleDays, paused: !limits.gifts.enabled || limits.gifts.frozen },
  };
}

async function recall(userId, giftId, { now = Date.now() } = {}) {
  const g = await getGift(giftId);
  if (!g || g.from_user !== userId) throw shopError("not_found", 404);
  if (!OPEN_STATUSES.has(g.status)) throw shopError("gift_not_recallable", 409);
  return descoin.runSerialized(userId, async () => {
    const [claimed] = await db.rows(db.from("shop2_gifts").update({ status: "recalled", recalled_at: new Date(now).toISOString() }).eq("id", giftId).in("status", ["scheduled", "delivered"]).select("*"));
    if (!claimed) throw shopError("gift_not_recallable", 409);
    let balance = await descoin.getBalance(userId);
    if (Number(g.amount) > 0) balance = (await descoin.credit(userId, Number(g.amount), "shop_refund", { shop2: "gift_recall", giftId })).balance;
    if (g.kind === "night" && g.meta?.nightId) {
      await db.rows(db.from("shop2_night_flips").update({ bought_at: null }).eq("night_id", String(g.meta.nightId)).eq("user_id", userId).eq("card_index", Number(g.meta.cardIndex)).select("night_id")).catch(() => []);
    }
    await actions.closeUndo(userId, { type: "gift_recall", giftId });
    await actions.log(userId, "gift_recall", { giftId, refunded: Number(g.amount) || 0 });
    events.toUser(g.to_user, "shop2:gift", { kind: "recalled", giftId });
    return { giftId, refunded: Number(g.amount) || 0, balance };
  });
}

/** Open: grant every item (anything the recipient bought meanwhile is refunded to the sender). */
async function open(userId, giftId, { equip = false, io = null, now = Date.now(), base = "" } = {}) {
  const g = await getGift(giftId);
  if (!g || g.to_user !== userId) throw shopError("not_found", 404);
  if (liveStatus(g, now) !== "delivered") throw shopError(g.status === "opened" ? "gift_opened" : "gift_not_ready", 409);
  const [claimed] = await db.rows(db.from("shop2_gifts").update({ status: "opened", opened_at: new Date(now).toISOString(), delivered_at: g.delivered_at || g.send_at }).eq("id", giftId).in("status", ["scheduled", "delivered"]).select("*"));
  if (!claimed) throw shopError("gift_opened", 409);
  const cat = await catalog.getCatalog();
  const owned = await people.ownedIds(userId);
  const granted = [];
  const already = [];
  for (const id of g.item_ids || []) {
    if (owned.has(String(id))) {
      already.push(String(id));
      continue;
    }
    const row = await shop.grantItem(userId, id, { acquiredVia: "gift", giftedBy: g.from_user, giftMessage: g.message || null });
    if (row) granted.push(String(id));
    else already.push(String(id));
  }
  // Pay back the sender's share of pieces the recipient already had (bought them meanwhile).
  if (already.length && Number(g.amount) > 0) {
    const items = (g.item_ids || []).map((id) => cat.byId.get(String(id))).filter(Boolean);
    const shares = require("./purchases").splitAmount(items, Number(g.amount));
    const back = shares.filter((s) => already.includes(String(s.item.id))).reduce((a, s) => a + s.amount, 0);
    if (back > 0) await descoin.credit(g.from_user, back, "shop_refund", { shop2: "gift_overlap", giftId, itemIds: already }).catch((e) => console.error("[shop2] gift overlap refund failed:", e?.message || e));
  }
  // Receipts for the desk analytics (paid by the sender).
  if (granted.length) {
    const items = granted.map((id) => cat.byId.get(id)).filter(Boolean);
    const receipts = require("./purchases").splitAmount(items, Number(g.amount) || 0).map((x) => ({ user_id: g.from_user, item_id: x.item.id, amount_descoin: x.amount, status: "paid" }));
    await db.real().from("shop_purchases").insert(receipts).then(() => {}, () => {});
    // Gift popups from the old shop must not fire again for these rows.
    try {
      const inv = await db.rows(db.real().from("user_inventory").select("id").eq("user_id", userId).in("item_id", granted));
      await shop.markGiftsNotified(inv.map((r) => r.id));
    } catch {
      /* popup flag only */
    }
  }
  let equipped = null;
  if (equip && granted.length) {
    equipped = await require("./purchases").equipBought(userId, granted, { io });
    await db.rows(db.from("shop2_gifts").update({ status: "equipped", equipped_at: new Date(now).toISOString() }).eq("id", giftId).select("id"));
  }
  if (g.set_key) await require("./sets").recordCompletions(userId, await people.ownedIds(userId), [await catalog.getSet(g.set_key)].filter(Boolean));
  events.toUser(g.from_user, "shop2:gift", { kind: equipped ? "equipped" : "opened", giftId });
  events.toUser(userId, "shop2:storefront", { reason: "gift" });
  return { giftId, granted, alreadyOwned: already, equipped, items: granted.map((id) => catalog.publicItem(cat.byId.get(id), base)).filter(Boolean) };
}

/** Recipient equipped a gift later (from the inventory), or says thanks. */
async function mark(userId, giftId, what, { now = Date.now() } = {}) {
  const g = await getGift(giftId);
  if (!g || g.to_user !== userId) throw shopError("not_found", 404);
  if (!["opened", "equipped", "thanked"].includes(g.status)) throw shopError("gift_not_opened", 409);
  const patch = what === "thanked" ? { status: "thanked", thanked_at: new Date(now).toISOString() } : { status: g.status === "thanked" ? "thanked" : "equipped", equipped_at: new Date(now).toISOString() };
  await db.rows(db.from("shop2_gifts").update(patch).eq("id", giftId).select("id"));
  events.toUser(g.from_user, "shop2:gift", { kind: what, giftId });
  return { giftId, status: patch.status };
}

/** Scheduler: deliver due gifts. */
async function deliverDue({ now = Date.now() } = {}) {
  await db.ready();
  const due = await db.rows(db.from("shop2_gifts").select("*").eq("status", "scheduled").lte("send_at", new Date(now).toISOString()).limit(200)).catch(() => []);
  let n = 0;
  for (const g of due) {
    const [row] = await db.rows(db.from("shop2_gifts").update({ status: "delivered", delivered_at: new Date(now).toISOString() }).eq("id", g.id).eq("status", "scheduled").select("*"));
    if (row) {
      n += 1;
      await notifyDelivered(row);
    }
  }
  return n;
}

/**
 * Gift sheet recipient list: accepted friends with what they own of the item / set ("3/8"),
 * whether it is on their wishlist (they come first), and whether they can receive it now.
 */
async function recipients(senderId, { itemId = null, setKey = null } = {}) {
  const friendIds = (await people.friendIds(senderId)).slice(0, 300);
  if (!friendIds.length) return { recipients: [] };
  const cat = await catalog.getCatalog();
  const set = setKey ? await catalog.getSet(setKey) : null;
  const targetIds = set ? set.items.map((it) => String(it.id)) : itemId ? [String(itemId)] : [];
  const [usersById, inv, wishes, states] = await Promise.all([
    people.getUsers(friendIds),
    targetIds.length ? db.rows(db.real().from("user_inventory").select("user_id, item_id").in("user_id", friendIds).in("item_id", targetIds)).catch(() => []) : [],
    db.rows(db.from("shop2_wishlist").select("user_id, item_id").in("user_id", friendIds)).catch(() => []),
    db.rows(db.from("shop2_user_state").select("user_id, gift_privacy").in("user_id", friendIds)).catch(() => []),
  ]);
  const noGifts = new Set(states.filter((x) => x.gift_privacy === "nobody").map((x) => x.user_id));
  const wishKey = set ? `set:${set.key}` : itemId ? String(itemId) : null;
  const out = [];
  for (const id of friendIds) {
    const u = usersById.get(String(id));
    if (!u) continue;
    const owned = inv.filter((r) => r.user_id === id).length;
    const wished = wishKey ? wishes.some((w) => w.user_id === id && (w.item_id === wishKey || (set && targetIds.includes(String(w.item_id))))) : false;
    const blocked = await people.blockedEitherWay(senderId, id);
    out.push({
      user: people.publicUser(u),
      owned,
      total: targetIds.length,
      ownsAll: targetIds.length > 0 && owned >= targetIds.length,
      wishlisted: wished,
      canReceive: !blocked && !noGifts.has(id) && !(targetIds.length > 0 && owned >= targetIds.length),
      wishlistCount: wishes.filter((w) => w.user_id === id).length,
    });
  }
  out.sort((a, b) => Number(b.wishlisted) - Number(a.wishlisted) || Number(b.canReceive) - Number(a.canReceive) || String(a.user.username).localeCompare(String(b.user.username)));
  void cat;
  return { recipients: out };
}

async function setPrivacy(userId, value) {
  const v = value === "nobody" ? "nobody" : "friends";
  await people.patchState(userId, { gift_privacy: v });
  return { giftPrivacy: v };
}

module.exports = { liveStatus, publicGift, quote, send, list, recall, open, mark, deliverDue, setPrivacy, getGift, allowed, recipients };
