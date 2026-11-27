"use strict";

/**
 * DesCoin earning heartbeat (`descoin:heartbeat`), sent every ~16 s by an active
 * call's UI while the mic is genuinely producing speech (or a screen share is on).
 * Every check is against server-owned state; the client can only ever *ask* to be
 * credited, never assert the amount or the fact.
 *
 * Contexts:
 *   dm      active DM call with the peer; screen share needs the in-memory DM share flag
 *   group   in the active group call with at least one other participant; screen share
 *           needs the group's screen-share session
 *   server  (owner approved, Nov 2026) a real seat in that server voice channel held by
 *           this socket, not server-muted / deafened / AFK-locked / self-muted / timed
 *           out, at least one other seated member; screen share only while sharing
 * Same caps (lib/descoin.js), same 15 s throttle, same anti-bot observe.
 *
 * Every accepted beat also feeds the end-of-call summary session
 * (lib/callCoinSessions.js) and tags the ledger row with the call's receipt.
 */

const descoin = require("../lib/descoin");
const descoinAntibot = require("../lib/descoinAntibot");
const callCoinSessions = require("../lib/callCoinSessions");
const ve = require("../lib/serverVoiceEnforce");
const { isActiveDmCall } = require("../lib/dmCallLog");
const { activeGroupCalls, screenShareSessions } = require("../runtime/sharedState");
const { getActiveServerTimeout } = require("../lib/serverTimeoutState");

const MIN_INTERVAL_MS = 15_000;
const TIMEOUT_CACHE_MS = 30_000;
const lastAt = new Map(); // `${userId}:${type}` -> ms
const timeoutCache = new Map(); // `${serverId}|${userId}` -> { at, timedOut }

async function isTimedOut(serverId, userId) {
  const key = `${serverId}|${userId}`;
  const hit = timeoutCache.get(key);
  if (hit && Date.now() - hit.at < TIMEOUT_CACHE_MS) return hit.timedOut;
  let timedOut = true; // fail closed: no proof, no coins
  try {
    timedOut = Boolean(await getActiveServerTimeout(serverId, userId));
  } catch {
    timedOut = true;
  }
  timeoutCache.set(key, { at: Date.now(), timedOut });
  if (timeoutCache.size > 5000) timeoutCache.delete(timeoutCache.keys().next().value);
  return timedOut;
}

/**
 * Server voice seat check (sync part). Returns null when the seat may not earn, else
 * { serverId, channelId, channelName, others }.
 */
function serverSeatCheck({ userId, channelId, socketId, type }) {
  if (typeof channelId !== "string" || !channelId) return null;
  const cid = ve.normalizeId(channelId);
  const found = ve.findSeat(cid, userId);
  if (!found?.seat || !found.call) return null;
  // The seat belongs to the socket that joined it (V9): another device cannot farm on it.
  const { seatOwnerOf } = require("./serverVoiceHandlers");
  const owner = seatOwnerOf(cid, userId);
  if (owner && socketId && owner !== socketId) return null;
  if (!ve.seatCanEarn(found.seat, type)) return null;
  const others = [];
  for (const [key, member] of found.call.participants.entries()) {
    const uid = String(member?.id ?? key);
    if (uid.toLowerCase() !== String(userId).toLowerCase()) others.push(uid);
  }
  if (others.length < 1) return null;
  return { serverId: String(found.call.serverId), channelId: cid, channelName: found.call.channelName || null, others };
}

/**
 * Decide whether this heartbeat may earn. Returns null or
 * { ctx, ctxKey, others, meta } (meta = display hints for the summary session).
 */
