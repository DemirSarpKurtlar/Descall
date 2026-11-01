"use strict";

/**
 * 3D world (phase 1): pure rules for the /world Socket.IO namespace.
 *
 * The world is a mode of an existing live call: a server voice channel or a
 * group call. Nothing here touches the network or the database, so the gate,
 * the authorization and the snapshot rules can be unit tested.
 *
 * Wire format of one snapshot (client -> server, server -> clients):
 *   [x, y, z, yaw, state, emote, emoteSeq, seat]
 *   x/y/z    metres in the room (y up), 2 decimals
 *   yaw      radians, 3 decimals, wrapped to (-PI, PI]
 *   state    STATES index (idle, walk, run, sit...)
 *   emote    EMOTES index, 0 = none
 *   emoteSeq 0..255, bumps every time an emote starts (replays the same emote)
 *   seat     seat index in the room layout, -1 = standing
 * The frontend mirror lives in src/world3d/net/protocol.js (protocol.selftest.mjs
 * checks both lists are the same).
 */

const MAX_AVATARS = 16;
const SNAP_HZ = 10;
const SNAP_INTERVAL_MS = Math.round(1000 / SNAP_HZ);
const MAX_SPEED_MPS = 6; // run is ~3.2 m/s; leaves headroom for jitter
const TELEPORT_SLACK_M = 1.6; // sitting down snaps onto the seat
const BOUNDS = { minX: -30, maxX: 30, minY: -1, maxY: 6, minZ: -30, maxZ: 30 };
const CHAT_MAX_LEN = 300;

const STATES = ["idle", "walk", "run", "sitDown", "sit", "standUp", "emote"];
const EMOTES = ["none", "wave", "dance", "clap", "laugh", "jump", "cheer", "guitar"];
const KINDS = ["voice", "group"];
const DESKTOP_APPS = new Set(["web", "electron"]);

/**
 * Feature gate. Phase 1: admins only until the owner opens it (publicEnabled).
 * Mobile clients (iOS, Android, Watch) never get the world.
 */
function canUseWorld({ isAdmin = false, app = "", publicEnabled = false } = {}) {
  const platform = String(app || "web").toLowerCase();
  if (!DESKTOP_APPS.has(platform)) return { ok: false, reason: "platform" };
  if (!isAdmin && !publicEnabled) return { ok: false, reason: "flag" };
  return { ok: true };
}

function isAdminRow(row, user) {
  return Boolean(row?.is_admin) || row?.username === "admin" || user?.username === "admin";
}

/** Room key for one live call. */
function roomKey(kind, id) {
  return `world:${kind}:${id}`;
}

function cleanId(value) {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s || s.length > 80 || !/^[A-Za-z0-9_-]+$/.test(s)) return "";
  return s;
}

/**
 * A user may enter the world of a call only while they are in that live call:
 * a participant of the server voice channel or of the group call.
 */
function authorizeWorldJoin({ kind, id, userId, activeGroupCalls, activeServerVoiceCalls } = {}) {
  if (!KINDS.includes(kind)) return { ok: false, reason: "kind" };
  const cid = cleanId(id);
  const uid = userId == null ? "" : String(userId);
  if (!cid || !uid) return { ok: false, reason: "bad_request" };
  if (kind === "group") {
    const call = activeGroupCalls?.get?.(cid);
    const inCall = Boolean(call?.participants?.has?.(uid));
    return inCall ? { ok: true, key: roomKey(kind, cid) } : { ok: false, reason: "not_in_call" };
  }
  const call = activeServerVoiceCalls?.get?.(cid);
  const inCall = Boolean(call?.participants?.has?.(uid));
  return inCall ? { ok: true, key: roomKey(kind, cid) } : { ok: false, reason: "not_in_call" };
}

