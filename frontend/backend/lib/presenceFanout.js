"use strict";

/**
 * Scoped presence fan-out (2.11.3, scale plan S0).
 *
 * Before: every connect, disconnect and status change sent the whole online
 * roster to every socket (`io.emit("users:update", all)`), so egress grew with
 * N³. Now a user's presence only reaches the people who can see it in the UI:
 * friends, plus members of a server or group they share. Changes are
 * coalesced and flushed every `flushMs`.
 *
 * Two client kinds:
 *  - delta clients (handshake `auth.presence >= 2`): one scoped
 *    `users:update` snapshot after connect / scope change, then
 *    `presence:delta { up: [entry], rm: [id] }` for changes.
 *  - legacy clients (older builds): a scoped `users:update` snapshot, rate
 *    limited per socket (2 s, longer for big scopes) so a busy server cannot
 *    turn it back into N².
 *
 * Invisible users never appear in either event (same rule as before).
 * Pure wiring: the caller passes io, the presence map, the friends map, an
 * entry builder and a membership loader, so it runs under test with fakes.
 */

const DEFAULTS = {
  flushMs: 500,
  legacyMinIntervalMs: 2000,
  legacyPerScopeMs: 20,
  legacyMaxIntervalMs: 30000,
  membershipTtlMs: 10 * 60 * 1000,
  membershipKeepOfflineMs: 30 * 60 * 1000,
};

function scopeKeyForRoom(room) {
  const s = String(room || "");
  if (s.startsWith("server:")) return `s:${s.slice(7)}`;
  if (s.startsWith("group:")) return `g:${s.slice(6)}`;
  return null;
}

function legacyIntervalMs(scopeSize, opts = DEFAULTS) {
  const n = Math.max(0, Number(scopeSize) || 0);
  const ms = opts.legacyMinIntervalMs + n * opts.legacyPerScopeMs;
  return Math.min(opts.legacyMaxIntervalMs, Math.max(opts.legacyMinIntervalMs, ms));
}

