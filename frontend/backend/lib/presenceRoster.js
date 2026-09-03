"use strict";

const VISIBLE_STATUSES = new Set(["online", "idle", "dnd"]);
const CONNECTED_STATUSES = new Set(["online", "idle", "dnd", "invisible"]);

function remainingUserSocketIds(room, currentSocketId) {
  if (!room) return [];
  const ids = typeof room[Symbol.iterator] === "function" ? [...room] : [];
  return ids.filter((sid) => sid && sid !== currentSocketId);
}

function userHasOtherSockets(room, currentSocketId) {
  return remainingUserSocketIds(room, currentSocketId).length > 0;
}

function normalizeStatus(status) {
  const s = String(status || "online").toLowerCase();
  return CONNECTED_STATUSES.has(s) ? s : "online";
}

function isVisibleStatus(status) {
  return VISIBLE_STATUSES.has(normalizeStatus(status));
}

function userRoom(io, userId) {
  if (!io?.sockets?.adapter?.rooms) return null;
  return io.sockets.adapter.rooms.get(`user:${String(userId)}`) || null;
}

function isPresenceSocketLive(io, userId, entry) {
  if (!io) return true;
  const room = userRoom(io, userId);
  if (room && room.size > 0) return true;
  const socketId = entry?.socketId;
  if (socketId && io.sockets?.sockets?.get(socketId)) return true;
  return false;
}

function pruneDeadPresence(presence, io) {
  if (!presence || !io) return 0;
  let removed = 0;
  for (const [id, entry] of [...presence.entries()]) {
    if (isPresenceSocketLive(io, id, entry)) continue;
    presence.delete(id);
    removed += 1;
  }
  return removed;
}

function summarizePresence(presence, { io } = {}) {
  const statusCounts = { online: 0, idle: 0, dnd: 0, invisible: 0 };
  const live = [];
  if (presence) {
    for (const [rawId, entry] of presence.entries()) {
      if (io && !isPresenceSocketLive(io, rawId, entry)) continue;
      const id = String(rawId);
      const status = normalizeStatus(entry?.status);
      statusCounts[status] += 1;
      live.push({
        id,
        username: entry?.username || null,
        avatar_url: entry?.avatar_url || null,
        status,
        socketId: entry?.socketId || null,
      });
    }
  }
  const connectedCount = live.length;
  const visibleCount = statusCounts.online + statusCounts.idle + statusCounts.dnd;
  return {
    onlineUsers: connectedCount,
    connectedCount,
    visibleCount,
    invisibleCount: statusCounts.invisible,
    statusCounts,
    live,
  };
}

function getPresenceEntry(presence, userId) {
  if (!presence || userId == null) return null;
  if (presence.has(userId)) return presence.get(userId);
  const asString = String(userId);
  if (presence.has(asString)) return presence.get(asString);
  return null;
}

module.exports = {
  remainingUserSocketIds,
  userHasOtherSockets,
  normalizeStatus,
  isVisibleStatus,
  isPresenceSocketLive,
  pruneDeadPresence,
  summarizePresence,
  getPresenceEntry,
};
