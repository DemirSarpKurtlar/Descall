"use strict";

/**
 * Socket room cleanup scoped to ONE server (audit 2026-10-19 #4): kick/ban used to
 * drop the user from every `server-channel:*` room and every server voice call, i.e.
 * also in servers they are still a member of.
 */
const supabase = require("../db/supabase");

async function serverRoomNames(serverId) {
  const { data: chans, error } = await supabase.from("server_channels").select("id").eq("server_id", serverId);
  if (error) throw error;
  const rooms = [`server:${serverId}`];
  for (const c of chans || []) rooms.push(`server-channel:${c.id}`, `server-voice:${c.id}`);
  return { rooms, channelIds: (chans || []).map((c) => c.id) };
}

/** userId given: that user's sockets leave this server's rooms. Otherwise everyone does. */
async function evictFromServerRooms(io, serverId, { userId = null, rooms = null } = {}) {
  if (!io || !serverId) return;
  const names = rooms || (await serverRoomNames(serverId)).rooms;
  if (userId != null) {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const sock of sockets || []) for (const r of names) sock.leave(r);
    return;
  }
  for (const r of names) {
    try {
      io.in(r).socketsLeave(r);
    } catch {
      /* adapter without socketsLeave */
    }
  }
}

/** Remove a user from this server's rooms and voice calls (kick / ban / leave). */
function dropUserFromServer(io, serverId, userId, reason) {
  if (!io || !serverId || userId == null) return Promise.resolve();
  return (async () => {
    try {
      await evictFromServerRooms(io, serverId, { userId });
    } catch (err) {
      console.warn("[serverRooms] leave rooms failed:", err?.message || err);
    }
    try {
      const { removeUserFromServerVoice } = require("../socket/serverVoiceHandlers");
      removeUserFromServerVoice(io, serverId, userId, reason || null);
    } catch (err) {
      console.warn("[serverRooms] voice cleanup failed:", err?.message || err);
    }
  })();
}

module.exports = { serverRoomNames, evictFromServerRooms, dropUserFromServer };