function createPresenceFanout({
  io,
  presence,
  friends,
  buildEntry,
  loadMemberships = async () => [],
  isEnabled = () => true,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
  options = {},
} = {}) {
  const opts = { ...DEFAULTS, ...options };
  /** uid -> { scopes:Set<string>, loadedAt:number, offlineAt:number|null } */
  const memberships = new Map();
  /** scopeKey -> Set<uid> of users currently online */
  const scopeOnline = new Map();
  const dirty = new Set();
  const snapshotWanted = new Set();
  const lastSnapshotAt = new Map();
  let timer = null;
  let timerDueAt = 0;
  const stats = { flushes: 0, deltaEmits: 0, snapshotEmits: 0, legacyGlobalEmits: 0, entriesSent: 0 };

  function isOnline(uid) {
    return presence.has(uid);
  }

  function userSockets(uid) {
    const room = io?.sockets?.adapter?.rooms?.get(`user:${uid}`);
    if (!room) return [];
    const out = [];
    for (const sid of room) {
      const s = io.sockets.sockets.get(sid);
      if (s) out.push(s);
    }
    return out;
  }

  function schedule(delayMs = opts.flushMs) {
    const due = now() + delayMs;
    if (timer && timerDueAt <= due) return;
    if (timer) clearTimer(timer);
    timerDueAt = due;
    timer = setTimer(() => {
      timer = null;
      timerDueAt = 0;
      flush();
    }, delayMs);
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function indexAdd(uid, key) {
    if (!scopeOnline.has(key)) scopeOnline.set(key, new Set());
    scopeOnline.get(key).add(uid);
  }

  function indexRemove(uid, key) {
    const set = scopeOnline.get(key);
    if (!set) return;
    set.delete(uid);
    if (!set.size) scopeOnline.delete(key);
  }

  function ensureMembershipRecord(uid) {
    let rec = memberships.get(uid);
    if (!rec) {
      rec = { scopes: new Set(), loadedAt: 0, offlineAt: null };
      memberships.set(uid, rec);
    }
    return rec;
  }

  function requestSnapshot(uid) {
    for (const s of userSockets(uid)) snapshotWanted.add(s.id);
  }

  function markDirty(uid) {
    if (uid == null) return;
    dirty.add(String(uid));
    schedule();
  }

  /** Relationship changed (friend added/removed, block): resend both rosters. */
  function refreshUsers(...uids) {
    for (const raw of uids) {
      if (raw == null) continue;
      const uid = String(raw);
      markDirty(uid);
      requestSnapshot(uid);
    }
  }

  async function refreshMemberships(uid) {
    const rec = ensureMembershipRecord(uid);
    if (rec.loadedAt && now() - rec.loadedAt < opts.membershipTtlMs) return rec;
    let keys = [];
    try {
      keys = (await loadMemberships(uid)) || [];
    } catch {
      return rec; // keep what we have; friends scope still works
    }
    const next = new Set(keys.filter(Boolean));
    const online = isOnline(uid);
    for (const k of rec.scopes) if (!next.has(k) && online) indexRemove(uid, k);
    for (const k of next) if (online) indexAdd(uid, k);
    // Keep scopes learnt from live room joins that the DB snapshot may predate.
    for (const k of rec.scopes) if (!next.has(k) && rec.liveScopes?.has(k)) next.add(k);
    rec.scopes = next;
    rec.loadedAt = now();
    return rec;
  }

  /** Call after the user's presence entry was set (connect). */
  function userOnline(uid) {
    uid = String(uid);
    const rec = ensureMembershipRecord(uid);
    rec.offlineAt = null;
    for (const k of rec.scopes) indexAdd(uid, k);
    markDirty(uid);
    requestSnapshot(uid);
    return refreshMemberships(uid)
      .then(() => {
        markDirty(uid);
        requestSnapshot(uid);
      })
      .catch(() => {});
  }

  /** Call after the user's presence entry was deleted (last socket gone). */
  function userOffline(uid) {
    uid = String(uid);
    const rec = memberships.get(uid);
    if (rec) {
      rec.offlineAt = now();
      for (const k of rec.scopes) indexRemove(uid, k);
    }
    markDirty(uid);
  }

  /** A socket joined a `server:` / `group:` room: grow that user's scope. */
  function onRoomJoin(room, socketId) {
    const key = scopeKeyForRoom(room);
    if (!key) return;
    const sock = io?.sockets?.sockets?.get(socketId);
    const uid = sock?.user?.id != null ? String(sock.user.id) : null;
    if (!uid) return;
    const rec = ensureMembershipRecord(uid);
    if (!rec.liveScopes) rec.liveScopes = new Set();
    rec.liveScopes.add(key);
    if (rec.scopes.has(key)) return;
    rec.scopes.add(key);
    if (isOnline(uid)) indexAdd(uid, key);
    markDirty(uid);
    snapshotWanted.add(socketId);
  }

  /** uids (online, not self-filtered) that should see `uid`'s presence. */
  function audienceOf(uid) {
    const out = new Set();
    out.add(uid);
    const f = friends.get(uid);
    if (f) for (const fid of f) if (isOnline(String(fid))) out.add(String(fid));
    const rec = memberships.get(uid);
    if (rec) {
      for (const k of rec.scopes) {
        const set = scopeOnline.get(k);
        if (set) for (const m of set) out.add(m);
      }
    }
    return out;
  }

  /** Online uids `uid` may see (its own roster). Same relation as audienceOf. */
  function scopeOf(uid) {
    return audienceOf(uid);
  }

  function scopedSnapshot(uid) {
    const list = [];
    for (const id of scopeOf(uid)) {
      const entry = buildEntry(id);
      if (entry) list.push(entry);
    }
    return list;
  }

  function legacyGlobalBroadcast() {
    const list = [];
    for (const id of presence.keys()) {
      const entry = buildEntry(String(id));
      if (entry) list.push(entry);
    }
    stats.legacyGlobalEmits += 1;
    io.emit("users:update", list);
  }

  function flush() {
    stats.flushes += 1;
    if (!isEnabled()) {
      dirty.clear();
      snapshotWanted.clear();
      legacyGlobalBroadcast();
      return;
    }
    const perSocket = new Map(); // sid -> Map(uid -> entry|null)
    const changed = [...dirty];
    dirty.clear();
    const entryCache = new Map();
    for (const uid of changed) {
      if (!entryCache.has(uid)) entryCache.set(uid, buildEntry(uid));
      const entry = entryCache.get(uid);
      for (const viewer of audienceOf(uid)) {
        for (const s of userSockets(viewer)) {
          if (snapshotWanted.has(s.id)) continue;
          if (s.data?.presenceDelta) {
            if (!perSocket.has(s.id)) perSocket.set(s.id, { sock: s, items: new Map() });
            perSocket.get(s.id).items.set(uid, entry);
          } else {
            snapshotWanted.add(s.id);
          }
        }
      }
    }
    for (const { sock, items } of perSocket.values()) {
      if (snapshotWanted.has(sock.id)) continue;
      const up = [];
      const rm = [];
      for (const [uid, entry] of items) {
        if (entry) up.push(entry);
        else rm.push(uid);
      }
      if (!up.length && !rm.length) continue;
      stats.deltaEmits += 1;
      stats.entriesSent += up.length;
      sock.emit("presence:delta", { up, rm });
    }
    let retryIn = 0;
    const t = now();
    for (const sid of [...snapshotWanted]) {
      const sock = io.sockets.sockets.get(sid);
      if (!sock) {
        snapshotWanted.delete(sid);
        lastSnapshotAt.delete(sid);
        continue;
      }
      const uid = sock.user?.id != null ? String(sock.user.id) : socketUser(sid);
      if (!uid) {
        snapshotWanted.delete(sid);
        continue;
      }
      const list = scopedSnapshot(uid);
      const last = lastSnapshotAt.get(sid) || 0;
      const gap = sock.data?.presenceDelta ? 0 : legacyIntervalMs(list.length, opts);
      if (last && t - last < gap) {
        const wait = gap - (t - last);
        retryIn = retryIn ? Math.min(retryIn, wait) : wait;
        continue;
      }
      snapshotWanted.delete(sid);
      lastSnapshotAt.set(sid, t);
      stats.snapshotEmits += 1;
      stats.entriesSent += list.length;
      sock.emit("users:update", list);
    }
    if (retryIn) schedule(retryIn);
    sweep();
  }

  function socketUser(sid) {
    const s = io.sockets.sockets.get(sid);
    return s?.user?.id != null ? String(s.user.id) : null;
  }

  let lastSweep = 0;
  function sweep() {
    const t = now();
    if (t - lastSweep < 60_000) return;
    lastSweep = t;
    for (const [uid, rec] of memberships) {
      if (rec.offlineAt && t - rec.offlineAt > opts.membershipKeepOfflineMs && !isOnline(uid)) {
        memberships.delete(uid);
      }
    }
    for (const sid of lastSnapshotAt.keys()) {
      if (!io.sockets.sockets.get(sid)) lastSnapshotAt.delete(sid);
    }
  }

  /** Socket left (any reason): drop per-socket bookkeeping. */
  function socketGone(sid) {
    snapshotWanted.delete(sid);
    lastSnapshotAt.delete(sid);
  }

  function attach() {
    const adapter = io?.of ? io.of("/").adapter : io?.sockets?.adapter;
    if (adapter && typeof adapter.on === "function") {
      adapter.on("join-room", (room, sid) => {
        try {
          onRoomJoin(room, sid);
        } catch {
          /* presence is best-effort */
        }
      });
    }
  }

  return {
    attach,
    markDirty,
    refreshUsers,
    userOnline,
    userOffline,
    onRoomJoin,
    socketGone,
    flush,
    audienceOf,
    scopedSnapshot,
    stats,
    _memberships: memberships,
    _scopeOnline: scopeOnline,
  };
}

module.exports = { createPresenceFanout, scopeKeyForRoom, legacyIntervalMs, DEFAULTS };
