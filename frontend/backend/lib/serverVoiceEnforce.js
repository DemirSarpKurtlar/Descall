"use strict";

/**
 * Server voice enforcement (server audit 2026-11-15: V1-V15, SK-1..3, SC-1..3/6, R3, M2).
 *
 * One place that decides what a seated member may do in a server voice / stage
 * channel and makes the SFU (LiveKit) obey it, instead of trusting the client:
 *   - LiveKit grants are derived from the seat (SPEAK, STREAM, stage role, server
 *     mute / deafen, AFK lock) and pushed with RoomServiceClient.updateParticipant
 *     whenever they change;
 *   - removals call removeParticipant with revokeTokenTs, so a kept JWT cannot be
 *     used to come back (tokens are also short-lived);
 *   - moderator server mute / deafen survive leave + re-join and moves (memory map,
 *     plus server_members.voice_muted / voice_deafened when that migration is applied).
 *
 * Contract used by the other server modules (routes/servers.js, slash commands):
 *   evictFromServerVoice(io, { serverId, userId, reason })
 *   recheckVoiceAccess(io, { serverId, userId?, channelId? })
 *   applyServerVoiceMute(io, { serverId, userId, muted?, deafened?, byUserId? })
 * All three are best effort and never throw.
 */

const supabase = require("../db/supabase");
const { activeServerVoiceCalls } = require("../runtime/sharedState");
const { Permissions, hasPermission, resolveChannelPermissions } = require("./serverPermissions");
const { screenCompanionIdentity, takeCompanionIssued, companionOwner } = require("./screenCompanion");

const ROOM_PREFIX = "server-voice-";
/** Voice tokens only need to be valid to connect; LiveKit refreshes connected clients itself. */
const VOICE_TOKEN_TTL = "5m";
const VOICE_TOKEN_TTL_SECONDS = 300;

function normalizeId(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function sameId(a, b) {
  return a != null && b != null && normalizeId(a) === normalizeId(b);
}

function liveKitRoomName(channelId) {
  return `${ROOM_PREFIX}${normalizeId(channelId)}`;
}

function channelIdFromRoom(room) {
  const value = String(room || "");
  return value.startsWith(ROOM_PREFIX) ? value.slice(ROOM_PREFIX.length) : null;
}

function isLiveKitConfigured() {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

/* ------------------------------------------------------------------ LiveKit */

let roomServiceOverride = null;
let roomServiceCached = null;
let roomServiceKey = "";

function roomService() {
  if (roomServiceOverride) return roomServiceOverride;
  if (!isLiveKitConfigured()) return null;
  const key = `${process.env.LIVEKIT_URL}|${process.env.LIVEKIT_API_KEY}`;
  if (roomServiceCached && roomServiceKey === key) return roomServiceCached;
  try {
    const { RoomServiceClient } = require("livekit-server-sdk");
    const host = String(process.env.LIVEKIT_URL).replace(/^ws/i, "http");
    roomServiceCached = new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
    roomServiceKey = key;
    return roomServiceCached;
  } catch (err) {
    console.warn("[voiceEnforce] LiveKit client unavailable:", err?.message || err);
    return null;
  }
}

function isNotFound(err) {
  const status = Number(err?.status || err?.code || 0);
  if (status === 404) return true;
  return /not\s*found|not_found|does not exist/i.test(String(err?.message || ""));
}

/** One retry, then a warning without secrets (V15). Participant-not-found is not an error. */
async function liveKitCall(label, fn) {
  const svc = roomService();
  if (!svc) return false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fn(svc);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      console.warn(`[voiceEnforce] LiveKit ${label} failed:`, err?.message || err);
    }
  }
  return false;
}

/** Remove an identity from a channel's room and revoke tokens minted before now. */
function removeLiveKitIdentity(channelId, identity) {
  if (!channelId || !identity) return Promise.resolve(false);
  const room = liveKitRoomName(channelId);
  let revokeTokenTs;
  try {
    revokeTokenTs = BigInt(Math.floor(Date.now() / 1000));
  } catch {
    revokeTokenTs = undefined;
  }
  return liveKitCall(`removeParticipant ${room} ${identity}`, (svc) =>
    svc.removeParticipant(room, String(identity), revokeTokenTs != null ? { revokeTokenTs } : undefined)
  );
}

