"use strict";

/**
 * 3D world (phase 1) Socket.IO namespace `/world`.
 *
 * Desktop clients open this namespace (a separate connection straight to Render,
 * never through the Cloudflare edge hub) only while the world view is open.
 * Same JWT middleware as the main namespace. Gate: admins only until the owner
 * opens the world; desktop platforms only. A user can enter the world of a call
 * only while they are in that live call (server voice channel or group call),
 * re-checked every few seconds. At most 16 avatars per call.
 *
 * Movement: clients send ~10 snapshots per second (`world:snap`), the server
 * validates them (lib/world3d/worldCore.js) and relays the changed ones to the
 * room once per 100 ms as one batch (`world:snaps`) stamped with server time;
 * clients interpolate ~100 ms behind.
 */

const {
  SNAP_INTERVAL_MS,
  canUseWorld,
  isAdminRow,
  authorizeWorldJoin,
  createRateLimiter,
  cleanChat,
  WorldRooms,
} = require("../lib/world3d/worldCore");

const RECHECK_MS = 5000;

function publicProfile(userId, socketUser) {
  let cached = null;
  try {
    cached = require("../lib/userProfile").getCachedPublicUser(userId);
  } catch {
    cached = null;
  }
  const username = cached?.username || socketUser?.username || "";
  const displayName = cached?.displayName || cached?.display_name || socketUser?.displayName || socketUser?.display_name || null;
  return {
    id: String(userId),
    username,
    displayName,
    avatarUrl: cached?.avatarUrl || cached?.avatar_url || null,
  };
}

/**
 * @param {import("socket.io").Server} io
 * @param {object} deps injectable for tests
 */
