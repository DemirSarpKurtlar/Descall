"use strict";

/**
 * Shared DM history helpers used by both Socket.IO (`dm:history` / `dm:fetch`)
 * and REST (`GET /api/dm/:peerId/messages`, `GET /api/dm/previews`).
 */

const supabase = require("../db/supabase");
const {
  cacheUserProfile,
  getCachedPublicUser,
  ensureCosmeticsCached,
  pickChatCosmetics,
} = require("./userProfile");
const {
  friends,
  usernameById,
  dmHistory,
  MAX_DM_PER_CONV,
} = require("../runtime/sharedState");
const { toUtcIso } = require("./datetime");

const DM_MESSAGE_COLUMNS =
  "id, from_user_id, to_user_id, content, media_url, media_type, mime_type, file_size, original_name, duration, reply_to, delivered_at, read_at, edited_at, edit_history, pinned_at, pinned_by, created_at";

function convKey(a, b) {
  return [a, b].sort().join("::");
}

/** Last-message preview text for DM list rows. */
function formatDmPreview(msg) {
  if (!msg) return null;
  const raw = String(msg.text || "").trim();
  if (raw && !raw.startsWith("__voice__:")) return raw;
  if (msg.mediaType === "image") return "📷 Photo";
  if (msg.mediaType === "voice" || msg.mediaType === "audio" || raw.startsWith("__voice__:")) {
    return "🎤 Voice message";
  }
  if (msg.mediaUrl) return "📎 Attachment";
  return null;
}

function getLastDmMessage(myId, peerId) {
  const arr = dmHistory.get(convKey(myId, peerId));
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[arr.length - 1];
}

function cacheDmMessages(key, messages) {
  const cached = dmHistory.get(key) || [];
  const byId = new Map(cached.map((message) => [message.id, message]));
  for (const message of messages) byId.set(message.id, message);
  const merged = Array.from(byId.values())
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-MAX_DM_PER_CONV);
  dmHistory.set(key, merged);
  return merged;
}

function messageSender(userId, fallbackUsername, fallbackAvatar) {
  const cached = getCachedPublicUser(userId);
  if (cached) {
    const isAdmin = Boolean(cached.is_admin || cached.isAdmin) || cached.username === "admin";
    return {
      id: userId,
      username: cached.username,
      displayName: cached.displayName || null,
      display_name: cached.displayName || null,
      avatarUrl: cached.avatarUrl,
      avatar_url: cached.avatarUrl,
      avatarVersion: cached.avatarVersion,
      updated_at: cached.updated_at,
      is_admin: isAdmin,
      isAdmin,
      ...pickChatCosmetics(cached),
    };
  }
  const isAdmin = fallbackUsername === "admin";
  return {
    id: userId,
    username: fallbackUsername,
    displayName: null,
    display_name: null,
    avatarUrl: fallbackAvatar || null,
    avatar_url: fallbackAvatar || null,
    is_admin: isAdmin,
    isAdmin,
  };
}

function mapDmRow(row, usersById) {
  const profile = usersById.get(row.from_user_id);
  if (profile) cacheUserProfile(profile);
  return {
    id: row.id,
    from: messageSender(row.from_user_id, profile?.username || usernameById.get(row.from_user_id)),
    to: { id: row.to_user_id },
    text: row.content || "",
    mediaUrl: row.media_url || null,
    mediaType: row.media_type || null,
    mimeType: row.mime_type || null,
    size: row.file_size ?? null,
    originalName: row.original_name || null,
    duration: row.duration ?? null,
    replyTo: row.reply_to || null,
    timestamp: toUtcIso(row.created_at) || row.created_at,
    deliveredAt: toUtcIso(row.delivered_at) || row.delivered_at || null,
    readAt: toUtcIso(row.read_at) || row.read_at || null,
    editedAt: row.edited_at || null,
    editHistory: row.edit_history || [],
    pinnedAt: row.pinned_at || null,
    pinnedBy: row.pinned_by || null,
  };
}

