/**
 * Coin toss physics for the Coinflip v2 card (design/coinflip-v2/spec.md).
 * Pure functions, no DOM, so the curve is testable in node.
 *
 * Faces: rotateX 0° shows Yazı (heads, number face), 180° shows Tura (tails,
 * logo face). The server decides `face` and `rotations`; the client only
 * animates to it.
 */

export const TOSS = Object.freeze({
  flightMs: 1100,     // launch → first contact
  apexPx: 64,         // toss height in card px (keeps the face-on coin inside the stage, per b-mid-flip)
  spinDecay: 2.6,     // 1/s, exponential slow-down of the spin
  apexScale: 0.05,    // coin grows 5% at the apex (closer to camera)
  wobbleDeg: 6,       // rotateZ half-sine across the flight
  settleMs: 320,      // contact → rest
  bounceHz: 1 / 0.13, // |sin| humps of the landing bounce
  bounceDecay: 8.45,  // 1/s → second hump ≈ 1/3 of the first (≈9px → 3px)
  bounceAmp: 15.5,
  restTiltDeg: 14,    // resting on the table, edge sliver visible
  prespinDelayMs: 80, // start a pre-spin if the server is slower than this
  prespinTurnsPerS: 6,
});

const mod = (a, n) => ((a % n) + n) % n;

/** Resting angle of a face. */
export function faceAngle(face) {
  return face === "heads" ? 0 : 180;
}

/** Final angle ≥ start + rotations turns that shows `face`. */
export function landingAngle(startDeg, face, rotations = 6) {
  const turns = Math.max(1, Math.floor(Number(rotations) || 6));
  const base = startDeg + turns * 360;
  const want = faceAngle(face);
  return base + mod(want - mod(base, 360), 360);
}

/** Ballistic height (px, positive = up) at time t of a flight of length T. */
export function heightAt(tMs, T = TOSS.flightMs, apex = TOSS.apexPx) {
  if (tMs <= 0 || tMs >= T) return 0;
  const u = tMs / T;
  return 4 * apex * u * (1 - u);
}

/** Spin angle with exponential decay; exactly `end` at contact. */
export function spinAt(tMs, start, end, T = TOSS.flightMs, k = TOSS.spinDecay) {
  if (tMs <= 0) return start;
  if (tMs >= T) return end;
  const s = tMs / 1000;
  const S = T / 1000;
  return start + (end - start) * ((1 - Math.exp(-k * s)) / (1 - Math.exp(-k * S)));
}

/** Landing bounce height (px, up) after first contact; 0 once settled. */
export function bounceAt(tMs) {
  if (tMs <= 0 || tMs >= TOSS.settleMs) return 0;
  const s = tMs / 1000;
  return TOSS.bounceAmp * Math.exp(-TOSS.bounceDecay * s) * Math.abs(Math.sin(Math.PI * TOSS.bounceHz * s));
}

/** Contact shadow follows height. */
export function shadowFor(heightPx, apex = TOSS.apexPx) {
  const h = Math.min(1, Math.max(0, heightPx / apex));
  return { scale: 1 - 0.45 * h, opacity: 0.55 - 0.3 * h, blur: 3 + 4 * h };
}

/** Face brightness: dims to 0.84 edge-on. */
export function faceLight(thetaDeg) {
  return 0.84 + 0.16 * Math.abs(Math.cos((thetaDeg * Math.PI) / 180));
}

/**
 * Full frame at time t since launch (flight then settle).
 * Returns transform inputs for the coin and its shadow.
 */
export function tossFrame(tMs, { start, end, wobbleDir = 1 }) {
  const T = TOSS.flightMs;
  if (tMs < T) {
    const h = heightAt(tMs);
    const theta = spinAt(tMs, start, end);
    return {
      phase: "flight",
      y: -h,
      theta,
      scale: 1 + TOSS.apexScale * (h / TOSS.apexPx),
      rotZ: wobbleDir * TOSS.wobbleDeg * Math.sin(Math.PI * (tMs / T)),
      squash: 1,
      light: faceLight(theta),
      shadow: shadowFor(h),
      done: false,
    };
  }
  const st = tMs - T;
  const h = bounceAt(st);
  // 60ms squash on each contact (start of the settle and the second hump)
  const contact = st < 60 || (st > 130 && st < 190);
  return {
    phase: st >= TOSS.settleMs ? "rest" : "settle",
    y: -h,
    theta: end,
    scale: 1,
    rotZ: 0,
    squash: contact ? 0.96 : 1,
    light: 1,
    shadow: shadowFor(h),
    done: st >= TOSS.settleMs,
  };
}

/** Total animation length (flight + settle). */
export const TOSS_TOTAL_MS = TOSS.flightMs + TOSS.settleMs;

/** Should a finished round still animate when the card mounts? (fresh only) */
export function isFreshRound(updatedAt, now = Date.now(), windowMs = 6000) {
  const t = Number(updatedAt) || Date.parse(updatedAt) || 0;
  return t > 0 && now - t < windowMs;
}
