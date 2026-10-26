"use strict";

/**
 * Tells a holder that a special badge arrived or was taken back. Rows stay "unnotified"
 * until a live socket got the event, so someone who was offline sees it on the next connect
 * (same deferred pattern as shop gifts).
 */

const specialBadges = require("./specialBadges");

function isOnline(io, userId) {
  return Boolean(io?.sockets?.adapter?.rooms?.get(`user:${userId}`)?.size);
}

/** `target` is an io (checks the room first) or a single socket (already connected). */
async function deliverPending(target, userId, { socket = null } = {}) {
  if (!userId) return 0;
  if (!socket && !isOnline(target, userId)) return 0;
  const { granted, revoked } = await specialBadges.pendingFor(userId);
  if (!granted.length && !revoked.length) return 0;
  const emit = (event, payload) => (socket ? socket.emit(event, payload) : target.to(`user:${userId}`).emit(event, payload));
  for (const g of granted) emit("special-badge:granted", { id: g.id, serial: g.serial, via: g.via, from: g.from || null });
  for (const r of revoked) emit("special-badge:revoked", { id: r.id, serial: r.serial, reason: r.reason || null });
  await specialBadges.markNotified(userId, [...granted, ...revoked].map((row) => row.rowId));
  return granted.length + revoked.length;
}

async function broadcastProfile(io, userId) {
  if (!io) return;
  try {
    const { broadcastUserProfileUpdate } = require("./userProfile");
    await broadcastUserProfileUpdate(io, userId);
  } catch (err) {
    console.warn("[special-badges] profile broadcast failed:", err?.message || err);
  }
}

module.exports = { deliverPending, broadcastProfile, isOnline };
