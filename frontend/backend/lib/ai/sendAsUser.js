"use strict";

const supabase = require("../../db/supabase");
const { isBlockedEitherWay } = require("../blocking");
const { getActiveTimeout, isBanned } = require("../moderation");
const {
  presence,
  friends,
  pendingRequests,
  usernameById,
  dmUnreadByUser,
  dmBlockPairs,
  rateLimitDm,
  systemConfig,
} = require("../../runtime/sharedState");
const {
  getCachedPublicUser,
  ensureCosmeticsCached,
  pickChatCosmetics,
  savePresenceStatus,
  cacheUserProfile,
  broadcastUserProfileUpdate,
} = require("../userProfile");
const { toUtcIso } = require("../datetime");
const descoin = require("../descoin");
const { shouldCreditMessage } = require("../descoinMessageGuard");
const {
  Permissions,
  hasPermission,
  resolveChannelPermissions,
} = require("../serverPermissions");
const { needsRulesAcceptance } = require("../serverRulesGate");
const { logInternal } = require("./sanitize");
const { convKey, normalizeHandle, polishOutboundText, publicPerson, scorePerson } = require("./agentDraft");

function emitToUser(io, userId, event, payload) {
  if (!io || !userId) return;
  const room = `user:${userId}`;
  const roomSet = io.sockets?.adapter?.rooms?.get(room);
  if (roomSet && roomSet.size > 0) {
    io.to(room).emit(event, payload);
    return;
  }
  const p = presence.get(userId);
  if (p?.socketId) io.to(p.socketId).emit(event, payload);
}

function senderPayload(userId) {
  const cached = getCachedPublicUser(userId);
  const username = cached?.username || usernameById.get(userId) || "Unknown";
  const avatar = cached?.avatarUrl || cached?.avatar_url || null;
  const displayName = cached?.displayName || cached?.display_name || null;
  const isAdmin = Boolean(cached?.is_admin || cached?.isAdmin) || username === "admin";
  return {
    id: userId,
    username,
    displayName,
    display_name: displayName,
    avatarUrl: avatar,
    avatar_url: avatar,
    avatarVersion: cached?.avatarVersion || cached?.updated_at || null,
    updated_at: cached?.updated_at || null,
    is_admin: isAdmin,
    isAdmin,
    ...pickChatCosmetics(cached),
  };
}

function fail(error, status = 400) {
  return { ok: false, error, status };
}