function updateLiveKitPermission(channelId, identity, permission) {
  if (!channelId || !identity) return Promise.resolve(false);
  const room = liveKitRoomName(channelId);
  return liveKitCall(`updateParticipant ${room} ${identity}`, (svc) =>
    svc.updateParticipant(room, String(identity), { permission })
  );
}

function trackSources() {
  try {
    const { TrackSource } = require("livekit-server-sdk");
    return {
      mic: TrackSource.MICROPHONE,
      all: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
      screen: TrackSource.SCREEN_SHARE,
    };
  } catch {
    return { mic: 2, all: [2, 1, 3, 4], screen: 3 };
  }
}

/* --------------------------------------------------- persistent mod state */

/** `${serverId}|${userId}` -> { muted, deafened } set by MUTE_MEMBERS / DEAFEN_MEMBERS. */
const modStates = new Map();
const MOD_STATE_MAX = 50_000;

function modKey(serverId, userId) {
  return `${normalizeId(serverId)}|${normalizeId(userId)}`;
}

function cachedModState(serverId, userId) {
  return modStates.get(modKey(serverId, userId)) || null;
}

/** Moderator mute/deafen state; reads server_members.voice_* once per process when present. */
async function getVoiceModState(serverId, userId) {
  const key = modKey(serverId, userId);
  const hit = modStates.get(key);
  if (hit) return hit;
  let state = { muted: false, deafened: false };
  try {
    const { data, error } = await supabase
      .from("server_members")
      .select("voice_muted, voice_deafened")
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .maybeSingle();
    // Missing columns (migration not applied yet) -> memory only.
    if (!error && data) state = { muted: data.voice_muted === true, deafened: data.voice_deafened === true };
  } catch {
    /* memory only */
  }
  if (modStates.size >= MOD_STATE_MAX) modStates.delete(modStates.keys().next().value);
  modStates.set(key, state);
  return state;
}

async function setVoiceModState(serverId, userId, { muted, deafened } = {}) {
  const prev = await getVoiceModState(serverId, userId);
  const next = {
    muted: muted === undefined ? prev.muted : Boolean(muted),
    deafened: deafened === undefined ? prev.deafened : Boolean(deafened),
  };
  modStates.set(modKey(serverId, userId), next);
  try {
    const { error } = await supabase
      .from("server_members")
      .update({ voice_muted: next.muted, voice_deafened: next.deafened })
      .eq("server_id", serverId)
      .eq("user_id", userId);
    if (error && !/voice_(muted|deafened)/i.test(String(error.message || ""))) {
      console.warn("[voiceEnforce] persist mod state failed:", error.message || error);
    }
  } catch {
    /* memory only */
  }
  return next;
}

function forgetVoiceModState(serverId, userId) {
  modStates.delete(modKey(serverId, userId));
}

/* ------------------------------------------------------------ seat rules */

/**
 * Derive the effective lock flags on a seat. `serverMuted` is what clients show:
 * moderator mute, moderator deafen, no SPEAK permission (non-stage) or the AFK lock.
 */
function recomputeSeatLocks(seat) {
  if (!seat) return seat;
  const stage = seat.channelType === "stage";
  seat.serverDeafened = Boolean(seat.modDeafened);
  const speakDenied = !seat.canSpeakPermission;
  if (stage && seat.stageRole === "speaker" && speakDenied) {
    seat.stageRole = "audience";
  }
  seat.serverMuted = Boolean(
    seat.modMuted || seat.modDeafened || seat.afkLocked || (!stage && speakDenied)
  );
  const mayPublish = canPublishSeat(seat);
  if (!mayPublish) seat.muted = true;
  if (!canStreamSeat(seat)) {
    seat.cameraOn = false;
    seat.isScreenSharing = false;
  }
  return seat;
}

function canPublishSeat(seat) {
  if (!seat || !seat.canSpeakPermission) return false;
  if (seat.serverMuted || seat.serverDeafened || seat.modMuted || seat.modDeafened || seat.afkLocked) return false;
  if (seat.channelType === "stage" && seat.stageRole !== "speaker") return false;
  return true;
}

