"use strict";

const supabase = require("../db/supabase");

const APP_BOT = {
  id: "descall-apps",
  username: "Descall Apps",
  displayName: "Descall Apps",
  display_name: "Descall Apps",
  avatar_url: "/brand/descall-logo.png",
  avatarUrl: "/brand/descall-logo.png",
  isBot: true,
};

const TEMP_MEMBER_GRACE_MS = 60_000;
const pendingTempRemovals = new Map();

/**
 * Socket-only welcome message from Descall Apps (not persisted — sender is app bot).
 */
async function postWelcomeMessage(io, server, userId) {
  // No welcome channel: the system messages channel takes join messages (SC-10: the
  // system channel setting was stored but never used).
  const channelId =
    server?.welcome_channel_id || server?.welcomeChannelId || server?.system_channel_id || server?.systemChannelId;
  if (!channelId || !io || !server?.id) return;

  const { data: user, error } = await supabase
    .from("users")
    .select("username, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[ServerJoin] welcome user lookup failed:", error.message);
  }

  const label = user?.display_name || user?.username || "there";
  void label;
  const content = `Welcome <@${userId}> to **${server.name}**!`;
  const now = new Date().toISOString();
  const message = {
    id: `welcome-${Date.now()}-${userId}`,
    server_id: server.id,
    channel_id: channelId,
    sender_id: APP_BOT.id,
    sender: { ...APP_BOT },
    content,
    text: content,
    type: "system",
    isBot: true,
    isAppMessage: true,
    created_at: now,
    timestamp: now,
  };

  const payload = { serverId: server.id, channelId, message };
  io.to(`server-channel:${channelId}`).emit("server:channel:message", payload);
  // Members who can see the welcome channel but are not in its room yet (a hidden
  // welcome channel used to reach the whole server room, server audit CA-5 / SK-12).
  void require("./channelViewers").emitToChannelViewers(io, server.id, channelId, "server:channel:message", payload);
}

function userHasLiveSockets(io, userId) {
  const room = io.sockets?.adapter?.rooms?.get(`user:${userId}`);
  return Boolean(room && room.size > 0);
}

function userIsInServerVoice(userId) {
  try {
    const { findUserVoiceChannel } = require("../socket/serverVoiceHandlers");
    return Boolean(findUserVoiceChannel(userId));
  } catch {
    return false;
  }
}

async function removeTemporaryMembership(userId, serverId) {
  // Never the owner (a temporary member could be made owner before 2026-11-15, IM-3).
  const { data: server } = await supabase.from("servers").select("owner_id").eq("id", serverId).maybeSingle();
  if (server && String(server.owner_id).toLowerCase() === String(userId).toLowerCase()) {
    await supabase.from("server_members").update({ temporary: false }).eq("server_id", serverId).eq("user_id", userId);
    return false;
  }
  const { data: removed, error } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .eq("temporary", true)
    .select("user_id");
  if (error) {
    console.warn("[ServerJoin] temp member removal failed:", error.message);
    return false;
  }
  if (!removed || (Array.isArray(removed) && !removed.length)) return false;
  // Role rows and member channel rules go with the membership; they came back on a
  // rejoin before (IM-8 / DF-1 / DF-2).
  const state = require("./serverMemberState");
  await state.purgeMemberState(serverId, userId);
  const { error: auditErr } = await supabase.from("server_audit_logs").insert({
    server_id: serverId,
    actor_id: null,
    action: "MEMBER_TEMPORARY_EXPIRED",
    target_type: "member",
    target_id: String(userId),
  });
  if (auditErr) console.warn("[ServerJoin] temp expiry audit failed:", auditErr.message);
  return true;
}

/** Expired temporary memberships of one user (no live socket, not in voice). */
async function expireTemporaryMemberships(io, userId) {
  const { data: rows, error } = await supabase
    .from("server_members")
    .select("server_id")
    .eq("user_id", userId)
    .eq("temporary", true);
  if (error) {
    console.warn("[ServerJoin] temp member scan failed:", error.message);
    return 0;
  }
  let n = 0;
  for (const row of rows || []) {
    if (userHasLiveSockets(io, userId) || userIsInServerVoice(userId)) break;
    const removed = await removeTemporaryMembership(userId, row.server_id);
    if (removed) {
      n += 1;
      io?.to?.(`server:${row.server_id}`).emit("server:member:left", {
        serverId: row.server_id,
        userId,
        reason: "temporary_expired",
      });
      // The app listens to server:member:removed: member counts and lists update, and the
      // user's other devices drop the server ("leave" shows no kick toast).
      const removedPayload = { serverId: row.server_id, userId, action: "leave" };
      io?.to?.(`server:${row.server_id}`).emit("server:member:removed", removedPayload);
      io?.to?.(`user:${userId}`).emit("server:member:removed", removedPayload);
      try {
        await require("./serverRooms").dropUserFromServer(io, row.server_id, userId, "temporary_expired");
      } catch {
        /* ignore */
      }
    }
  }
  return n;
}

/**
 * The disconnect timer is in memory: a restart lost it, and a member who joined over
 * REST and never opened a socket was never removed (IM-8). This sweep runs at start and
 * every few minutes and expires temporary memberships of users with no live socket.
 */
let sweepTimer = null;
async function sweepTemporaryMembers(io) {
  const seen = new Set();
  for (let from = 0; from < 20000; from += 1000) {
    const { data: rows, error } = await supabase
      .from("server_members")
      .select("user_id, joined_at")
      .eq("temporary", true)
      .order("user_id", { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.warn("[ServerJoin] temp sweep failed:", error.message);
      return;
    }
    for (const r of rows || []) {
      const key = String(r.user_id);
      if (seen.has(key)) continue;
      seen.add(key);
      // Fresh joins get the normal grace period first.
      if (r.joined_at && Date.now() - new Date(r.joined_at).getTime() < TEMP_MEMBER_GRACE_MS) continue;
      if (userHasLiveSockets(io, r.user_id) || userIsInServerVoice(r.user_id)) continue;
      if (pendingTempRemovals.has(key)) continue;
      await expireTemporaryMemberships(io, r.user_id);
    }
    if (!rows || rows.length < 1000) break;
  }
}

function startTemporaryMemberSweeper(io, { intervalMs = 5 * 60 * 1000 } = {}) {
  if (sweepTimer || !io) return;
  const run = () => sweepTemporaryMembers(io).catch((err) => console.warn("[ServerJoin] temp sweep error:", err?.message || err));
  setTimeout(run, 30_000).unref?.();
  sweepTimer = setInterval(run, intervalMs);
  sweepTimer.unref?.();
}

/**
 * After full socket disconnect, drop temporary memberships once offline 60s.
 */
function scheduleTemporaryMemberCleanup(io, userId) {
  if (!io || !userId) return;
  const key = String(userId);
  const prev = pendingTempRemovals.get(key);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(async () => {
    pendingTempRemovals.delete(key);
    if (userHasLiveSockets(io, userId) || userIsInServerVoice(userId)) return;
    await expireTemporaryMemberships(io, userId);
  }, TEMP_MEMBER_GRACE_MS);

  pendingTempRemovals.set(key, timer);
}

module.exports = {
  postWelcomeMessage,
  scheduleTemporaryMemberCleanup,
  sweepTemporaryMembers,
  startTemporaryMemberSweeper,
  removeTemporaryMembership,
  TEMP_MEMBER_GRACE_MS,
};
