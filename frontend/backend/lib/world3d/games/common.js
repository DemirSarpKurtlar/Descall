"use strict";

/**
 * Shared pieces of the 3D world table games (Oyun odası).
 *
 * Every engine is a pure, deterministic state machine:
 *   - state is a plain JSON value (persistable, cloneable, comparable);
 *   - every function returns a new state and never mutates its input;
 *   - randomness and time come in through `ctx` ({ rng, now }), never from globals,
 *     so the server passes crypto randomness and the clock while tests pass a
 *     seeded RNG and a fake clock and replay games exactly.
 *
 * Result shape of every mutating call: { state, events, error }.
 *   error === null on success. On failure state is the input state (unchanged)
 *   and events is empty.
 *
 * Events are broadcast-safe by construction: anything that only one player may
 * see goes in `event.private = { playerId, ...data }` and `eventsFor()` strips it
 * for everybody else.
 *
 * No socket, database or timer code lives here or in the engines.
 */

const crypto = require("crypto");

const SYSTEM = null; // playerId of server-originated actions (timeouts, phase changes)

// ---------------------------------------------------------------- RNG

/** 128-bit string hash (cyrb128) used to seed sfc32. */
function hashSeed(seed) {
  const str = String(seed);
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/**
 * Seeded RNG (sfc32). Same seed, same sequence, on every platform.
 * int(n) returns an integer in [0, n); float() returns [0, 1).
 */
function createSeededRng(seed) {
  let [a, b, c, d] = hashSeed(seed);
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return {
    float: next,
    int(n) {
      if (!(n > 0)) throw new RangeError("rng.int needs n > 0");
      return Math.floor(next() * n);
    },
  };
}

/** Server RNG: crypto.randomInt, unbiased. */
const cryptoRng = {
  int(n) {
    if (!(n > 0)) throw new RangeError("rng.int needs n > 0");
    return crypto.randomInt(n);
  },
  float() {
    return crypto.randomInt(281474976710655) / 281474976710655;
  },
};

function rngOf(ctx) {
  return (ctx && ctx.rng) || cryptoRng;
}

function nowOf(ctx) {
  const t = ctx && ctx.now;
  if (typeof t === "function") return t();
  if (typeof t === "number") return t;
  return Date.now();
}

/** In-place Fisher-Yates. */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// ---------------------------------------------------------------- results

/**
 * Deep copy of a plain JSON value (states are plain objects, arrays, strings,
 * numbers, booleans and null). Much faster than structuredClone for this shape.
 */
function clone(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const n = v.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = v[i];
      out[i] = x === null || typeof x !== "object" ? x : clone(x);
    }
    return out;
  }
  const out = {};
  for (const k in v) {
    const x = v[k];
    if (x === undefined) continue;
    out[k] = x === null || typeof x !== "object" ? x : clone(x);
  }
  return out;
}

function ok(state, events = []) {
  return { state, events, error: null };
}

function fail(state, error) {
  return { state, events: [], error };
}

/** Strip private payloads of events for one viewer (null = spectator). */
function eventsFor(events, viewerId) {
  const out = [];
  for (const ev of events || []) {
    if (!ev) continue;
    const { private: priv, ...pub } = ev;
    if (priv && viewerId != null && String(priv.playerId) === String(viewerId)) {
      const { playerId: _drop, ...data } = priv;
      out.push({ ...pub, ...data });
    } else {
      out.push(pub);
    }
  }
  return out;
}

// ---------------------------------------------------------------- seats and members

/**
 * Common seat record (all engines):
 *   { playerId, name, kind: "human" | "bot", connected, autopilot, level }
 * `autopilot` is set by the table manager when a human stayed disconnected past
 * the grace period: a bot plays their turns until they come back.
 */
function emptySeat() {
  return { playerId: null, name: "", kind: null, connected: false, autopilot: false, level: null };
}

function humanSeat(playerId, name) {
  return { playerId: String(playerId), name: cleanName(name), kind: "human", connected: true, autopilot: false, level: null };
}

function botSeat(index, level) {
  return { playerId: `bot:${index}`, name: `Bot ${index + 1}`, kind: "bot", connected: true, autopilot: false, level: level || "medium" };
}

function cleanName(name) {
  const s = String(name == null ? "" : name)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > 40 ? s.slice(0, 40) : s;
}

function cleanPlayerId(id) {
  if (id == null) return "";
  const s = String(id).trim();
  if (!s || s.length > 80 || !/^[A-Za-z0-9_:-]+$/.test(s)) return "";
  return s;
}

function seatOf(state, playerId) {
  if (playerId == null) return -1;
  const id = String(playerId);
  return state.seats.findIndex((s) => s.playerId === id);
}

/** True when a bot decides for this seat (bot seat or autopiloted human). */
function botControlled(seat) {
  return Boolean(seat && seat.playerId && (seat.kind === "bot" || seat.autopilot));
}

/** Register a member (spectator until seated). */
function joinMember(state, player) {
  const id = cleanPlayerId(player && player.id);
  if (!id || id.startsWith("bot:")) return fail(state, "bad_player");
  const s = clone(state);
  const prev = s.members[id];
  s.members[id] = { name: cleanName(player.name) || (prev && prev.name) || id };
  return ok(s, prev ? [] : [{ type: "member", op: "join", playerId: id }]);
}

/**
 * Presence: connected / autopilot flags for a seated human. Used by the table
 * manager for reconnection; never changes turn order or hidden information.
 */
function setPresence(state, playerId, patch) {
  const i = seatOf(state, playerId);
  if (i < 0 || state.seats[i].kind !== "human") return fail(state, "not_seated");
  const s = clone(state);
  const seat = s.seats[i];
  if (patch && typeof patch.connected === "boolean") seat.connected = patch.connected;
  if (patch && typeof patch.autopilot === "boolean") seat.autopilot = patch.autopilot;
  // Coming back always hands the seat back to the human.
  if (patch && patch.connected === true && patch.autopilot !== true) seat.autopilot = false;
  return ok(s, [{ type: "presence", seat: i, connected: seat.connected, autopilot: seat.autopilot }]);
}

/** Deterministic pseudo-random delay for a timer key (timers(state) stays pure). */
function delayFor(key, base, spread) {
  const r = createSeededRng(`delay:${key}`);
  return humanDelay(r, base, spread);
}

function publicSeat(seat, index) {
  return {
    index,
    playerId: seat.playerId,
    name: seat.name,
    kind: seat.kind,
    connected: seat.connected,
    autopilot: seat.autopilot,
    level: seat.kind === "bot" ? seat.level : null,
  };
}

/** Human-feeling bot delay in ms. */
function humanDelay(rng, base, spread) {
  // Sum of two uniforms: a soft bell between base and base + spread.
  return Math.round(base + ((rng.float() + rng.float()) / 2) * spread);
}

function isInt(n) {
  return typeof n === "number" && Number.isInteger(n);
}

module.exports = {
  SYSTEM,
  hashSeed,
  createSeededRng,
  cryptoRng,
  rngOf,
  nowOf,
  shuffle,
  clone,
  ok,
  fail,
  eventsFor,
  emptySeat,
  humanSeat,
  botSeat,
  cleanName,
  cleanPlayerId,
  seatOf,
  botControlled,
  joinMember,
  setPresence,
  publicSeat,
  humanDelay,
  delayFor,
  isInt,
};
