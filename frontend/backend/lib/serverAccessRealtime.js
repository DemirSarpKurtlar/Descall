"use strict";

/**
 * Force-leave socket rooms when VIEW_CHANNEL is lost so hidden channels
 * stop receiving live messages immediately (client refetch is not enough).
 *
 * 2026-11-15 (server audit R3 / R5 / SC-2):
 *  - permissions are resolved once per channel for every socket in its room
 *    (resolveChannelPermissionsBulk, 5 queries) instead of ~8 queries per socket;
 *  - runs for one server are coalesced: while one runs, further calls collapse into a
 *    single trailing run, so a burst of role edits costs at most two passes;
 *  - voice seats are re-checked through the voice contract (recheckVoiceAccess): a
 *    member who lost VIEW / CONNECT on a voice channel is removed from the call and
 *    from LiveKit, not only from the socket room.
 */

const supabase = require("../db/supabase");
const {
  Permissions,
  hasPermission,
  resolveChannelPermissionsBulk,
} = require("./serverPermissions");

// Process-wide counter bumped on every access change (kick / ban / leave / role /
// overwrite). Socket joins compare it before and after their permission check and
// re-check when it moved, so a join that straddles an eviction cannot keep the room
// (server audit CA-1; used by socket/serverChannelHandlers.js and lib/serverRooms.js).
let accessEpoch = 0;
function getServerAccessEpoch() {
  return accessEpoch;
}
function bumpServerAccessEpoch() {
  accessEpoch += 1;
  return accessEpoch;
}

function emitServerChannelsResync(io, serverId, extra = {}) {
  if (!io || !serverId) return;
  try {
    // Only serverId goes to the whole server room. The changed channel id used to be
    // included and leaked hidden channel ids to every member (O2, 2026-10-18); clients
    // refetch their own visible list from serverId alone.
    void extra;
    io.to(`server:${serverId}`).emit("server:channels:resync", { serverId });
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
      if (!sockets.length) continue;
      const userIds = [...new Set(sockets.map((s) => s.user?.id).filter(Boolean).map(String))];
      // Who is still a member: bits for non-members would be computed as members'.
      let memberSet = new Set();
      let bits = new Map();
      try {
        const { data: memberRows, error: mErr } = await supabase
          .from("server_members")
          .select("user_id")
          .eq("server_id", serverId)
          .in("user_id", userIds);
        if (mErr) throw mErr;
        const { data: server } = await supabase.from("servers").select("owner_id").eq("id", serverId).maybeSingle();
        memberSet = new Set((memberRows || []).map((r) => String(r.user_id)));
        if (server?.owner_id) memberSet.add(String(server.owner_id));
        bits = await resolveChannelPermissionsBulk(supabase, serverId, channel.id, [...memberSet].filter((u) => userIds.includes(u)));
      } catch {
        // Could not decide: fail closed for this room.
        memberSet = new Set();
        bits = new Map();
      }
      for (const socket of sockets) {
        const userId = socket.user?.id;
        if (!userId) continue;
        const b = bits.get(String(userId));
        if (memberSet.has(String(userId)) && b != null && hasPermission(b, Permissions.VIEW_CHANNEL)) continue;
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
  return { kicked };
}

const running = new Map(); // serverId -> { pending: boolean, promise }

async function runAccessPass(io, serverId) {
  try {
    await evictUnauthorizedChannelSockets(io, serverId);
  } catch (err) {
    console.warn("[SERVERS] access eviction failed:", err?.message || err);
  }
  // Voice seats and LiveKit (voice contract, owned by the voice code).
  try {
    await require("./serverMemberState").callVoice("recheckVoiceAccess", io, { serverId });
  } catch (err) {
    console.warn("[SERVERS] voice access recheck failed:", err?.message || err);
  }
}

async function notifyServerAccessChanged(io, serverId, extra = {}) {
  bumpServerAccessEpoch();
  try {
    require("./channelViewers").clearChannelViewCache(serverId);
  } catch {
    /* ignore */
  }
  emitServerChannelsResync(io, serverId, extra);
  const key = String(serverId || "");
  if (!key) return;
  const current = running.get(key);
  if (current) {
    current.pending = true;
    return current.promise;
  }
  const state = { pending: false, promise: null };
  running.set(key, state);
  state.promise = (async () => {
    try {
      do {
        state.pending = false;
        await runAccessPass(io, serverId);
      } while (state.pending);
    } finally {
      running.delete(key);
    }
  })();
  return state.promise;
}

module.exports = {
  getServerAccessEpoch,
  bumpServerAccessEpoch,
  emitServerChannelsResync,
  evictUnauthorizedChannelSockets,
  notifyServerAccessChanged,
};
