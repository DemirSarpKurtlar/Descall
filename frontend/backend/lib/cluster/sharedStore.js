"use strict";

/**
 * Cross-node state of runtime/sharedState.js (only when clustered).
 *
 * Shared through the Key Value (replicated; hot paths keep reading the local Map):
 *   presence              owned per node   dc:presence:<nodeId> hash userId -> entry
 *   socketToUser          local + index    dc:sockets:<userId> set "nodeId:socketId"
 *   activeGroupCalls      shared + watch   dc:groupcall:<groupId>
 *   activeServerVoiceCalls shared + watch  dc:servercall:<channelId>
 *   screenShareSessions   shared           dc:screenshare:<groupId:userId>
 *   bannedUserIds         shared set       dc:bans hash
 *   banDetailsByUser      shared           dc:bandetail hash
 *   timedOutUsers         shared           dc:timeouts hash
 *   revokedSessionIds     shared set       dc:revoked set
 *   rateLimitDm           volatile         (pub/sub only, 200 ms windows)
 *   lib/rateLimit buckets stamps mirrored  dc:rl:<scope>:<id> INCR + PEXPIRE
 *   lib/dmCallLog         shared + watch   dc:dmcall:<pair>, dc:dmended:<pair>
 *
 * Node-local caches (friends + pending requests, usernames, roles, profiles,
 * profanity / system config, DM unread, DM thread cache, notifications, and
 * every module cache wrapped with cluster.linkInvalidate: admin permissions,
 * admin tokens, session guard, blocks, premium, shop / Market 2.0 catalogs,
 * announcements, live popup schedules, maintenance windows) stay local and are
 * refreshed through `dc:inval` messages { kind, id }.
 */

