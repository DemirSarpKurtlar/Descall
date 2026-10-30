"use strict";

const { checkMessageSend } = require("../lib/platformPolicy");
const supabase = require("../db/supabase");
const { normalizeIncomingMediaUrl } = require("../lib/privateMedia");
const iosPushContext = require("../lib/iosPushContext");
const friendSince = require("../lib/friendSince");
const {
  loadUserProfile,
  savePresenceStatus,
  cacheUserProfile,
  broadcastUserProfileUpdate,
  enrichFriendEntry,
  toPublicUser,
  getCachedPublicUser,
  publicPresenceStatus,
  ensureCosmeticsCached,
  pickChatCosmetics,
} = require("../lib/userProfile");
const {
  presence,
  socketToUser,
  friends,
  pendingRequests,
  lastSeenByUserId,
  usernameById,
  dmUnreadByUser,
  notificationsByUser,
  dmHistory,
  MAX_DM_PER_CONV,
  MAX_NOTIFICATIONS,
  systemConfig,
  profanityWords,
  bannedUserIds,
  userRoles,
  rateLimitDm,
  userSessionStartMs,
  userOnlineAccumMs,
  dmBlockPairs,
  activeGroupCalls,
  appendAudit,
  appendErrorLog,
} = require("../runtime/sharedState");
const { setupAdminSocket, notifyAdminRoom } = require("./adminHandlers");
const { publicFeatureFlags } = require("../lib/systemSettings");
const dmPrefs = require("../lib/dmConversationPrefs");
const {
  convKey,
  formatDmPreview,
  getLastDmMessage,
  cacheDmMessages,
  messageSender,
  mapDmRow,
  loadDmMessages,
  isAcceptedFriend,
  buildDmPreviewMaps,
  attachReactions,
} = require("../lib/dmMessages");
const { remainingUserSocketIds } = require("../lib/presenceRoster");
const { getPresenceFanout, refreshPresenceFor } = require("../runtime/presenceFanoutInstance");
const { registerGroupHandlers, removeUserFromAllGroupCalls } = require("./groupHandlers");
const { registerServerChannelHandlers } = require("./serverChannelHandlers");
const { registerPollHandlers } = require("./pollHandlers");
const { startPollSweeper } = require("../lib/polls");
const { registerServerVoiceHandlers, removeUserFromAllServerVoice, startAfkIdleScanner } = require("./serverVoiceHandlers");
const { scheduleTemporaryMemberCleanup } = require("../lib/serverMemberJoin");
const { scheduleParticipantDisconnectGrace } = require("./groupCallLifecycle");
const { toUtcIso } = require("../lib/datetime");
const {
  trackOffer,
  markAnswered,
  bufferCalleeIce,
  answerReplayForCaller,
  isActiveDmCall,
  finalizeCall,
  getPendingCall,
  endedRecently,
  bufferCallerIce,
  listRingingForCallee,
  callStateByUuid,
  listActiveDmCalls,
} = require("../lib/dmCallLog");
const { createRingFanout } = require("../lib/callRingFanout");
const { buildDmCallSummary, callSummaryMessageFields } = require("../lib/callSummary");
const { isBlockedEitherWay } = require("../lib/blocking");
const { routeDmSlashCommand } = require("../lib/dmSlashCommands");
const { planDmSend, planCallOffer } = require("../lib/messageRequestPolicy");
const {
  upsertMessageRequest,
  listMessageRequests,
  deleteMessageRequest,
  messageRequestPreview,
} = require("../lib/messageRequestStore");
const shop = require("../lib/shop");
const descoin = require("../lib/descoin");
const { touchLastSeen } = require("../lib/presenceTouch");
const { recordFirstMessage } = require("../lib/userAnalyticsStore");
const { screenShareSessions } = require("../runtime/sharedState");

// Basic anti-farm guards that don't belong in the ledger caps themselves:
// throttle how often a single socket can even ask for a heartbeat credit,
// and skip paying out messages that are exact repeats of the sender's last
// message (classic "spam the same text for coins" bot behavior).
const { shouldCreditMessage } = require("../lib/descoinMessageGuard");
// DesCoin anti-bot Faz 0 (monitor only): observes messages / heartbeats /
// connects and scores risk in the background. It never changes a credit.
const descoinAntibot = require("../lib/descoinAntibot");
const { socketIp } = require("../middleware/socketAuth");
const descoinHeartbeatLastAt = new Map(); // `${userId}:${reason}` -> ms
const DESCOIN_HEARTBEAT_MIN_INTERVAL_MS = 15_000;
// DM calls have no DB-backed screen-share session (unlike group calls' own
// `screenShareSessions`), so track it in-memory here purely to validate
// DesCoin screenshare heartbeats server-side instead of trusting the client.
const dmScreenSharingUsers = new Set();

async function notifyCallHistory(io, record) {
  if (!record) return;
  const payload = { call: record };
  emitToUser(io, record.callerId, "calls:updated", payload);
  emitToUser(io, record.calleeId, "calls:updated", payload);
}

/**
 * Drop a WhatsApp-style ended-call row into the DM thread for both people.
 * Presence does not matter: an offline callee still sees it on the next open.
 */
async function publishDmCallSummary(io, record) {
  if (!record?.callerId || !record?.calleeId) return;
  const callerName =
    usernameById.get(record.callerId) ||
    getCachedPublicUser(record.callerId)?.username ||
    "User";
  const summary = buildDmCallSummary(record, callerName);
  const content = JSON.stringify(summary);
  const { data: row, error } = await supabase
    .from("dm_messages")
    .insert({
      from_user_id: record.callerId,
      to_user_id: record.calleeId,
      content,
    })
    .select("id, created_at")
    .single();
  if (error || !row) {
    console.warn("[Call] DM summary insert failed:", error?.message || error);
    return;
  }

  const sender = messageSender(record.callerId, callerName);
  const timestamp = toUtcIso(row.created_at) || row.created_at;
  // Summary fields ride on the message itself: clients render the card from
  // msg.durationSeconds / msg.participantCount (the JSON text alone rendered
  // "< 1s · 0 participants" for every DM call since 2.9.88).
  const messagePayload = {
    ...callSummaryMessageFields(summary),
    id: row.id,
    from: sender,
    text: content,
    type: "call_summary",
    mediaUrl: null,
    mediaType: null,
    timestamp,
  };
  cacheDmMessages(convKey(record.callerId, record.calleeId), [
    { ...messagePayload, to: { id: record.calleeId } },
  ]);

  const calleeSocket = getSocketForUser(io, record.calleeId);
  const calleeViewing = calleeSocket?.data?.activeDmPeer === record.callerId;
  if (!calleeViewing) {
    const unreadMap = ensureDmUnreadMap(record.calleeId);
    const unreadCount = (unreadMap.get(record.callerId) || 0) + 1;
    unreadMap.set(record.callerId, unreadCount);
    emitToUser(io, record.calleeId, "dm:unread:sync", {
      peerId: record.callerId,
      count: unreadCount,
    });
  }

  emitToUser(io, record.calleeId, "dm:message", { ...messagePayload, convWith: record.callerId });
  emitToUser(io, record.callerId, "dm:message", { ...messagePayload, convWith: record.calleeId });
}

let ringFanout = null;
/**
 * One ring-state tracker per process (lib/callRingFanout.js). Every way a DM
 * ring can end goes through it so the callee's other devices — sockets, the
 * iPhone's CallKit screen (VoIP end push) and closed-tab web notifications —
 * stop at once.
 */
function getRingFanout(io) {
  if (ringFanout) return ringFanout;
  ringFanout = createRingFanout({
    emitToUserRoom: (userId, event, payload, exceptSocketId) => {
      const target = io.to(`user:${userId}`);
      (exceptSocketId ? target.except(exceptSocketId) : target).emit(event, payload);
    },
    emitToUser: (userId, event, payload) => emitToUser(io, userId, event, payload),
    sendVoipEnd: (calleeId, end) => require("../lib/voipPush").sendCallEndVoip(calleeId, end),
    sendWebPushEnd: (calleeId, end) => require("../lib/webPush").sendCallRingEndedPush([calleeId], end),
    onMissed: (ring) => finishDmCall(io, ring.callerId, ring.calleeId, "missed"),
    onCallerLost: (ring) => finishDmCall(io, ring.callerId, ring.calleeId, "missed"),
    hasLiveSockets: (userId) => (io.sockets?.adapter?.rooms?.get(`user:${userId}`)?.size || 0) > 0,
  });
  return ringFanout;
}

/** Peer ids of the connected DM calls `userId` is in. */
function activeDmPeersOf(userId) {
  const out = [];
  for (const call of listActiveDmCalls()) {
    if (call.callerId === userId) out.push(call.calleeId);
    else if (call.calleeId === userId) out.push(call.callerId);
  }
  return out;
}

async function finishDmCall(io, userA, userB, status) {
  const record = await finalizeCall(userA, userB, status);
  await notifyCallHistory(io, record);
  await publishDmCallSummary(io, record);
  return record;
}

function ensureSet(map, key) {
  if (!map.has(key)) map.set(key, new Set());
  return map.get(key);
}

function ensurePending(userId) {
  if (!pendingRequests.has(userId)) pendingRequests.set(userId, new Map());
  return pendingRequests.get(userId);
}

function ensureDmUnreadMap(userId) {
  if (!dmUnreadByUser.has(userId)) dmUnreadByUser.set(userId, new Map());
  return dmUnreadByUser.get(userId);
}

function getNotifications(userId) {
  return notificationsByUser.get(userId) || [];
}

function pushNotification(io, userId, n) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const entry = {
    id,
    type: n.type,
    title: n.title,
    body: n.body,
    read: false,
    createdAt: new Date().toISOString(),
    meta: n.meta || {},
  };
  const list = notificationsByUser.get(userId) || [];
  list.unshift(entry);
  if (list.length > MAX_NOTIFICATIONS) list.length = MAX_NOTIFICATIONS;
  notificationsByUser.set(userId, list);
  emitToUser(io, userId, "notification:new", { notification: entry });
}

// Presence fan-out is scoped (friends + shared servers/groups) and coalesced
// in runtime/presenceFanoutInstance.js. `presenceScoped: false` restores the
// legacy global roster.
function broadcastUsers(io, userId) {
  const fanout = getPresenceFanout(io);
  if (fanout && userId != null) fanout.markDirty(userId);
  else if (fanout) fanout.flush();
}

function getSocketForUser(io, userId) {
  const p = presence.get(userId);
  if (!p?.socketId) return null;
  return io.sockets.sockets.get(p.socketId);
}

function getFriendList(userId) {
  const set = friends.get(userId);
  if (!set) return [];
  const out = [];
  for (const fid of set) {
    const last = getLastDmMessage(userId, fid);
    out.push({
      ...enrichFriendEntry(fid),
      lastMessage: formatDmPreview(last),
      lastActivity: last?.timestamp || last?.created_at || null,
      friendsSince: friendSince.friendSinceFor(userId, fid),
    });
  }
  return out.sort((a, b) =>
    String(a?.username || "").localeCompare(String(b?.username || ""))
  );
}

function getPendingList(userId) {
  const m = pendingRequests.get(userId);
  if (!m) return [];
  // Newest request first.
  return friendSince.newestFirst(
    Array.from(m.keys()).map((id) => ({
      ...enrichFriendEntry(id),
      requestedAt: friendSince.requestSinceFor(id, userId),
    })),
    "requestedAt",
  );
}

function emitToUser(io, userId, event, payload) {
  if (!userId) return;
  // Prefer durable per-user room so call invites survive presence-map races
  // and multi-tab sessions (socket always joins `user:${id}` on connect).
  const room = `user:${userId}`;
  const roomSet = io.sockets?.adapter?.rooms?.get(room);
  if (roomSet && roomSet.size > 0) {
    io.to(room).emit(event, payload);
    return;
  }
  const p = presence.get(userId);
  if (p?.socketId) {
    io.to(p.socketId).emit(event, payload);
  }
}

/**
 * Fresh friend list + pending requests to every device of `userId`
 * (`user:<id>` room). REST routes use this; they have no socket of their own.
 */
async function emitFriendState(io, userId, { requests = true } = {}) {
  if (!io || !userId) return;
  await loadFriendsFromDB(userId);
  await ensureCosmeticsCached([...(friends.get(userId) || [])]).catch(() => {});
  io.to(`user:${userId}`).emit("friend:list", getFriendList(userId));
  if (requests) io.to(`user:${userId}`).emit("friend:requests", getPendingList(userId));
}