function canStreamSeat(seat) {
  return canPublishSeat(seat) && Boolean(seat.canStream);
}

/** LiveKit permission for a seat (token grant and updateParticipant use the same rules). */
function liveKitPermissionForSeat(seat) {
  const sources = trackSources();
  const canPublish = canPublishSeat(seat);
  return {
    canSubscribe: !(seat?.serverDeafened || seat?.modDeafened),
    canPublish,
    canPublishData: false,
    canPublishSources: canPublish ? (canStreamSeat(seat) ? sources.all : [sources.mic]) : [],
    canUpdateMetadata: false,
  };
}

/** Push the seat's rights to LiveKit; drop the iOS screen companion when it may not stream. */
async function pushSeatToLiveKit(channelId, seat) {
  if (!seat?.id) return;
  const permission = liveKitPermissionForSeat(seat);
  await updateLiveKitPermission(channelId, seat.id, permission);
  if (!canStreamSeat(seat) && takeCompanionIssued(channelId, seat.id)) {
    await removeLiveKitIdentity(channelId, screenCompanionIdentity(seat.id));
  }
}

/** Mint a LiveKit voice token for a seated member (socket join payload and REST route). */
async function mintVoiceToken({ userId, channelId, seat }) {
  if (!isLiveKitConfigured()) return null;
  const { AccessToken } = require("livekit-server-sdk");
  const room = liveKitRoomName(channelId);
  const permission = liveKitPermissionForSeat(seat);
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: String(userId),
    ttl: VOICE_TOKEN_TTL,
  });
  token.addGrant({
    room,
    roomJoin: true,
    canSubscribe: permission.canSubscribe,
    canPublish: permission.canPublish,
    canPublishData: false,
    canUpdateOwnMetadata: false,
    ...(permission.canPublish ? { canPublishSources: permission.canPublishSources } : {}),
  });
  let livekitUrls = null;
  try {
    livekitUrls = require("./turnUrls").liveKitEndpoints();
  } catch {
    livekitUrls = null;
  }
  return {
    enabled: true,
    livekitUrl: process.env.LIVEKIT_URL,
    livekitUrls,
    room,
    token: await token.toJwt(),
    ttlSeconds: VOICE_TOKEN_TTL_SECONDS,
    canPublish: permission.canPublish,
    canSubscribe: permission.canSubscribe,
    canStream: canStreamSeat(seat),
    channelType: seat?.channelType || "voice",
    stageRole: seat?.channelType === "stage" ? seat?.stageRole || "audience" : "speaker",
    canRequestToSpeak: Boolean(seat?.canRequestToSpeak),
    serverMuted: Boolean(seat?.serverMuted),
    serverDeafened: Boolean(seat?.serverDeafened),
  };
}

/* ----------------------------------------------------------- seat lookup */

function handlers() {
  return require("../socket/serverVoiceHandlers");
}

function seatsOfServer(serverId, { userId = null, channelId = null } = {}) {
  const out = [];
  for (const [cid, call] of activeServerVoiceCalls.entries()) {
    if (!sameId(call?.serverId, serverId)) continue;
    if (channelId && !sameId(cid, channelId)) continue;
    for (const [key, member] of call.participants.entries()) {
      const uid = String(member?.id ?? key);
      if (userId != null && !sameId(uid, userId)) continue;
      out.push({ channelId: cid, call, userId: uid, seat: member });
    }
  }
  return out;
}

function findSeat(channelId, userId) {
  const call = activeServerVoiceCalls.get(normalizeId(channelId)) || activeServerVoiceCalls.get(String(channelId));
  if (!call?.participants || userId == null) return null;
  for (const [key, member] of call.participants.entries()) {
    if (sameId(key, userId) || sameId(member?.id, userId)) return { call, seat: member, key };
  }
  return null;
}

