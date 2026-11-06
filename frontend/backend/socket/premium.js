"use strict";

/**
 * Descall+ / Ultra checks for socket handlers. hasFeature(userId, key) answers from a short cache
 * (lib/premium/entitlements.js, 30 s, cleared on every premium change for that user), so a handler
 * can call it on each event. socketHasFeature(socket, key) reads the signed-in user from the socket.
 * Both fail closed.
 */

const entitlements = require("../lib/premium/entitlements");

function hasFeature(userId, feature) {
  return entitlements.hasFeature(userId, feature);
}

function socketHasFeature(socket, feature) {
  const userId = socket?.user?.id;
  if (!userId) return Promise.resolve(false);
  return entitlements.hasFeature(userId, feature);
}

/**
 * The badge others see: drop the cached plan, read it again, and refresh the member's roster row
 * (presence fan-out) so online friends and server members see the change without a reload.
 */
function refreshBadge(userId) {
  if (!userId) return;
  const badges = require("../lib/premium/badges");
  badges.invalidate(userId);
  badges
    .plansFor([userId])
    .then(() => {
      try {
        require("../runtime/presenceFanoutInstance").markPresenceDirty(String(userId));
      } catch {
        /* no fan-out in this process */
      }
    })
    .catch(() => {});
}

/** Tell the account's sockets that its membership changed (clients refetch /api/premium/me). */
function emitPremiumUpdated(io, userId, payload = {}) {
  entitlements.invalidate(userId);
  refreshBadge(userId);
  if (!io || !userId) return;
  try {
    io.to(`user:${userId}`).emit("premium:updated", { userId: String(userId), ...payload });
  } catch {
    /* best effort */
  }
}

module.exports = { hasFeature, socketHasFeature, emitPremiumUpdated };