async function loadUser(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, bio, custom_status, presence_status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findUser({ userId, username }) {
  const id = String(userId || "").trim();
  const name = normalizeHandle(username);
  if (id) {
    const row = await loadUser(id);
    if (row) return row;
  }
  if (!name) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, bio, custom_status")
    .ilike("username", name)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function knownPeople(fromUserId) {
  const ids = new Set();
  const { data: friendRows } = await supabase
    .from("friendships")
    .select("user_id, friend_id")
    .or(`user_id.eq.${fromUserId},friend_id.eq.${fromUserId}`)
    .eq("status", "accepted")
    .limit(200);
  for (const row of friendRows || []) {
    const other = row.user_id === fromUserId ? row.friend_id : row.user_id;
    if (other) ids.add(other);
  }
  const { data: dms } = await supabase
    .from("dm_messages")
    .select("from_user_id, to_user_id")
    .or(`from_user_id.eq.${fromUserId},to_user_id.eq.${fromUserId}`)
    .order("created_at", { ascending: false })
    .limit(80);
  for (const row of dms || []) {
    const other = row.from_user_id === fromUserId ? row.to_user_id : row.from_user_id;
    if (other) ids.add(other);
  }
  ids.delete(fromUserId);
  if (!ids.size) return [];
  const { data: users, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, bio, custom_status")
    .in("id", [...ids]);
  if (error) throw error;
  return users || [];
}

async function searchPeople(fromUserId, query, { limit = 8 } = {}) {
  const q = normalizeHandle(query);
  if (q.length < 2) return { people: [], query: q };
  const known = await knownPeople(fromUserId);
  const ranked = known
    .map((u) => ({ ...u, _score: scorePerson(u, q) }))
    .filter((u) => u._score > 0)
    .sort((a, b) => b._score - a._score);

  const seen = new Set(ranked.map((u) => u.id));
  const safe = q.replace(/[%_,()]/g, "").slice(0, 24);
  if (safe.length >= 2) {
    const { data: extra } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url, bio, custom_status")
      .or(`username.ilike.${safe}%,display_name.ilike.%${safe}%`)
      .neq("id", fromUserId)
      .limit(12);
    for (const u of extra || []) {
      if (seen.has(u.id)) continue;
      const score = scorePerson(u, q);
      if (score <= 0) continue;
      ranked.push({ ...u, _score: score });
      seen.add(u.id);
    }
  }
  ranked.sort((a, b) => b._score - a._score);
  return {
    query: q,
    people: ranked.slice(0, Math.min(12, Math.max(1, limit))).map((u) => publicPerson(u)),
  };
}

async function resolveRecipient(fromUserId, { userId, username }) {
  const direct = await findUser({ userId, username });
  if (direct && direct.id !== fromUserId) return { user: direct };
  const q = normalizeHandle(username);
  if (!q && !userId) return { error: "Provide a username or user_id." };
  if (!q) return { error: "Recipient not found." };
  const { people } = await searchPeople(fromUserId, q, { limit: 8 });
  if (people.length === 1) {
    const user = await loadUser(people[0].id);
    return user ? { user } : { error: "Recipient not found." };
  }
  if (people.length > 1) {
    return {
      error: "Multiple people match that name. Call compose_direct_message again with the exact username or user_id.",
      candidates: people,
    };
  }
  return { error: "Recipient not found. Look them up with search_people or list_friends." };
}

async function friendshipRow(userA, userB) {
  const { data } = await supabase
    .from("friendships")
    .select("id, user_id, friend_id, status")
    .or(`and(user_id.eq.${userA},friend_id.eq.${userB}),and(user_id.eq.${userB},friend_id.eq.${userA})`);
  return Array.isArray(data) ? data : [];
}

function ensurePending(userId) {
  if (!pendingRequests.has(userId)) pendingRequests.set(userId, new Map());
  return pendingRequests.get(userId);
}

async function sendDirectMessage(fromUserId, { toUserId, text }, { io } = {}) {
  const polished = polishOutboundText(text);
  if (polished.error) return fail(polished.error);
  const trimmed = polished.text;
  if (fromUserId === toUserId) return fail("You cannot message yourself.");
  if (isBanned(fromUserId)) return fail("You are banned.", 403);
  const timeout = getActiveTimeout(fromUserId);
  if (timeout) return fail(timeout.message || "You are timed out and cannot send messages.", 403);
  if (dmBlockPairs.has(convKey(fromUserId, toUserId))) {
    return fail("Conversation blocked.", 403);
  }
  if (await isBlockedEitherWay(fromUserId, toUserId)) {
    return fail("You can't message this user.", 403);
  }
  const now = Date.now();
  const last = rateLimitDm.get(fromUserId) || 0;
  if (now - last < (systemConfig.dmRateLimitMs || 200)) {
    return fail("Rate limited. Try again in a moment.", 429);
  }
  rateLimitDm.set(fromUserId, now);

  const target = await loadUser(toUserId);
  if (!target) return fail("User not found.", 404);

  await ensureCosmeticsCached([fromUserId]).catch(() => {});
  const sender = senderPayload(fromUserId);

  const { data: row, error } = await supabase
    .from("dm_messages")
    .insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      content: trimmed,
    })
    .select("id, created_at")
    .single();
  if (error || !row) {
    logInternal("agent-dm-insert", error);
    return fail("Failed to send message. Please try again.", 500);
  }

  if (shouldCreditMessage(fromUserId, trimmed)) {
    descoin
      .creditCapped(fromUserId, 1, "message_activity", { context: "dm", toUserId, source: "dimaai_agent" })
      .catch((err) => logInternal("agent-descoin", err));
  }

  const recipientSocketId = presence.get(toUserId)?.socketId;
  const recipientSocket = recipientSocketId && io?.sockets?.sockets?.get(recipientSocketId);
  const recipientActivePeer = recipientSocket?.data?.activeDmPeer;
  let unreadCount = 0;
  if (recipientActivePeer !== fromUserId) {
    if (!dmUnreadByUser.has(toUserId)) dmUnreadByUser.set(toUserId, new Map());
    const unreadMap = dmUnreadByUser.get(toUserId);
    unreadCount = (unreadMap.get(fromUserId) || 0) + 1;
    unreadMap.set(fromUserId, unreadCount);
  } else {
    dmUnreadByUser.get(toUserId)?.delete(fromUserId);
  }

  const timestamp = toUtcIso(row.created_at) || row.created_at;
  const messagePayload = {
    id: row.id,
    from: sender,
    text: trimmed,
    timestamp,
  };
  if (io) {
    emitToUser(io, toUserId, "dm:message", { ...messagePayload, convWith: fromUserId });
    emitToUser(io, fromUserId, "dm:message", { ...messagePayload, convWith: toUserId });
    if (recipientActivePeer !== fromUserId) {
      emitToUser(io, toUserId, "dm:unread:sync", { peerId: fromUserId, count: unreadCount });
    }
    try {
      const dmPrefs = require("../dmConversationPrefs");
      void Promise.all([
        dmPrefs.revealOnMessage(fromUserId, toUserId),
        dmPrefs.revealOnMessage(toUserId, fromUserId),
      ]);
      const { sendDmMessagePush } = require("../webPush");
      if (recipientActivePeer !== fromUserId && !(await dmPrefs.isMuted(toUserId, fromUserId))) {
        void sendDmMessagePush([toUserId], {
          title: sender.username || "New message",
          body: trimmed.slice(0, 140),
          from: sender.username,
          fromId: fromUserId,
          deepLink: `/?dm=${encodeURIComponent(fromUserId)}`,
        });
      }
    } catch (pushErr) {
      logInternal("agent-dm-push", pushErr);
    }
  }

  return {
    ok: true,
    summary: `Message sent to ${target.display_name || target.username}.`,
    messageId: row.id,
    to: { id: target.id, username: target.username, display_name: target.display_name || null },
  };
}

async function sendGroupMessage(fromUserId, { groupId, text }, { io } = {}) {
  const polished = polishOutboundText(text);
  if (polished.error) return fail(polished.error);
  const trimmed = polished.text;
  if (isBanned(fromUserId)) return fail("You are banned.", 403);
  const timeout = getActiveTimeout(fromUserId);
  if (timeout) return fail(timeout.message || "You are timed out and cannot send messages.", 403);

  const { data: member } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", fromUserId)
    .maybeSingle();
  if (!member) return fail("You are not a member of this group.", 403);

  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return fail("Group not found.", 404);

  const { data: message, error } = await supabase
    .from("group_messages")
    .insert({
      group_id: groupId,
      sender_id: fromUserId,
      content: trimmed,
    })
    .select("*, sender:sender_id (id, username, avatar_url)")
    .single();
  if (error || !message) {
    logInternal("agent-group-insert", error);
    return fail("Failed to send group message.", 500);
  }

  await ensureCosmeticsCached([fromUserId]).catch(() => {});
  const pub = getCachedPublicUser(fromUserId);
  if (pub) {
    message.sender = { ...(message.sender || {}), ...pub, id: fromUserId };
    message.from = message.sender;
  }
  if (io) {
    io.to(`group:${groupId}`).emit("group:message", { groupId, message });
  }
  return {
    ok: true,
    summary: `Message sent in ${group.name || "group"}.`,
    messageId: message.id,
  };
}

async function sendChannelMessage(fromUserId, { channelId, serverId, text }, { io } = {}) {
  const polished = polishOutboundText(text);
  if (polished.error) return fail(polished.error);
  const trimmed = polished.text;
  if (isBanned(fromUserId)) return fail("You are banned.", 403);
  const timeout = getActiveTimeout(fromUserId);
  if (timeout) return fail(timeout.message || "You are timed out and cannot send messages.", 403);

  const { data: channel, error: cErr } = await supabase
    .from("server_channels")
    .select("id, server_id, type, name, slowmode_seconds")
    .eq("id", channelId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!channel) return fail("Channel not found.", 404);
  if (channel.type !== "text" && channel.type !== "announcement") {
    return fail("Only text channels support chat messages.");
  }
  if (serverId && serverId !== channel.server_id) {
    return fail("Channel does not belong to that server.");
  }

  const resolved = await resolveChannelPermissions(supabase, channel.server_id, fromUserId, channelId);
  if (!resolved.isMember) return fail("You are not a member of this server.", 403);
  if (!hasPermission(resolved.bits, Permissions.SEND_MESSAGES) || !hasPermission(resolved.bits, Permissions.VIEW_CHANNEL)) {
    return fail("You don't have permission to send messages in this channel.", 403);
  }
  if (await needsRulesAcceptance(supabase, channel.server_id, fromUserId, { isOwner: resolved.isOwner })) {
    return fail("You must accept the server rules before sending messages.", 403);
  }

  const { data: membership } = await supabase
    .from("server_members")
    .select("timeout_until, timeout_reason")
    .eq("server_id", channel.server_id)
    .eq("user_id", fromUserId)
    .maybeSingle();
  if (membership?.timeout_until) {
    const until = new Date(membership.timeout_until);
    if (Number.isFinite(until.getTime()) && until > new Date()) {
      return fail(`You are timed out until ${until.toISOString()}.`, 403);
    }
  }

  if (/https?:\/\//i.test(trimmed) && !hasPermission(resolved.bits, Permissions.EMBED_LINKS)) {
    return fail("You don't have permission to embed links in this channel.", 403);
  }
  if (/(^|\s)@(everyone|here)\b/i.test(trimmed) && !hasPermission(resolved.bits, Permissions.MENTION_EVERYONE)) {
    return fail("You cannot mention @everyone here.", 403);
  }

  const { data: row, error } = await supabase
    .from("server_messages")
    .insert({
      server_id: channel.server_id,
      channel_id: channelId,
      sender_id: fromUserId,
      content: trimmed,
    })
    .select("id, created_at")
    .single();
  if (error || !row) {
    logInternal("agent-channel-insert", error);
    return fail("Failed to send channel message.", 500);
  }

  if (shouldCreditMessage(fromUserId, trimmed)) {
    descoin
      .creditCapped(fromUserId, 1, "message_activity", {
        context: "server_channel",
        serverId: channel.server_id,
        channelId,
        source: "dimaai_agent",
      })
      .catch((err) => logInternal("agent-descoin", err));
  }

  await ensureCosmeticsCached([fromUserId]).catch(() => {});
  const message = {
    id: row.id,
    server_id: channel.server_id,
    channel_id: channelId,
    sender_id: fromUserId,
    content: trimmed,
    created_at: toUtcIso(row.created_at) || row.created_at,
    sender: senderPayload(fromUserId),
  };
  if (io) {
    const payload = { serverId: channel.server_id, channelId, message };
    io.to(`server-channel:${channelId}`).emit("server:channel:message", payload);
  }
  return {
    ok: true,
    summary: `Message sent in #${channel.name}.`,
    messageId: row.id,
  };
}

async function sendFriendRequest(fromUserId, { username, userId }, { io } = {}) {
  if (isBanned(fromUserId)) return fail("You are banned.", 403);
  const target = await findUser({ userId, username });
  if (!target) return fail("User not found.", 404);
  if (target.id === fromUserId) return fail("Cannot add yourself as a friend.");
  if (await isBlockedEitherWay(fromUserId, target.id)) {
    return fail("You can't send a request to this user.", 403);
  }
  const existing = await friendshipRow(fromUserId, target.id);
  if (existing.some((r) => r.status === "accepted")) return fail("Already friends.");
  if (existing.some((r) => r.status === "pending")) return fail("Friend request already pending.");
  if (existing.length) {
    await supabase
      .from("friendships")
      .delete()
      .or(`and(user_id.eq.${fromUserId},friend_id.eq.${target.id}),and(user_id.eq.${target.id},friend_id.eq.${fromUserId})`);
  }
  const { error } = await supabase.from("friendships").insert({
    user_id: fromUserId,
    friend_id: target.id,
    status: "pending",
  });
  if (error) {
    logInternal("agent-friend-request", error);
    return fail("Failed to send friend request.", 500);
  }
  const me = await loadUser(fromUserId);
  const senderUsername = me?.username || usernameById.get(fromUserId) || "Unknown";
  ensurePending(target.id).set(fromUserId, { id: fromUserId, username: senderUsername });
  usernameById.set(fromUserId, senderUsername);
  if (io) {
    emitToUser(io, target.id, "friend:request:incoming", {
      from: { id: fromUserId, username: senderUsername },
    });
  }
  return {
    ok: true,
    summary: `Friend request sent to ${target.username}.`,
    to: { id: target.id, username: target.username },
  };
}

async function acceptFriendRequest(userId, { fromUserId }, { io } = {}) {
  if (!fromUserId) return fail("fromUserId is required.");
  const { data: existing, error: checkError } = await supabase
    .from("friendships")
    .select("id")
    .eq("user_id", fromUserId)
    .eq("friend_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (checkError) return fail("Database error checking request.", 500);
  if (!existing) return fail("Friend request not found or already processed.", 404);

  const { error: updateError } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", existing.id);
  if (updateError) return fail("Failed to accept friend request.", 500);

  if (!friends.has(userId)) friends.set(userId, new Set());
  if (!friends.has(fromUserId)) friends.set(fromUserId, new Set());
  friends.get(userId).add(fromUserId);
  friends.get(fromUserId).add(userId);
  pendingRequests.get(userId)?.delete(fromUserId);

  if (io) {
    io.to(`user:${userId}`).emit("friend:accepted", { by: { id: fromUserId } });
    io.to(`user:${fromUserId}`).emit("friend:accepted", { by: { id: userId } });
  }
  const other = await loadUser(fromUserId);
  return {
    ok: true,
    summary: `You are now friends with ${other?.username || "that user"}.`,
  };
}

async function declineFriendRequest(userId, { fromUserId }, { io } = {}) {
  if (!fromUserId) return fail("fromUserId is required.");
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_id", fromUserId)
    .eq("friend_id", userId)
    .eq("status", "pending");
  if (error) return fail("Failed to decline friend request.", 500);
  pendingRequests.get(userId)?.delete(fromUserId);
  if (io) {
    emitToUser(io, fromUserId, "friend:declined", { by: { id: userId } });
  }
  return { ok: true, summary: "Friend request declined." };
}

async function updatePresence(userId, { status }, { io } = {}) {
  const allowed = ["online", "idle", "dnd", "invisible"];
  const s = allowed.includes(String(status || "").toLowerCase()) ? String(status).toLowerCase() : null;
  if (!s) return fail("Status must be online, idle, dnd, or invisible.");
  const p = presence.get(userId);
  if (p) {
    p.status = s;
    presence.set(userId, p);
  }
  await savePresenceStatus(userId, s);
  if (io) emitToUser(io, userId, "status:current", { status: s });
  return { ok: true, summary: `Status set to ${s}.`, status: s };
}

async function updateCustomStatus(userId, { text }, { io } = {}) {
  const next = String(text || "").trim().slice(0, 128);
  const { data, error } = await supabase
    .from("users")
    .update({ custom_status: next || null, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();
  if (error) {
    logInternal("agent-custom-status", error);
    return fail("Failed to update custom status.", 500);
  }
  cacheUserProfile(data);
  if (io) await broadcastUserProfileUpdate(io, userId);
  return {
    ok: true,
    summary: next ? `Custom status set to “${next}”.` : "Custom status cleared.",
    customStatus: next || null,
  };
}

async function executePending(row, { io } = {}) {
  const type = row?.type;
  const payload = row?.payload || {};
  const userId = row.userId;
  if (type === "dm") return sendDirectMessage(userId, payload, { io });
  if (type === "group") return sendGroupMessage(userId, payload, { io });
  if (type === "channel") return sendChannelMessage(userId, payload, { io });
  if (type === "friend_request") return sendFriendRequest(userId, payload, { io });
  if (type === "friend_accept") return acceptFriendRequest(userId, payload, { io });
  if (type === "friend_decline") return declineFriendRequest(userId, payload, { io });
  if (type === "presence_status") return updatePresence(userId, payload, { io });
  if (type === "custom_status") return updateCustomStatus(userId, payload, { io });
  return fail("Unknown action type.");
}

module.exports = {
  findUser,
  knownPeople,
  searchPeople,
  resolveRecipient,
  friendshipRow,
  sendDirectMessage,
  sendGroupMessage,
  sendChannelMessage,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  updatePresence,
  updateCustomStatus,
  executePending,
};