function attachSharedState({ cluster, replicator, state, getIo, log = console }) {
  const io = () => getIo?.() || null;
  const nodeId = cluster.nodeId;
  const kvFire = (...args) => cluster._internals.kv?.fire(...args);

  function fanout() {
    try {
      const inst = require("../../runtime/presenceFanoutInstance");
      return { inst, live: io() ? inst.getPresenceFanout(io()) : null };
    } catch {
      return { inst: null, live: null };
    }
  }

  function localSocketsOf(userId) {
    const s = io();
    const room = s?.sockets?.adapter?.rooms?.get(`user:${String(userId)}`);
    if (!room) return [];
    const out = [];
    for (const sid of room) {
      const sock = s.sockets.sockets.get(sid);
      if (sock) out.push(sock);
    }
    return out;
  }

  // ---- presence (owned per node) -----------------------------------------
  replicator.register("presence", state.presence, {
    kind: "owned",
    storage: { key: "dc:presence" },
    // A write whose socketId is one of ours is this node's contribution.
    isLocal: (k, v) => {
      const sid = v && v.socketId;
      return Boolean(sid && io()?.sockets?.sockets?.has?.(sid));
    },
    onChange: ({ op, k, remote }) => {
      if (!remote) return;
      const { live, inst } = fanout();
      if (op === "online") {
        const p = state.presence.get(k);
        if (p?.username) state.usernameById.set(k, p.username);
        if (!live) return;
        // The fan-out reaches the user's friends through this node's friends cache:
        // load it for a user who is online on another node.
        if (state.friends.has(k)) {
          void live.userOnline(k);
        } else {
          Promise.resolve(require("../../socket/handlers").loadFriendsFromDB(k))
            .catch(() => {})
            .then(() => {
              if (state.presence.has(k)) void live.userOnline(k);
            });
        }
      } else if (op === "offline") {
        if (live) live.userOffline(k);
      } else {
        inst?.markPresenceDirty(k);
      }
    },
  });

  // ---- user -> sockets index (dc:sockets:<userId>) ---------------------------
  {
    const target = state.socketToUser;
    const MapSet = Map.prototype.set;
    const MapDelete = Map.prototype.delete;
    target.set = function set(sid, uid) {
      MapSet.call(this, sid, uid);
      if (uid != null) kvFire("sadd", `dc:sockets:${uid}`, `${nodeId}:${sid}`);
      return this;
    };
    target.delete = function del(sid) {
      const uid = Map.prototype.get.call(this, sid);
      const had = MapDelete.call(this, sid);
      if (had && uid != null) kvFire("srem", `dc:sockets:${uid}`, `${nodeId}:${sid}`);
      return had;
    };
  }

  // ---- calls / screen share ------------------------------------------------------
  replicator.register("groupCalls", state.activeGroupCalls, {
    storage: { type: "keys", prefix: "dc:groupcall:", ttlMs: 12 * 3600 * 1000 },
    watch: true,
    localFields: ["disconnectGraceByUser"],
    localDefaults: { disconnectGraceByUser: () => new Map() },
  });
  replicator.register("serverCalls", state.activeServerVoiceCalls, {
    storage: { type: "keys", prefix: "dc:servercall:", ttlMs: 12 * 3600 * 1000 },
    watch: true,
  });
  replicator.register("screenShare", state.screenShareSessions, {
    storage: { type: "keys", prefix: "dc:screenshare:", ttlMs: 12 * 3600 * 1000 },
  });

  // ---- moderation ------------------------------------------------------------------
  function noteBan(id) {
    try {
      const mod = require("../moderation");
      mod.noteRemoteBanChange?.(id, state.bannedUserIds.has(id) ? state.banDetailsByUser.get(id) || {} : null);
    } catch {
      /* moderation not loaded */
    }
  }
  const pendingKicks = new Map();
  replicator.register("bans", state.bannedUserIds, {
    storage: { type: "hash", key: "dc:bans" },
    onChange: ({ op, k }) => {
      noteBan(k);
      if (op !== "set") return;
      // The banning node kicks through the adapter; this catches a socket that
      // connected here in between.
      if (pendingKicks.has(k)) return;
      const t = setTimeout(() => {
        pendingKicks.delete(k);
        if (!state.bannedUserIds.has(k)) return;
        const d = state.banDetailsByUser.get(k) || {};
        for (const sock of localSocketsOf(k)) {
          try {
            sock.emit("system:kick", {
              action: "ban",
              reason: d.reason || "Account banned",
              category: d.category || null,
              message: d.message || null,
              bannedAt: d.bannedAt || null,
              expiresAt: d.expiresAt || null,
            });
            sock.disconnect(true);
          } catch {
            /* gone */
          }
        }
      }, 1500);
      t.unref?.();
      pendingKicks.set(k, t);
    },
  });
  replicator.register("banDetails", state.banDetailsByUser, {
    storage: { type: "hash", key: "dc:bandetail" },
    onChange: ({ k }) => noteBan(k),
  });
  replicator.register("timeouts", state.timedOutUsers, {
    storage: { type: "hash", key: "dc:timeouts" },
  });
  replicator.register("revoked", state.revokedSessionIds, {
    // Session tokens live 7 days (JWT_EXPIRES_IN); the database keeps the durable list.
    storage: { type: "set", key: "dc:revoked", ttlMs: 30 * 24 * 3600 * 1000 },
    onChange: ({ op, k }) => {
      if (op !== "set") return;
      const s = io();
      if (!s?.sockets?.sockets) return;
      for (const [, sock] of s.sockets.sockets) {
        if (sock?.user?.sid && sock.user.sid === k) {
          try {
            sock.emit("session:revoked", { sessionId: k });
            sock.disconnect(true);
          } catch {
            /* gone */
          }
        }
      }
    },
  });

  // ---- rate limits --------------------------------------------------------------------
  replicator.register("rateLimitDm", state.rateLimitDm, { kind: "volatile" });
  try {
    const rl = require("../rateLimit");
    if (typeof rl.setReplicator === "function") {
      cluster.subscribe("dc:rl", (m, meta) => {
        if (meta?.from === nodeId || !m) return;
        rl.applyRemoteStamp(m.key, m.at, m.windowMs);
      });
      rl.setReplicator((key, at, windowMs) => {
        if (!cluster.enabled()) return;
        cluster.publish("dc:rl", { key, at, windowMs });
        const k = `dc:rl:auth:${String(key).slice(0, 200)}`;
        kvFire("incr", k);
        kvFire("pexpire", k, Math.max(1000, Number(windowMs) || 60000));
      });
    }
  } catch (err) {
    log.warn?.("[cluster] rate limit mirror off:", err?.message || err);
  }

  // ---- DM call state --------------------------------------------------------------------
  try {
    const dmCallLog = require("../dmCallLog");
    if (dmCallLog.pendingDmCalls instanceof Map) {
      replicator.register("dmCalls", dmCallLog.pendingDmCalls, {
        storage: { type: "keys", prefix: "dc:dmcall:", ttlMs: 30 * 60 * 1000 },
        watch: true,
      });
    }
    if (dmCallLog.recentlyEndedPairs instanceof Map) {
      replicator.register("dmEnded", dmCallLog.recentlyEndedPairs, {
        storage: { type: "keys", prefix: "dc:dmended:", ttlMs: 5 * 60 * 1000 },
      });
    }
  } catch (err) {
    log.warn?.("[cluster] dm call state stays local:", err?.message || err);
  }

  // ---- invalidation of node-local caches ------------------------------------------------
  cluster.onInvalidate("friends", (m) => {
    const id = m.id;
    if (!id) return;
    if (localSocketsOf(id).length) {
      const handlers = require("../../socket/handlers");
      // The node that made the change already emitted the new list to the user room.
      Promise.all([handlers.loadFriendsFromDB(id), handlers.loadPendingRequestsFromDB?.(id)])
        .then(() => fanout().inst?.refreshPresenceLocal(id))
        .catch(() => {});
    } else {
      Map.prototype.delete.call(state.friends, id);
    }
  });
  cluster.onInvalidate("profile", (m) => {
    const id = m.id;
    if (!id) return;
    const up = require("../userProfile");
    up.loadUserProfile(id, { withCosmetics: true })
      .then((profile) => {
        if (!profile) return;
        for (const sock of localSocketsOf(id)) {
          if (!sock.user) continue;
          sock.user.avatar_url = profile.avatar_url;
          sock.user.username = profile.username || sock.user.username;
          sock.user.display_name = profile.display_name;
          sock.user.displayName = profile.display_name;
        }
        fanout().inst?.markPresenceDirty(id);
      })
      .catch(() => {});
  });
  cluster.onInvalidate("username", (m) => {
    if (m.id && m.username) state.usernameById.set(m.id, String(m.username));
  });
  cluster.onInvalidate("roles", (m) => {
    if (!m.id) return;
    if (m.role) state.userRoles.set(m.id, String(m.role));
    else state.userRoles.delete(m.id);
  });
  cluster.onInvalidate("dmUnread", (m) => {
    if (!m.id || !m.peer) return;
    const map = state.dmUnreadByUser.get(m.id);
    if (!map) return; // hydrated from the database on this user's next sync here
    const count = Math.max(0, Number(m.count) || 0);
    if (count) map.set(m.peer, count);
    else map.delete(m.peer);
  });
  cluster.onInvalidate("notif", (m) => {
    if (!m.id || !m.item) return;
    const list = state.notificationsByUser.get(m.id);
    if (!list) return;
    if (list.some((n) => n && n.id === m.item.id)) return;
    list.unshift(m.item);
    if (list.length > (state.MAX_NOTIFICATIONS || 100)) list.length = state.MAX_NOTIFICATIONS || 100;
  });
  cluster.onInvalidate("notifRead", (m) => {
    const list = m.id ? state.notificationsByUser.get(m.id) : null;
    if (!list) return;
    if (m.all) for (const n of list) n.read = true;
    else if (m.nid) for (const n of list) if (n.id === m.nid) n.read = true;
  });
  cluster.onInvalidate("dmConv", (m) => {
    // A DM thread changed on another node: the next read here comes from the database.
    if (m.id) Map.prototype.delete.call(state.dmHistory, m.id);
  });
  cluster.onInvalidate("sysconfig", () => {
    const { loadSystemSettings, applySystemConfigToState } = require("../systemSettings");
    loadSystemSettings(require("../../db/supabase"))
      .then((settings) => {
        if (settings?.config) applySystemConfigToState(state, settings.config);
      })
      .catch(() => {});
  });

  // ---- a node died: its users' call seats -------------------------------------------------------
  // Its users reconnect to a live node within seconds and resume their seats; whoever
  // is still nowhere after the usual grace leaves the call (leader only, once).
  const GHOST_CHECK_MS = 5000;
  const GHOST_GRACE_MS = 45000;
  function sweepGhosts() {
    if (!cluster.isLeader()) return;
    const s = io();
    if (!s) return;
    const present = (uid) => state.presence.has(String(uid));
    try {
      const gcl = require("../../socket/groupCallLifecycle");
      for (const [gid, call] of state.activeGroupCalls) {
        for (const uid of [...(call?.participants || [])]) if (!present(uid)) gcl.scheduleParticipantDisconnectGrace(s, gid, uid);
      }
    } catch (err) {
      log.warn?.("[cluster] group call ghost sweep failed:", err?.message || err);
    }
    const seats = [];
    for (const [cid, call] of state.activeServerVoiceCalls) {
      for (const key of [...(call?.participants?.keys?.() || [])]) if (!present(key)) seats.push([cid, String(key)]);
    }
    if (!seats.length) return;
    const t = setTimeout(() => {
      if (!cluster.isLeader()) return;
      try {
        const { _internals } = require("../../socket/serverVoiceHandlers");
        for (const [cid, uid] of seats) if (!present(uid)) _internals.removeFromVoice(io(), cid, uid);
      } catch (err) {
        log.warn?.("[cluster] voice ghost sweep failed:", err?.message || err);
      }
    }, GHOST_GRACE_MS);
    t.unref?.();
  }
  cluster.on("nodeDown", () => {
    const t = setTimeout(sweepGhosts, GHOST_CHECK_MS);
    t.unref?.();
  });
  // A (re)start or a KV return loads the calls kept in the KV (dc:servercall:*, 12 h TTL).
  // Seats of people who never came back (closed the app during a deploy) used to stay
  // until someone else's join or leave touched them: the same sweep runs then too.
  cluster.on("kvUp", () => {
    const t = setTimeout(sweepGhosts, GHOST_CHECK_MS);
    t.unref?.();
  });

  // ---- after (re)connecting to the KV -----------------------------------------------------------
  async function resyncSockets() {
    const kv = cluster._internals.kv;
    if (!kv?.isUp()) return;
    const mine = new Map();
    for (const [sid, uid] of state.socketToUser) {
      if (uid == null) continue;
      if (!mine.has(uid)) mine.set(uid, []);
      mine.get(uid).push(`${nodeId}:${sid}`);
    }
    // Members left over from an earlier run of this node id.
    try {
      const keys = await kv.scanAll("dc:sockets:*");
      for (const key of keys || []) {
        const members = await kv.call("smembers", key).catch(() => []);
        const uid = key.slice("dc:sockets:".length);
        const keep = new Set(mine.get(uid) || []);
        const stale = (members || []).filter((x) => String(x).startsWith(`${nodeId}:`) && !keep.has(x));
        if (stale.length) await kv.call("srem", key, ...stale).catch(() => {});
      }
    } catch {
      /* next reconnect */
    }
    for (const [uid, members] of mine) kvFire("sadd", `dc:sockets:${uid}`, ...members);
  }
  cluster.on("kvUp", () => void resyncSockets());
  if (cluster._internals.kv?.isUp()) void resyncSockets();

  return { localSocketsOf, sweepGhosts };
}

module.exports = { attachSharedState };
