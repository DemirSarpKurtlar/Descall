/**
 * 3D world wire format (mirror of backend/lib/world3d/worldCore.js; protocol.selftest.mjs
 * keeps the two lists identical).
 *
 * Snapshot: [x, y, z, yaw, state, emote, emoteSeq, seat]
 */

export const MAX_AVATARS = 16;
export const SNAP_HZ = 10;
export const SNAP_INTERVAL_MS = Math.round(1000 / SNAP_HZ);
export const INTERP_DELAY_MS = 100;

export const STATES = ["idle", "walk", "run", "sitDown", "sit", "standUp", "emote"];
export const EMOTES = ["none", "wave", "dance", "clap", "laugh", "jump", "cheer"];

export const STATE = Object.freeze(Object.fromEntries(STATES.map((s, i) => [s, i])));
export const EMOTE = Object.freeze(Object.fromEntries(EMOTES.map((s, i) => [s, i])));

function r(v, d) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export function encodeSnapshot({ x, y, z, yaw, state, emote = 0, emoteSeq = 0, seat = -1 }) {
  return [r(x, 2), r(y, 2), r(z, 2), r(yaw, 3), state | 0, emote | 0, emoteSeq & 255, seat | 0];
}

export function decodeSnapshot(arr) {
  if (!Array.isArray(arr) || arr.length < 8) return null;
  const [x, y, z, yaw, state, emote, emoteSeq, seat] = arr.map(Number);
  if (![x, y, z, yaw].every(Number.isFinite)) return null;
  return { x, y, z, yaw, state, emote, emoteSeq, seat };
}
