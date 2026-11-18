"use strict";

/**
 * End-of-call DesCoin summary: runtime store (in memory, one Node process).
 *
 * A session is one user in one call context (DM peer, group call, server voice seat),
 * from join to leave. It is keyed by user, not socket, so a socket that drops mid-call
 * keeps the session; it ends when the call / seat ends (the server's own leave paths:
 * finishDmCall, removeUserFromGroupCall / endGroupCall, removeFromVoice).
 *
 * On end, a session that earned DesCoin is summarised and sent as
 * `descoin:call-summary`: to the socket that left when that socket is still connected
 * ("self"), else to every socket of the user ("server"; the client shows it only on a
 * device that was in the call, deduped by sessionId). With no socket online the
 * payload waits (10 min) and goes out on the next connect.
 *
 * Pure rules: lib/callCoinSummary.js.
 */

const supabase = require("../db/supabase");
const summary = require("./callCoinSummary");

const STALE_MS = 12 * 3600_000;
const PENDING_TTL_MS = 10 * 60_000;
const SWEEP_MS = 10 * 60_000;

const sessions = new Map(); // `${userId}|${key}` -> session
const pending = new Map(); // userId -> [{ payload, at }]
let sweepTimer = null;

const id = (key, userId) => `${String(userId)}|${key}`;

function ensureSweeper() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => sweep(), SWEEP_MS);
  sweepTimer.unref?.();
}

/** Drops sessions with no activity for 12 h (a leave that never reached us) and old pending payloads. */
function sweep(now = Date.now()) {
  for (const [k, s] of sessions) {
    if (now - (s.lastBeatAt || s.startedAt) > STALE_MS) sessions.delete(k);
  }
  for (const [uid, list] of pending) {
    const keep = list.filter((p) => now - p.at < PENDING_TTL_MS);
    if (keep.length) pending.set(uid, keep);
    else pending.delete(uid);
  }
}

/** Start (or keep) the session for a join. `meta` keeps display hints such as serverId / channelName. */
function start(userId, ctx, { at = Date.now(), meta = null } = {}) {
  const key = summary.contextKey(ctx);
  if (!userId || !key) return null;
  const k = id(key, userId);
  let s = sessions.get(k);
  if (!s) {
    s = summary.createSession({ userId, key, startedAt: at });
    if (!s) return null;
    s.meta = {};
    sessions.set(k, s);
    ensureSweeper();
  }
  if (meta && typeof meta === "object") s.meta = { ...s.meta, ...meta };
  return s;
}

function get(userId, ctx) {
  const key = summary.contextKey(ctx);
  return key ? sessions.get(id(key, userId)) || null : null;
}

/** Session for a heartbeat; started lazily when the join was missed (server restart). */
function ensure(userId, ctx, opts) {
  return get(userId, ctx) || start(userId, ctx, opts);
}

/** One accepted heartbeat with what creditCapped returned. */
function recordBeat(userId, ctx, beat = {}, opts = {}) {
  const s = ensure(userId, ctx, opts);
  if (!s) return null;
  return summary.addBeat(s, beat);
}

function take(userId, ctx) {
  const key = summary.contextKey(ctx);
  if (!key) return null;
  const k = id(key, userId);
  const s = sessions.get(k) || null;
  if (s) sessions.delete(k);
  return s;
}

/**
 * Carry a session to another context (server voice: moved by a moderator or the AFK move).
 * A move is not the end of the call, so no summary pops; earnings keep adding up.
 */
function move(userId, fromCtx, toCtx, { meta = null } = {}) {
  const toKey = summary.contextKey(toCtx);
  if (!userId || !toKey) return null;
  const s = take(userId, fromCtx);
  if (!s) return start(userId, toCtx, { meta });
  const k = id(toKey, userId);
  const existing = sessions.get(k);
  if (existing) {
    if (meta && typeof meta === "object") existing.meta = { ...existing.meta, ...meta };
    return existing;
  }
  const parsed = summary.parseContextKey ? summary.parseContextKey(toKey) : null;
  s.key = toKey;
  if (parsed) {
    s.context = parsed.context;
    s.targetId = parsed.targetId;
  }
  if (meta && typeof meta === "object") s.meta = { ...(s.meta || {}), ...meta };
  sessions.set(k, s);
  return s;
}

