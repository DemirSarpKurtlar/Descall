/**
 * Server voice channel hangouts (Step 10+) + moderation (MOVE_MEMBERS / MUTE_MEMBERS).
 * Mesh WebRTC signaling keyed by channelId.
 */

"use strict";

const supabase = require("../db/supabase");
const { activeServerVoiceCalls } = require("../runtime/sharedState");
const { getCachedPublicUser, getAvatarUrl, pickChatCosmetics, pickVoiceCosmetics } = require("../lib/userProfile");
const {
  Permissions,
  hasPermission,
  resolveMemberPermissions,
  resolveChannelPermissions,
  assertHierarchy,
  isTimeoutRestricted,
  timeoutRestrictedError,
} = require("../lib/serverPermissions");
const { needsRulesAcceptance } = require("../lib/serverRulesGate");
const { emitToChannelViewers, canViewChannel } = require("../lib/channelViewers");
const { getActiveServerTimeout, timedOutError } = require("../lib/serverTimeoutState");
const { errorFields } = require("../lib/apiError");
const { screenCompanionIdentity, takeCompanionIssued } = require("../lib/screenCompanion");
const ve = require("../lib/serverVoiceEnforce");
const callCoinSessions = require("../lib/callCoinSessions");

/** Channel / user ids are lowercase UUIDs; spelling variants must not open parallel calls (V11). */
const normId = (v) => ve.normalizeId(v);

function resolvePublicUser(socket) {
  const myId = socket.user?.id;
  const cached = getCachedPublicUser(myId);
  const avatar =
    cached?.avatarUrl ||
    cached?.avatar_url ||
    getAvatarUrl(myId) ||
    socket.user?.avatar_url ||
    null;
  const displayName =
    cached?.displayName || socket.user?.display_name || socket.user?.displayName || null;
  const username = cached?.username || socket.user?.username;
  return {
    id: myId != null ? String(myId) : myId,
    username,
    displayName,
    display_name: displayName,
    avatarUrl: avatar,
    avatar_url: avatar,
    muted: false,
    serverMuted: false,
    serverDeafened: false,
    // Self-deafen (headphones off) — presentation-only, set via media-state.
    deafened: false,
    cameraOn: false,
    isScreenSharing: false,
    requestedToSpeak: false,
    stageRole: "speaker",
    ...pickChatCosmetics(cached),
    // Market 2.0: the voice tile everyone sees + the join sound others hear.
    ...pickVoiceCosmetics(cached),
  };
}

function roomMembers(channelId) {
  const call = activeServerVoiceCalls.get(channelId);
  if (!call) return [];
  return Array.from(call.participants.values());
}

function emitChannelState(io, serverId, channelId) {
  const members = roomMembers(channelId);
  const payload = {
    serverId,
    channelId,
    memberCount: members.length,
    members,
  };
  // Server room: only members who can see the channel (hidden voice channel ids and
  // occupants used to reach everyone). Participants always get it via the voice room.
  void emitToChannelViewers(io, serverId, channelId, "server:voice:channel-state", payload);
  io.to(`server-voice:${channelId}`).emit("server:voice:channel-state", payload);
  return payload;
}

/**
 * Resolve voice/stage channel access.
 * Discord parity: MOVE_MEMBERS can place a user into a channel they cannot
 * VIEW/CONNECT. While they remain a participant they may re-join media
 * (bypassConnectView). After leave, normal VIEW+CONNECT checks apply again
 * so the channel stays hidden from their channel list.
 */