function finite(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function round(v, digits) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function wrapAngle(a) {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/**
 * Validate one client snapshot. Returns null for garbage. When `prev` is given
 * (last accepted snapshot and its time) a jump faster than MAX_SPEED_MPS is
 * pulled back along the same direction, so a modified client cannot teleport.
 */
function sanitizeSnapshot(raw, prev = null, nowMs = Date.now()) {
  if (!Array.isArray(raw) || raw.length < 5 || raw.length > 12) return null;
  let x = clamp(finite(raw[0]), BOUNDS.minX, BOUNDS.maxX);
  let y = clamp(finite(raw[1]), BOUNDS.minY, BOUNDS.maxY);
  let z = clamp(finite(raw[2]), BOUNDS.minZ, BOUNDS.maxZ);
  const yaw = wrapAngle(finite(raw[3]));
  const stateIdx = Math.trunc(finite(raw[4], -1));
  if (stateIdx < 0 || stateIdx >= STATES.length) return null;
  let emote = Math.trunc(finite(raw[5], 0));
  if (emote < 0 || emote >= EMOTES.length) emote = 0;
  const emoteSeq = clamp(Math.trunc(finite(raw[6], 0)), 0, 255);
  let seat = Math.trunc(finite(raw[7], -1));
  if (seat < -1 || seat > 63) seat = -1;

  if (prev && Array.isArray(prev.snap)) {
    const dt = Math.max(0.05, Math.min(2, (nowMs - prev.at) / 1000));
    const maxStep = MAX_SPEED_MPS * dt + TELEPORT_SLACK_M;
    const dx = x - prev.snap[0];
    const dy = y - prev.snap[1];
    const dz = z - prev.snap[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > maxStep && dist > 0) {
      const k = maxStep / dist;
      x = prev.snap[0] + dx * k;
      y = prev.snap[1] + dy * k;
      z = prev.snap[2] + dz * k;
    }
  }
  return [round(x, 2), round(y, 2), round(z, 2), round(yaw, 3), stateIdx, emote, emoteSeq, seat];
}

/** Token bucket; `take()` is false when the caller is over its rate. */
function createRateLimiter({ ratePerSec, burst, now = () => Date.now() }) {
  let tokens = burst;
  let last = now();
  return {
    take(cost = 1) {
      const t = now();
      tokens = Math.min(burst, tokens + ((t - last) / 1000) * ratePerSec);
      last = t;
      if (tokens < cost) return false;
      tokens -= cost;
      return true;
    },
  };
}

function cleanChat(text) {
  const s = String(text == null ? "" : text)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.length > CHAT_MAX_LEN ? s.slice(0, CHAT_MAX_LEN) : s;
}

/**
 * In-memory rooms. One per live call that has at least one person in the world.
 * Snapshots are collected and flushed by the caller at SNAP_HZ as one batch.
 */
class WorldRooms {
  constructor({ maxAvatars = MAX_AVATARS, now = () => Date.now() } = {}) {
    this.maxAvatars = maxAvatars;
    this.now = now;
    this.rooms = new Map(); // key -> { kind, id, members: Map<userId, member>, dirty: Set<userId> }
  }

  room(key) {
    return this.rooms.get(key) || null;
  }

  join(key, { kind, id, userId, socketId, profile }) {
    let room = this.rooms.get(key);
    if (!room) {
      room = { kind, id, members: new Map(), dirty: new Set() };
      this.rooms.set(key, room);
    }
    const uid = String(userId);
    const existing = room.members.get(uid);
    if (!existing && room.members.size >= this.maxAvatars) {
      if (room.members.size === 0) this.rooms.delete(key);
      return { ok: false, reason: "full" };
    }
    const member = {
      userId: uid,
      socketId,
      profile: profile || { id: uid },
      snap: existing?.snap || null,
      at: existing?.at || 0,
      joinedAt: existing?.joinedAt || this.now(),
    };
    room.members.set(uid, member);
    return { ok: true, member, replaced: existing ? existing.socketId : null };
  }

  leave(key, userId, socketId = null) {
    const room = this.rooms.get(key);
    if (!room) return false;
    const uid = String(userId);
    const m = room.members.get(uid);
    if (!m) return false;
    if (socketId && m.socketId !== socketId) return false; // a newer tab took over
    room.members.delete(uid);
    room.dirty.delete(uid);
    if (room.members.size === 0) this.rooms.delete(key);
    return true;
  }

  update(key, userId, raw) {
    const room = this.rooms.get(key);
    const m = room?.members.get(String(userId));
    if (!m) return null;
    const t = this.now();
    const snap = sanitizeSnapshot(raw, m.snap ? { snap: m.snap, at: m.at } : null, t);
    if (!snap) return null;
    m.snap = snap;
    m.at = t;
    room.dirty.add(m.userId);
    return snap;
  }

  /** Changed snapshots since the last flush, as [[userId, ...snap], ...]. */
  flush(key) {
    const room = this.rooms.get(key);
    if (!room || room.dirty.size === 0) return [];
    const out = [];
    for (const uid of room.dirty) {
      const m = room.members.get(uid);
      if (m?.snap) out.push([uid, ...m.snap]);
    }
    room.dirty.clear();
    return out;
  }

  roster(key) {
    const room = this.rooms.get(key);
    if (!room) return [];
    return Array.from(room.members.values()).map((m) => ({
      ...m.profile,
      id: m.userId,
      snap: m.snap,
    }));
  }

  keys() {
    return Array.from(this.rooms.keys());
  }
}

module.exports = {
  MAX_AVATARS,
  SNAP_HZ,
  SNAP_INTERVAL_MS,
  MAX_SPEED_MPS,
  STATES,
  EMOTES,
  KINDS,
  CHAT_MAX_LEN,
  canUseWorld,
  isAdminRow,
  roomKey,
  authorizeWorldJoin,
  sanitizeSnapshot,
  createRateLimiter,
  cleanChat,
  wrapAngle,
  WorldRooms,
};
