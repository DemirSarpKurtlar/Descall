"use strict";

/**
 * Force-leave socket rooms when VIEW_CHANNEL is lost so hidden channels
 * stop receiving live messages immediately (client refetch is not enough).
 */

const supabase = require("../db/supabase");
const {
  Permissions,
  hasPermission,
  resolveChannelPermissions,
} = require("./serverPermissions");

function emitServerChannelsResync(io, serverId, extra = {}) {
  if (!io || !serverId) return;
  try {
    io.to(`server:${serverId}`).emit("server:channels:resync", { serverId, ...extra });
  } catch (err) {
    console.warn("[SERVERS] channels resync emit failed:", err?.message || err);
  }
}

async function evictUnauthorizedChannelSockets(io, serverId) {
  if (!io || !serverId) return { kicked: 0 };
  const { data: channels, error } = await supabase
    .from("server_channels")
    .select("id, type")
    .eq("server_id", serverId);
  if (error) throw error;

  let kicked = 0;
  for (const channel of channels || []) {
    const type = String(channel.type || "").toLowerCase();
    const prefixes = [];
    if (type === "text" || type === "announcement") prefixes.push("server-channel:");
    if (type === "voice" || type === "stage") prefixes.push("server-voice:");
    if (!prefixes.length) continue;

    for (const prefix of prefixes) {
      const room = `${prefix}${channel.id}`;
      let sockets = [];
      try {
        sockets = await io.in(room).fetchSockets();
      } catch {
        continue;
      }
      for (const socket of sockets) {
        const userId = socket.user?.id;
        if (!userId) continue;
        let resolved;
        try {
          resolved = await resolveChannelPermissions(supabase, serverId, userId, channel.id);
        } catch {
          socket.leave(room);
          kicked += 1;
          continue;
        }
        if (!resolved.isMember || !hasPermission(resolved.bits, Permissions.VIEW_CHANNEL)) {
          socket.leave(room);
          kicked += 1;
          try {
            socket.emit("server:channel:hidden", { serverId, channelId: channel.id });
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  return { kicked };
}

async function notifyServerAccessChanged(io, serverId, extra = {}) {
  emitServerChannelsResync(io, serverId, extra);
  try {
    await evictUnauthorizedChannelSockets(io, serverId);
  } catch (err) {
    console.warn("[SERVERS] access eviction failed:", err?.message || err);
  }
}

module.exports = {
  emitServerChannelsResync,
  evictUnauthorizedChannelSockets,
  notifyServerAccessChanged,
};