async function assertVoiceAccess(userId, channelId, { bypassConnectView = false } = {}) {
  const { data: channel, error } = await supabase
    .from("server_channels")
    .select("id, server_id, type, name")
    .eq("id", normId(channelId))
    .maybeSingle();
  if (error) throw error;
  if (!channel) {
    const err = new Error("Channel not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (!["voice", "stage"].includes(channel.type)) {
    const err = new Error("Not a voice channel.");
    err.code = "NOT_VOICE_CHANNEL";
    throw err;
  }
  const resolved = await resolveChannelPermissions(supabase, channel.server_id, userId, channel.id);
  if (!resolved.isMember) {
    const err = new Error("You are not a member of this server.");
    err.code = "NOT_MEMBER";
    throw err;
  }
  // Timed-out members cannot be in voice at all (Discord parity; audit 2026-10-18).
  if (!resolved.isOwner) {
    const t = await getActiveServerTimeout(channel.server_id, userId);
    if (t) throw timedOutError(t);
  }
  const canView = hasPermission(resolved.bits, Permissions.VIEW_CHANNEL);
  const canConnect = hasPermission(resolved.bits, Permissions.CONNECT);
  if (!bypassConnectView) {
    if (!canView) {
      const err = new Error("Missing VIEW_CHANNEL permission.");
      err.code = "MISSING_PERMISSION";
      throw err;
    }
    if (!canConnect) {
      const err = new Error("Missing CONNECT permission.");
      err.code = "MISSING_PERMISSION";
      throw err;
    }
  }
  return { channel, resolved, canView, canConnect };
}

function canSpeakInChannel(channel, resolved, participant = null) {
  if (!hasPermission(resolved.bits, Permissions.SPEAK)) return false;
  if (channel.type !== "stage") return true;
  return participant?.stageRole === "speaker";
}

function canStreamInChannel(channel, resolved, participant = null) {
  if (!hasPermission(resolved.bits, Permissions.STREAM)) return false;
  return canSpeakInChannel(channel, resolved, participant);
}

/** STREAM + SPEAK, stage speaker, not server-muted / deafened / AFK-locked (V5, V10). */
function participantCanStream(participant) {
  return ve.canStreamSeat(participant);
}

async function assertStageChannel(userId, channelId, opts = {}) {
  const { channel, resolved } = await assertVoiceAccess(userId, channelId, opts);
  if (channel.type !== "stage") {
    const err = new Error("Not a stage channel.");
    err.code = "NOT_STAGE_CHANNEL";
    throw err;
  }
  return { channel, resolved };
}

function sameUserId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/** Resolve a participant map entry even when key/id types differ (uuid string vs raw). */
function getParticipantEntry(call, userId) {
  if (!call?.participants || userId == null) return null;
  if (call.participants.has(userId)) {
    return { key: userId, member: call.participants.get(userId) };
  }
  const uid = String(userId);
  if (call.participants.has(uid)) {
    return { key: uid, member: call.participants.get(uid) };
  }
  for (const [key, member] of call.participants.entries()) {
    if (sameUserId(key, uid) || sameUserId(member?.id, uid)) {
      return { key, member };
    }
  }
  return null;
}

function setParticipant(call, userId, member) {
  const uid = String(userId);
  const existing = getParticipantEntry(call, uid);
  if (existing && existing.key !== uid) {
    call.participants.delete(existing.key);
  }
  const next = { ...(member || {}), id: uid };
  call.participants.set(uid, next);
  return next;
}

/**
 * Remove an identity from the channel's LiveKit room and revoke the tokens it holds
 * (revokeTokenTs), so a kept JWT cannot be used to come back (M2, SK-3). Failures are
 * logged with one retry (V15); occupancy drop still runs.
 */
function kickLiveKitParticipant(channelId, userId) {
  if (!channelId || userId == null) return Promise.resolve(false);
  return ve.removeLiveKitIdentity(channelId, String(userId)).catch(() => false);
}

/** `${channelId}|${userId}` -> socket id that holds the seat (V9; never sent to clients). */
const seatOwners = new Map();
const seatOwnerKey = (channelId, userId) => `${normId(channelId)}|${normId(userId)}`;
/** seat key -> when its holder socket disconnected (grace running; telemetry only). */
const seatLostAt = new Map();
/** Socket id holding the user's seat in the channel, or null (DesCoin heartbeat check). */
function seatOwnerOf(channelId, userId) {
  return seatOwners.get(seatOwnerKey(channelId, userId)) || null;
}

/** The socket may act on the user's seat: it holds it, or no holder is recorded. */
function socketHoldsSeat(channelId, userId, socketId) {
  const owner = seatOwnerOf(channelId, userId);
  return !owner || !socketId || owner === socketId;
}

function socketIsLive(io, socketId) {
  if (!socketId) return false;
  const map = io?.sockets?.sockets;
  if (!map?.get) return true; // test doubles without a socket map
  return Boolean(map.get(socketId));
}

/**
 * Where seat events for one user go (force-moved, room joins): the socket that holds the
 * seat when it is connected, else every socket of the user. Idle devices of the same user
 * used to get force-moved too and joined voice on their own (server-voice-03).
 */
function seatTarget(io, owner, userId) {
  return owner && socketIsLive(io, owner) ? owner : `user:${userId}`;
}

/** Another device of the same user took the seat: tell the device that held it. */
function notifySeatTakenOver(io, oldSocketId, { serverId, channelId }) {
  if (!oldSocketId || !socketIsLive(io, oldSocketId)) return;
  try {
    io.to(oldSocketId).emit("server:voice:force-disconnected", { serverId, channelId, reason: "other_device" });
    io.in?.(oldSocketId)?.socketsLeave?.(`server-voice:${channelId}`);
  } catch {
    /* older socket.io */
  }
}

function removeFromVoice(io, channelId, userId, { originSocketId = null, keepCoinSession = false } = {}) {
  channelId = normId(channelId);
  seatOwners.delete(seatOwnerKey(channelId, userId));
  const call = activeServerVoiceCalls.get(channelId);
  if (!call) return null;
  const uid = String(userId);
  // End-of-call DesCoin summary for this seat (lib/callCoinSessions.js; never throws).
  // A move keeps the session (callCoinSessions.move): it is not the end of the call.
  if (!keepCoinSession) void callCoinSessions.finish(io, uid, { context: "server", channelId }, { originSocketId });
  void kickLiveKitParticipant(channelId, uid);
  // iOS screen broadcast companion (`<userId>:screen`) leaves with its owner.
  if (takeCompanionIssued(channelId, uid)) void kickLiveKitParticipant(channelId, screenCompanionIdentity(uid));
  const entry = getParticipantEntry(call, uid);
  if (entry) call.participants.delete(entry.key);
  // Also drop string/uuid key variants if present
  if (call.participants.has(uid)) call.participants.delete(uid);
  if (call.participants.has(userId)) call.participants.delete(userId);
  const leavePayload = {
    serverId: call.serverId,
    channelId,
    userId: uid,
  };
  // Voice room (peers) + server room (sidebar viewers who aren't connected)
  io.to(`server-voice:${channelId}`).emit("server:voice:member-left", leavePayload);
  void emitToChannelViewers(io, call.serverId, channelId, "server:voice:member-left", leavePayload);
  // Kick every socket for that user out of the voice room so they can't linger
  try {
    io.in(`user:${uid}`).socketsLeave(`server-voice:${channelId}`);
  } catch {
    /* ignore older socket.io */
  }
  const state = emitChannelState(io, call.serverId, channelId);
  if (call.participants.size === 0) {
    activeServerVoiceCalls.delete(channelId);
  }
  return state;
}

function removeUserFromAllServerVoice(io, userId, opts = {}) {
  const uid = String(userId);
  for (const [channelId, call] of activeServerVoiceCalls.entries()) {
    if (getParticipantEntry(call, uid)) {
      removeFromVoice(io, channelId, uid, opts);
    }
  }
}

/** Seat fields that mirror the user's public profile (name, avatar, cosmetics). */
const SEAT_PROFILE_KEYS = [
  "equippedVoiceTile",
  "equippedJoinSound",
  "equippedAvatarFrame",
  "equippedBadge",
  "equippedTitle",
  "equippedCountry",
  "equippedSpecialBadge",
  "equippedNameEffect",
  "equippedAvatarEffect",
  "equippedChatBubble",
  "equippedPresenceFlare",
  "equippedProfileColor",
];

/**
 * A profile change (equip / unequip a voice tile or join sound, new avatar or name) reaches
 * the user's voice seats: they were copied once at join, so everyone kept seeing the old
 * tile until a rejoin (server-voice-18). Called from broadcastUserProfileUpdate.
 */
function refreshSeatProfile(io, userId, profile) {
  if (!io || userId == null || !profile) return 0;
  const { toPublicUser } = require("../lib/userProfile");
  const pub = toPublicUser(profile) || {};
  const uid = normId(userId);
  let n = 0;
  for (const [channelId, call] of [...activeServerVoiceCalls.entries()]) {
    const entry = getParticipantEntry(call, uid);
    if (!entry?.member) continue;
    const next = { ...entry.member };
    for (const key of SEAT_PROFILE_KEYS) next[key] = pub[key] ?? profile[key] ?? null;
    const displayName = pub.displayName || pub.display_name || profile.display_name || null;
    if (displayName) {
      next.displayName = displayName;
      next.display_name = displayName;
    }
    if (pub.username || profile.username) next.username = pub.username || profile.username;
    const avatar = pub.avatarUrl || pub.avatar_url || profile.avatar_url || null;
    next.avatarUrl = avatar;
    next.avatar_url = avatar;
    setParticipant(call, uid, next);
    emitChannelState(io, call.serverId, channelId);
    n += 1;
  }
  return n;
}

/**
 * Drop a user from every voice channel of one server and tell their clients (kick, ban,
 * leave, timeout). Also removes (and revokes) their LiveKit identity and screen companion
 * in every voice room of the server, seated or not (ghost listeners, V2 / M2). Returns
 * the LiveKit cleanup promise; callers may ignore it.
 */
function removeUserFromServerVoice(io, serverId, userId, reason = null) {
  const uid = normId(userId);
  for (const [channelId, call] of [...activeServerVoiceCalls.entries()]) {
    if (!sameUserId(normId(call.serverId), normId(serverId)) || !getParticipantEntry(call, uid)) continue;
    removeFromVoice(io, channelId, uid);
    io?.to?.(`user:${uid}`).emit("server:voice:force-disconnected", { serverId, channelId, reason });
  }
  if (["kick", "kicked", "ban", "banned", "leave", "left"].includes(String(reason || "").toLowerCase())) {
    ve.forgetVoiceModState(serverId, uid);
  }
  return ve.evictLiveKitFromServerRooms(serverId, uid).catch(() => 0);
}

/**
 * End a voice channel's call for everyone (channel deleted, server deleted). Before
 * 2026-10-19 the in-memory call and the LiveKit room outlived a deleted channel.
 */
function endServerVoiceChannel(io, channelId, reason = "channel_deleted") {
  channelId = normId(channelId);
  // Also drops identities that joined with a token but no seat.
  void ve.deleteLiveKitRoom(channelId);
  const call = activeServerVoiceCalls.get(channelId);
  if (!call) return 0;
  const serverId = call.serverId;
  const uids = [...call.participants.keys()].map(String);
  for (const uid of uids) {
    removeFromVoice(io, channelId, uid);
    io?.to?.(`user:${uid}`).emit("server:voice:force-disconnected", { serverId, channelId, reason });
  }
  activeServerVoiceCalls.delete(channelId);
  try {
    io?.in?.(`server-voice:${channelId}`).socketsLeave(`server-voice:${channelId}`);
  } catch {
    /* older socket.io */
  }
  return uids.length;
}

/** End every voice call of one server (server deleted). */
function endAllServerVoice(io, serverId, reason = "server_deleted") {
  let n = 0;
  for (const [channelId, call] of [...activeServerVoiceCalls.entries()]) {
    if (sameUserId(call.serverId, serverId)) n += endServerVoiceChannel(io, channelId, reason);
  }
  return n;
}

function findUserVoiceChannel(userId) {
  const uid = String(userId);
  for (const [channelId, call] of activeServerVoiceCalls.entries()) {
    const entry = getParticipantEntry(call, uid);
    if (entry) {
      return { channelId, call, entry };
    }
  }
  return null;
}

function findUserInChannel(channelId, userId) {
  if (!channelId || userId == null) return null;
  channelId = normId(channelId);
  const call = activeServerVoiceCalls.get(channelId);
  if (!call) return null;
  const entry = getParticipantEntry(call, userId);
  if (!entry) return null;
  return { channelId, call, entry };
}

/**
 * Voice moderation right. With channelIds the flag comes from that channel's bits
 * (overwrite allows and denies count, Discord parity; server audit P4): a channel
 * allow of MUTE_MEMBERS / DEAFEN_MEMBERS / MOVE_MEMBERS works without the server-wide
 * bit, and a deny removes it. Without channels (target not in voice) the server bits
 * decide. A timed-out moderator cannot moderate (M4).
 */
async function assertVoiceMod(actorId, serverId, flag, { channelIds = [] } = {}) {
  const resolved = await resolveMemberPermissions(supabase, serverId, actorId);
  if (!resolved.isMember) {
    const err = new Error("You are not a member of this server.");
    err.code = "NOT_MEMBER";
    throw err;
  }
  if (typeof isTimeoutRestricted === "function" && isTimeoutRestricted(resolved)) {
    throw timeoutRestrictedError(resolved);
  }
  const ids = [...new Set((channelIds || []).filter(Boolean).map(normId))];
  if (ids.length) {
    for (const chId of ids) {
      const r = await resolveChannelPermissions(supabase, serverId, actorId, chId);
      if (r.channelMissing || !hasPermission(r.bits, flag)) {
        const err = new Error("Missing permission.");
        err.code = "MISSING_PERMISSION";
        throw err;
      }
    }
    return resolved;
  }
  if (!hasPermission(resolved.bits, flag)) {
    const err = new Error("Missing permission.");
    err.code = "MISSING_PERMISSION";
    throw err;
  }
  return resolved;
}

/**
 * Voice moderation obeys the role hierarchy like kick/ban/timeout (Y1, 2026-10-18):
 * nobody can mute / deafen / disconnect / move / re-stage the owner or a member
 * whose highest role is at or above their own. Acting on yourself is not checked here.
 */
async function assertVoiceTarget(actorId, serverId, targetId, { flag = null, channelIds = [], connectIds = [] } = {}) {
  // The moderation bit must survive the channel's overrides (not just server bits),
  // and a mover must be able to CONNECT to the destination.
  for (const chId of channelIds.filter(Boolean)) {
    const r = await resolveChannelPermissions(supabase, serverId, actorId, chId);
    if (r.channelMissing || (flag && !hasPermission(r.bits, flag))) {
      const err = new Error("Missing permission.");
      err.code = "MISSING_PERMISSION";
      throw err;
    }
  }
  for (const chId of connectIds.filter(Boolean)) {
    const r = await resolveChannelPermissions(supabase, serverId, actorId, chId);
    if (r.channelMissing || !hasPermission(r.bits, Permissions.CONNECT)) {
      const err = new Error("Missing CONNECT permission on the destination channel.");
      err.code = "MISSING_PERMISSION";
      throw err;
    }
  }
  if (sameUserId(actorId, targetId)) return;
  try {
    await assertHierarchy(supabase, serverId, actorId, targetId);
  } catch (err) {
    if (!err.code) err.code = "HIERARCHY";
    throw err;
  }
}

/** Optional per-channel user limit (server_channels.user_limit, migration 20261115). 0 = none. */
async function channelUserLimit(channelId) {
  try {
    const { data, error } = await supabase
      .from("server_channels")
      .select("user_limit")
      .eq("id", channelId)
      .maybeSingle();
    if (error || !data) return 0;
    const n = Number(data.user_limit);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** The server's AFK channel id (members there cannot speak, Discord parity), or null. */
async function serverAfkChannelId(serverId) {
  try {
    const { data, error } = await supabase
      .from("servers")
      .select("afk_channel_id")
      .eq("id", serverId)
      .maybeSingle();
    if (error || !data?.afk_channel_id) return null;
    return normId(data.afk_channel_id);
  } catch {
    return null;
  }
}

/** Fixed-window per-socket limiter for chatty voice events (SK-7). */
function makeSocketLimiter(socket) {
  const buckets = new Map();
  return (key, max, windowMs) => {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now - b.start >= windowMs) {
      buckets.set(key, { start: now, n: 1 });
      return true;
    }
    b.n += 1;
    return b.n <= max;
  };
}

/**
 * A disconnected socket's seat stays this long for a reconnect, then goes (V9). It has
 * to cover socket.io's dead-link detection (pingInterval + pingTimeout = 22 s) plus a
 * couple of reconnect backoff steps, or a short radio stall drops the seat (and the
 * peers' audio) although the media path never broke (voice-drops-01).
 */
const SEAT_RECONNECT_GRACE_MS = Number(process.env.VOICE_SEAT_GRACE_MS) || 45_000;
const STAGE_REQUEST_COOLDOWN_MS = 5_000;

function registerServerVoiceHandlers(io, socket) {
  const myId = socket.user?.id != null ? normId(socket.user.id) : socket.user?.id;
  const allow = makeSocketLimiter(socket);

  /** Timed out while seated (e.g. timeout raced the disconnect): no new media, drop the seat. */
  async function rejectIfTimedOut(call, channelId) {
    let t = null;
    try {
      t = await getActiveServerTimeout(call?.serverId, myId);
    } catch {
      t = null;
    }
    if (!t) return false;
    {
      const e = timedOutError(t);
      socket.emit("server:voice:error", { channelId, message: e.message, messageKey: e.i18n.errorKey, messageVars: e.i18n.errorVars, code: "TIMED_OUT", timeout: t });
    }
    if (getParticipantEntry(activeServerVoiceCalls.get(channelId), myId)) {
      removeFromVoice(io, channelId, myId);
      io.to(`user:${myId}`).emit("server:voice:force-disconnected", { serverId: call.serverId, channelId, reason: "timeout" });
    }
    return true;
  }
  if (!myId) return;

  socket.on("server:voice:subscribe", async ({ serverId } = {}) => {
    if (!serverId) return;
    try {
      const resolved = await resolveMemberPermissions(supabase, serverId, myId);
      if (!resolved.isMember) return;
      socket.join(`server:${serverId}`);
      // A kick / ban can land between the check and the join (SK-13): check again.
      const again = await resolveMemberPermissions(supabase, serverId, myId);
      if (!again.isMember) {
        socket.leave(`server:${serverId}`);
        return;
      }
      const states = [];
      for (const [channelId, call] of activeServerVoiceCalls.entries()) {
        if (sameUserId(call.serverId, serverId)) {
          // Only channels this user can see (or sits in after a move).
          if (!getParticipantEntry(call, myId) && !(await canViewChannel(serverId, channelId, myId))) continue;
          states.push({
            serverId,
            channelId,
            memberCount: call.participants.size,
            members: Array.from(call.participants.values()),
          });
        }
      }
      socket.emit("server:voice:states", { serverId, states });
    } catch (err) {
      console.error("[ServerVoice] subscribe error:", err.message || err);
    }
  });

  socket.on("server:voice:check", async ({ channelId } = {}) => {
    if (!channelId) return;
    channelId = normId(channelId);
    try {
      const { channel } = await assertVoiceAccess(myId, channelId);
      socket.join(`server:${channel.server_id}`);
      const call = activeServerVoiceCalls.get(channelId);
      socket.emit("server:voice:channel-state", {
        serverId: channel.server_id,
        channelId,
        memberCount: call ? call.participants.size : 0,
        members: call ? Array.from(call.participants.values()) : [],
      });
    } catch (err) {
      socket.emit("server:voice:error", {
        channelId,
        ...errorFields(err, "message"),
        message: err.message || "Failed to check voice channel.",
        code: err.code || null,
      });
    }
  });

  const bumpVoiceJoin = () => {
    socket.data.voiceJoinEpoch = (socket.data.voiceJoinEpoch || 0) + 1;
    return socket.data.voiceJoinEpoch;
  };

  socket.on("server:voice:join", async ({ serverId, channelId } = {}) => {
    if (!channelId) return;
    channelId = normId(channelId);
    const epoch = bumpVoiceJoin();
    try {
      // Only a member a mover (MOVE_MEMBERS) placed here may re-join media without
      // VIEW/CONNECT (Discord parity); any other seat is checked like a new join (V6).
      const seatedFound = findUserInChannel(channelId, myId);
      const alreadySeated = Boolean(seatedFound);
      const previous = seatedFound?.entry?.member || null;
      const { channel, resolved, canView, canConnect } = await assertVoiceAccess(myId, channelId, {
        bypassConnectView: Boolean(previous?.forceMovedIn),
      });
      channelId = normId(channel.id);
      if ((socket.data.voiceJoinEpoch || 0) !== epoch) return;
      if (serverId && normId(serverId) !== normId(channel.server_id)) {
        socket.emit("server:voice:error", {
          phase: "join",
          channelId,
          message: "Server mismatch.",
          code: "SERVER_MISMATCH",
        });
        return;
      }

      if (
        await needsRulesAcceptance(supabase, channel.server_id, myId, {
          isOwner: resolved?.isOwner,
        })
      ) {
        if ((socket.data.voiceJoinEpoch || 0) !== epoch) return;
        socket.emit("server:voice:error", {
          phase: "join",
          channelId,
          message: "You must accept the server rules before joining voice.",
          code: "RULES_REQUIRED",
        });
        return;
      }
      if ((socket.data.voiceJoinEpoch || 0) !== epoch) return;

      // Per-channel user limit (V12): MOVE_MEMBERS holders and existing seats bypass it.
      if (!alreadySeated) {
        const existing = activeServerVoiceCalls.get(channelId);
        const count = existing?.participants?.size || 0;
        if (count > 0 && !hasPermission(resolved.bits, Permissions.MOVE_MEMBERS)) {
          const limit = await channelUserLimit(channelId);
          if (limit && count >= limit) {
            if ((socket.data.voiceJoinEpoch || 0) !== epoch) return;
            socket.emit("server:voice:error", {
              phase: "join",
              channelId,
              message: "This voice channel is full.",
              code: "CHANNEL_FULL",
            });
            return;
          }
        }
      }

      const [mod, afkChannelId] = await Promise.all([
        ve.getVoiceModState(channel.server_id, myId),
        serverAfkChannelId(channel.server_id),
      ]);
      if ((socket.data.voiceJoinEpoch || 0) !== epoch) return;

      const myUid = String(myId);
      for (const [otherId, call] of [...activeServerVoiceCalls.entries()]) {
        if (otherId !== channelId && getParticipantEntry(call, myUid)) {
          const heldBy = seatOwnerOf(otherId, myUid);
          removeFromVoice(io, otherId, myUid);
          socket.leave(`server-voice:${otherId}`);
          if (heldBy && heldBy !== socket.id) notifySeatTakenOver(io, heldBy, { serverId: call.serverId, channelId: otherId });
        }
      }

      let call = activeServerVoiceCalls.get(channelId);
      if (!call) {
        call = {
          serverId: channel.server_id,
          channelName: channel.name,
          participants: new Map(),
          startTime: Date.now(),
        };
        activeServerVoiceCalls.set(channelId, call);
      }

      const mePublic = resolvePublicUser(socket);
      mePublic.channelType = channel.type;
      // Re-join of the same seat (reconnect, media retry) keeps the stage role, the
      // hand raise and the self-mute; server mute / deafen come from the stored state
      // and survive leave + join (V3).
      const keepSeat = Boolean(previous && previous.channelType === channel.type);
      mePublic.stageRole =
        channel.type === "stage" ? (keepSeat && previous.stageRole === "speaker" ? "speaker" : "audience") : "speaker";
      mePublic.requestedToSpeak = keepSeat ? Boolean(previous.requestedToSpeak) : false;
      if (keepSeat) {
        mePublic.muted = Boolean(previous.muted);
        mePublic.deafened = Boolean(previous.deafened);
      }
      mePublic.canSpeakPermission = hasPermission(resolved.bits, Permissions.SPEAK);
      mePublic.canStream = hasPermission(resolved.bits, Permissions.STREAM);
      mePublic.canRequestToSpeak = hasPermission(resolved.bits, Permissions.REQUEST_TO_SPEAK);
      mePublic.canPrioritySpeaker = hasPermission(resolved.bits, Permissions.PRIORITY_SPEAKER);
      mePublic.modMuted = Boolean(mod.muted);
      mePublic.modDeafened = Boolean(mod.deafened);
      mePublic.afkLocked = Boolean(afkChannelId && afkChannelId === channelId);
      mePublic.forceMovedIn = Boolean(previous?.forceMovedIn) && !(canView && canConnect);
      mePublic.joinedAt = keepSeat && previous.joinedAt ? previous.joinedAt : Date.now();
      if (channel.type === "stage" && mePublic.stageRole !== "speaker") mePublic.muted = true;
      ve.recomputeSeatLocks(mePublic);
      const canSpeak = canSpeakInChannel(channel, resolved, mePublic);
      mePublic.afkIdleSince = mePublic.muted
        ? (keepSeat && previous.afkIdleSince) || Date.now()
        : null;
      setParticipant(call, myUid, mePublic);
      // Same seat taken from another device of this user: that device leaves voice (S-03).
      const heldBySameSeat = seatOwnerOf(channelId, myUid);
      if (heldBySameSeat && socket.id && heldBySameSeat !== socket.id) {
        notifySeatTakenOver(io, heldBySameSeat, { serverId: channel.server_id, channelId });
      }
      if (socket.id) seatOwners.set(seatOwnerKey(channelId, myUid), socket.id);
      {
        const lostAt = seatLostAt.get(seatOwnerKey(channelId, myUid));
        if (lostAt) {
          seatLostAt.delete(seatOwnerKey(channelId, myUid));
          if (alreadySeated) console.log(`[VoiceSeat] seat kept, holder back after ms=${Date.now() - lostAt}`);
        }
      }
      callCoinSessions.start(myUid, { context: "server", channelId }, {
        meta: { serverId: String(channel.server_id), channelName: channel.name || null },
      });

      socket.join(`server:${channel.server_id}`);
      socket.join(`server-voice:${channelId}`);

      // The LiveKit token comes with the confirmed seat (V2): minted after the seat
      // exists, with grants that match it. Older clients still use /livekit-token.
      let livekit = null;
      try {
        livekit = await ve.mintVoiceToken({ userId: myUid, channelId, seat: mePublic });
      } catch (err) {
        console.warn("[ServerVoice] token mint failed:", err?.message || err);
      }
      if ((socket.data.voiceJoinEpoch || 0) !== epoch) return;
      if (alreadySeated) void ve.pushSeatToLiveKit(channelId, mePublic);

      const others = Array.from(call.participants.values()).filter((p) => !sameUserId(p.id, myUid));
      socket.emit("server:voice:joined", {
        serverId: channel.server_id,
        channelId,
        channelName: channel.name,
        channelType: channel.type,
        participants: others,
        canSpeak,
        canStream: canStreamInChannel(channel, resolved, mePublic),
        canRequestToSpeak: mePublic.canRequestToSpeak,
        stageRole: mePublic.stageRole,
        requestedToSpeak: Boolean(mePublic.requestedToSpeak),
        serverMuted: Boolean(mePublic.serverMuted),
        serverDeafened: Boolean(mePublic.serverDeafened),
        afkChannel: Boolean(mePublic.afkLocked),
        // Same seat taken again (socket reconnect, media retry): clients keep their
        // roster / media and skip the join sounds.
        rejoin: Boolean(alreadySeated && keepSeat),
        ...(livekit ? { livekit } : {}),
      });

      socket.to(`server-voice:${channelId}`).emit("server:voice:member-joined", {
        serverId: channel.server_id,
        channelId,
        user: mePublic,
        rejoin: Boolean(alreadySeated && keepSeat),
      });

      emitChannelState(io, channel.server_id, channelId);
      // Re-engagement: "<friend> is in voice" push to away friends (lib/reengage.js, off by default).
      if (!alreadySeated) {
        require("../lib/reengage").fire("onVoiceJoin", {
          joinerId: myUid,
          serverId: channel.server_id,
          channelId,
          channelName: channel.name,
          channelType: channel.type,
        });
      }
    } catch (err) {
      if ((socket.data.voiceJoinEpoch || 0) !== epoch) return;
      console.error("[ServerVoice] join error:", err.message || err);
      socket.emit("server:voice:error", {
        phase: "join",
        channelId,
        ...errorFields(err, "message"),
        message: err.message || "Failed to join voice channel.",
        code: err.code || null,
      });
    }
  });

  socket.on("server:voice:leave", ({ channelId } = {}) => {
    bumpVoiceJoin();
    channelId = channelId ? normId(channelId) : channelId;
    if (channelId) {
      // Only that channel, and only a seat this socket holds. A stale leave (the client's
      // old channel after a move, or a device whose seat went to another device) used to
      // fall through to "every seat" and dropped the live one (server-voice-02 / 03).
      if (findUserInChannel(channelId, myId) && socketHoldsSeat(channelId, myId, socket.id)) {
        removeFromVoice(io, channelId, myId, { originSocketId: socket.id });
      }
      try {
        socket.leave(`server-voice:${channelId}`);
      } catch (err) {
        console.warn("[ServerVoice] leave room failed:", err?.message || err);
      }
    } else {
      // No channel id (the client already cleared it): drop the seats this socket holds.
      for (const [cid, call] of [...activeServerVoiceCalls.entries()]) {
        if (!getParticipantEntry(call, myId) || !socketHoldsSeat(cid, myId, socket.id)) continue;
        removeFromVoice(io, cid, myId, { originSocketId: socket.id });
        socket.leave(`server-voice:${cid}`);
      }
    }
    socket.emit("server:voice:left", { channelId: channelId || null });
  });

  // V9: a seat belongs to the socket that joined it. When that socket goes away while
  // another socket of the user stays connected (phone app open), the seat used to stay
  // forever. Give a reconnect a short grace (the client re-emits join on connect).
  socket.on("disconnect", (why) => {
    const sid = socket.id;
    if (!sid) return;
    const owned = [];
    for (const [channelId, call] of activeServerVoiceCalls.entries()) {
      if (getParticipantEntry(call, myId) && seatOwners.get(seatOwnerKey(channelId, myId)) === sid) owned.push(channelId);
    }
    if (!owned.length) return;
    // Drop statistics without ids (voice-drops-05): why seat holders lose their socket,
    // how many come back within the grace and how fast.
    console.log(`[VoiceSeat] holder socket lost reason=${String(why || "unknown").replace(/[^a-z ]/gi, "").slice(0, 40)} seats=${owned.length}`);
    for (const channelId of owned) seatLostAt.set(seatOwnerKey(channelId, myId), Date.now());
    const timer = setTimeout(() => {
      for (const channelId of owned) {
        const call = activeServerVoiceCalls.get(channelId);
        const entry = getParticipantEntry(call, myId);
        if (!entry || seatOwners.get(seatOwnerKey(channelId, myId)) !== sid) continue;
        seatLostAt.delete(seatOwnerKey(channelId, myId));
        console.log(`[VoiceSeat] seat dropped after grace graceMs=${SEAT_RECONNECT_GRACE_MS}`);
        removeFromVoice(io, channelId, myId);
        io.to(`user:${myId}`).emit("server:voice:force-disconnected", {
          serverId: call?.serverId,
          channelId,
          reason: "disconnected",
        });
      }
    }, SEAT_RECONNECT_GRACE_MS);
    timer.unref?.();
  });

  /** Force-disconnect a member from voice (MOVE_MEMBERS). */
  socket.on("server:voice:disconnect", async ({ serverId, channelId, userId } = {}) => {
    if (!serverId || !userId) return;
    serverId = normId(serverId);
    channelId = channelId ? normId(channelId) : channelId;
    const targetId = normId(userId);
    try {
      if (sameUserId(targetId, myId)) {
        socket.emit("server:voice:error", { message: "Cannot disconnect yourself this way." });
        return;
      }
      const found =
        (channelId && findUserInChannel(channelId, targetId)) || findUserVoiceChannel(targetId);
      if (!found || !sameUserId(normId(found.call.serverId), serverId)) {
        socket.emit("server:voice:error", { message: "User is not in a voice channel." });
        return;
      }
      await assertVoiceMod(myId, serverId, Permissions.MOVE_MEMBERS, { channelIds: [found.channelId] });
      await assertVoiceTarget(myId, serverId, targetId, { flag: Permissions.MOVE_MEMBERS, channelIds: [found.channelId] });
      removeFromVoice(io, found.channelId, targetId);
      io.to(`user:${targetId}`).emit("server:voice:force-disconnected", {
        serverId,
        channelId: found.channelId,
        byUserId: myId,
      });
      socket.emit("server:voice:mod-ok", {
        action: "disconnect",
        userId: targetId,
        channelId: found.channelId,
      });
    } catch (err) {
      socket.emit("server:voice:error", {
        ...errorFields(err, "message"),
        message: err.message || "Disconnect failed.",
        code: err.code || null,
      });
    }
  });

  /** Move a member to another voice channel (MOVE_MEMBERS). */
  socket.on(
    "server:voice:move",
    async ({ serverId, userId, fromChannelId, toChannelId } = {}) => {
      if (!serverId || !userId || !toChannelId) return;
      serverId = normId(serverId);
      fromChannelId = fromChannelId ? normId(fromChannelId) : fromChannelId;
      const targetId = normId(userId);
      const destId = normId(toChannelId);
      try {
        // Discord: movers can seat members into channels the member cannot see.
        const { channel: dest, resolved: destPerms, canView, canConnect } = await assertVoiceAccess(
          targetId,
          destId,
          { bypassConnectView: true }
        );
        if (normId(dest.server_id) !== serverId) {
          socket.emit("server:voice:error", { message: "Target channel is on another server." });
          return;
        }
        // Prefer the stated source channel, but fall back if the client id is stale.
        const found =
          (fromChannelId && findUserInChannel(fromChannelId, targetId)) ||
          findUserVoiceChannel(targetId);
        if (!found || normId(found.call.serverId) !== serverId) {
          socket.emit("server:voice:error", { message: "User is not in a voice channel." });
          return;
        }
        await assertVoiceMod(myId, serverId, Permissions.MOVE_MEMBERS, { channelIds: [found.channelId, destId] });
        await assertVoiceTarget(myId, serverId, targetId, { flag: Permissions.MOVE_MEMBERS, channelIds: [found.channelId, destId], connectIds: [destId] });
        if (String(found.channelId) === destId) return;

        const snapshot = {
          ...(found.entry?.member || { id: targetId }),
          id: targetId,
        };
        const owner = seatOwners.get(seatOwnerKey(found.channelId, targetId));
        removeFromVoice(io, found.channelId, targetId, { keepCoinSession: true });
        if (owner) seatOwners.set(seatOwnerKey(destId, targetId), owner);
        callCoinSessions.move(targetId, { context: "server", channelId: found.channelId }, { context: "server", channelId: destId }, {
          meta: { serverId: String(serverId), channelName: dest.name || null },
        });
        const moveTarget = seatTarget(io, owner, targetId);

        let destCall = activeServerVoiceCalls.get(destId);
        if (!destCall) {
          destCall = {
            serverId,
            channelName: dest.name,
            participants: new Map(),
            startTime: Date.now(),
          };
          activeServerVoiceCalls.set(destId, destCall);
        }
        snapshot.channelType = dest.type;
        snapshot.stageRole = dest.type === "stage" ? "audience" : "speaker";
        snapshot.requestedToSpeak = false;
        snapshot.canSpeakPermission = hasPermission(destPerms.bits, Permissions.SPEAK);
        snapshot.canStream = hasPermission(destPerms.bits, Permissions.STREAM);
        snapshot.canRequestToSpeak = hasPermission(destPerms.bits, Permissions.REQUEST_TO_SPEAK);
        snapshot.canPrioritySpeaker = hasPermission(destPerms.bits, Permissions.PRIORITY_SPEAKER);
        snapshot.muted = dest.type === "stage" ? true : Boolean(snapshot.muted);
        snapshot.cameraOn = false;
        snapshot.isScreenSharing = false;
        // Server mute / deafen are stored per member and follow the move (V3); no SPEAK
        // at the destination locks the mic like a join does (V10).
        const destMod = await ve.getVoiceModState(serverId, targetId);
        snapshot.modMuted = Boolean(destMod.muted);
        snapshot.modDeafened = Boolean(destMod.deafened);
        snapshot.afkLocked = (await serverAfkChannelId(serverId)) === destId;
        // Session-only seat into a private channel (cleared on leave).
        snapshot.forceMovedIn = !canView || !canConnect;
        snapshot.joinedAt = Date.now();
        ve.recomputeSeatLocks(snapshot);
        snapshot.afkIdleSince = snapshot.muted ? Date.now() : null;
        setParticipant(destCall, targetId, snapshot);

        // Put every socket for the user into the destination voice room immediately
        // so signaling works even before the client finishes media rejoin.
        try {
          io.in(moveTarget).socketsJoin(`server-voice:${destId}`);
          io.in(moveTarget).socketsJoin(`server:${serverId}`);
        } catch {
          /* ignore older socket.io */
        }

        emitChannelState(io, serverId, destId);
        const seated = destCall.participants.get(targetId) || snapshot;
        io.to(`server-voice:${destId}`).emit("server:voice:member-joined", {
          serverId,
          channelId: destId,
          user: seated,
        });
        void emitToChannelViewers(io, serverId, destId, "server:voice:member-joined", {
          serverId,
          channelId: destId,
          user: seated,
        });

        io.to(moveTarget).emit("server:voice:force-moved", {
          serverId,
          fromChannelId: found.channelId,
          toChannelId: destId,
          channelName: dest.name,
          channelType: dest.type,
          byUserId: myId,
          hiddenChannel: !canView,
        });
        socket.emit("server:voice:mod-ok", {
          action: "move",
          userId: targetId,
          fromChannelId: found.channelId,
          toChannelId: destId,
        });
      } catch (err) {
        socket.emit("server:voice:error", {
          ...errorFields(err, "message"),
          message: err.message || "Move failed.",
          code: err.code || null,
        });
      }
    }
  );

  /**
   * Server-mute / server-deafen a member (MUTE_MEMBERS / DEAFEN_MEMBERS). The state is
   * stored per member (survives leave + join, moves, AFK; V3 / SK-1) and enforced in
   * LiveKit with updateParticipant (V4): no publishing while muted, no subscribing
   * while deafened. A member who is not in voice can still be (un)muted.
   */
  async function serverMuteOrDeafen({ serverId, channelId, userId, value, kind }) {
    if (!serverId || !userId) return;
    serverId = normId(serverId);
    channelId = channelId ? normId(channelId) : channelId;
    const targetId = normId(userId);
    const flag = kind === "deafen" ? Permissions.DEAFEN_MEMBERS : Permissions.MUTE_MEMBERS;
    try {
      const found =
        (channelId && findUserInChannel(channelId, targetId)) || findUserVoiceChannel(targetId);
      const inThisServer = found && normId(found.call.serverId) === serverId;
      await assertVoiceMod(myId, serverId, flag, { channelIds: inThisServer ? [found.channelId] : [] });
      if (!inThisServer) {
        const target = await resolveMemberPermissions(supabase, serverId, targetId);
        if (!target.isMember) {
          socket.emit("server:voice:error", { message: "User is not in a voice channel." });
          return;
        }
      }
      await assertVoiceTarget(myId, serverId, targetId, {
        flag,
        channelIds: inThisServer ? [found.channelId] : [],
      });
      const on = Boolean(value);
      const applied = await ve.applyServerVoiceMute(io, {
        serverId,
        userId: targetId,
        ...(kind === "deafen" ? { deafened: on } : { muted: on }),
        byUserId: myId,
      });
      if (!applied) throw new Error(kind === "deafen" ? "Deafen failed." : "Mute failed.");
      socket.emit("server:voice:mod-ok", {
        action: kind === "deafen" ? (on ? "server-deafen" : "server-undeafen") : on ? "server-mute" : "server-unmute",
        userId: targetId,
        channelId: inThisServer ? found.channelId : null,
      });
    } catch (err) {
      socket.emit("server:voice:error", {
        ...errorFields(err, "message"),
        message: err.message || (kind === "deafen" ? "Deafen failed." : "Mute failed."),
        code: err.code || null,
      });
    }
  }

  socket.on("server:voice:server-mute", ({ serverId, channelId, userId, muted } = {}) =>
    serverMuteOrDeafen({ serverId, channelId, userId, value: muted, kind: "mute" })
  );

  socket.on("server:voice:server-deafen", ({ serverId, channelId, userId, deafened } = {}) =>
    serverMuteOrDeafen({ serverId, channelId, userId, value: deafened, kind: "deafen" })
  );

  socket.on("server:voice:offer", ({ channelId, toUserId, offer, screen } = {}) => {
    if (!channelId || !toUserId || !offer) return;
    channelId = normId(channelId);
    const call = activeServerVoiceCalls.get(channelId);
    const self = getParticipantEntry(call, myId);
    if (!self) return;
    // Relay only to a peer seated in the same call (any user id was accepted before).
    if (!getParticipantEntry(call, toUserId)) return;
    const { sanitizeScreenAnnouncement } = require("../lib/screenShareSignal");
    const announced = sanitizeScreenAnnouncement(screen);
    io.to(`user:${String(toUserId)}`).emit("server:voice:offer", {
      channelId,
      fromUserId: String(myId),
      fromUser: self.member || resolvePublicUser(socket),
      offer,
      ...(announced ? { screen: announced } : {}),
    });
  });

  socket.on("server:voice:answer", ({ channelId, toUserId, answer } = {}) => {
    if (!channelId || !toUserId || !answer) return;
    channelId = normId(channelId);
    const call = activeServerVoiceCalls.get(channelId);
    if (!getParticipantEntry(call, myId)) return;
    if (!getParticipantEntry(call, toUserId)) return;
    io.to(`user:${String(toUserId)}`).emit("server:voice:answer", {
      channelId,
      fromUserId: String(myId),
      answer,
    });
  });

  socket.on("server:voice:ice", ({ channelId, toUserId, candidate } = {}) => {
    if (!channelId || !toUserId || !candidate) return;
    channelId = normId(channelId);
    const call = activeServerVoiceCalls.get(channelId);
    if (!getParticipantEntry(call, myId)) return;
    if (!getParticipantEntry(call, toUserId)) return;
    io.to(`user:${String(toUserId)}`).emit("server:voice:ice", {
      channelId,
      fromUserId: String(myId),
      candidate,
    });
  });

  socket.on("server:voice:screen:start", async ({ channelId, screen } = {}) => {
    if (!channelId) return;
    if (!allow("media", 20, 5000)) return;
    channelId = normId(channelId);
    const call = activeServerVoiceCalls.get(channelId);
    const self = getParticipantEntry(call, myId);
    if (!self) return;
    if (await rejectIfTimedOut(call, channelId)) return;
    const me = self.member;
    if (!participantCanStream(me)) {
      socket.emit("server:voice:error", {
        channelId,
        message: "Missing STREAM permission.",
        code: "MISSING_PERMISSION",
      });
      return;
    }
    if (me) {
      me.isScreenSharing = true;
      setParticipant(call, myId, me);
    }
    const { sanitizeScreenAnnouncement } = require("../lib/screenShareSignal");
    const announced = sanitizeScreenAnnouncement(screen);
    socket.to(`server-voice:${channelId}`).emit("server:voice:screen:started", {
      serverId: call.serverId,
      channelId,
      fromUserId: String(myId),
      fromUser: me || { id: String(myId) },
      ...(announced ? { screen: announced } : {}),
    });
    emitChannelState(io, call.serverId, channelId);
  });

  socket.on("server:voice:screen:stop", ({ channelId } = {}) => {
    if (!channelId) return;
    if (!allow("media", 20, 5000)) return;
    channelId = normId(channelId);
    const call = activeServerVoiceCalls.get(channelId);
    const self = getParticipantEntry(call, myId);
    if (!self) return;
    const me = self.member;
    if (me) {
      me.isScreenSharing = false;
      setParticipant(call, myId, me);
    }
    socket.to(`server-voice:${channelId}`).emit("server:voice:screen:stopped", {
      serverId: call.serverId,
      channelId,
      fromUserId: String(myId),
    });
    emitChannelState(io, call.serverId, channelId);
  });

  socket.on("server:voice:camera:start", async ({ channelId } = {}) => {
    if (!channelId) return;
    if (!allow("media", 20, 5000)) return;
    channelId = normId(channelId);
    const call = activeServerVoiceCalls.get(channelId);
    const self = getParticipantEntry(call, myId);
    if (!self?.member) return;
    if (await rejectIfTimedOut(call, channelId)) return;
    const me = self.member;
    if (!participantCanStream(me)) {
      socket.emit("server:voice:error", {
        channelId,
        message: "Missing STREAM permission.",
        code: "MISSING_PERMISSION",
      });
      return;
    }
    me.cameraOn = true;
    setParticipant(call, myId, me);
    socket.to(`server-voice:${channelId}`).emit("server:voice:camera:started", {
      serverId: call.serverId,
      channelId,
      fromUserId: String(myId),
      fromUser: me,
    });
    emitChannelState(io, call.serverId, channelId);
  });

  socket.on("server:voice:camera:stop", ({ channelId } = {}) => {
    if (!channelId) return;
    if (!allow("media", 20, 5000)) return;
    channelId = normId(channelId);
    const call = activeServerVoiceCalls.get(channelId);
    const self = getParticipantEntry(call, myId);
    if (!self) return;
    const me = self.member;
    if (me) {
      me.cameraOn = false;
      setParticipant(call, myId, me);
    }
    socket.to(`server-voice:${channelId}`).emit("server:voice:camera:stopped", {
      serverId: call.serverId,
      channelId,
      fromUserId: String(myId),
    });
    emitChannelState(io, call.serverId, channelId);
  });

  socket.on("server:voice:stage:request", async ({ channelId } = {}) => {
    if (!channelId) return;
    channelId = normId(channelId);
    // Hand raises broadcast to the whole stage: one per few seconds (V13).
    if (!allow("stage-request", 1, STAGE_REQUEST_COOLDOWN_MS)) return;
    try {
      const seat = findUserInChannel(channelId, myId)?.entry?.member;
      const { resolved } = await assertStageChannel(myId, channelId, { bypassConnectView: Boolean(seat?.forceMovedIn) });
      if (!hasPermission(resolved.bits, Permissions.REQUEST_TO_SPEAK)) {
        socket.emit("server:voice:error", {
          channelId,
          message: "Missing REQUEST_TO_SPEAK permission.",
          code: "MISSING_PERMISSION",
        });
        return;
      }
      channelId = normId(channelId);
    const call = activeServerVoiceCalls.get(channelId);
      const self = getParticipantEntry(call, myId);
      const me = self?.member;
      if (!call || !me || me.stageRole === "speaker") return;
      me.requestedToSpeak = true;
      setParticipant(call, myId, me);
      io.to(`server-voice:${channelId}`).emit("server:voice:stage-state", {
        serverId: call.serverId,
        channelId,
        userId: String(myId),
        requestedToSpeak: true,
        stageRole: me.stageRole,
      });
      emitChannelState(io, call.serverId, channelId);
    } catch (err) {
      socket.emit("server:voice:error", {
        channelId,
        ...errorFields(err, "message"),
        message: err.message || "Request to speak failed.",
        code: err.code || null,
      });
    }
  });

  /**
   * Invite to speak / move to audience. Stage moderators need MOVE_MEMBERS and
   * MUTE_MEMBERS (V13, Discord parity). A server mute stays in place; LiveKit rights
   * follow the role at once (V4), the iOS screen companion goes on demotion.
   */
  socket.on("server:voice:stage:set-role", async ({ serverId, channelId, userId, stageRole } = {}) => {
    if (!serverId || !channelId || !userId) return;
    serverId = normId(serverId);
    channelId = normId(channelId);
    const targetId = normId(userId);
    try {
      await assertVoiceMod(myId, serverId, Permissions.MOVE_MEMBERS, { channelIds: [channelId] });
      await assertVoiceMod(myId, serverId, Permissions.MUTE_MEMBERS, { channelIds: [channelId] });
      const found = findUserInChannel(channelId, targetId);
      const member = found?.entry?.member;
      const { channel, resolved } = await assertStageChannel(targetId, channelId, {
        bypassConnectView: Boolean(member?.forceMovedIn),
      });
      if (normId(channel.server_id) !== serverId) {
        socket.emit("server:voice:error", { channelId, message: "Server mismatch.", code: "SERVER_MISMATCH" });
        return;
      }
      if (!found || !member) {
        socket.emit("server:voice:error", { channelId, message: "User is not in this stage." });
        return;
      }
      await assertVoiceTarget(myId, serverId, targetId, { flag: Permissions.MOVE_MEMBERS, channelIds: [channelId] });
      await assertVoiceTarget(myId, serverId, targetId, { flag: Permissions.MUTE_MEMBERS, channelIds: [channelId] });
      const nextRole = stageRole === "speaker" ? "speaker" : "audience";
      if (nextRole === "speaker" && !hasPermission(resolved.bits, Permissions.SPEAK)) {
        socket.emit("server:voice:error", {
          channelId,
          message: "User is missing SPEAK permission.",
          code: "MISSING_PERMISSION",
        });
        return;
      }
      member.stageRole = nextRole;
      member.requestedToSpeak = false;
      member.canSpeakPermission = hasPermission(resolved.bits, Permissions.SPEAK);
      member.canStream = hasPermission(resolved.bits, Permissions.STREAM);
      if (nextRole === "audience") {
        member.muted = true;
        member.cameraOn = false;
        member.isScreenSharing = false;
      }
      ve.recomputeSeatLocks(member);
      setParticipant(found.call, targetId, member);
      void ve.pushSeatToLiveKit(channelId, member);
      io.to(`user:${targetId}`).emit("server:voice:stage-role", {
        serverId,
        channelId,
        stageRole: nextRole,
        serverMuted: Boolean(member.serverMuted),
        byUserId: myId,
      });
      io.to(`server-voice:${channelId}`).emit("server:voice:stage-state", {
        serverId,
        channelId,
        userId: targetId,
        requestedToSpeak: false,
        stageRole: nextRole,
      });
      io.to(`server-voice:${channelId}`).emit("server:voice:media-state", {
        channelId,
        fromUserId: targetId,
        muted: Boolean(member.muted),
        serverMuted: Boolean(member.serverMuted),
        serverDeafened: Boolean(member.serverDeafened),
        cameraOn: Boolean(member.cameraOn),
      });
      emitChannelState(io, serverId, channelId);
      socket.emit("server:voice:mod-ok", {
        action: "stage-role",
        userId: targetId,
        channelId,
        stageRole: nextRole,
      });
    } catch (err) {
      socket.emit("server:voice:error", {
        channelId,
        ...errorFields(err, "message"),
        message: err.message || "Stage role update failed.",
        code: err.code || null,
      });
    }
  });

  socket.on("server:voice:media-state", ({ channelId, muted, cameraOn, deafened, ptt } = {}) => {
    if (!channelId) return;
    if (!allow("media", 20, 5000)) return;
    channelId = normId(channelId);
    const call = activeServerVoiceCalls.get(channelId);
    const self = getParticipantEntry(call, myId);
    if (!self) return;
    const me = self.member;
    if (me) {
      // Server mute, server deafen, AFK lock, no SPEAK or a stage audience role lock
      // the mic (V10): only an unmute is refused, muting is always fine.
      if (!muted && !ve.canPublishSeat(me)) {
        if (me.serverDeafened) {
          socket.emit("server:voice:force-deafen", {
            serverId: call.serverId,
            channelId,
            deafened: true,
            byUserId: null,
          });
        } else {
          socket.emit("server:voice:force-mute", {
            serverId: call.serverId,
            channelId,
            muted: true,
            byUserId: null,
          });
        }
        return;
      }
      // Read before assigning: the AFK clock starts on the mute transition (SC-6).
      const wasMuted = Boolean(me.muted);
      me.muted = Boolean(muted);
      // A camera flag without STREAM is ignored (it bypassed camera:start's check).
      if (cameraOn !== undefined) me.cameraOn = Boolean(cameraOn) && participantCanStream(me);
      if (deafened !== undefined) me.deafened = Boolean(deafened);
      // Push-to-talk (client sends ptt: true with its press / release): the key is often
      // up when the 16 s DesCoin beat lands, so the last open-mic moment still counts
      // (serverVoiceEnforce.seatCanEarn). A plain self-mute never does.
      if (ptt !== undefined) me.ptt = Boolean(ptt);
      if (!me.muted || !wasMuted) me.lastUnmutedAt = Date.now();
      if (me.muted && !wasMuted) {
        me.afkIdleSince = Date.now();
      } else if (!me.muted) {
        me.afkIdleSince = null;
      } else if (!me.afkIdleSince) {
        me.afkIdleSince = Date.now();
      }
      setParticipant(call, myId, me);
    }
    socket.to(`server-voice:${channelId}`).emit("server:voice:media-state", {
      channelId,
      fromUserId: String(myId),
      muted: Boolean(me?.muted),
      serverMuted: Boolean(me?.serverMuted),
      serverDeafened: Boolean(me?.serverDeafened),
      deafened: Boolean(me?.deafened),
      cameraOn: Boolean(me?.cameraOn),
    });
    emitChannelState(io, call.serverId, channelId);
  });
}

/**
 * AFK move. The target must be able to see and connect to the AFK channel; if not, the
 * member is disconnected instead (SC-1: a private channel set as AFK must not seat
 * anyone who could not join it). In the AFK channel members cannot speak (afkLocked),
 * moderator mute / deafen carry over (V3).
 */
async function moveParticipantToChannel(io, serverId, userId, fromChannelId, toChannelId) {
  const targetId = normId(userId);
  const destId = normId(toChannelId);
  serverId = normId(serverId);
  const found =
    (fromChannelId && findUserInChannel(fromChannelId, targetId)) || findUserVoiceChannel(targetId);
  if (!found || normId(found.call.serverId) !== serverId) return false;
  if (String(found.channelId) === destId) return true;

  let access;
  try {
    access = await assertVoiceAccess(targetId, destId, { bypassConnectView: true });
  } catch (err) {
    // Timed out / no longer a member: leave voice. A missing AFK channel is handled by
    // the scanner (it clears the setting); nobody is moved.
    if (err?.code === "TIMED_OUT" || err?.code === "NOT_MEMBER") {
      removeFromVoice(io, found.channelId, targetId);
      io.to(`user:${targetId}`).emit("server:voice:force-disconnected", {
        serverId,
        channelId: found.channelId,
        reason: err.code === "TIMED_OUT" ? "timeout" : "not_member",
      });
      return false;
    }
    throw err;
  }
  const { channel: dest, resolved: destPerms, canView, canConnect } = access;
  if (normId(dest.server_id) !== serverId) return false;

  if (!canView || !canConnect) {
    removeFromVoice(io, found.channelId, targetId);
    io.to(`user:${targetId}`).emit("server:voice:force-disconnected", {
      serverId,
      channelId: found.channelId,
      reason: "afk",
    });
    return false;
  }

  const snapshot = { ...(found.entry?.member || { id: targetId }), id: targetId };
  const owner = seatOwners.get(seatOwnerKey(found.channelId, targetId));
  removeFromVoice(io, found.channelId, targetId, { keepCoinSession: true });
  if (owner) seatOwners.set(seatOwnerKey(destId, targetId), owner);
  callCoinSessions.move(targetId, { context: "server", channelId: found.channelId }, { context: "server", channelId: destId }, {
    meta: { serverId: String(dest.server_id), channelName: dest.name || null },
  });
  const moveTarget = seatTarget(io, owner, targetId);

  let destCall = activeServerVoiceCalls.get(destId);
  if (!destCall) {
    destCall = {
      serverId: dest.server_id,
      channelName: dest.name,
      participants: new Map(),
      startTime: Date.now(),
    };
    activeServerVoiceCalls.set(destId, destCall);
  }
  const mod = await ve.getVoiceModState(serverId, targetId);
  snapshot.channelType = dest.type;
  snapshot.stageRole = dest.type === "stage" ? "audience" : "speaker";
  snapshot.requestedToSpeak = false;
  snapshot.canSpeakPermission = hasPermission(destPerms.bits, Permissions.SPEAK);
  snapshot.canStream = hasPermission(destPerms.bits, Permissions.STREAM);
  snapshot.canRequestToSpeak = hasPermission(destPerms.bits, Permissions.REQUEST_TO_SPEAK);
  snapshot.canPrioritySpeaker = hasPermission(destPerms.bits, Permissions.PRIORITY_SPEAKER);
  snapshot.modMuted = Boolean(mod.muted);
  snapshot.modDeafened = Boolean(mod.deafened);
  snapshot.afkLocked = true;
  snapshot.muted = true;
  snapshot.cameraOn = false;
  snapshot.isScreenSharing = false;
  snapshot.afkIdleSince = Date.now();
  snapshot.joinedAt = Date.now();
  snapshot.forceMovedIn = false;
  ve.recomputeSeatLocks(snapshot);
  setParticipant(destCall, targetId, snapshot);

  try {
    io.in(moveTarget).socketsJoin(`server-voice:${destId}`);
    io.in(moveTarget).socketsJoin(`server:${dest.server_id}`);
  } catch {
    /* ignore */
  }

  emitChannelState(io, dest.server_id, destId);
  // Same arrival event as a moderator move, so rosters in the AFK channel add the member.
  const seated = destCall.participants.get(String(targetId)) || snapshot;
  io.to(`server-voice:${destId}`).emit("server:voice:member-joined", { serverId: dest.server_id, channelId: destId, user: seated });
  void emitToChannelViewers(io, dest.server_id, destId, "server:voice:member-joined", { serverId: dest.server_id, channelId: destId, user: seated });
  io.to(moveTarget).emit("server:voice:force-moved", {
    serverId: dest.server_id,
    fromChannelId: found.channelId,
    toChannelId: destId,
    channelName: dest.name,
    channelType: dest.type,
    byUserId: null,
    reason: "afk",
    hiddenChannel: false,
  });
  return true;
}

/** Clear a dangling AFK setting (channel deleted or no longer voice; V8 / SC-5). */
async function clearDanglingAfkChannel(serverId, afkChannelId) {
  try {
    const { error } = await supabase
      .from("servers")
      .update({ afk_channel_id: null })
      .eq("id", serverId)
      .eq("afk_channel_id", afkChannelId);
    if (error) throw error;
  } catch (err) {
    console.warn("[ServerVoice] AFK setting cleanup failed:", err?.message || err);
  }
}

/**
 * One AFK pass. Errors are contained per server and per member (V8 / SC-3 / SK-10): a
 * deleted AFK channel or one timed-out member no longer stops AFK for everyone. Stage
 * channels are skipped (their audience is muted by design, SC-6). Idle time counts from
 * the self-mute (or the join while muted).
 */
async function runAfkScan(io, now = Date.now()) {
  const { data: servers, error } = await supabase
    .from("servers")
    .select("id, afk_channel_id, afk_timeout_seconds")
    .not("afk_channel_id", "is", null);
  if (error || !servers?.length) return { moved: 0, failed: 0 };

  const afkByServer = new Map(
    servers.map((s) => [
      normId(s.id),
      {
        afkChannelId: normId(s.afk_channel_id),
        timeoutMs: Math.max(60, Number(s.afk_timeout_seconds) || 300) * 1000,
      },
    ])
  );

  let moved = 0;
  let failed = 0;
  const brokenServers = new Set();
  for (const [channelId, call] of [...activeServerVoiceCalls.entries()]) {
    const sid = normId(call.serverId);
    const cfg = afkByServer.get(sid);
    if (!cfg || brokenServers.has(sid) || String(channelId) === cfg.afkChannelId) continue;
    const first = call.participants.values().next().value;
    if (first?.channelType === "stage") continue;

    for (const [uid, member] of [...call.participants.entries()]) {
      if (!member?.muted || member.channelType === "stage") continue;
      const idleSince = member.afkIdleSince || member.joinedAt || now;
      if (now - idleSince < cfg.timeoutMs) continue;
      try {
        if (await moveParticipantToChannel(io, sid, uid, channelId, cfg.afkChannelId)) moved += 1;
      } catch (err) {
        failed += 1;
        if (err?.code === "NOT_FOUND" || err?.code === "NOT_VOICE_CHANNEL") {
          brokenServers.add(sid);
          await clearDanglingAfkChannel(sid, cfg.afkChannelId);
          break;
        }
        console.warn("[ServerVoice] AFK move failed:", err?.message || err);
      }
    }
  }
  return { moved, failed };
}

let afkScannerTimer = null;

function startAfkIdleScanner(io) {
  if (afkScannerTimer || !io) return;
  afkScannerTimer = setInterval(async () => {
    try {
      await runAfkScan(io);
    } catch (err) {
      console.warn("[ServerVoice] AFK scan failed:", err?.message || err);
    }
    // LiveKit sweep: identities in a server voice room without a seat (ghost tokens,
    // kept JWTs) are removed even when the LiveKit webhook is not configured.
    try {
      await ve.reconcileAllLiveKitRooms();
    } catch (err) {
      console.warn("[ServerVoice] LiveKit sweep failed:", err?.message || err);
    }
  }, 60_000);
  afkScannerTimer.unref?.();
}

module.exports = {
  registerServerVoiceHandlers,
  removeUserFromAllServerVoice,
  removeUserFromServerVoice,
  endServerVoiceChannel,
  endAllServerVoice,
  findUserVoiceChannel,
  findUserInChannel,
  seatOwnerOf,
  refreshSeatProfile,
  startAfkIdleScanner,
  runAfkScan,
  // lib/serverVoiceEnforce.js (contract for the other server modules) uses these.
  _internals: { removeFromVoice, emitChannelState, setParticipant, getParticipantEntry, moveParticipantToChannel },
};
