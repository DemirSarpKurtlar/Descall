"use strict";

const state = require("../runtime/sharedState");
const { pruneDeadPresence, summarizePresence, getPresenceEntry } = require("../lib/presenceRoster");

function getSocketForUser(io, userId) {
  const p = getPresenceEntry(state.presence, userId);
  if (!p?.socketId) return null;
  return io.sockets.sockets.get(p.socketId);
}

function buildSnapshot(io) {
  pruneDeadPresence(state.presence, io);
  const roster = summarizePresence(state.presence, { io });
  const sockets = roster.live.map((row) => ({
    userId: row.id,
    username: row.username,
    status: row.status || "online",
    socketId: row.socketId,
  }));
  return {
    at: new Date().toISOString(),
    onlineCount: roster.connectedCount,
    connectedCount: roster.connectedCount,
    visibleCount: roster.visibleCount,
    invisibleCount: roster.invisibleCount,
    statusCounts: roster.statusCounts,
    maintenanceMode: state.systemConfig.maintenanceMode,
    sockets,
    bannedCount: state.bannedUserIds.size,
    auditTail: state.auditLog.slice(0, 30),
    errorsTail: state.serverErrorLog.slice(0, 20),
  };
}

function notifyAdminRoom(io, payload) {
  io.to("admin").emit("admin:update", payload);
}

/**
 * `system:kick` payload (docs/design/ban-experience/CONTRACT.md section 5).
 * `reason` stays for old clients (they show "message, reason"), so it carries
 * the category label and never repeats the admin note in `message`.
 * A ban also carries a fresh banTicket for the ban screen.
 */
function buildKickPayload({ targetUserId, reason, action, category, message, bannedAt, expiresAt, username, access }) {
  const kind = action === "ban" || action === "access_ban" ? action : "kick";
  const note = message ? String(message).trim() || null : null;
  let label = reason ? String(reason).trim() : "";
  if (!label || (note && label === note)) {
    label = category ? require("../lib/moderation").categoryLabel(category) : "";
  }
  if (!label || (note && label === note)) {
    label = kind === "ban" ? "Banned" : kind === "access_ban" ? "Access blocked" : "Removed by moderator";
  }
  if (kind === "access_ban") {
    return {
      action: "access_ban",
      reason: label,
      category: "access",
      categoryId: null,
      message: null,
      access: access || null,
    };
  }
  const categoryId = category ? require("../lib/banExperience").categoryIdOf(category) : null;
  let banTicket = null;
  if (kind === "ban" && targetUserId) {
    try {
      banTicket = require("../config/jwt").signBanTicket({ id: targetUserId });
    } catch {
      banTicket = null;
    }
  }
  return {
    action: kind,
    reason: label,
    category: category || null,
    categoryId,
    message: note,
    bannedAt: kind === "ban" ? bannedAt || new Date().toISOString() : null,
    expiresAt: expiresAt || null,
    username: username || state.usernameById.get(String(targetUserId)) || null,
    banTicket,
  };
}

/** Every live socket of a user: the user room (all instances) plus a local scan. */
async function socketsOfUser(io, userId) {
  const out = new Map();
  try {
    if (typeof io?.in === "function") {
      for (const s of await io.in(`user:${userId}`).fetchSockets()) out.set(s.id, s);
    }
  } catch (err) {
    console.warn("[kick] fetchSockets failed:", err?.message || err);
  }
  try {
    for (const [, s] of io?.sockets?.sockets || []) {
      if (s?.user?.id != null && String(s.user.id) === String(userId) && !out.has(s.id)) out.set(s.id, s);
    }
  } catch {
    /* ignore */
  }
  return [...out.values()];
}

/**
 * Disconnect every socket of the user with one `system:kick`. Resolves to the
 * number of sockets closed; never throws (callers may fire and forget).
 */
async function kickUser(io, { actorId, actorUsername, targetUserId, reason, action, category, message, bannedAt, expiresAt, username }) {
  const payload = buildKickPayload({ targetUserId, reason, action, category, message, bannedAt, expiresAt, username });
  let kicked = 0;
  for (const sock of await socketsOfUser(io, targetUserId)) {
    try {
      sock.emit("system:kick", payload);
      sock.disconnect(true);
      kicked += 1;
    } catch {
      /* already gone */
    }
  }
  const auditMeta = { reason: payload.reason, category: payload.category, message: payload.message, expiresAt: payload.expiresAt };
  state.appendAudit(actorId, actorUsername, payload.action, targetUserId, { ...auditMeta, sockets: kicked });
  try {
    notifyAdminRoom(io, { type: payload.action, targetUserId, ...auditMeta });
  } catch {
    /* io without rooms (tests) */
  }
  return kicked;
}

function disconnectAll(io, actorId, actorUsername) {
  for (const [, sock] of io.sockets.sockets) {
    try {
      sock.emit("system:maintenance", { message: "Server maintenance disconnect." });
      sock.disconnect(true);
    } catch {
      /* ignore */
    }
  }
  state.appendAudit(actorId, actorUsername, "disconnect_all", "all", {});
  notifyAdminRoom(io, { type: "disconnect_all" });
}

const { verifyToken } = require("../config/jwt");

function setupAdminSocket(io, socket) {
  // Privileged admin events trust only the verified JWT username. is_admin is
  // loaded from the database on connect (socket/handlers.js loadUserProfile)
  // and is not taken from the client. Promoting admins is HTTP + super-admin.
  if (socket.user.username !== "admin") return;

  socket.join("admin");
  socket.emit("admin:sync", buildSnapshot(io));

  socket.on("admin:subscribe", () => {
    if (socket.user.username !== "admin") return;
    socket.join("admin");
    socket.emit("admin:sync", buildSnapshot(io));
  });

  socket.on("admin:refresh", () => {
    if (socket.user.username !== "admin") return;
    socket.emit("admin:sync", buildSnapshot(io));
  });

  // 3.2.0: changes need the same fresh-code step-up token as the HTTP admin API.
  const stepUpOk = (token) => {
    try {
      const t = verifyToken(String(token || ""));
      return Boolean(t.stepUp) && t.sub === socket.user.id;
    } catch {
      return false;
    }
  };

  socket.on("admin:kick_user", ({ userId, reason, stepUp } = {}) => {
    if (socket.user.username !== "admin") return;
    if (typeof userId !== "string") return;
    if (!stepUpOk(stepUp)) return socket.emit("admin:error", { code: "STEP_UP_REQUIRED" });
    kickUser(io, {
      actorId: socket.user.id,
      actorUsername: socket.user.username,
      targetUserId: userId,
      reason,
    }).then(() => socket.emit("admin:sync", buildSnapshot(io)));
  });

  socket.on("admin:broadcast", ({ text, stepUp } = {}) => {
    if (socket.user.username !== "admin") return;
    if (!stepUpOk(stepUp)) return socket.emit("admin:error", { code: "STEP_UP_REQUIRED" });
    const t = String(text || "").trim();
    if (!t) return;
    io.emit("server:announcement", {
      text: t,
      at: new Date().toISOString(),
      from: "admin",
    });
    state.appendAudit(socket.user.id, socket.user.username, "broadcast", "all", { length: t.length });
    notifyAdminRoom(io, { type: "broadcast", length: t.length });
  });

  socket.on("admin:ping", () => {
    if (socket.user.username !== "admin") return;
    socket.emit("admin:pong", { at: Date.now() });
  });
}

module.exports = {
  setupAdminSocket,
  notifyAdminRoom,
  buildSnapshot,
  kickUser,
  buildKickPayload,
  socketsOfUser,
  disconnectAll,
  getSocketForUser,
};