async function validateHeartbeat({ userId, socketId, payload, dmScreenSharingUsers }) {
  const { context, peerId, groupId, channelId, type } = payload || {};
  if (type !== "voice" && type !== "screenshare") return null;
  if (context === "dm" && typeof peerId === "string" && peerId) {
    const ok = isActiveDmCall(userId, peerId) && (type === "voice" || Boolean(dmScreenSharingUsers?.has(userId)));
    if (!ok) return null;
    return { ctx: { context: "dm", peerId }, ctxKey: `dm:${[userId, peerId].sort().join(":")}`, others: [peerId], meta: null };
  }
  if (context === "group" && typeof groupId === "string" && groupId) {
    const call = activeGroupCalls.get(groupId);
    const inCall = Boolean(call?.participants?.has(userId) && call.participants.size >= 2);
    if (!inCall) return null;
    if (type === "screenshare" && !screenShareSessions.has(`${groupId}:${userId}`)) return null;
    const others = [...(call.participants || [])].filter((id) => id !== userId);
    return { ctx: { context: "group", groupId }, ctxKey: `group:${groupId}`, others, meta: null };
  }
  if (context === "server") {
    const seat = serverSeatCheck({ userId, channelId, socketId, type });
    if (!seat) return null;
    if (await isTimedOut(seat.serverId, userId)) return null;
    // Re-check after the await: the seat may have gone meanwhile.
    if (!serverSeatCheck({ userId, channelId, socketId, type })) return null;
    return {
      ctx: { context: "server", channelId: seat.channelId },
      ctxKey: `server:${seat.channelId}`,
      others: seat.others,
      meta: { serverId: seat.serverId, channelName: seat.channelName },
    };
  }
  return null;
}

/** Handle one heartbeat. Resolves to the credit result or null when ignored. */
async function handleHeartbeat({ socket, userId, payload = {}, dmScreenSharingUsers = null }) {
  const { type, speaking, antibot } = payload || {};
  if (type !== "voice" && type !== "screenshare") return null;
  if (type === "voice" && !speaking) return null; // only pay for actual talking, not idle presence
  const ok = await validateHeartbeat({ userId, socketId: socket?.id || null, payload, dmScreenSharingUsers });
  if (!ok) return null;
  // Growth 3B: a verified speaking minute (voice task, return tracking, friend-call reward).
  if (type === "voice") require("../lib/reengage/hooks").onVoiceSpeaking(userId, ok.others, { serverId: ok.meta?.serverId || null, channelName: ok.meta?.channelName || null });

  const throttleKey = `${userId}:${type}`;
  const last = lastAt.get(throttleKey) || 0;
  if (Date.now() - last < MIN_INTERVAL_MS) return null;
  lastAt.set(throttleKey, Date.now());

  // Anti-bot monitor (Faz 0): records activity (+ media shadow rules when a newer
  // client sends hints). Does not change the amount below.
  try {
    descoinAntibot.observeHeartbeat({
      userId,
      type,
      ctxKey: ok.ctxKey,
      others: ok.others,
      beat: antibot && typeof antibot === "object" && !Array.isArray(antibot) ? antibot : null,
    });
  } catch {
    /* monitoring must never affect earning */
  }

  const session = callCoinSessions.ensure(userId, ok.ctx, { meta: ok.meta });
  const reason = type === "voice" ? "voice_activity" : "screenshare_activity";
  const amount = type === "voice" ? 1 : 2;
  const result = await descoin.creditCapped(userId, amount, reason, {
    context: ok.ctx.context,
    groupId: ok.ctx.groupId || null,
    peerId: ok.ctx.peerId || null,
    ...(ok.ctx.channelId ? { channelId: ok.ctx.channelId, serverId: ok.meta?.serverId || null } : {}),
    ...callCoinSessions.ledgerMeta(session),
  });
  callCoinSessions.recordBeat(
    userId,
    ok.ctx,
    { type, credited: result?.credited || 0, capped: result?.capped || null, people: ok.others.length + 1 },
    { meta: ok.meta }
  );
  if (result?.credited > 0) {
    socket?.emit?.("descoin:balance", { balance: result.balance, delta: result.credited, reason });
  }
  return result;
}

function registerDescoinHeartbeat(socket, { userId, dmScreenSharingUsers }) {
  socket.on("descoin:heartbeat", async (payload = {}) => {
    try {
      await handleHeartbeat({ socket, userId, payload, dmScreenSharingUsers });
    } catch (err) {
      console.warn("[DesCoin] heartbeat error:", err?.message || err);
    }
  });
}

function _reset() {
  lastAt.clear();
  timeoutCache.clear();
}

module.exports = {
  MIN_INTERVAL_MS,
  registerDescoinHeartbeat,
  handleHeartbeat,
  validateHeartbeat,
  serverSeatCheck,
  _reset,
};