async function buildSyncState(userId) {
  const dmMap = ensureDmUnreadMap(userId);
  const dmUnreadByPeer = {};
  for (const [k, v] of dmMap) {
    dmUnreadByPeer[k] = v;
  }
  const { dmPreviewsByPeer, dmLastActivityByPeer } = await buildDmPreviewMaps(userId);
  const dmPrefsList = await dmPrefs.listPrefs(userId);
  return {
    dmUnreadByPeer,
    dmPreviewsByPeer,
    dmLastActivityByPeer,
    dmPrefs: dmPrefsList,
    notifications: getNotifications(userId),
  };
}

function emitSyncState(io, userId, socket = null) {
  buildSyncState(userId)
    .then((state) => {
      if (socket) socket.emit("sync:state", state);
      else emitToUser(io, userId, "sync:state", state);
    })
    .catch((error) => console.warn("[DM] Sync state build failed:", error?.message || error));
}

async function findUserByUsername(username) {
  const clean = String(username || "").trim();
  if (!clean) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, username")
    .ilike("username", clean)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// Load friends from database into memory
async function loadFriendsFromDB(userId) {
  try {
    // Fetch all accepted friendship rows involving this user
    const { data: rows, error } = await supabase
      .from("friendships")
      .select("user_id, friend_id, created_at")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq("status", "accepted");

    if (error) {
      console.error("[FRIENDS] loadFriendsFromDB query error:", error);
      return new Set();
    }

    // Collect the IDs of the OTHER party in each row
    const friendIds = [];
    for (const row of (rows || [])) {
      const otherId = row.user_id === userId ? row.friend_id : row.user_id;
      if (otherId && otherId !== userId) {
        friendIds.push(otherId);
        friendSince.rememberFriendSince(userId, otherId, row.created_at);
      }
    }

    if (friendIds.length === 0) {
      friends.set(userId, new Set());
      console.log(`[FRIENDS] No friends found for user ${userId}`);
      return new Set();
    }

    // Batch-fetch profile fields for friend rows / hover cards
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, username, avatar_url, display_name, bio, custom_status, banner_url, updated_at")
      .in("id", friendIds);

    if (usersError) console.error("[FRIENDS] loadFriendsFromDB users fetch error:", usersError);

    const friendSet = new Set();
    // Keep every accepted friendship id even if a profile row is missing —
    // otherwise a partial users query silently drops chats from the sidebar.
    for (const id of friendIds) friendSet.add(id);
    for (const u of (users || [])) {
      if (u?.username) usernameById.set(u.id, u.username);
      cacheUserProfile(u);
    }
    if ((users || []).length < friendIds.length) {
      console.warn(
        `[FRIENDS] Profile rows ${ (users || []).length }/${friendIds.length} for user ${userId}`
      );
    }

    friends.set(userId, friendSet);
    console.log(`[FRIENDS] Loaded ${friendSet.size} friends for user ${userId}`);
    return friendSet;
  } catch (e) {
    console.error("[FRIENDS] Error in loadFriendsFromDB:", e);
    return new Set();
  }
}

// Load pending friend requests from DB into memory
async function loadPendingRequestsFromDB(userId) {
  try {
    const { data: rows, error } = await supabase
      .from("friendships")
      .select("user_id, created_at")
      .eq("friend_id", userId)
      .eq("status", "pending");

    if (error) {
      console.error("[FRIENDS] loadPendingRequestsFromDB error:", error);
      return;
    }

    if (!rows || rows.length === 0) return;
    for (const r of rows) friendSince.rememberRequest(r.user_id, userId, r.created_at);

    const senderIds = rows.map((r) => r.user_id);
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, username, avatar_url, display_name, updated_at")
      .in("id", senderIds);

    if (usersError) {
      console.error("[FRIENDS] loadPendingRequestsFromDB users error:", usersError);
      return;
    }

    const pending = ensurePending(userId);
    for (const u of (users || [])) {
      if (!pending.has(u.id)) {
        pending.set(u.id, {
          id: u.id,
          username: u.username,
          avatarUrl: u.avatar_url || null,
        });
        usernameById.set(u.id, u.username);
        cacheUserProfile(u);
      }
    }
  } catch (e) {
    console.error("[FRIENDS] Error in loadPendingRequestsFromDB:", e);
  }
}

// Accept the pending friend request in the 'friendships' table (one row, requester → acceptor)
async function saveFriendshipToDB(requesterId, acceptorId) {
  try {
    const { data, error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("user_id", requesterId)
      .eq("friend_id", acceptorId)
      .eq("status", "pending")
      .select("id");

    if (error) {
      console.error("[FRIENDS] Error accepting friendship in DB:", error);
      return false;
    }
    if (Array.isArray(data) && data.length > 0) {
      friendSince.markFriendsNow(requesterId, acceptorId);
      return true;
    }

    // No pending row (e.g. socket-only legacy request) — upsert accepted friendship.
    const { error: upsertError } = await supabase.from("friendships").upsert(
      {
        user_id: requesterId,
        friend_id: acceptorId,
        status: "accepted",
      },
      { onConflict: "user_id,friend_id" }
    );
    if (upsertError) {
      console.error("[FRIENDS] Error upserting accepted friendship:", upsertError);
      return false;
    }
    friendSince.markFriendsNow(requesterId, acceptorId);
    return true;
  } catch (e) {
    console.error("[FRIENDS] Error in saveFriendshipToDB:", e);
    return false;
  }
}

/** Persist a pending friend request (requester → target). */
async function createPendingFriendshipInDB(requesterId, targetId) {
  try {
    // Clear any stale non-accepted rows either direction, then insert pending.
    await supabase
      .from("friendships")
      .delete()
      .or(
        `and(user_id.eq.${requesterId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${requesterId})`
      )
      .neq("status", "accepted");

    const { data: existingAccepted } = await supabase
      .from("friendships")
      .select("id")
      .or(
        `and(user_id.eq.${requesterId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${requesterId})`
      )
      .eq("status", "accepted")
      .limit(1);

    if (existingAccepted?.length) return { ok: false, reason: "already_friends" };

    const { error } = await supabase.from("friendships").insert({
      user_id: requesterId,
      friend_id: targetId,
      status: "pending",
    });

    if (error) {
      // Unique conflict — treat as already pending
      if (String(error.code) === "23505" || /duplicate|unique/i.test(error.message || "")) {
        return { ok: false, reason: "already_pending" };
      }
      console.error("[FRIENDS] Error creating pending friendship:", error);
      return { ok: false, reason: "db_error", error };
    }
    return { ok: true };
  } catch (e) {
    console.error("[FRIENDS] Error in createPendingFriendshipInDB:", e);
    return { ok: false, reason: "db_error", error: e };
  }
}

// Remove friendship from the 'friends' table (both directions)
async function removeFriendshipFromDB(userId, friendId) {
  try {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);

    if (error) console.error("[FRIENDS] Error removing friendship from DB:", error);
    else friendSince.forgetFriendship(userId, friendId);
    return !error;
  } catch (e) {
    console.error("[FRIENDS] Error in removeFriendshipFromDB:", e);
    return false;
  }
}

function registerSocketHandlers(io) {
  startAfkIdleScanner(io);
  if (process.env.NODE_ENV !== "test") startPollSweeper(io);
  io.on("connection", (socket) => {
    const me = socket.user;
    const myId = me.id;

    if (systemConfig.maintenanceMode && me.username !== "admin") {
      socket.emit("system:maintenance", { message: "Server is in maintenance mode." });
      socket.disconnect(true);
      return;
    }

    try {
      descoinAntibot.onSocketConnect(socket, myId, socketIp(socket));
    } catch {
      /* monitoring must never affect the connection */
    }
    // Optional client hints for the anti-bot monitor (webdriver / headless /
    // device fingerprint, hashed on arrival). At most 3 per connection, small
    // payloads only; nothing is sent back.
    let antibotSignalsLeft = 3;
    socket.on("antibot:signals", (payload) => {
      if (antibotSignalsLeft <= 0) return;
      antibotSignalsLeft -= 1;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
      try {
        if (JSON.stringify(payload).length > 2048) return;
      } catch {
        return;
      }
      descoinAntibot.onClientSignals(myId, payload);
    });

    // Liveness probe used by clients right after returning to the foreground
    // (zombie-socket detection). Registered first, answers immediately.
    socket.on("app:ping", (ack) => {
      if (typeof ack === "function") ack(Date.now());
    });

    socket.emit("features:updated", publicFeatureFlags(systemConfig.featureFlags));
    try {
      const { service: maintenance } = require("../runtime/maintenanceInstance");
      socket.emit("maintenance:state", { maintenance: maintenance.publicState(), serverTime: new Date().toISOString() });
    } catch {
      /* best effort */
    }
    // 2.11.6: where this client should connect next time (Cloudflare Hub or Render).
    require("../runtime/edgeRuntime").sendAdvice(socket);

    if (!userRoles.has(myId)) {
      userRoles.set(myId, me.username === "admin" || me.is_admin ? "admin" : "user");
    }
    userSessionStartMs.set(myId, Date.now());

    usernameById.set(myId, me.username);

    const existingPresence = presence.get(myId);
    presence.set(myId, {
      username: me.username,
      status: existingPresence?.status || "online",
      socketId: socket.id,
      avatar_url: existingPresence?.avatar_url || me.avatar_url || null,
    });
    socket.join(`user:${myId}`);
    socketToUser.set(socket.id, myId);
    // A caller whose app blipped keeps ringing; a DM peer learns we are back
    // (its client stops counting toward "peer lost").
    getRingFanout(io).callerSocketsBack(myId);
    for (const peerId of activeDmPeersOf(myId)) {
      emitToUser(io, peerId, "call:peer-presence", { peerId: myId, online: true });
    }
    // Native iOS app sockets identify with auth.platform === "ios" (used for push context).
    const fromIosApp = String(socket?.handshake?.auth?.platform || "").toLowerCase() === "ios";
    socket.data.activeDmPeer = null;
    // 2.11.3+ clients merge `presence:delta`; older builds get scoped snapshots.
    socket.data.presenceDelta = Number(socket.handshake?.auth?.presence) >= 2;

    // Durable activity timestamp for admin "recently active" boards.
    touchLastSeen(myId).catch(() => {});

    setupAdminSocket(io, socket);

    // Load friends + full profile, then emit connected with displayName etc.
    // Never let a single failed sub-task block friend:list / connected —
    // that left the SPA with empty chats/friends/groups until reconnect.
    Promise.allSettled([
      loadFriendsFromDB(myId),
      loadPendingRequestsFromDB(myId),
      loadUserProfile(myId),
    ]).then((results) => {
      const profile = results[2]?.status === "fulfilled" ? results[2].value : null;
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === "rejected") {
          console.error(`[FRIENDS] Boot task ${i} failed for ${myId}:`, results[i].reason);
        }
      }
      if (profile) {
        me.avatar_url = profile.avatar_url;
        me.display_name = profile.display_name;
        me.displayName = profile.display_name;
        me.bio = profile.bio;
        me.custom_status = profile.custom_status;
        me.banner_url = profile.banner_url;
        me.updated_at = profile.updated_at;
        me.is_admin = Boolean(profile.is_admin);
        socket.user.avatar_url = profile.avatar_url;
        socket.user.display_name = profile.display_name;
        socket.user.displayName = profile.display_name;
        socket.user.is_admin = Boolean(profile.is_admin);
        if (profile.is_admin || me.username === "admin") {
          userRoles.set(myId, "admin");
          try {
            socket.join("admin");
          } catch {
            /* admin live-listen room is best-effort */
          }
        }
        const p = presence.get(myId);
        if (p) {
          p.avatar_url = profile.avatar_url;
          if (!existingPresence) {
            const allowed = ["online", "idle", "dnd", "invisible"];
            const restored = allowed.includes(profile.presence_status)
              ? profile.presence_status
              : "online";
            p.status = restored;
          }
          presence.set(myId, p);
        }
      }

      try {
        socket.emit("connected", {
          user: profile ? toPublicUser(profile) : me,
          message: "Socket connected successfully.",
        });
        socket.emit("status:current", { status: presence.get(myId)?.status || "online" });
        const friendIds = [...(friends.get(myId) || [])];
        ensureCosmeticsCached(friendIds)
          .catch(() => {})
          .finally(() => {
            // 2.11.7: reconnects with an unchanged list get "same" (boot diet).
            require("../lib/bootDiet").emitBootFriendList(socket, getFriendList(myId), {
              enabled: systemConfig.featureFlags?.bootDiet !== false,
            });
            socket.emit("friend:requests", getPendingList(myId));
            listMessageRequests(supabase, myId)
              .then((list) => socket.emit("dm:requests", list))
              .catch(() => {});
          });
      } catch (emitErr) {
        console.error("[FRIENDS] Boot emit failed:", emitErr);
        socket.emit("connected", { user: me, message: "Socket connected successfully." });
        socket.emit("friend:list", []);
        socket.emit("friend:requests", []);
        socket.emit("dm:requests", []);
      }
      emitSyncState(io, myId, socket);
      getPresenceFanout(io).userOnline(myId);

      try {
        const { getActiveTimeout } = require("../lib/moderation");
        const activeTimeout = getActiveTimeout(myId);
        if (activeTimeout) socket.emit("system:timeout", activeTimeout);
      } catch {
        /* ignore */
      }

      // Deliver any gift popups the recipient missed while offline (e.g. an
      // admin gifted them a cosmetic before they ever connected this
      // session). Delivered once per gift via the notified_at flag.
      shop
        .getUnnotifiedGifts(myId)
        .then((pending) => {
          if (!pending.length) return;
          pending.forEach((gift) => {
            if (!gift.item) return;
            socket.emit("shop:gift:received", { item: gift.item, message: gift.message, from: gift.from });
          });
          shop.markGiftsNotified(pending.map((g) => g.inventoryId)).catch(() => {});
        })
        .catch((err) => console.warn("[shop] failed to deliver pending gifts:", err.message));

      // Special badges granted or taken back while this person was offline.
      require("../lib/specialBadgeNotify")
        .deliverPending(io, myId, { socket })
        .catch((err) => console.warn("[special-badges] failed to deliver pending:", err.message));

      // Same deferred-delivery pattern for admin DesCoin grants that carried
      // a message (the recipient was offline when the admin sent it).
      descoin
        .getUnnotifiedGrants(myId)
        .then((pending) => {
          if (!pending.length) return;
          pending.forEach((grant) => {
            socket.emit("descoin:gift", { amount: grant.amount, message: grant.message, from: grant.from });
          });
          descoin.markGrantsNotified(pending.map((g) => g.ledgerId)).catch(() => {});
        })
        .catch((err) => console.warn("[descoin] failed to deliver pending grants:", err.message));
    });

    socket.on("status:set", async ({ status } = {}) => {
      const allowed = ["online", "idle", "dnd", "invisible"];
      const s = allowed.includes(status) ? status : "online";
      const p = presence.get(myId);
      if (p) {
        p.status = s;
        presence.set(myId, p);
      }
      await savePresenceStatus(myId, s);
      socket.emit("status:current", { status: s });
      broadcastUsers(io, myId);
      io.to(socket.id).emit("friend:list", getFriendList(myId));
    });

    socket.on("friend:list", async () => {
      // Always rehydrate from DB — an empty in-memory Set must not stick
      // forever after a transient boot failure or missed accept event.
      await loadFriendsFromDB(myId);
      await loadPendingRequestsFromDB(myId);
      await ensureCosmeticsCached([...(friends.get(myId) || [])]).catch(() => {});
      socket.emit("friend:list", getFriendList(myId));
      socket.emit("friend:requests", getPendingList(myId));
      socket.emit("dm:requests", await listMessageRequests(supabase, myId));
    });

    socket.on("friend:request", async ({ toUsername } = {}) => {
      try {
        const target = await findUserByUsername(toUsername);
        if (!target) {
          appendErrorLog("friend:request", "User not found", { toUsername }, myId, me.username);
          return socket.emit("friend:error", { message: "User not found." });
        }
        if (target.id === myId) {
          appendErrorLog("friend:request", "Cannot add self", {}, myId, me.username);
          return socket.emit("friend:error", { message: "You cannot add yourself." });
        }
        if (await isBlockedEitherWay(myId, target.id)) {
          return socket.emit("friend:error", { message: "You can't send a request to this user." });
        }
        const myFriends = ensureSet(friends, myId);
        if (myFriends.has(target.id) || ensureSet(friends, target.id).has(myId)) {
          appendErrorLog("friend:request", "Already friends", { targetId: target.id, targetUsername: target.username }, myId, me.username);
          return socket.emit("friend:error", { message: "Already friends." });
        }

        // DB is source of truth — also catches REST-sent / cross-instance pending rows
        const { data: existingRows } = await supabase
          .from("friendships")
          .select("id, status, user_id, friend_id")
          .or(
            `and(user_id.eq.${myId},friend_id.eq.${target.id}),and(user_id.eq.${target.id},friend_id.eq.${myId})`
          );

        if (existingRows?.some((r) => r.status === "accepted")) {
          ensureSet(friends, myId).add(target.id);
          ensureSet(friends, target.id).add(myId);
          refreshPresenceFor(myId, target.id);
          return socket.emit("friend:error", { message: "Already friends." });
        }
        if (existingRows?.some((r) => r.status === "pending")) {
          return socket.emit("friend:error", { message: "Request already pending." });
        }

        const theirPending = ensurePending(target.id);
        if (theirPending.has(myId)) {
          appendErrorLog("friend:request", "Request already pending", { targetId: target.id }, myId, me.username);
          return socket.emit("friend:error", { message: "Request already pending." });
        }

        const created = await createPendingFriendshipInDB(myId, target.id);
        if (!created.ok) {
          if (created.reason === "already_friends") {
            return socket.emit("friend:error", { message: "Already friends." });
          }
          if (created.reason === "already_pending") {
            return socket.emit("friend:error", { message: "Request already pending." });
          }
          return socket.emit("friend:error", { message: "Could not send request." });
        }

        theirPending.set(myId, { id: myId, username: me.username, avatarUrl: me.avatar_url || null });
        friendSince.markRequestNow(myId, target.id);
        usernameById.set(myId, me.username);
        emitToUser(io, target.id, "friend:request:incoming", {
          from: enrichFriendEntry(myId),
        });
        // Keep recipient's pending list in sync even if they missed the incoming event
        emitToUser(io, target.id, "friend:requests", getPendingList(target.id));
        pushNotification(io, target.id, {
          type: "friend_request",
          title: "Friend request",
          body: `${me.username} sent you a friend request`,
          meta: { fromUserId: myId },
        });
        try {
          const { sendFriendRequestPush } = require("../lib/webPush");
          void sendFriendRequestPush(target.id, {
            fromId: myId,
            from: me.username,
          });
        } catch (pushErr) {
          console.warn("[Friends] request push skipped:", pushErr?.message || pushErr);
        }
        socket.emit("friend:request:sent", { to: target.username });
      } catch (e) {
        console.error("[Friends] request error:", e);
        socket.emit("friend:error", { message: "Could not send request." });
      }
    });

    socket.on("friend:accept", async (payload = {}) => {
      const fromUserId = String(payload?.fromUserId || payload?.userId || "").trim();
      if (!fromUserId) {
        socket.emit("friend:error", { message: "Invalid user ID" });
        return;
      }

      // Verify pending request exists in DB (handles REST-sent requests not in memory)
      const { data: pendingRow, error: checkError } = await supabase
        .from("friendships")
        .select("id")
        .eq("user_id", fromUserId)
        .eq("friend_id", myId)
        .eq("status", "pending")
        .maybeSingle();

      if (checkError) {
        console.error("[Friends] Accept check error:", checkError);
        socket.emit("friend:error", { message: "Database error checking request" });
        return;
      }

      const theirPending = pendingRequests.get(myId);
      const inMemory = Boolean(theirPending?.has(fromUserId));

      if (!pendingRow && !inMemory) {
        console.log("[Friends] No pending request found:", { fromUserId, myId });
        socket.emit("friend:error", { message: "Friend request not found or already processed" });
        socket.emit("friend:requests", getPendingList(myId));
        return;
      }

      // Update memory
      const fromProf = theirPending?.get(fromUserId);
      if (theirPending?.has(fromUserId)) {
        theirPending.delete(fromUserId);
        if (theirPending.size === 0) pendingRequests.delete(myId);
      }

      ensureSet(friends, myId).add(fromUserId);
      ensureSet(friends, fromUserId).add(myId);
      refreshPresenceFor(myId, fromUserId);
      if (fromProf?.username) usernameById.set(fromUserId, fromProf.username);

      // Accept in DB — update pending, or upsert accepted for legacy memory-only requests
      const saved = await saveFriendshipToDB(fromUserId, myId);
      if (!saved) {
        // Roll back memory so UI can restore the pending request
        ensureSet(friends, myId).delete(fromUserId);
        ensureSet(friends, fromUserId).delete(myId);
        ensurePending(myId).set(fromUserId, fromProf || { id: fromUserId, username: usernameById.get(fromUserId) || "?" });
        socket.emit("friend:error", { message: "Failed to save friendship" });
        socket.emit("friend:requests", getPendingList(myId));
        return;
      }

      emitToUser(io, fromUserId, "friend:accepted", { by: { id: myId, username: me.username } });
      pushNotification(io, fromUserId, {
        type: "friend_accepted",
        title: "Friend request accepted",
        body: `${me.username} accepted your friend request`,
        meta: { userId: myId },
      });

      // Every device of the acceptor (phone app + web tab), not just this socket.
      emitToUser(io, myId, "friend:accepted", { by: { id: fromUserId } });
      emitToUser(io, myId, "friend:list", getFriendList(myId));
      emitToUser(io, myId, "friend:requests", getPendingList(myId));
      emitSyncState(io, myId);
      emitToUser(io, fromUserId, "friend:list", getFriendList(fromUserId));
      emitToUser(io, fromUserId, "friend:requests", getPendingList(fromUserId));
      emitSyncState(io, fromUserId);
      
      console.log("[Friends] Request accepted:", { fromUserId, by: myId });
    });

    socket.on("friend:decline", async (payload = {}) => {
      const fromUserId = String(payload?.fromUserId || payload?.userId || "").trim();
      if (!fromUserId) {
        socket.emit("friend:error", { message: "Invalid user ID" });
        return;
      }
      
      try {
        // First delete from database
        const { error: deleteError } = await supabase
          .from("friendships")
          .delete()
          .eq("user_id", fromUserId)
          .eq("friend_id", myId)
          .eq("status", "pending");
        
        if (deleteError) {
          console.error("[Friends] Decline error:", deleteError);
          socket.emit("friend:error", { message: "Failed to decline request" });
          return;
        }
        
        // Then remove from memory
        const theirPending = pendingRequests.get(myId);
        if (theirPending?.has(fromUserId)) {
          theirPending.delete(fromUserId);
          if (theirPending.size === 0) pendingRequests.delete(myId);
        }
        
        // Update friend list for the sender to remove pending status
        io.to(`user:${fromUserId}`).emit("friend:list", getFriendList(fromUserId));
        
        emitToUser(io, myId, "friend:requests", getPendingList(myId));
        emitToUser(io, myId, "friend:list", getFriendList(myId));
        
        console.log("[Friends] Request declined:", { fromUserId, by: myId });
      } catch (err) {
        console.error("[Friends] Decline error:", err);
        socket.emit("friend:error", { message: "Failed to decline request" });
      }
    });

    socket.on("dm:request:list", async () => {
      socket.emit("dm:requests", await listMessageRequests(supabase, myId));
    });

    socket.on("dm:request:accept", async ({ fromUserId } = {}) => {
      const fromId = String(fromUserId || "").trim();
      if (!fromId || fromId === myId) {
        socket.emit("dm:request:error", { message: "Message request not found.", fromUserId: fromId || null });
        return;
      }
      const removed = await deleteMessageRequest(supabase, fromId, myId);
      if (!removed) {
        socket.emit("dm:request:error", { message: "Message request not found.", fromUserId: fromId });
        socket.emit("dm:requests", await listMessageRequests(supabase, myId));
        return;
      }
      if (removed.username) usernameById.set(fromId, removed.username);
      ensureSet(friends, myId).add(fromId);
      ensureSet(friends, fromId).add(myId);
      refreshPresenceFor(myId, fromId);
      const saved = await saveFriendshipToDB(fromId, myId);
      if (!saved) {
        ensureSet(friends, myId).delete(fromId);
        ensureSet(friends, fromId).delete(myId);
        await upsertMessageRequest(supabase, {
          fromUserId: fromId,
          toUserId: myId,
          username: removed.username,
          avatarUrl: removed.avatarUrl,
          preview: removed.preview,
        });
        socket.emit("dm:request:error", { message: "Could not accept message request.", fromUserId: fromId });
        socket.emit("dm:requests", await listMessageRequests(supabase, myId));
        return;
      }
      emitToUser(io, myId, "dm:requests", await listMessageRequests(supabase, myId));
      emitToUser(io, myId, "friend:list", getFriendList(myId));
      emitToUser(io, myId, "friend:accepted", { by: { id: fromId, username: removed.username } });
      emitToUser(io, fromId, "dm:request:accepted", { byUserId: myId, username: me.username });
      emitToUser(io, fromId, "friend:list", getFriendList(fromId));
      emitSyncState(io, myId);
      emitSyncState(io, fromId);
    });

    socket.on("dm:request:decline", async ({ fromUserId } = {}) => {
      const fromId = String(fromUserId || "").trim();
      if (!fromId) return;
      await deleteMessageRequest(supabase, fromId, myId);
      emitToUser(io, myId, "dm:requests", await listMessageRequests(supabase, myId));
      emitToUser(io, fromId, "dm:request:declined", { byUserId: myId });
    });

    socket.on("friend:remove", async ({ friendId } = {}) => {
      if (typeof friendId !== "string") return;
      const a = friends.get(myId);
      const b = friends.get(friendId);
      if (a) a.delete(friendId);
      if (b) b.delete(myId);
      refreshPresenceFor(myId, friendId);
      ensureDmUnreadMap(myId).delete(friendId);
      ensureDmUnreadMap(friendId).delete(myId);
      
      // Remove friendship from database
      await removeFriendshipFromDB(myId, friendId);
      
      emitToUser(io, myId, "friend:list", getFriendList(myId));
      emitSyncState(io, myId);
      emitToUser(io, friendId, "friend:list", getFriendList(friendId));
      emitSyncState(io, friendId);
    });

    socket.on("dm:set_active", ({ withUserId } = {}) => {
      socket.data.activeDmPeer = typeof withUserId === "string" ? withUserId : null;
    });

    // Native iOS app: which chat is on screen and whether the app is in the
    // foreground, so its alert pushes skip the chat being read (lib/iosPushContext.js).
    socket.on("push:ios-context", (payload = {}) => {
      if (!fromIosApp || !payload || typeof payload !== "object") return;
      iosPushContext.report({
        userId: myId,
        socketId: socket.id,
        token: payload.token,
        foreground: payload.foreground === true,
        chat: payload.chat,
      });
    });

    socket.on("typing:start", (payload = {}) => {
      const { context = "dm", toUserId, groupId, channelId } = payload;
      const fromUser = { id: myId, username: me.username };
      if (context === "dm" && typeof toUserId === "string") {
        emitToUser(io, toUserId, "typing:update", { context: "dm", fromUser, typing: true });
      } else if (context === "group" && typeof groupId === "string") {
        // Only sockets in the group room (removed / left members are taken out).
        if (!socket.rooms?.has?.(`group:${groupId}`)) return;
        socket.to(`group:${groupId}`).emit("typing:update", { context: "group", groupId, fromUser, typing: true });
      } else if (context === "server" && typeof channelId === "string") {
        // Only from a VIEW-checked live room, with SEND_MESSAGES and not timed out
        // (anyone could fake typing into any channel before). Cached 10 s per socket.
        if (!socket.rooms?.has?.(`server-channel:${channelId}`)) return;
        void (async () => {
          const cache = socket.data.typingOk || (socket.data.typingOk = new Map());
          const hit = cache.get(channelId);
          let ok = hit && Date.now() - hit.at < 10000 ? hit.ok : null;
          if (ok === null) {
            try {
              const { assertTextChannelAccess } = require("./serverChannelHandlers");
              const { Permissions } = require("../lib/serverPermissions");
              const { getActiveServerTimeout } = require("../lib/serverTimeoutState");
              const { channel } = await assertTextChannelAccess(myId, channelId, Permissions.SEND_MESSAGES);
              ok = !(await getActiveServerTimeout(channel.server_id, myId));
            } catch {
              ok = false;
            }
            cache.set(channelId, { ok, at: Date.now() });
          }
          if (!ok) return;
          socket
            .to(`server-channel:${channelId}`)
            .emit("typing:update", { context: "server", channelId, fromUser, typing: true });
        })();
      }
    });

    socket.on("typing:stop", (payload = {}) => {
      const { context = "dm", toUserId, groupId, channelId } = payload;
      const fromUser = { id: myId, username: me.username };
      if (context === "dm" && typeof toUserId === "string") {
        emitToUser(io, toUserId, "typing:update", { context: "dm", fromUser, typing: false });
      } else if (context === "group" && typeof groupId === "string") {
        socket.to(`group:${groupId}`).emit("typing:update", { context: "group", groupId, fromUser, typing: false });
      } else if (context === "server" && typeof channelId === "string") {
        if (!socket.rooms?.has?.(`server-channel:${channelId}`)) return;
        socket
          .to(`server-channel:${channelId}`)
          .emit("typing:update", { context: "server", channelId, fromUser, typing: false });
      }
    });

    socket.on("dm:send", async ({ toUserId, tempId, text, mediaUrl, mediaType, mimeType, size, originalName, duration, replyTo, poll: pollInput } = {}) => {
      let pollDraft = null;
      if (mediaType === "poll_v2" || mediaType === "poll_end" || mediaType === "app_card") mediaType = null;
      if (bannedUserIds.has(myId)) {
        appendErrorLog("dm:send", "User is banned", { toUserId }, myId, me.username);
        return socket.emit("dm:error", { message: "You are banned.", tempId: tempId || null, toUserId });
      }
      {
        const { getActiveTimeout } = require("../lib/moderation");
        const to = getActiveTimeout(myId);
        if (to) {
          return socket.emit("dm:error", {
            message: to.message || "You are timed out and cannot send messages.",
            code: "TIMED_OUT",
            timeout: to,
            tempId: tempId || null,
            toUserId,
          });
        }
      }
      if (dmBlockPairs.has(convKey(myId, toUserId))) {
        appendErrorLog("dm:send", "Conversation blocked", { toUserId }, myId, me.username);
        return socket.emit("dm:error", { message: "Conversation blocked.", tempId: tempId || null, toUserId });
      }
      if (await isBlockedEitherWay(myId, toUserId)) {
        return socket.emit("dm:error", { message: "You can't message this user.", tempId: tempId || null, toUserId });
      }
      if (typeof toUserId !== "string" || !toUserId || toUserId === myId) {
        return socket.emit("dm:error", { message: "You can't message this user.", tempId: tempId || null, toUserId });
      }
      const now = Date.now();
      const last = rateLimitDm.get(myId) || 0;
      if (now - last < systemConfig.dmRateLimitMs) {
        appendErrorLog("dm:send", "Rate limited", { toUserId }, myId, me.username);
        return socket.emit("dm:error", { message: "Rate limited.", tempId: tempId || null, toUserId });
      }
      rateLimitDm.set(myId, now);
      {
        // Yönetici Paneli switches (3.1.3): freeze, DMs off, slow mode, per-minute cap.
        const verdict = checkMessageSend({ config: systemConfig, userId: myId, isAdmin: Boolean(me.is_admin) || me.username === "admin", kind: "dm", now });
        if (!verdict.ok) {
          return socket.emit("dm:error", { message: verdict.message, code: verdict.code, retryAfterMs: verdict.retryAfterMs, tempId: tempId || null, toUserId });
        }
      }

      if (mediaUrl) {
        // 2.11.2: attachments are private; store the stable ref, never a public URL.
        const original = mediaUrl;
        mediaUrl = await normalizeIncomingMediaUrl(supabase, myId, mediaUrl);
        if (!mediaUrl && original && !(typeof text === "string" && text.trim())) {
          return socket.emit("dm:error", { message: "Attachment unavailable.", tempId: tempId || null, toUserId });
        }
      }

      // Slash commands in a 1:1 DM: casino games and DM-safe app commands.
      // Friends only (never via a message request), not blocked, not banned or
      // timed out; age + iOS gates still run inside handleGameCommand.
      if (!mediaUrl && typeof text === "string" && text.trim().startsWith("/")) {
        const routed = await routeDmSlashCommand({ io, socket, myId, me, toUserId, tempId, text: text.trim() });
        if (routed.handled && !routed.dmText && !routed.dmPoll) return;
        if (routed.dmPoll) pollInput = routed.dmPoll;
        else if (routed.dmText) text = routed.dmText;
      }
      if (pollInput) {
        const { normalizePollInput, pollFallbackText } = require("../lib/pollCore");
        const normalized = normalizePollInput(pollInput);
        if (!normalized.ok) {
          return socket.emit("dm:error", { message: normalized.message, code: normalized.code, tempId: tempId || null, toUserId });
        }
        // Polls never travel as a message request: friends only.
        if (!(await isAcceptedFriend(myId, toUserId))) {
          return socket.emit("dm:error", { message: "Anketi yalnızca arkadaşlarına gönderebilirsin.", code: "NOT_FRIENDS", tempId: tempId || null, toUserId });
        }
        pollDraft = normalized.poll;
        text = pollFallbackText(pollDraft);
        mediaUrl = null;
        mediaType = "poll_v2";
        replyTo = null;
      }

      const friendsOk = await isAcceptedFriend(myId, toUserId);
      if (planDmSend({ friends: friendsOk }) === "request") {
        const preview = messageRequestPreview({ text, mediaType, mediaUrl });
        const request = await upsertMessageRequest(supabase, {
          fromUserId: myId,
          toUserId,
          username: me.username,
          avatarUrl: me.avatar_url || socket.user?.avatar_url || null,
          preview,
        });
        socket.emit("dm:request:sent", { toUserId, tempId: tempId || null, request });
        emitToUser(io, toUserId, "dm:request:incoming", { request });
        emitToUser(io, toUserId, "dm:requests", await listMessageRequests(supabase, toUserId));
        pushNotification(io, toUserId, {
          type: "message_request",
          title: "Message request",
          body: `${me.username || "Someone"} sent you a message request`,
          meta: { fromUserId: myId },
        });
        try {
          const { sendMessageRequestPush } = require("../lib/webPush");
          void sendMessageRequestPush(toUserId, {
            fromId: myId,
            from: me.username,
            preview,
          });
        } catch (pushErr) {
          console.warn("[DM request] push skipped:", pushErr?.message || pushErr);
        }
        return;
      }
      socket.data.activeDmPeer = toUserId;
      await ensureCosmeticsCached([myId]).catch(() => {});
      const sender = messageSender(myId, me.username, me.avatar_url || socket.user?.avatar_url);
      const replyMeta = replyTo && typeof replyTo === "object"
        ? {
            id: replyTo.id || null,
            text: replyTo.text || "",
            mediaType: replyTo.mediaType || null,
            from: replyTo.from || null,
          }
        : null;
      const isVoice = mediaType === "voice" || mediaType === "audio";
      const voiceDuration = isVoice ? Math.max(0, Math.round(Number(duration) || 0)) : null;
      const storedText = isVoice
        ? (String(text || "").startsWith("__voice__:") ? text : `__voice__:${voiceDuration || 1}`)
        : (text || "");
      const { data: row, error: persistError } = await supabase
        .from("dm_messages")
        .insert({
          from_user_id: myId,
          to_user_id: toUserId,
          content: storedText,
          media_url: mediaUrl || null,
          media_type: isVoice ? "voice" : (mediaType || null),
          mime_type: mimeType || null,
          file_size: size ?? null,
          original_name: originalName || null,
          duration: voiceDuration,
          reply_to: replyMeta,
        })
        .select("id, created_at")
        .single();
      if (persistError || !row) {
        console.error("[DM] Database insert failed:", persistError?.message || "No row returned");
        return socket.emit("dm:error", {
          message: "Failed to send message. Please try again.",
          tempId: tempId || null,
          toUserId,
        });
      }
      const messageId = row.id;
      const timestamp = toUtcIso(row.created_at) || row.created_at;
      let pollSnapshot = null;
      if (pollDraft) {
        try {
          const { createPollForMessage } = require("../lib/polls");
          const { buildPollSnapshot } = require("../lib/pollCore");
          const made = await createPollForMessage({ scope: "dm", messageId, dmUsers: [myId, toUserId], creatorId: myId, poll: pollDraft });
          pollSnapshot = buildPollSnapshot(made.poll, made.options, null, {});
        } catch (pollErr) {
          console.error("[DM] poll create failed:", pollErr?.message || pollErr);
          await supabase.from("dm_messages").delete().eq("id", messageId).eq("from_user_id", myId);
          return socket.emit("dm:error", { message: "Anket oluşturulamadı. Tekrar dene.", tempId: tempId || null, toUserId });
        }
      }
      void recordFirstMessage(myId);

      // DesCoin: a small, capped reward per genuine message. Fully
      // server-driven (no client heartbeat) since it fires only after the
      // message actually persisted; a repeat of the same text within 60s
      // (copy/paste spam bots) earns nothing.
      // Anti-bot monitor (Faz 0): shadow evaluation only, never awaited, never
      // changes whether / how much this message earns.
      if (!isVoice) {
        void descoinAntibot.observeMessage({
          userId: myId,
          convKey: `dm:${[myId, toUserId].sort().join(":")}`,
          dmPeerId: toUserId,
          text: storedText,
        });
      }
      if (shouldCreditMessage(myId, storedText)) {
        descoin
          .creditCapped(myId, 1, "message_activity", { context: "dm", toUserId })
          .then((result) => {
            if (result.credited > 0) {
              socket.emit("descoin:balance", { balance: result.balance, delta: result.credited, reason: "message_activity" });
            }
          })
          .catch((err) => console.warn("[DesCoin] message credit failed:", err?.message || err));
      }

      // Unread for recipient — skip if they currently have this DM open
      const recipientSocket = getSocketForUser(io, toUserId);
      const recipientActivePeer = recipientSocket?.data?.activeDmPeer;
      let unreadCount = 0;
      if (recipientActivePeer !== myId) {
        const unreadMap = ensureDmUnreadMap(toUserId);
        unreadCount = (unreadMap.get(myId) || 0) + 1;
        unreadMap.set(myId, unreadCount);
      } else {
        ensureDmUnreadMap(toUserId).delete(myId);
      }

      const messagePayload = {
        id: messageId,
        from: sender,
        text: isVoice ? "" : storedText,
        mediaUrl,
        mediaType: isVoice ? "voice" : mediaType,
        mimeType,
        size,
        originalName,
        duration: voiceDuration,
        replyTo: replyMeta,
        timestamp,
        ...(pollSnapshot ? { poll: pollSnapshot } : {}),
      };
      cacheDmMessages(convKey(myId, toUserId), [{ ...messagePayload, to: { id: toUserId } }]);
      void Promise.all([
        dmPrefs.revealOnMessage(myId, toUserId),
        dmPrefs.revealOnMessage(toUserId, myId),
      ]);
      emitToUser(io, toUserId, "dm:message", { ...messagePayload, convWith: myId });
      // Echo back to sender with tempId so client can replace the optimistic message
      socket.emit("dm:message", { ...messagePayload, tempId, convWith: toUserId });

      // Sync unread after the message so the list can reorder first, then badge updates
      if (recipientActivePeer !== myId) {
        emitToUser(io, toUserId, "dm:unread:sync", { peerId: myId, count: unreadCount });
      } else {
        emitToUser(io, toUserId, "dm:unread:sync", { peerId: myId, count: 0 });
      }

      // Emit mention:received if text contains @recipient — used by notification service
      let dmMentioned = false;
      if (text) {
        const recipientUsername = usernameById.get(toUserId);
        const mentionPattern = new RegExp(`@${recipientUsername}\\b`, "i");
        if (recipientUsername && mentionPattern.test(text)) {
          dmMentioned = true;
          emitToUser(io, toUserId, "mention:received", {
            dmConversationId: myId,
            from: me.username,
            text,
          });
        }
      }

      // Wake backgrounded clients (web push + FCM) when the recipient isn't
      // looking at this DM. Mentions get a distinct payload for notification UX.
      if (recipientActivePeer !== myId) {
        try {
          const muted = await dmPrefs.isMuted(toUserId, myId);
          if (!muted) {
            const { sendDmMessagePush, sendMentionPush } = require("../lib/webPush");
            const preview =
              isVoice
                ? "Voice message"
                : mediaUrl
                  ? "Sent an attachment"
                  : String(storedText || text || "").slice(0, 140) || "New message";
            const previewKind = isVoice ? "voice" : mediaUrl ? "media" : "text";
            const rawText = isVoice ? "" : String(storedText || text || "").slice(0, 140);
            if (dmMentioned) {
              void sendMentionPush([toUserId], {
                title: `${me.username || "Someone"} mentioned you`,
                body: preview,
                text: preview,
                rawText,
                previewKind,
                from: me.username,
                fromId: myId,
                dmConversationId: myId,
                messageId,
                deepLink: `/?dm=${encodeURIComponent(myId)}`,
              });
            } else {
              void sendDmMessagePush([toUserId], {
                title: me.username || "New message",
                body: preview,
                rawText,
                previewKind,
                from: me.username,
                fromId: myId,
                messageId,
                deepLink: `/?dm=${encodeURIComponent(myId)}`,
              });
            }
          }
        } catch (pushErr) {
          console.warn("[WebPush] DM push skipped:", pushErr?.message || pushErr);
        }
      }
    });

    socket.on("dm:delivered", async ({ msgId, fromUserId } = {}) => {
      if (typeof msgId !== "string" || typeof fromUserId !== "string") return;
      const key = convKey(myId, fromUserId);
      const arr = dmHistory.get(key);
      const m = arr?.find((x) => x.id === msgId);
      const at = new Date().toISOString();
      const { error } = await supabase
        .from("dm_messages")
        .update({ delivered_at: at })
        .eq("id", msgId)
        .eq("from_user_id", fromUserId)
        .eq("to_user_id", myId)
        .is("delivered_at", null);
      if (error) return console.error("[DM] Delivery update failed:", error.message);
      if (m) m.deliveredAt = m.deliveredAt || at;
      emitToUser(io, fromUserId, "dm:message:update", {
        msgId,
        convWith: myId,
        deliveredAt: m?.deliveredAt || at,
      });
    });

    socket.on("dm:mark_read", async ({ withUserId } = {}) => {
      if (typeof withUserId !== "string") return;
      const key = convKey(myId, withUserId);
      const arr = dmHistory.get(key);
      const at = new Date().toISOString();
      const { error } = await supabase
        .from("dm_messages")
        .update({ read_at: at })
        .eq("from_user_id", withUserId)
        .eq("to_user_id", myId)
        .is("read_at", null);
      if (error) return console.error("[DM] Read update failed:", error.message);
      if (arr) {
        for (const m of arr) {
          if (m.from?.id === withUserId && m.to?.id === myId) {
            m.readAt = m.readAt || at;
          }
        }
      }
      const umap = ensureDmUnreadMap(myId);
      umap.delete(withUserId);
      emitToUser(io, myId, "dm:unread:sync", { peerId: withUserId, count: 0 });
      emitToUser(io, withUserId, "dm:peer_read", { peerId: myId, at });
      void dmPrefs.clearMarkedUnread(myId, withUserId);
    });

    socket.on("dm:mark_unread", async ({ withUserId } = {}) => {
      if (typeof withUserId !== "string" || !dmPrefs.isUuid(withUserId)) return;
      const umap = ensureDmUnreadMap(myId);
      const cur = umap.get(withUserId) || 0;
      if (cur < 1) umap.set(withUserId, 1);
      emitToUser(io, myId, "dm:unread:sync", { peerId: withUserId, count: umap.get(withUserId) || 1 });
      void dmPrefs.upsertPref(myId, withUserId, { markedUnread: true });
    });

    socket.on("dm:history", async ({ withUserId } = {}) => {
      if (typeof withUserId !== "string") return;
      if (!(await isAcceptedFriend(myId, withUserId))) {
        return socket.emit("dm:history", { withUserId, messages: [] });
      }
      try {
        const { messages } = await loadDmMessages(myId, withUserId);
        const withReactions = await attachReactions(messages, "dm", convKey(myId, withUserId));
        socket.emit("dm:history", { withUserId, messages: withReactions });
      } catch (error) {
        console.error("[DM] History load failed:", error.message);
        socket.emit("dm:error", { message: "Failed to load message history.", toUserId: withUserId });
      }
    });

    socket.on("dm:fetch", async ({ withUserId, before, limit = 50 } = {}) => {
      if (typeof withUserId !== "string") return;
      if (!(await isAcceptedFriend(myId, withUserId))) {
        return socket.emit("dm:page", { withUserId, messages: [], hasMore: false });
      }
      try {
        const { messages, hasMore } = await loadDmMessages(myId, withUserId, {
          before: typeof before === "string" ? before : null,
          limit,
        });
        const withReactions = await attachReactions(messages, "dm", convKey(myId, withUserId));
        socket.emit("dm:page", { withUserId, messages: withReactions, hasMore });
      } catch (error) {
        console.error("[DM] Page load failed:", error.message);
        socket.emit("dm:error", { message: "Failed to load older messages.", toUserId: withUserId });
      }
    });

    socket.on("notification:read", ({ id } = {}) => {
      if (typeof id !== "string") return;
      const list = notificationsByUser.get(myId);
      if (!list) return;
      const n = list.find((x) => x.id === id);
      if (n) n.read = true;
      emitToUser(io, myId, "notifications:sync", { notifications: getNotifications(myId) });
    });

    socket.on("notification:read_all", () => {
      const list = notificationsByUser.get(myId);
      if (list) for (const n of list) n.read = true;
      emitToUser(io, myId, "notifications:sync", { notifications: getNotifications(myId) });
    });

    socket.on("call:offer", async ({ toUserId, offer, callType, renegotiate, screen } = {}, ack) => {
      // 3.0.0 (C3): delivery ack; the client re-sends after 3 s without it.
      if (typeof ack === "function") ack({ ok: true });
      if (typeof toUserId !== "string" || !offer) return;
      const targetId = toUserId.trim();
      if (!targetId) return;
      if (await isBlockedEitherWay(myId, targetId)) {
        return socket.emit("call:error", { message: "You can't call this user.", toUserId: targetId });
      }

      // Always attempt delivery via durable user room + presence fallback.
      const room = io.sockets?.adapter?.rooms?.get(`user:${targetId}`);
      const presenceHit = Boolean(presence.get(targetId)?.socketId);
      const delivered = (room && room.size > 0) || presenceHit;

      // Clients since 2.9.133 say whether this is a renegotiation inside a
      // connected call; older clients don't, so fall back to "already active".
      // A client flag alone must not ring someone who is not a friend.
      const prior = getPendingCall(myId, targetId);
      const activeRenegotiation = prior?.status === "active";
      const renegotiation =
        renegotiate === true || (renegotiate === undefined && activeRenegotiation);
      const friendsOk = await isAcceptedFriend(myId, targetId);
      if (planCallOffer({ friends: friendsOk, activeRenegotiation }) === "deny") {
        return socket.emit("call:error", {
          message: "You can call this person after they accept your message request.",
          code: "not_friends",
          toUserId: targetId,
        });
      }
      const { callUuid } = trackOffer({
        callerId: myId,
        calleeId: targetId,
        callType: callType || "voice",
        offer,
        renegotiation,
      });

      // Full public user (frame / name effect / badge) so the callee call
      // tile can render shop cosmetics — bare id+username stripped them.
      const fromUser =
        enrichFriendEntry(myId) ||
        getCachedPublicUser(myId) || {
          id: myId,
          username: me.username,
          avatar_url: me.avatar_url || socket.user?.avatar_url || null,
          avatarUrl: me.avatar_url || socket.user?.avatar_url || null,
        };
      const { sanitizeScreenAnnouncement } = require("../lib/screenShareSignal");
      const announced = sanitizeScreenAnnouncement(screen);
      emitToUser(io, targetId, "call:offer", {
        fromUser,
        offer,
        callType: callType || "voice",
        callUuid,
        renegotiate: renegotiation,
        ...(announced ? { screen: announced } : {}),
      });

      if (!renegotiation && callUuid) {
        getRingFanout(io).ringStarted({
          callUuid,
          callerId: myId,
          calleeId: targetId,
          callerName: fromUser.displayName || fromUser.display_name || fromUser.username || me.username,
        });
      }

      // Native iOS: PushKit VoIP ring → CallKit. Fresh rings only, never a
      // renegotiation (that would ring a phone that is already in the call).
      if (!renegotiation && callUuid) {
        try {
          const { sendIncomingCallVoip } = require("../lib/voipPush");
          void sendIncomingCallVoip(targetId, {
            callUuid,
            callerId: myId,
            callerName:
              fromUser.displayName || fromUser.display_name || fromUser.username || me.username,
            callerAvatar: fromUser.avatarUrl || fromUser.avatar_url || "",
            video: (callType || "voice") === "video",
            conversationId: myId,
          });
        } catch (err) {
          console.warn("[Call] VoIP ring failed:", err?.message || err);
        }
      }

      // Wake backgrounded Android / PWA clients even when Socket.IO is asleep.
      // Push carries no SDP — opening the app lets the live offer (or a retry) connect.
      // iOS: only phones without CallKit/VoIP get this as an alert (lib/iosAlertPush.js).
      // A renegotiation is an already-running call, so nothing should ring.
      if (!renegotiation) try {
        const { sendIncomingCallPush } = require("../lib/webPush");
        void sendIncomingCallPush([targetId], {
          type: "call",
          callType: callType || "voice",
          fromId: myId,
          from: me.username,
          conversationId: myId,
          title: `${fromUser.displayName || fromUser.display_name || me.username} arıyor`,
          body: (callType || "voice") === "video" ? "Görüntülü arama" : "Sesli arama",
          callUuid,
          // 3.0.0 (C3): the tap resolver tells a live ring from an old one.
          callKind: "dm",
          startedAt: Date.now(),
          tag: `call-${myId}`,
          deepLink: `/?dm=${encodeURIComponent(myId)}&call=1`,
          action: "answer",
        });
      } catch (err) {
        console.warn("[Call] incoming push failed:", err?.message || err);
      }

      // Inform caller only when we truly have no socket for the callee.
      // Do not block the offer attempt — emitToUser is best-effort.
      if (!delivered) {
        console.warn(`[Call] offer — callee may be offline: ${targetId}`);
        socket.emit("call:unreachable", {
          toUserId: targetId,
          reason: "offline_or_no_socket",
        });
      }
    });

    socket.on("call:answer", ({ toUserId, answer } = {}, ack) => {
      // 3.0.0 (C3): delivery ack; the client re-sends after 3 s without it.
      if (typeof ack === "function") ack({ ok: true });
      if (typeof toUserId !== "string" || !answer) return;
      const ringing = getPendingCall(toUserId, myId);
      const wasRinging = ringing?.status === "ringing" && ringing.calleeId === myId;
      // Callee answers → caller is toUserId
      markAnswered({ callerId: toUserId, calleeId: myId, answer });
      if (wasRinging) {
        // Stop the ring on every other device of the callee: sockets
        // (call:ring-ended + legacy call:answered-elsewhere), the iPhone's
        // CallKit screen even when locked / killed (VoIP end push), and
        // closed-tab web notifications (web push).
        const fanout = getRingFanout(io);
        const plan =
          fanout.endRingByPair(toUserId, myId, "answered_elsewhere", { exceptSocketId: socket.id }) ||
          null;
        if (!plan) {
          // Ring not tracked (server restarted mid-ring): sockets still need it.
          socket.to(`user:${myId}`).emit("call:answered-elsewhere", {
            fromUserId: toUserId,
            callUuid: ringing.callUuid || null,
          });
          socket.to(`user:${myId}`).emit("call:ring-ended", {
            fromUserId: toUserId,
            callUuid: ringing.callUuid || null,
            reason: "answered_elsewhere",
          });
        }
      }
      emitToUser(io, toUserId, "call:answer", {
        fromUserId: myId,
        answer,
      });
    });

    socket.on("call:ice-candidate", ({ toUserId, candidate } = {}) => {
      if (typeof toUserId !== "string" || !candidate) return;
      bufferCallerIce({ callerId: myId, calleeId: toUserId, candidate });
      bufferCalleeIce({ fromId: myId, toId: toUserId, candidate });
      emitToUser(io, toUserId, "call:ice-candidate", {
        fromUserId: myId,
        candidate,
      });
    });

    socket.on("call:end", async ({ toUserId } = {}, ack) => {
      // 3.0.0 (C3): delivery ack; the client re-sends after 3 s without it.
      if (typeof ack === "function") ack({ ok: true });
      if (typeof toUserId !== "string") return;
      emitToUser(io, toUserId, "call:ended", { fromUserId: myId });
      // Hung up before the callee answered (older caller clients send end,
      // not cancel): the callee's other devices must stop ringing too.
      getRingFanout(io).endRingByPair(myId, toUserId, "cancelled");
      try {
        await finishDmCall(io, myId, toUserId, "completed");
      } catch (err) {
        console.warn("[Call] finalize end failed:", err?.message || err);
      }
    });

    socket.on("call:cancel", async ({ toUserId } = {}, ack) => {
      // 3.0.0 (C3): delivery ack; the client re-sends after 3 s without it.
      if (typeof ack === "function") ack({ ok: true });
      if (typeof toUserId !== "string") return;
      emitToUser(io, toUserId, "call:cancelled", { fromUserId: myId });
      getRingFanout(io).endRingByPair(myId, toUserId, "cancelled");
      try {
        // Unanswered cancel = missed for the callee history
        await finishDmCall(io, myId, toUserId, "missed");
      } catch (err) {
        console.warn("[Call] finalize cancel failed:", err?.message || err);
      }
    });

    socket.on("call:decline", async ({ toUserId } = {}, ack) => {
      // 3.0.0 (C3): delivery ack; the client re-sends after 3 s without it.
      if (typeof ack === "function") ack({ ok: true });
      if (typeof toUserId !== "string") return;
      const ringing = getPendingCall(toUserId, myId);
      if (ringing?.status === "ringing" && ringing.calleeId === myId) {
        const plan = getRingFanout(io).endRingByPair(toUserId, myId, "declined_elsewhere", {
          exceptSocketId: socket.id,
        });
        if (!plan) {
          socket.to(`user:${myId}`).emit("call:declined-elsewhere", {
            fromUserId: toUserId,
            callUuid: ringing.callUuid || null,
          });
          socket.to(`user:${myId}`).emit("call:ring-ended", {
            fromUserId: toUserId,
            callUuid: ringing.callUuid || null,
            reason: "declined_elsewhere",
          });
        }
      }
      emitToUser(io, toUserId, "call:declined", { fromUserId: myId });
      try {
        await finishDmCall(io, myId, toUserId, "declined");
      } catch (err) {
        console.warn("[Call] finalize decline failed:", err?.message || err);
      }
    });

    // Caller back after its socket was suspended while ringing (iPhone locked
    // / app in background): replay the answer + callee ICE it missed.
    socket.on("call:caller-resume", ({ toUserId } = {}) => {
      if (typeof toUserId !== "string" || !toUserId) return;
      getRingFanout(io).callerSocketsBack(myId);
      const replay = answerReplayForCaller(myId, toUserId);
      // 3.0.0 (C3): tell the caller what the server knows about its ring.
      // "unknown" = no record at all (backend restarted mid-ring): the caller
      // re-sends its offer so the callee's ring survives the restart.
      const known = getPendingCall(myId, toUserId);
      socket.emit("call:caller-resume:result", {
        toUserId,
        state: known
          ? known.status === "active"
            ? "active"
            : "ringing"
          : endedRecently(myId, toUserId)
            ? "ended"
            : "unknown",
      });
      if (!replay) return;
      socket.emit("call:answer", { fromUserId: toUserId, answer: replay.answer, resumed: true });
      for (const candidate of replay.candidates) {
        socket.emit("call:ice-candidate", { fromUserId: toUserId, candidate });
      }
    });

    // Connection telemetry from clients (no ids / names): one line per call
    // setup so failed iOS calls show up in the Render logs.
    let telemetryCount = 0;
    socket.on("call:telemetry", (summary = {}) => {
      const { sanitizeCallTelemetry, MAX_PER_SOCKET } = require("../lib/callTelemetry");
      if (!summary || typeof summary !== "object" || ++telemetryCount > MAX_PER_SOCKET) return;
      const pick = sanitizeCallTelemetry(summary);
      if (!pick) return;
      console.log("[CallTelemetry]", JSON.stringify(pick));
    });

    // Native iOS after a VoIP wake / CallKit answer: replay still-ringing offers
    // (plus buffered caller ICE) to THIS socket only, and report the state of
    // the CallKit calls it was woken for so it can end stale ones.
    socket.on("call:resume-pending", ({ callUuids } = {}) => {
      const wanted = Array.isArray(callUuids)
        ? callUuids.filter((id) => typeof id === "string" && id.length <= 64).slice(0, 8)
        : [];
      const ringing = listRingingForCallee(myId);
      for (const call of ringing) {
        const fromUser =
          enrichFriendEntry(call.callerId) ||
          getCachedPublicUser(call.callerId) || { id: call.callerId };
        socket.emit("call:offer", {
          fromUser,
          offer: call.offer,
          callType: call.callType,
          callUuid: call.callUuid,
          resumed: true,
        });
        for (const candidate of call.callerIce) {
          socket.emit("call:ice-candidate", { fromUserId: call.callerId, candidate });
        }
      }
      socket.emit("call:resume-pending:result", {
        calls: wanted.map((callUuid) => ({ callUuid, state: callStateByUuid(callUuid, myId) })),
      });
    });

    // A tab / device that was asleep while it rang asks whether that ring is
    // still on (it may have missed call:ring-ended). "ringing" | "active" | "ended".
    socket.on("call:ring-status", ({ fromUserId, callUuid } = {}) => {
      if (typeof fromUserId !== "string" || !fromUserId) return;
      const pending = getPendingCall(fromUserId, myId);
      // "unknown" (3.0.0, C3): no record and not recently ended, i.e. the
      // backend restarted mid-ring. The callee keeps ringing; the caller
      // re-sends its offer (call:caller-resume:result).
      let state = pending || endedRecently(fromUserId, myId) ? "ended" : "unknown";
      if (pending && pending.calleeId === myId) {
        if (pending.status === "active") state = "active";
        else if (pending.status === "ringing" && (!callUuid || !pending.callUuid || pending.callUuid === callUuid)) {
          state = "ringing";
        }
      }
      socket.emit("call:ring-status:result", { fromUserId, callUuid: callUuid || null, state });
    });

    socket.on("screen:share-start", ({ toUserId, screen } = {}) => {
      if (typeof toUserId !== "string") return;
      dmScreenSharingUsers.add(myId);
      const { sanitizeScreenAnnouncement } = require("../lib/screenShareSignal");
      const announced = sanitizeScreenAnnouncement(screen);
      emitToUser(io, toUserId, "screen:share-start", {
        fromUserId: myId,
        ...(announced ? { screen: announced } : {}),
      });
    });

    socket.on("screen:share-stop", ({ toUserId } = {}) => {
      if (typeof toUserId !== "string") return;
      dmScreenSharingUsers.delete(myId);
      emitToUser(io, toUserId, "screen:share-stop", { fromUserId: myId });
    });

    // DesCoin earning heartbeat — sent every ~15-20s by an active call's UI
    // while the mic is genuinely producing speech (or a screen share is on).
    // Every check here is against server-owned state; the client can only
    // ever *ask* to be credited, never assert the amount or the fact.
    socket.on("descoin:heartbeat", async ({ context, peerId, groupId, type, speaking, antibot } = {}) => {
      try {
        if (type !== "voice" && type !== "screenshare") return;

        let valid = false;
        if (context === "dm" && typeof peerId === "string") {
          valid = isActiveDmCall(myId, peerId) && (type === "voice" || dmScreenSharingUsers.has(myId));
        } else if (context === "group" && typeof groupId === "string") {
          const activeCall = activeGroupCalls.get(groupId);
          const inCall = Boolean(activeCall?.participants?.has(myId) && activeCall.participants.size >= 2);
          valid = inCall && (type === "voice" || screenShareSessions.has(`${groupId}:${myId}`));
        }
        if (!valid) return;
        if (type === "voice" && !speaking) return; // only pay for actual talking, not idle presence

        const throttleKey = `${myId}:${type}`;
        const lastAt = descoinHeartbeatLastAt.get(throttleKey) || 0;
        if (Date.now() - lastAt < DESCOIN_HEARTBEAT_MIN_INTERVAL_MS) return;
        descoinHeartbeatLastAt.set(throttleKey, Date.now());

        // Anti-bot monitor (Faz 0): records activity (+ media shadow rules when
        // a newer client sends hints). Does not change the amount below.
        try {
          descoinAntibot.observeHeartbeat({
            userId: myId,
            type,
            ctxKey: context === "dm" ? `dm:${[myId, peerId].sort().join(":")}` : `group:${groupId}`,
            others:
              context === "dm"
                ? [peerId]
                : [...(activeGroupCalls.get(groupId)?.participants?.keys?.() || [])].filter((id) => id !== myId),
            beat: antibot && typeof antibot === "object" && !Array.isArray(antibot) ? antibot : null,
          });
        } catch {
          /* monitoring must never affect earning */
        }

        const reason = type === "voice" ? "voice_activity" : "screenshare_activity";
        const amount = type === "voice" ? 1 : 2;
        const result = await descoin.creditCapped(myId, amount, reason, {
          context,
          groupId: groupId || null,
          peerId: peerId || null,
        });
        if (result.credited > 0) {
          socket.emit("descoin:balance", { balance: result.balance, delta: result.credited, reason });
        }
      } catch (err) {
        console.warn("[DesCoin] heartbeat error:", err?.message || err);
      }
    });

    // Media state is presentation-only; it lets the remote tile immediately
    // show muted/camera-off status instead of inferring it from a frozen track.
    // `deafened` and `requestState` (ask the peer to re-send its state, e.g.
    // after this client connected or its socket reconnected) are optional.
    socket.on("call:media-state", ({ toUserId, muted, cameraOn, deafened, requestState, sending } = {}) => {
      if (typeof toUserId !== "string") return;
      emitToUser(io, toUserId, "call:media-state", {
        fromUserId: myId,
        muted: Boolean(muted),
        cameraOn: Boolean(cameraOn),
        deafened: Boolean(deafened),
        requestState: Boolean(requestState),
        // 3.0.0 (C2): sender's outbound audio verified flowing; omitted by old clients.
        ...(typeof sending === "boolean" ? { sending } : {}),
      });
    });

    // 2.11.1 security: the old generic "room:join" / "room:message" events let any
    // logged-in socket join any room (user:<otherId>, admin, …) and inject events
    // into it. No client used them, so they are gone. Rooms are only joined
    // server-side after an authorization check (user:<self>, admin for admins,
    // group/server/voice rooms in their own handlers).

    // Emoji Reactions
    socket.on("reaction:add", async (payload = {}, ack) => {
      // Optional ack (Master Update A2): the client rolls its optimistic chip
      // back on ok:false or a 5 s timeout. Old clients pass no callback.
      const reply = (res) => { if (typeof ack === "function") { try { ack(res); } catch { /* client gone */ } } };
      const refuse = (error) => { reply({ ok: false, error }); };
      let { messageId, conversationType, conversationId, emoji } = payload || {};
      if (!messageId || !conversationType || !conversationId || !emoji) {
        return refuse("rejected");
      }
      
      // Verify user is part of this conversation
      let otherId = null;
      let dmKey = conversationId;
      if (conversationType === "dm") {
        // Accept either "a::b" or a bare peer user id
        if (typeof conversationId === "string" && conversationId.includes("::")) {
          const ids = conversationId.split("::");
          if (ids.length !== 2) {
            return refuse("rejected");
          }
          otherId = ids[0] === myId ? ids[1] : ids[0];
          dmKey = convKey(myId, otherId);
        } else {
          otherId = conversationId;
          dmKey = convKey(myId, otherId);
        }
        if (!otherId || otherId === myId) {
          return refuse("rejected");
        }
        // Soft-check friendship: still allow if already in an open DM thread
        const knownThread = dmHistory.has(dmKey);
        if (!friends.get(myId)?.has(otherId) && !knownThread) {
          return refuse("rejected");
        }
        // A block (either way) also stops reactions, not just messages and calls.
        if (dmBlockPairs.has(dmKey) || await isBlockedEitherWay(myId, otherId)) {
          return refuse("blocked");
        }
        conversationId = dmKey;
      } else if (conversationType === "group") {
        // Check group membership - room has 'group:' prefix
        const roomId = `group:${conversationId}`;
        const isMember = socket.rooms.has(roomId);
        if (!isMember) {
          // Fallback: allow if user is in the group's member list in DB / previously joined
          try {
            const { data: mem } = await supabase
              .from("group_members")
              .select("user_id")
              .eq("group_id", conversationId)
              .eq("user_id", myId)
              .maybeSingle();
            if (!mem) {
              return refuse("rejected");
            }
            socket.join(roomId);
          } catch {
            return refuse("rejected");
          }
        }
      } else if (conversationType === "server") {
        // conversationId is the text channel id
        try {
          const { assertTextChannelAccess } = require("./serverChannelHandlers");
          const { Permissions, hasPermission } = require("../lib/serverPermissions");
          // assertTextChannelAccess always requires VIEW_CHANNEL; reacting also
          // needs READ_MESSAGE_HISTORY (you can only react to what you can read).
          const { channel, permissions } = await assertTextChannelAccess(myId, conversationId, Permissions.ADD_REACTIONS);
          if (!hasPermission(permissions, Permissions.READ_MESSAGE_HISTORY)) {
            return refuse("rejected");
          }
          // Timed-out members are refused inside assertTextChannelAccess(ADD_REACTIONS);
          // removing your own reaction stays allowed.
          // A stored message (uuid id) must live in that channel; a foreign
          // messageId used to be accepted. Live-only app/game messages have
          // non-uuid ids, are never stored, and keep working as before.
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(messageId))) {
            const { data: msg } = await supabase
              .from("server_messages")
              .select("id")
              .eq("id", messageId)
              .eq("channel_id", channel.id)
              .eq("server_id", channel.server_id)
              .maybeSingle();
            if (!msg) {
              return refuse("rejected");
            }
          }
          // No socket.join here: a reaction never grants live-room membership
          // (K1, 2026-10-18). Only server:channel:join / rejoin do, after VIEW_CHANNEL.
        } catch (err) {
          return refuse("rejected");
        }
      } else {
        return refuse("rejected");
      }

      try {
        const { data, error } = await supabase
          .from("reactions")
          .upsert({
            message_id: messageId,
            conversation_type: conversationType,
            conversation_id: conversationId,
            user_id: myId,
            emoji: emoji,
          }, { onConflict: "message_id,user_id,emoji" })
          .select();

        if (error) {
          console.error("[reaction:add] Supabase error:", error);
          throw error;
        }


        // Broadcast to all users in conversation
        const reactionData = {
          messageId,
          emoji,
          userId: myId,
          username: me.username,
          conversationType,
          conversationId,
        };


        if (conversationType === "dm" && otherId) {
          const otherPresence = presence.get(otherId);
          emitToUser(io, otherId, "reaction:update", reactionData);
        } else if (conversationType === "server") {
          io.to(`server-channel:${conversationId}`).emit("reaction:update", reactionData);
        } else {
          io.to(`group:${conversationId}`).emit("reaction:update", reactionData);
        }
        socket.emit("reaction:update", reactionData);
        reply({ ok: true });
      } catch (err) {
        console.error("[reaction:add] Error:", err);
        refuse("failed");
      }
    });

    socket.on("reaction:remove", async (payload = {}, ack) => {
      // Optional ack (Master Update A2): the client rolls its optimistic chip
      // back on ok:false or a 5 s timeout. Old clients pass no callback.
      const reply = (res) => { if (typeof ack === "function") { try { ack(res); } catch { /* client gone */ } } };
      const refuse = (error) => { reply({ ok: false, error }); };
      let { messageId, conversationType, conversationId, emoji } = payload || {};
      if (!messageId || !conversationType || !conversationId || !emoji) return refuse("rejected");

      // Get otherId for DM
      let otherId = null;
      if (conversationType === "dm") {
        if (typeof conversationId === "string" && conversationId.includes("::")) {
          const ids = conversationId.split("::");
          if (ids.length === 2) {
            otherId = ids[0] === myId ? ids[1] : ids[0];
            conversationId = convKey(myId, otherId);
          }
        } else {
          otherId = conversationId;
          conversationId = convKey(myId, otherId);
        }
      } else if (conversationType === "server") {
        try {
          const { assertTextChannelAccess } = require("./serverChannelHandlers");
          const { Permissions, hasPermission } = require("../lib/serverPermissions");
          const { permissions } = await assertTextChannelAccess(myId, conversationId, Permissions.ADD_REACTIONS);
          if (!hasPermission(permissions, Permissions.READ_MESSAGE_HISTORY)) return refuse("rejected");
        } catch {
          return refuse("rejected");
        }
      } else if (conversationType === "group") {
        // Same membership gate as reaction:add, so an outsider cannot push
        // reaction:update events into a group room.
        if (!socket.rooms.has(`group:${conversationId}`)) {
          try {
            const { data: mem } = await supabase
              .from("group_members")
              .select("user_id")
              .eq("group_id", conversationId)
              .eq("user_id", myId)
              .maybeSingle();
            if (!mem) return refuse("rejected");
          } catch {
            return refuse("rejected");
          }
        }
      } else {
        return refuse("rejected");
      }

      try {
        const { error } = await supabase
          .from("reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", myId)
          .eq("emoji", emoji);

        if (error) throw error;

        const reactionData = {
          messageId,
          emoji,
          userId: myId,
          username: me.username,
          removed: true,
          conversationType,
          conversationId,
        };

        if (conversationType === "dm" && otherId) {
          emitToUser(io, otherId, "reaction:update", reactionData);
        } else if (conversationType === "server") {
          io.to(`server-channel:${conversationId}`).emit("reaction:update", reactionData);
        } else {
          io.to(`group:${conversationId}`).emit("reaction:update", reactionData);
        }
        socket.emit("reaction:update", reactionData);
        reply({ ok: true });
      } catch (err) {
        console.error("[reaction:remove] Error:", err);
        refuse("failed");
      }
    });

    // Message Edit - DM
    socket.on("dm:message:edit", async ({ messageId, newText, toUserId } = {}) => {
      const fail = (message) => socket.emit("dm:error", {
        message: message || "Failed to edit message.",
        toUserId,
        messageId,
        code: "EDIT_FAILED",
      });
      if (!messageId || !newText || !toUserId) return fail("Failed to edit message.");

      // Verify friendship
      if (!friends.get(myId)?.has(toUserId)) return fail("Failed to edit message.");
      {
        const { data: kind } = await supabase.from("dm_messages").select("media_type").eq("id", messageId).eq("from_user_id", myId).maybeSingle();
        if (["poll_v2", "poll_end", "app_card"].includes(kind?.media_type)) return fail("Bu mesaj metin olarak düzenlenemez.");
      }

      const key = convKey(myId, toUserId);
      const arr = dmHistory.get(key) || [];
      const msg = arr.find((message) => message.id === messageId && message.from?.id === myId);
      const editedAt = new Date().toISOString();
      const nextEditHistory = [
        ...(msg?.editHistory || []),
        ...(msg ? [{ text: msg.text, editedAt }] : []),
      ];
      const { data, error } = await supabase
        .from("dm_messages")
        .update({
          content: newText,
          edited_at: editedAt,
          edit_history: nextEditHistory,
        })
        .eq("id", messageId)
        .eq("from_user_id", myId)
        .eq("to_user_id", toUserId)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        console.error("[DM] Edit failed:", error?.message || "Message not found");
        return fail("Failed to edit message.");
      }
      if (msg) {
        msg.editHistory = nextEditHistory;
        msg.text = newText;
        msg.editedAt = editedAt;
      }
      emitToUser(io, toUserId, "dm:message:edited", {
        messageId, newText, editedAt, withUserId: myId, from: myId,
      });
      socket.emit("dm:message:edited", { messageId, newText, editedAt, withUserId: toUserId });
    });

    // Message delete — DM. Own messages only, removed for both people.
    socket.on("dm:message:delete", async ({ messageId, toUserId } = {}) => {
      if (!messageId || !toUserId) return;
      const fail = (message) => socket.emit("dm:error", {
        message: message || "Failed to delete message.",
        toUserId,
        messageId,
        code: "DELETE_FAILED",
      });
      if (!friends.get(myId)?.has(toUserId)) return fail("Failed to delete message.");
      try {
        const { data, error } = await supabase
          .from("dm_messages")
          .delete()
          .eq("id", messageId)
          .eq("from_user_id", myId)
          .eq("to_user_id", toUserId)
          .select("id")
          .maybeSingle();
        if (error || !data) return fail(error?.message || "Failed to delete message.");
        const key = convKey(myId, toUserId);
        const arr = dmHistory.get(key);
        if (arr) {
          const idx = arr.findIndex((m) => m.id === messageId);
          if (idx >= 0) arr.splice(idx, 1);
        }
        socket.emit("dm:message:deleted", { messageId, withUserId: toUserId });
        emitToUser(io, toUserId, "dm:message:deleted", { messageId, withUserId: myId });
      } catch (err) {
        fail(err?.message);
      }
    });

    // Message pinning - DM (either participant may pin/unpin)
    socket.on("dm:message:pin", async ({ messageId, toUserId } = {}) => {
      if (!messageId || !toUserId) return;
      if (!(await isAcceptedFriend(myId, toUserId))) return;

      const pinnedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("dm_messages")
        .update({ pinned_at: pinnedAt, pinned_by: myId })
        .eq("id", messageId)
        .or(`and(from_user_id.eq.${myId},to_user_id.eq.${toUserId}),and(from_user_id.eq.${toUserId},to_user_id.eq.${myId})`)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        return socket.emit("dm:error", { message: "Failed to pin message.", toUserId });
      }

      const key = convKey(myId, toUserId);
      const msg = (dmHistory.get(key) || []).find((m) => m.id === messageId);
      if (msg) {
        msg.pinnedAt = pinnedAt;
        msg.pinnedBy = myId;
      }

      const payload = { messageId, pinnedAt, pinnedBy: myId, byUsername: me.username };
      socket.emit("dm:message:pinned", { ...payload, toUserId });
      emitToUser(io, toUserId, "dm:message:pinned", { ...payload, toUserId: myId });
    });

    socket.on("dm:message:unpin", async ({ messageId, toUserId } = {}) => {
      if (!messageId || !toUserId) return;
      if (!(await isAcceptedFriend(myId, toUserId))) return;

      const { data, error } = await supabase
        .from("dm_messages")
        .update({ pinned_at: null, pinned_by: null })
        .eq("id", messageId)
        .or(`and(from_user_id.eq.${myId},to_user_id.eq.${toUserId}),and(from_user_id.eq.${toUserId},to_user_id.eq.${myId})`)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        return socket.emit("dm:error", { message: "Failed to unpin message.", toUserId });
      }

      const key = convKey(myId, toUserId);
      const msg = (dmHistory.get(key) || []).find((m) => m.id === messageId);
      if (msg) {
        msg.pinnedAt = null;
        msg.pinnedBy = null;
      }

      socket.emit("dm:message:unpinned", { messageId, toUserId });
      emitToUser(io, toUserId, "dm:message:unpinned", { messageId, toUserId: myId });
    });

    socket.on("dm:pinned:list", async ({ withUserId } = {}) => {
      if (typeof withUserId !== "string") return socket.emit("dm:pinned:list", { withUserId, pinned: [] });
      if (!(await isAcceptedFriend(myId, withUserId))) {
        return socket.emit("dm:pinned:list", { withUserId, pinned: [] });
      }
      try {
        const { data: rows, error } = await supabase
          .from("dm_messages")
          .select("id, from_user_id, to_user_id, content, media_url, media_type, mime_type, original_name, pinned_at, pinned_by, created_at")
          .or(`and(from_user_id.eq.${myId},to_user_id.eq.${withUserId}),and(from_user_id.eq.${withUserId},to_user_id.eq.${myId})`)
          .not("pinned_at", "is", null)
          .order("pinned_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        const userIds = [...new Set((rows || []).map((r) => r.from_user_id))];
        const { data: profiles } = userIds.length
          ? await supabase.from("users").select("id, username, avatar_url").in("id", userIds)
          : { data: [] };
        const usersById = new Map((profiles || []).map((p) => [p.id, p]));
        const pinned = (rows || []).map((row) => mapDmRow(row, usersById));
        socket.emit("dm:pinned:list", { withUserId, pinned });
      } catch (err) {
        console.error("[DM] pinned list failed:", err.message);
        socket.emit("dm:pinned:list", { withUserId, pinned: [] });
      }
    });

    // Message Edit - Group
    socket.on("group:message:edit", async ({ messageId, newText, groupId } = {}) => {
      const fail = (message) => socket.emit("group:message:error", {
        groupId,
        messageId,
        message: message || "Failed to edit message.",
        code: "EDIT_FAILED",
      });
      if (!messageId || !newText || !groupId) return fail("Failed to edit message.");

      // Check membership
      if (!socket.rooms.has(`group:${groupId}`)) return fail("Failed to edit message.");
      {
        const { data: kind } = await supabase.from("group_messages").select("media_type").eq("id", messageId).eq("group_id", groupId).maybeSingle();
        if (["poll_v2", "poll_end", "app_card"].includes(kind?.media_type)) return fail("Bu mesaj metin olarak düzenlenemez.");
      }
      
      const editedAt = new Date().toISOString();
      
      try {
        // Update message in Supabase
        const { error } = await supabase
          .from("group_messages")
          .update({
            content: newText,
            edited_at: editedAt,
            edited_by: myId,
            is_edited: true
          })
          .eq("id", messageId)
          .eq("sender_id", myId); // Only edit own messages
        
        if (error) {
          console.error("[group:message:edit] Error updating message:", error);
          return fail("Failed to edit message.");
        }
        
        // Broadcast edit to group room
        const editData = {
          groupId,
          messageId,
          newText,
          editedAt,
          editedBy: myId,
          username: me.username
        };
        
        io.to(`group:${groupId}`).emit("group:message:edited", editData);
      } catch (err) {
        console.error("[group:message:edit] Error:", err);
        fail("Failed to edit message.");
      }
    });

    // Message delete — group. Own messages only, removed for every member.
    socket.on("group:message:delete", async ({ messageId, groupId } = {}) => {
      if (!messageId || !groupId) return;
      const fail = (message) => socket.emit("group:message:error", {
        groupId,
        messageId,
        message: message || "Failed to delete message.",
      });
      if (!socket.rooms.has(`group:${groupId}`)) return fail("Failed to delete message.");
      try {
        const { data, error } = await supabase
          .from("group_messages")
          .delete()
          .eq("id", messageId)
          .eq("group_id", groupId)
          .eq("sender_id", myId)
          .select("id")
          .maybeSingle();
        if (error || !data) return fail(error?.message || "Failed to delete message.");
        const payload = { messageId, groupId };
        io.to(`group:${groupId}`).emit("group:message:deleted", payload);
        socket.emit("group:message:deleted", payload);
      } catch (err) {
        console.error("[group:message:delete] Error:", err);
        fail(err?.message);
      }
    });

    // Message pinning - Group (any member may pin/unpin, mirrors edit's membership check)
    socket.on("group:message:pin", async ({ messageId, groupId } = {}) => {
      if (!messageId || !groupId) return;
      if (!socket.rooms.has(`group:${groupId}`)) return;

      const pinnedAt = new Date().toISOString();
      try {
        const { data, error } = await supabase
          .from("group_messages")
          .update({ pinned_at: pinnedAt, pinned_by: myId })
          .eq("id", messageId)
          .eq("group_id", groupId)
          .select("id")
          .maybeSingle();
        if (error || !data) throw error || new Error("Message not found");

        io.to(`group:${groupId}`).emit("group:message:pinned", {
          messageId,
          groupId,
          pinnedAt,
          pinnedBy: myId,
          byUsername: me.username,
        });
      } catch (err) {
        console.error("[group:message:pin] Error:", err.message || err);
      }
    });

    socket.on("group:message:unpin", async ({ messageId, groupId } = {}) => {
      if (!messageId || !groupId) return;
      if (!socket.rooms.has(`group:${groupId}`)) return;

      try {
        const { data, error } = await supabase
          .from("group_messages")
          .update({ pinned_at: null, pinned_by: null })
          .eq("id", messageId)
          .eq("group_id", groupId)
          .select("id")
          .maybeSingle();
        if (error || !data) throw error || new Error("Message not found");

        io.to(`group:${groupId}`).emit("group:message:unpinned", { messageId, groupId });
      } catch (err) {
        console.error("[group:message:unpin] Error:", err.message || err);
      }
    });

    socket.on("group:pinned:list", async ({ groupId } = {}) => {
      if (typeof groupId !== "string") return socket.emit("group:pinned:list", { groupId, pinned: [] });
      if (!socket.rooms.has(`group:${groupId}`)) return socket.emit("group:pinned:list", { groupId, pinned: [] });
      try {
        const { data: rows, error } = await supabase
          .from("group_messages")
          .select("id, group_id, sender_id, content, media_url, media_type, original_name, pinned_at, pinned_by, created_at")
          .eq("group_id", groupId)
          .not("pinned_at", "is", null)
          .order("pinned_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        const senderIds = [...new Set((rows || []).map((r) => r.sender_id))];
        const { data: profiles } = senderIds.length
          ? await supabase.from("users").select("id, username, avatar_url").in("id", senderIds)
          : { data: [] };
        const usersById = new Map((profiles || []).map((p) => [p.id, p]));
        const pinned = (rows || []).map((row) => ({
          id: row.id,
          groupId: row.group_id,
          sender: messageSender(row.sender_id, usersById.get(row.sender_id)?.username),
          text: row.content || "",
          mediaUrl: row.media_url || null,
          mediaType: row.media_type || null,
          originalName: row.original_name || null,
          pinnedAt: row.pinned_at,
          pinnedBy: row.pinned_by,
          timestamp: toUtcIso(row.created_at) || row.created_at,
        }));
        socket.emit("group:pinned:list", { groupId, pinned });
      } catch (err) {
        console.error("[group:pinned:list] Error:", err.message || err);
        socket.emit("group:pinned:list", { groupId, pinned: [] });
      }
    });

    socket.on("disconnect", async () => {
      if (fromIosApp) iosPushContext.clearSocket(socket.id);
      // Only drop group-call participation when THIS user has no other live
      // sockets (other tabs / reconnect). Removing on every socket disconnect
      // kicked the remaining participant out of the room on brief blips and
      // made "peer hangup" look like mutual disconnect.
      const remaining = io.sockets?.adapter?.rooms?.get(`user:${myId}`);
      const otherSocketIds = remainingUserSocketIds(remaining, socket.id);
      const hasOtherSockets = otherSocketIds.length > 0;
      if (!hasOtherSockets) {
        for (const groupId of activeGroupCalls.keys()) {
          scheduleParticipantDisconnectGrace(io, groupId, myId);
        }
        // DM: an outgoing ring whose caller vanished is cancelled after a
        // short grace; a connected call is never ended here (WebRTC often
        // outlives the socket) — the peer is only told we are offline.
        getRingFanout(io).callerSocketsGone(myId);
        for (const peerId of activeDmPeersOf(myId)) {
          emitToUser(io, peerId, "call:peer-presence", { peerId: myId, online: false });
        }
        removeUserFromAllServerVoice(io, myId);
        dmScreenSharingUsers.delete(myId);
        scheduleTemporaryMemberCleanup(io, myId);
      }
      socketToUser.delete(socket.id);

      // Keep presence if another tab/socket for this user is still connected.
      // Filter out this socket — on disconnect it may still be listed in the room.
      if (hasOtherSockets) {
        const nextSocketId = otherSocketIds[0];
        const prev = presence.get(myId);
        if (prev) {
          presence.set(myId, { ...prev, socketId: nextSocketId, status: prev.status || "online" });
        } else {
          presence.set(myId, {
            username: me.username,
            status: "online",
            socketId: nextSocketId,
          });
        }
        getPresenceFanout(io).socketGone(socket.id);
        broadcastUsers(io, myId);
        notifyAdminRoom(io, { type: "presence", online: presence.size });
        return;
      }

      const sessStart = userSessionStartMs.get(myId);
      if (sessStart) {
        userOnlineAccumMs.set(myId, (userOnlineAccumMs.get(myId) || 0) + (Date.now() - sessStart));
      }
      userSessionStartMs.delete(myId);
      const p = presence.get(myId);
      if (p?.username) usernameById.set(myId, p.username);
      lastSeenByUserId.set(myId, new Date().toISOString());
      touchLastSeen(myId, { force: true }).catch(() => {});
      presence.delete(myId);
      getPresenceFanout(io).socketGone(socket.id);
      getPresenceFanout(io).userOffline(myId);
      notifyAdminRoom(io, { type: "presence", online: presence.size });
    });

    // Grup DM handlerları
    registerGroupHandlers(io, socket, {
      presence,
      socketToUser,
      friends,
    });

    // Server channel text chat (Step 4) + voice hangouts (Step 10)
    registerServerChannelHandlers(io, socket);
    registerServerVoiceHandlers(io, socket);
    registerPollHandlers(io, socket);
  });
}

module.exports = { registerSocketHandlers, loadFriendsFromDB, finishDmCall, getRingFanout, pushNotification, emitFriendState };