function forceDisconnect(io, { serverId, channelId, userId, reason }) {
  try {
    handlers()._internals.removeFromVoice(io, channelId, userId);
  } catch (err) {
    console.warn("[voiceEnforce] seat removal failed:", err?.message || err);
  }
  try {
    io?.to?.(`user:${userId}`).emit("server:voice:force-disconnected", { serverId, channelId, reason: reason || null });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------- contract */

const MEMBERSHIP_END_REASONS = new Set(["kick", "kicked", "ban", "banned", "leave", "left"]);

/**
 * Remove a user from every voice seat of one server (events as for a normal leave)
 * and from every LiveKit room of that server, including rooms they joined with a
 * token but no seat and the `<userId>:screen` companion. Never throws.
 */
async function evictFromServerVoice(io, { serverId, userId, reason = null } = {}) {
  if (!serverId || userId == null) return { removed: 0 };
  const uid = normalizeId(userId);
  let removed = 0;
  try {
    for (const s of seatsOfServer(serverId, { userId: uid })) {
      forceDisconnect(io, { serverId: s.call.serverId, channelId: s.channelId, userId: s.userId, reason });
      removed += 1;
    }
  } catch (err) {
    console.warn("[voiceEnforce] evict seats failed:", err?.message || err);
  }
  if (MEMBERSHIP_END_REASONS.has(String(reason || "").toLowerCase())) forgetVoiceModState(serverId, uid);
  if (!roomService()) return { removed };
  try {
    const { data: channels, error } = await supabase
      .from("server_channels")
      .select("id, type")
      .eq("server_id", serverId);
    if (error) throw error;
    const companion = screenCompanionIdentity(uid);
    await Promise.all(
      (channels || [])
        .filter((c) => ["voice", "stage"].includes(String(c.type || "").toLowerCase()))
        .flatMap((c) => [removeLiveKitIdentity(c.id, uid), companion ? removeLiveKitIdentity(c.id, companion) : null])
        .filter(Boolean)
    );
  } catch (err) {
    console.warn("[voiceEnforce] evict LiveKit failed:", err?.message || err);
  }
  return { removed };
}

/**
 * Re-evaluate seated members against current permissions (role / override / channel
 * change). Lost membership, timeout, or VIEW/CONNECT (unless a mover placed them
 * there) -> removed. Lost SPEAK -> server-muted (stage: back to audience). Lost
 * STREAM -> camera / screen stopped. LiveKit rights follow. Never throws.
 */
async function recheckVoiceAccess(io, { serverId, userId = null, channelId = null } = {}) {
  const result = { removed: 0, updated: 0 };
  if (!serverId) return result;
  let seats;
  try {
    seats = seatsOfServer(serverId, { userId, channelId });
  } catch {
    return result;
  }
  if (!seats.length) return result;
  const { getActiveServerTimeout } = require("./serverTimeoutState");
  const channelRows = new Map();
  for (const s of seats) {
    try {
      let row = channelRows.get(s.channelId);
      if (row === undefined) {
        const { data, error } = await supabase
          .from("server_channels")
          .select("id, server_id, type, name")
          .eq("id", s.channelId)
          .maybeSingle();
        if (error) throw error;
        row = data || null;
        channelRows.set(s.channelId, row);
      }
      if (!row || !["voice", "stage"].includes(row.type) || !sameId(row.server_id, serverId)) {
        forceDisconnect(io, { serverId, channelId: s.channelId, userId: s.userId, reason: "channel_unavailable" });
        result.removed += 1;
        continue;
      }
      const resolved = await resolveChannelPermissions(supabase, row.server_id, s.userId, row.id);
      if (!resolved.isMember) {
        forceDisconnect(io, { serverId, channelId: s.channelId, userId: s.userId, reason: "not_member" });
        result.removed += 1;
        continue;
      }
      if (!resolved.isOwner && (await getActiveServerTimeout(row.server_id, s.userId))) {
        forceDisconnect(io, { serverId, channelId: s.channelId, userId: s.userId, reason: "timeout" });
        result.removed += 1;
        continue;
      }
      const canView = hasPermission(resolved.bits, Permissions.VIEW_CHANNEL);
      const canConnect = hasPermission(resolved.bits, Permissions.CONNECT);
      if (!s.seat?.forceMovedIn && (!canView || !canConnect)) {
        forceDisconnect(io, { serverId, channelId: s.channelId, userId: s.userId, reason: "permission" });
        result.removed += 1;
        continue;
      }
      if (await refreshSeatPermissions(io, { serverId, channelId: s.channelId, call: s.call, seat: s.seat, resolved })) {
        result.updated += 1;
      }
    } catch (err) {
      console.warn("[voiceEnforce] recheck failed:", err?.message || err);
    }
  }
  return result;
}

const SEAT_RIGHT_KEYS = ["canSpeakPermission", "canStream", "canRequestToSpeak", "canPrioritySpeaker"];
const SEAT_STATE_KEYS = ["serverMuted", "serverDeafened", "muted", "cameraOn", "isScreenSharing", "stageRole"];

/** Apply fresh channel bits to a seat; emits and pushes to LiveKit when anything changed. */
async function refreshSeatPermissions(io, { serverId, channelId, call, seat, resolved }) {
  if (!seat) return false;
  const before = {};
  for (const k of [...SEAT_RIGHT_KEYS, ...SEAT_STATE_KEYS]) before[k] = seat[k];
  seat.canSpeakPermission = hasPermission(resolved.bits, Permissions.SPEAK);
  seat.canStream = hasPermission(resolved.bits, Permissions.STREAM);
  seat.canRequestToSpeak = hasPermission(resolved.bits, Permissions.REQUEST_TO_SPEAK);
  seat.canPrioritySpeaker = hasPermission(resolved.bits, Permissions.PRIORITY_SPEAKER);
  recomputeSeatLocks(seat);
  const changed = [...SEAT_RIGHT_KEYS, ...SEAT_STATE_KEYS].some((k) => before[k] !== seat[k]);
  if (!changed) return false;
  announceSeatChange(io, { serverId, channelId, call, seat, before });
  await pushSeatToLiveKit(channelId, seat);
  return true;
}

/** Tell the member and the room what changed on a seat (same events moderators trigger). */
function announceSeatChange(io, { serverId, channelId, call, seat, before = {} }) {
  if (!io || !seat?.id) return;
  const uid = String(seat.id);
  const sid = serverId || call?.serverId;
  try {
    if (before.serverMuted !== seat.serverMuted) {
      io.to(`user:${uid}`).emit("server:voice:force-mute", { serverId: sid, channelId, muted: Boolean(seat.serverMuted), byUserId: null });
    }
    if (before.serverDeafened !== seat.serverDeafened) {
      io.to(`user:${uid}`).emit("server:voice:force-deafen", { serverId: sid, channelId, deafened: Boolean(seat.serverDeafened), byUserId: null });
    }
    if (before.stageRole !== undefined && before.stageRole !== seat.stageRole && seat.channelType === "stage") {
      io.to(`user:${uid}`).emit("server:voice:stage-role", { serverId: sid, channelId, stageRole: seat.stageRole, byUserId: null });
      io.to(`server-voice:${channelId}`).emit("server:voice:stage-state", {
        serverId: sid,
        channelId,
        userId: uid,
        requestedToSpeak: Boolean(seat.requestedToSpeak),
        stageRole: seat.stageRole,
      });
    }
    if (before.canStream !== undefined && (before.canStream !== seat.canStream || before.canSpeakPermission !== seat.canSpeakPermission)) {
      io.to(`user:${uid}`).emit("server:voice:rights", {
        serverId: sid,
        channelId,
        canSpeak: canPublishSeat(seat),
        canStream: canStreamSeat(seat),
        canRequestToSpeak: Boolean(seat.canRequestToSpeak),
      });
    }
    if (before.isScreenSharing && !seat.isScreenSharing) {
      io.to(`server-voice:${channelId}`).emit("server:voice:screen:stopped", { serverId: sid, channelId, fromUserId: uid });
    }
    if (before.cameraOn && !seat.cameraOn) {
      io.to(`server-voice:${channelId}`).emit("server:voice:camera:stopped", { serverId: sid, channelId, fromUserId: uid });
    }
    io.to(`server-voice:${channelId}`).emit("server:voice:media-state", {
      channelId,
      fromUserId: uid,
      muted: Boolean(seat.muted),
      serverMuted: Boolean(seat.serverMuted),
      serverDeafened: Boolean(seat.serverDeafened),
      deafened: Boolean(seat.deafened),
      cameraOn: Boolean(seat.cameraOn),
    });
    handlers()._internals.emitChannelState(io, sid, channelId);
  } catch (err) {
    console.warn("[voiceEnforce] announce failed:", err?.message || err);
  }
}

/**
 * Moderator server mute / deafen. Stored per member (survives re-join, moves and
 * AFK), applied to the current seat and enforced in LiveKit (canPublish false while
 * muted, canSubscribe false while deafened). Omitted fields stay as they are.
 */
async function applyServerVoiceMute(io, { serverId, userId, muted, deafened, byUserId = null } = {}) {
  if (!serverId || userId == null) return null;
  try {
    const state = await setVoiceModState(serverId, userId, { muted, deafened });
    const seats = seatsOfServer(serverId, { userId });
    for (const s of seats) {
      const seat = s.seat;
      const before = {};
      for (const k of SEAT_STATE_KEYS) before[k] = seat[k];
      seat.modMuted = state.muted;
      seat.modDeafened = state.deafened;
      if (muted === true || deafened === true) seat.muted = true;
      recomputeSeatLocks(seat);
      announceSeatChange(io, { serverId, channelId: s.channelId, call: s.call, seat, before: { ...before, byUserId } });
      await pushSeatToLiveKit(s.channelId, seat);
    }
    return { ...state, seats: seats.map((s) => ({ channelId: s.channelId, seat: s.seat })) };
  } catch (err) {
    console.warn("[voiceEnforce] server mute failed:", err?.message || err);
    return null;
  }
}

/**
 * LiveKit reconciliation: anyone in a server voice room without a seat (ghost token,
 * kept JWT after a kick) is removed; companions only stay with their seated owner.
 * Used by the webhook (participant_joined) and the periodic sweep.
 */
function identityAllowedInRoom(channelId, identity) {
  const owner = companionOwner(identity);
  if (owner) {
    const found = findSeat(channelId, owner);
    return Boolean(found && canStreamSeat(found.seat));
  }
  return Boolean(findSeat(channelId, identity));
}

async function reconcileLiveKitRoom(channelId) {
  const svc = roomService();
  if (!svc || !channelId) return 0;
  let participants = [];
  try {
    participants = await svc.listParticipants(liveKitRoomName(channelId));
  } catch (err) {
    if (!isNotFound(err)) console.warn("[voiceEnforce] listParticipants failed:", err?.message || err);
    return 0;
  }
  let removed = 0;
  for (const p of participants || []) {
    const identity = String(p?.identity || "");
    if (!identity || identityAllowedInRoom(channelId, identity)) continue;
    await removeLiveKitIdentity(channelId, identity);
    removed += 1;
  }
  return removed;
}

async function reconcileAllLiveKitRooms() {
  if (!roomService()) return 0;
  let removed = 0;
  for (const channelId of [...activeServerVoiceCalls.keys()]) {
    removed += await reconcileLiveKitRoom(channelId);
  }
  return removed;
}

function _setRoomServiceForTest(svc) {
  roomServiceOverride = svc || null;
}

function _resetForTest() {
  modStates.clear();
  roomServiceOverride = null;
}

module.exports = {
  // contract
  evictFromServerVoice,
  recheckVoiceAccess,
  applyServerVoiceMute,
  // helpers for the voice socket handlers / webrtc routes
  VOICE_TOKEN_TTL_SECONDS,
  normalizeId,
  liveKitRoomName,
  channelIdFromRoom,
  isLiveKitConfigured,
  removeLiveKitIdentity,
  updateLiveKitPermission,
  getVoiceModState,
  cachedModState,
  setVoiceModState,
  forgetVoiceModState,
  recomputeSeatLocks,
  canPublishSeat,
  canStreamSeat,
  liveKitPermissionForSeat,
  pushSeatToLiveKit,
  refreshSeatPermissions,
  announceSeatChange,
  mintVoiceToken,
  findSeat,
  identityAllowedInRoom,
  reconcileLiveKitRoom,
  reconcileAllLiveKitRooms,
  _setRoomServiceForTest,
  _resetForTest,
};