async function safe(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** Only what the user already saw in the call: names and pictures. */
async function resolveDisplay(session) {
  const meta = session.meta || {};
  if (session.context === "dm") {
    const { getCachedPublicUser } = require("./userProfile");
    const cached = getCachedPublicUser(session.targetId);
    if (cached) return { id: session.targetId, name: cached.displayName || cached.username || null, avatarUrl: cached.avatarUrl || null };
    const row = await safe(async () => {
      const { data } = await supabase.from("users").select("id, username, display_name, avatar_url").eq("id", session.targetId).maybeSingle();
      return data;
    }, null);
    return { id: session.targetId, name: row?.display_name || row?.username || null, avatarUrl: row?.avatar_url || null };
  }
  if (session.context === "group") {
    const row = await safe(async () => {
      const { data } = await supabase.from("groups").select("id, name, avatar_url").eq("id", session.targetId).maybeSingle();
      return data;
    }, null);
    return { id: session.targetId, name: row?.name || meta.name || null, avatarUrl: row?.avatar_url || null };
  }
  const serverId = meta.serverId || null;
  const row = serverId
    ? await safe(async () => {
        const { data } = await supabase.from("servers").select("id, name, icon_url").eq("id", serverId).maybeSingle();
        return data;
      }, null)
    : null;
  return {
    id: session.targetId,
    name: meta.channelName || null,
    channelName: meta.channelName || null,
    serverId,
    serverName: row?.name || null,
    avatarUrl: row?.icon_url || null,
  };
}

async function loadFeatured(userId, balance) {
  const shop = require("./shop");
  let assetBase = "";
  try {
    assetBase = require("./edgeConfig").edgePublicBase() || "";
  } catch {
    assetBase = "";
  }
  const [items, owned] = await Promise.all([
    safe(() => shop.listActiveItems({ assetBase }), []),
    safe(async () => {
      const { data, error } = await supabase.from("user_inventory").select("item_id").eq("user_id", userId);
      if (error) throw error;
      return (data || []).map((r) => r.item_id);
    }, null),
  ]);
  // Without the inventory we could suggest something the user already owns: show none.
  if (owned == null) return null;
  // 1. Market 2.0: one of today's storefront cards (the shop sells s2 items only there).
  const fromStorefront = await safe(() => loadStorefrontFeatured(userId, { owned, balance, assetBase }), null);
  if (fromStorefront) return fromStorefront;
  // 2. "Tüm ürünler" is browse only: only rows an admin opened for direct sale can be bought.
  const buyable = (items || []).filter((it) => it && it.direct_sale === true);
  return summary.pickFeaturedItem(buyable, { ownedIds: owned, balance, now: Date.now() });
}

/** Today's storefront of the user (stored, else computed the same way without saving it). */
async function loadStorefrontFeatured(userId, { owned, balance, assetBase = "" }) {
  const sfs = require("./shop2/storefrontService");
  const catalog = require("./shop2/catalog");
  const sdb = require("./shop2/db");
  const [p, cat, wishes] = await Promise.all([
    sfs.preview(userId, "today"),
    catalog.getCatalog(),
    safe(async () => (await sdb.rows(sdb.from("shop2_wishlist").select("item_id").eq("user_id", userId))).map((r) => r.item_id), []),
  ]);
  // Before the s2 catalog exists the storefront draws from the classic rows: keep the
  // classic pick (sale / limited / timed) then.
  if (cat.legacyPool) return null;
  const slots = (p?.storefront?.slots || []).map((s) => ({ slot: s.slot, item: cat.byId.get(String(s.itemId)) || null }));
  return summary.pickStorefrontItem(slots, { ownedIds: owned, wishIds: wishes, balance, publicItem: (it) => catalog.publicItem(it, assetBase) });
}

/** Builds the payload with fresh balance, today's totals, streak and featured item. */
async function buildPayload(session, { endedAt = Date.now(), origin = "server" } = {}) {
  const descoin = require("./descoin");
  const [balance, today, streakDays, display] = await Promise.all([
    safe(() => descoin.getBalance(session.userId), 0),
    safe(() => descoin.getTodayEarnings(session.userId), { voice: 0, screenshare: 0, global: summary.earnedTotal(session) }),
    safe(() => descoin.getCallStreakDays(session.userId), 1),
    safe(() => resolveDisplay(session), {}),
  ]);
  const featuredItem = await safe(() => loadFeatured(session.userId, balance), null);
  const caps = {
    voice: descoin.CAPS.voice_activity.perDay,
    screenshare: descoin.CAPS.screenshare_activity.perDay,
    global: descoin.GLOBAL_DAILY_CAP,
  };
  return summary.buildSummaryPayload(session, {
    endedAt,
    origin,
    display,
    balance,
    today,
    todayCap: descoin.GLOBAL_DAILY_CAP,
    caps,
    streakDays,
    featuredItem,
  });
}

function userSocketCount(io, userId) {
  return io?.sockets?.adapter?.rooms?.get?.(`user:${userId}`)?.size || 0;
}

function socketConnected(io, socketId) {
  if (!socketId) return false;
  const map = io?.sockets?.sockets;
  if (!map?.get) return true; // test doubles without a socket map: trust the caller
  return Boolean(map.get(socketId)?.connected ?? map.get(socketId));
}

function deliver(io, userId, payload, originSocketId) {
  if (originSocketId && socketConnected(io, originSocketId)) {
    io.to(originSocketId).emit("descoin:call-summary", { ...payload, origin: "self" });
    return "self";
  }
  const out = { ...payload, origin: "server" };
  const hasRoomInfo = Boolean(io?.sockets?.adapter?.rooms?.get);
  if (hasRoomInfo && userSocketCount(io, userId) === 0) {
    const list = pending.get(String(userId)) || [];
    list.push({ payload: out, at: Date.now() });
    pending.set(String(userId), list.slice(-5));
    ensureSweeper();
    return "pending";
  }
  io.to(`user:${userId}`).emit("descoin:call-summary", out);
  return "server";
}

/**
 * End the user's session for this context and send the summary when it earned DesCoin.
 * Never throws (a summary must not break a leave path). Resolves to the payload or null.
 */
async function finish(io, userId, ctx, { originSocketId = null, endedAt = Date.now() } = {}) {
  const session = take(userId, ctx);
  if (!session || !summary.shouldEmit(session)) return null;
  try {
    const payload = await buildPayload(session, { endedAt, origin: originSocketId ? "self" : "server" });
    deliver(io, session.userId, payload, originSocketId);
    return payload;
  } catch (err) {
    console.warn("[call-coin] summary failed:", err?.message || err);
    return null;
  }
}

/** On connect: summaries that ended while the user had no socket. */
function flushPending(socket, userId) {
  const list = pending.get(String(userId));
  if (!list?.length) return 0;
  pending.delete(String(userId));
  const now = Date.now();
  let n = 0;
  for (const p of list) {
    if (now - p.at >= PENDING_TTL_MS) continue;
    socket.emit("descoin:call-summary", p.payload);
    n += 1;
  }
  return n;
}

/** Ledger meta for a credit in this session (receipt in the wallet history). */
function ledgerMeta(session) {
  return session ? { callSession: session.id, receipt: session.receipt } : {};
}

function _reset() {
  sessions.clear();
  pending.clear();
}

module.exports = {
  start,
  move,
  get,
  ensure,
  recordBeat,
  take,
  finish,
  flushPending,
  buildPayload,
  loadFeatured,
  ledgerMeta,
  sweep,
  _sessions: sessions,
  _pending: pending,
  _reset,
};
