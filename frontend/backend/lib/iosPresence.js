"use strict";
/**
 * Remembers which users were recently connected from the native iOS app, so the server can refuse
 * voice recordings that include an iOS participant (App Store: no recording of iOS users' calls).
 * In-memory: userId -> last time an iOS socket was seen (connect, disconnect). Kept for 24h.
 */
const KEEP_MS = 24 * 60 * 60 * 1000;
const lastSeen = new Map();
const liveSockets = new Map(); // userId -> count of open iOS sockets

function isIosHandshake(socket) {
  const p = String(socket?.handshake?.auth?.platform || "").toLowerCase();
  return p === "ios";
}

function markConnected(userId) {
  if (!userId) return;
  liveSockets.set(userId, (liveSockets.get(userId) || 0) + 1);
  lastSeen.set(userId, Date.now());
}

function markDisconnected(userId) {
  if (!userId) return;
  const n = (liveSockets.get(userId) || 1) - 1;
  if (n > 0) liveSockets.set(userId, n);
  else liveSockets.delete(userId);
  lastSeen.set(userId, Date.now());
}

/** True when any of userIds had an iOS connection open at or after sinceMs. */
function anyIosSince(userIds, sinceMs) {
  const since = Number.isFinite(sinceMs) ? sinceMs : Date.now() - KEEP_MS;
  for (const id of userIds || []) {
    if (!id) continue;
    if (liveSockets.has(id)) return true;
    const at = lastSeen.get(id);
    if (at && at >= since) return true;
  }
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - KEEP_MS;
  for (const [id, at] of lastSeen) if (at < cutoff && !liveSockets.has(id)) lastSeen.delete(id);
}, 60 * 60 * 1000).unref?.();

module.exports = { isIosHandshake, markConnected, markDisconnected, anyIosSince };