async function loadDmMessages(myId, peerId, { before, limit = 100 } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 100);
  let query = supabase
    .from("dm_messages")
    .select(DM_MESSAGE_COLUMNS)
    .or(`and(from_user_id.eq.${myId},to_user_id.eq.${peerId}),and(from_user_id.eq.${peerId},to_user_id.eq.${myId})`)
    .order("created_at", { ascending: false })
    .limit(pageSize + 1);
  if (before) query = query.lt("created_at", before);

  const { data: rows, error } = await query;
  if (error) throw error;

  const hasMore = (rows || []).length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : (rows || []);
  const userIds = [...new Set(page.map((row) => row.from_user_id))];
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase
      .from("users")
      .select("id, username, avatar_url, display_name, updated_at, is_admin")
      .in("id", userIds)
    : { data: [], error: null };
  if (profileError) console.warn("[DM] Sender profile lookup failed:", profileError.message);

  const usersById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  for (const profile of usersById.values()) cacheUserProfile(profile);
  // Attach equipped cosmetics so chat avatars/name effects/bubbles match profiles
  await ensureCosmeticsCached([...userIds, myId, peerId]);
  const messages = page.reverse().map((row) => mapDmRow(row, usersById));
  cacheDmMessages(convKey(myId, peerId), messages);
  return { messages, hasMore };
}

async function listAcceptedFriendIds(userId) {
  const cached = friends.get(userId);
  if (cached) return [...cached];
  try {
    const { data: rows, error } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq("status", "accepted");
    if (error) {
      console.error("[DM] listAcceptedFriendIds failed:", error.message);
      return [];
    }
    const ids = [];
    for (const row of rows || []) {
      const otherId = row.user_id === userId ? row.friend_id : row.user_id;
      if (otherId && otherId !== userId) ids.push(otherId);
    }
    friends.set(userId, new Set(ids));
    return ids;
  } catch (err) {
    console.error("[DM] listAcceptedFriendIds failed:", err?.message || err);
    return [];
  }
}

async function isAcceptedFriend(userId, otherUserId) {
  if (typeof userId !== "string" || typeof otherUserId !== "string") return false;
  if (!userId || !otherUserId || userId === otherUserId) return false;
  const cached = friends.get(userId);
  // A socket can receive dm:history before its asynchronous boot-time friend
  // load completes. Hydrate from the durable source instead of treating the
  // temporary cache miss as a denial.
  if (cached) return cached.has(otherUserId);
  try {
    const { data, error } = await supabase
      .from("friendships")
      .select("user_id")
      .or(
        `and(user_id.eq.${userId},friend_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},friend_id.eq.${userId})`,
      )
      .eq("status", "accepted")
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[DM] isAcceptedFriend query failed:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error("[DM] isAcceptedFriend failed:", err?.message || err);
    return false;
  }
}

