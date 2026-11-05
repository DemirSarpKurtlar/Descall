"use strict";

/**
 * Multi-device message fan-out helpers.
 *
 * Own messages typed on one device (iOS / Electron / web) must appear on the
 * sender's other open sessions. Room broadcasts (`socket.to(group:…)`) already
 * reach other sockets that joined that room; DM send used to echo only to the
 * sending socket, so Electron never saw an iOS-sent DM until a history reload.
 *
 * These helpers target the durable per-user room (`user:${id}`) every socket
 * joins on connect — same approach notifyActions already uses for notification
 * quick-replies.
 */

/**
 * Emit `event`/`payload` to every socket currently in `user:${userId}`.
 * No-op when the room is empty (offline).
 */
function emitToUserRoom(io, userId, event, payload) {
  if (!io || !userId) return;
  const room = `user:${userId}`;
  const roomSet = io.sockets?.adapter?.rooms?.get(room);
  if (roomSet && roomSet.size > 0) {
    io.to(room).emit(event, payload);
    return;
  }
  // Fallback when adapter rooms are unavailable (some test harnesses).
  const sockets = io.sockets?.sockets;
  if (sockets && typeof sockets.values === "function") {
    for (const s of sockets.values()) {
      if (s?.user?.id === userId || s?.data?.userId === userId) s.emit(event, payload);
    }
  }
}

/**
 * Emit to every socket in `user:${userId}` except `exceptSocketId`.
 * Used after a room broadcast + sender `socket.emit(tempId)` so other devices
 * of the same user still receive the message even when they are not (yet) in
 * the group/channel room.
 */
function emitToUserRoomExcept(io, userId, exceptSocketId, event, payload) {
  if (!io || !userId) return;
  const room = `user:${userId}`;
  const roomSet = io.sockets?.adapter?.rooms?.get(room);
  const sockets = io.sockets?.sockets;
  if (roomSet && roomSet.size > 0 && sockets) {
    for (const sid of roomSet) {
      if (exceptSocketId && sid === exceptSocketId) continue;
      const s = typeof sockets.get === "function" ? sockets.get(sid) : null;
      if (s) s.emit(event, payload);
    }
    return;
  }
  // Socket.IO v4 sugar when the adapter supports it.
  try {
    const target = io.to(room);
    if (exceptSocketId && typeof target.except === "function") {
      target.except(exceptSocketId).emit(event, payload);
      return;
    }
    target.emit(event, payload);
  } catch {
    /* best-effort */
  }
}

/**
 * DM path: deliver to the peer and to every device of the sender (incl. the
 * sending socket). Pass `tempId` so the sending client can replace its
 * optimistic row; other devices of the sender ignore an unknown tempId and
 * just append by real id.
 */
function fanoutDmMessage(io, { senderId, peerId, messagePayload, tempId } = {}) {
  if (!io || !senderId || !peerId || !messagePayload) return;
  emitToUserRoom(io, peerId, "dm:message", { ...messagePayload, convWith: senderId });
  emitToUserRoom(io, senderId, "dm:message", {
    ...messagePayload,
    ...(tempId ? { tempId } : {}),
    convWith: peerId,
  });
}

/**
 * After broadcasting a group/channel message to the chat room and echoing the
 * sending socket with tempId, also push to the sender's other devices.
 */
function fanoutOwnMessageToOtherDevices(io, { userId, exceptSocketId, event, payload } = {}) {
  if (!io || !userId || !event || !payload) return;
  emitToUserRoomExcept(io, userId, exceptSocketId, event, payload);
}

module.exports = {
  emitToUserRoom,
  emitToUserRoomExcept,
  fanoutDmMessage,
  fanoutOwnMessageToOtherDevices,
};
