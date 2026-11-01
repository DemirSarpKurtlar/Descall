/**
 * Snapshot interpolation for remote avatars (pure, no Babylon).
 *
 * The server stamps every batch with its clock (`t`). Each client keeps a
 * running estimate of (serverTime - localTime) and renders remote avatars
 * INTERP_DELAY_MS behind the newest server time, interpolating between the two
 * snapshots around that render time. Position is linear, yaw takes the short
 * way round. Discrete fields (state, emote, seat) switch at the later snapshot.
 * When the buffer runs dry the avatar holds its last pose for a short time
 * (extrapolating at most EXTRAPOLATE_MS), never jumping.
 */

export const DEFAULT_DELAY_MS = 100;
export const EXTRAPOLATE_MS = 120;
const MAX_BUFFER = 32;

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Server clock offset estimate: keeps the smallest observed offset (least network delay), slowly forgetting. */
export function createClock() {
  let offset = null;
  return {
    observe(serverT, localT) {
      const o = serverT - localT;
      // o = trueOffset - networkDelay: the largest value is the least delayed sample
      if (offset == null || o > offset) offset = o;
      else offset = offset * 0.98 + o * 0.02;
      return offset;
    },
    serverNow(localT) {
      return offset == null ? localT : localT + offset;
    },
    get offset() {
      return offset;
    },
  };
}

export function createSnapshotBuffer({ delayMs = DEFAULT_DELAY_MS } = {}) {
  const items = []; // { t, s } sorted by t

  function push(t, s) {
    if (!s || !Number.isFinite(t)) return;
    if (items.length && t <= items[items.length - 1].t) {
      // out of order or duplicate: insert in place (rare on a socket), drop exact dupes
      const i = items.findIndex((it) => it.t >= t);
      if (i >= 0 && items[i].t === t) {
        items[i] = { t, s };
        return;
      }
      items.splice(i < 0 ? items.length : i, 0, { t, s });
    } else {
      items.push({ t, s });
    }
    while (items.length > MAX_BUFFER) items.shift();
  }

  /** Pose at server time `now - delay`. Returns null before the first snapshot. */
  function sample(serverNow) {
    if (!items.length) return null;
    const rt = serverNow - delayMs;
    // drop snapshots we will never need again (keep one before rt)
    while (items.length > 2 && items[1].t <= rt) items.shift();
    const a = items[0];
    if (items.length === 1 || rt <= a.t) {
      return { ...a.s, t: rt, interpolated: false };
    }
    const b = items[1];
    if (rt >= b.t) {
      // ran past the newest snapshot: extrapolate briefly along the last segment, then hold
      const prev = a;
      const dt = Math.min(EXTRAPOLATE_MS, rt - b.t);
      const span = Math.max(1, b.t - prev.t);
      const k = dt / span;
      return {
        ...b.s,
        x: b.s.x + (b.s.x - prev.s.x) * k,
        y: b.s.y,
        z: b.s.z + (b.s.z - prev.s.z) * k,
        yaw: b.s.yaw,
        t: rt,
        interpolated: false,
      };
    }
    const k = (rt - a.t) / Math.max(1, b.t - a.t);
    return {
      ...b.s,
      x: a.s.x + (b.s.x - a.s.x) * k,
      y: a.s.y + (b.s.y - a.s.y) * k,
      z: a.s.z + (b.s.z - a.s.z) * k,
      yaw: lerpAngle(a.s.yaw, b.s.yaw, k),
      t: rt,
      interpolated: true,
    };
  }

  return {
    push,
    sample,
    get size() {
      return items.length;
    },
    clear() {
      items.length = 0;
    },
  };
}