async function lookupLastDmRow(userId, peerId) {
  const { data, error } = await supabase
    .from("dm_messages")
    .select("content, media_url, media_type, created_at")
    .or(
      `and(from_user_id.eq.${userId},to_user_id.eq.${peerId}),and(from_user_id.eq.${peerId},to_user_id.eq.${userId})`,
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function applyPreviewRow(dmPreviewsByPeer, dmLastActivityByPeer, peerId, row) {
  if (!row || !peerId) return;
  const preview = formatDmPreview({
    text: row.content || row.text,
    mediaUrl: row.media_url || row.mediaUrl,
    mediaType: row.media_type || row.mediaType,
  });
  if (preview) dmPreviewsByPeer[peerId] = preview;
  const ts = row.created_at || row.timestamp || null;
  if (ts) dmLastActivityByPeer[peerId] = ts;
}

/**
 * Build preview + activity maps for every DM thread involving this user.
 * The in-memory history is only a cache, so cold/restarted servers must use
 * persisted messages rather than rendering every thread as empty.
 */
async function buildDmPreviewMaps(userId) {
  const dmPreviewsByPeer = {};
  const dmLastActivityByPeer = {};
  const missingPeerIds = [];
  const friendIds = await listAcceptedFriendIds(userId);

  for (const [key, arr] of dmHistory) {
    const parts = String(key).split("::");
    if (parts.length !== 2 || !parts.includes(userId)) continue;
    const peerId = parts[0] === userId ? parts[1] : parts[0];
    if (!Array.isArray(arr) || arr.length === 0) {
      missingPeerIds.push(peerId);
      continue;
    }
    const last = arr[arr.length - 1];
    const preview = formatDmPreview(last);
    if (preview) dmPreviewsByPeer[peerId] = preview;
    const ts = last?.timestamp || last?.created_at || null;
    if (ts) dmLastActivityByPeer[peerId] = ts;
  }

  // A process restart leaves dmHistory empty, so make every accepted friend a
  // candidate for a persisted preview, not only conversations touched in this
  // process. This keeps the sidebar and its ordering durable.
  for (const peerId of friendIds) {
    if (!dmLastActivityByPeer[peerId] && !missingPeerIds.includes(peerId)) {
      missingPeerIds.push(peerId);
    }
  }

  if (missingPeerIds.length === 0) {
    return { dmPreviewsByPeer, dmLastActivityByPeer };
  }

  const remaining = new Set(missingPeerIds);
  try {
    const { data: rows, error } = await supabase
      .from("dm_messages")
      .select("from_user_id, to_user_id, content, media_url, media_type, created_at")
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(Math.max(500, missingPeerIds.length * 3));
    if (error) throw error;
    for (const row of rows || []) {
      const peerId = row.from_user_id === userId ? row.to_user_id : row.from_user_id;
      if (!remaining.has(peerId)) continue;
      remaining.delete(peerId);
      applyPreviewRow(dmPreviewsByPeer, dmLastActivityByPeer, peerId, row);
      if (remaining.size === 0) break;
    }
  } catch (error) {
    console.warn("[DM] Bulk preview lookup failed:", error?.message || error);
  }

  await Promise.all([...remaining].map(async (peerId) => {
    try {
      const data = await lookupLastDmRow(userId, peerId);
      applyPreviewRow(dmPreviewsByPeer, dmLastActivityByPeer, peerId, data);
    } catch (error) {
      console.warn("[DM] Preview lookup failed:", error?.message || error);
    }
  }));

  return { dmPreviewsByPeer, dmLastActivityByPeer };
}

/** Attach persisted emoji reactions onto an in-memory message list. */
async function attachReactions(messages, conversationType, conversationId) {
  if (!Array.isArray(messages) || messages.length === 0 || !conversationType || !conversationId) {
    return messages || [];
  }
  const ids = messages.map((m) => m?.id).filter(Boolean);
  if (ids.length === 0) return messages;
  try {
    const { data, error } = await supabase
      .from("reactions")
      .select("message_id, emoji, user_id")
      .eq("conversation_type", conversationType)
      .eq("conversation_id", conversationId)
      .in("message_id", ids);
    if (error) {
      console.warn("[reactions] attach failed (run reactionsMigration.sql?):", error.message);
      return messages;
    }
    const byMsg = new Map();
    for (const r of data || []) {
      if (!byMsg.has(r.message_id)) byMsg.set(r.message_id, []);
      byMsg.get(r.message_id).push({
        emoji: r.emoji,
        userId: r.user_id,
        messageId: r.message_id,
      });
    }
    return messages.map((m) => ({
      ...m,
      reactions: byMsg.get(m.id) || m.reactions || [],
    }));
  } catch (err) {
    console.warn("[reactions] attach error:", err.message);
    return messages;
  }
}

module.exports = {
  convKey,
  formatDmPreview,
  getLastDmMessage,
  cacheDmMessages,
  messageSender,
  mapDmRow,
  loadDmMessages,
  listAcceptedFriendIds,
  isAcceptedFriend,
  buildDmPreviewMaps,
  attachReactions,
};
