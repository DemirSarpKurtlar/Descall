"use strict";

/**
 * Descall+ 2.0 live events:
 *   plus:event   to user:<id>     { kind, ... }   gift / ticket / boost / payment status (live tracking)
 *   plus:server  to server:<id>   { kind, ... }   boost count, level up (one announcement per level)
 *   premium:updated (existing) after membership changes, so usePremium refreshes.
 * Payloads carry ids and codes only; clients render the text in their own language.
 */

let io = null;

function bind(instance) {
  if (instance && typeof instance.to === "function") io = instance;
}

function emit(room, event, payload) {
  try {
    if (io) io.to(room).emit(event, { ...payload, at: new Date().toISOString() });
  } catch {
    /* best effort */
  }
}

function toUser(userId, payload) {
  if (userId) emit(`user:${userId}`, "plus:event", payload);
}

function toServer(serverId, payload) {
  if (serverId) emit(`server:${serverId}`, "plus:server", payload);
}

function toAdmins(payload) {
  emit("admin", "plus:admin", payload);
}

function premiumChanged(userId, payload = {}) {
  try {
    require("../premium/entitlements").invalidate(userId);
  } catch {
    /* ignore */
  }
  try {
    require("../../socket/premium").emitPremiumUpdated(io, userId, payload);
  } catch {
    /* ignore */
  }
  toUser(userId, payload);
}

function audit(actorId, action, target, meta = {}) {
  try {
    require("../../runtime/sharedState").appendAudit(actorId, null, action, target, meta);
  } catch {
    /* best effort */
  }
}

module.exports = { bind, toUser, toServer, toAdmins, premiumChanged, audit };