function registerWorldNamespace(io, deps = {}) {
  const shared = deps.sharedState || require("../runtime/sharedState");
  const loadAdminRow = deps.loadAdminRow || ((id) => require("../lib/adminPermissions").loadRow(id));
  const authMiddleware = deps.authMiddleware || require("../middleware/socketAuth").socketAuthMiddleware;
  const publicEnabled = deps.publicEnabled || (() => false);
  const profileOf = deps.profileOf || publicProfile;
  const rooms = deps.rooms || new WorldRooms();
  const nsp = io.of("/world");
  if (authMiddleware) nsp.use(authMiddleware);

  // Gate before any handler: platform + admin flag.
  nsp.use((socket, next) => {
    const user = socket.user;
    if (!user?.id) return next(new Error("WORLD_AUTH"));
    const app = socket.handshake?.auth?.app || "web";
    Promise.resolve(loadAdminRow(user.id))
      .catch(() => null)
      .then((row) => {
        const verdict = canUseWorld({ isAdmin: isAdminRow(row, user), app, publicEnabled: publicEnabled() });
        if (!verdict.ok) return next(new Error(verdict.reason === "platform" ? "WORLD_PLATFORM" : "WORLD_DISABLED"));
        return next();
      });
  });

  const tick = setInterval(() => {
    for (const key of rooms.keys()) {
      const batch = rooms.flush(key);
      if (batch.length) nsp.to(key).volatile.emit("world:snaps", { t: Date.now(), s: batch });
    }
  }, SNAP_INTERVAL_MS);
  tick.unref?.();

  const recheck = setInterval(() => {
    for (const key of rooms.keys()) {
      const room = rooms.room(key);
      if (!room) continue;
      for (const m of Array.from(room.members.values())) {
        const verdict = authorizeWorldJoin({
          kind: room.kind,
          id: room.id,
          userId: m.userId,
          activeGroupCalls: shared.activeGroupCalls,
          activeServerVoiceCalls: shared.activeServerVoiceCalls,
        });
        if (verdict.ok) continue;
        const s = nsp.sockets.get(m.socketId);
        if (rooms.leave(key, m.userId, m.socketId)) {
          nsp.to(key).emit("world:member", { type: "leave", id: m.userId });
        }
        if (s) {
          s.emit("world:kicked", { reason: "not_in_call" });
          s.leave(key);
          if (s.data.worldKey === key) s.data.worldKey = null;
        }
      }
    }
  }, RECHECK_MS);
  recheck.unref?.();

  nsp.on("connection", (socket) => {
    const userId = String(socket.user.id);
    const snapLimit = createRateLimiter({ ratePerSec: 15, burst: 20 });
    const chatLimit = createRateLimiter({ ratePerSec: 0.5, burst: 5 });
    const emoteLimit = createRateLimiter({ ratePerSec: 2, burst: 4 });
    const joinLimit = createRateLimiter({ ratePerSec: 0.2, burst: 6 });
    socket.data.worldKey = null;

    const leaveCurrent = () => {
      const key = socket.data.worldKey;
      if (!key) return;
      socket.data.worldKey = null;
      socket.leave(key);
      if (rooms.leave(key, userId, socket.id)) {
        nsp.to(key).emit("world:member", { type: "leave", id: userId });
      }
    };

    socket.on("world:join", (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (!joinLimit.take()) return reply({ ok: false, error: "rate_limited" });
      const kind = payload?.kind;
      const id = payload?.id;
      const verdict = authorizeWorldJoin({
        kind,
        id,
        userId,
        activeGroupCalls: shared.activeGroupCalls,
        activeServerVoiceCalls: shared.activeServerVoiceCalls,
      });
      if (!verdict.ok) return reply({ ok: false, error: verdict.reason });
      if (socket.data.worldKey && socket.data.worldKey !== verdict.key) leaveCurrent();
      const profile = profileOf(userId, socket.user);
      const joined = rooms.join(verdict.key, { kind, id: String(id), userId, socketId: socket.id, profile });
      if (!joined.ok) return reply({ ok: false, error: joined.reason });
      if (joined.replaced && joined.replaced !== socket.id) {
        // Same account opened the world in another window: the newest one wins.
        const old = nsp.sockets.get(joined.replaced);
        if (old) {
          old.emit("world:kicked", { reason: "replaced" });
          old.leave(verdict.key);
          old.data.worldKey = null;
        }
      }
      socket.data.worldKey = verdict.key;
      socket.join(verdict.key);
      socket.to(verdict.key).emit("world:member", { type: "join", member: { ...profile, snap: null } });
      return reply({
        ok: true,
        self: userId,
        serverTime: Date.now(),
        members: rooms.roster(verdict.key),
        maxAvatars: rooms.maxAvatars,
        snapHz: Math.round(1000 / SNAP_INTERVAL_MS),
      });
    });

    socket.on("world:snap", (raw) => {
      const key = socket.data.worldKey;
      if (!key || !snapLimit.take()) return;
      const prevEmote = rooms.room(key)?.members.get(userId)?.snap?.[6];
      const snap = Array.isArray(raw) ? raw : null;
      if (snap && Number(snap[6]) !== prevEmote && Number(snap[5]) > 0 && !emoteLimit.take()) {
        // Too many emotes: keep the movement, drop the new emote.
        snap[5] = 0;
        snap[6] = prevEmote || 0;
      }
      rooms.update(key, userId, snap);
    });

    socket.on("world:chat", (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const key = socket.data.worldKey;
      if (!key) return reply({ ok: false, error: "not_joined" });
      if (!chatLimit.take()) return reply({ ok: false, error: "rate_limited" });
      let text = cleanChat(payload?.text);
      if (!text) return reply({ ok: false, error: "empty" });
      try {
        text = require("../lib/profanity").maskProfanity(text);
      } catch {
        /* filter is best effort */
      }
      const member = rooms.room(key)?.members.get(userId);
      const msg = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        userId,
        name: member?.profile?.displayName || member?.profile?.username || "",
        text,
        at: Date.now(),
      };
      nsp.to(key).emit("world:chat", msg);
      return reply({ ok: true, id: msg.id });
    });

    socket.on("world:leave", () => leaveCurrent());
    socket.on("disconnect", () => leaveCurrent());
  });

  return {
    nsp,
    rooms,
    stop() {
      clearInterval(tick);
      clearInterval(recheck);
    },
  };
}

module.exports = { registerWorldNamespace };
