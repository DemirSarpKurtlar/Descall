/**
 * Fluid-interface physics shared by every gesture and spring in the app.
 *
 * Pure math (no DOM, no React) so it runs in Node selftests. Follows
 * /workspace/design/apple-design.md ("Designing Fluid Interfaces", WWDC 2018):
 *   - project():     Apple's momentum projection (exponential deceleration)
 *   - rubberband():  UIScrollView-style progressive resistance (c = 0.55)
 *   - createSpring(): damping-ratio + response spring that starts from the live
 *                    value and velocity, so any motion can be grabbed again.
 *
 * Units: px and ms. Velocities are px/ms (0.45 px/ms = 450 px/s).
 * Extracted from lib/edgeSwipeBack.js (2.9.151); that module re-exports these.
 */

/** Apple's scroll deceleration rate (UIScrollView.DecelerationRate.normal). */
export const DECELERATION_NORMAL = 0.998;
/** Snappier deceleration (UIScrollView.DecelerationRate.fast). */
export const DECELERATION_FAST = 0.99;
/** UIScrollView rubber-band constant. */
export const RUBBER_BAND_CONSTANT = 0.55;
/** Velocity is measured over the last few samples inside this window (ms). */
export const VELOCITY_WINDOW_MS = 90;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Newest sample vs the oldest one inside the window. samples: [{ x, t }]. Returns px/ms. */
export function computeVelocity(samples, windowMs = VELOCITY_WINDOW_MS) {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[samples.length - 2];
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (!(dt > 0)) return 0;
  return (last.x - first.x) / dt;
}

/**
 * Apple's momentum projection (Designing Fluid Interfaces sample code):
 * distance a flick would travel under scroll-like exponential deceleration.
 * Velocity in px/s, result in px.
 */
export function project(velocityPxPerSec, decelerationRate = DECELERATION_NORMAL) {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: follows less the further you pull. */
export function rubberband(overshoot, dimension, constant = RUBBER_BAND_CONSTANT) {
  if (!(dimension > 0)) return 0;
  const o = Math.abs(overshoot);
  const r = (o * dimension * constant) / (dimension + constant * o);
  return overshoot < 0 ? -r : r;
}

/** Inverse of rubberband(): the raw finger travel that shows `displayed` px. */
export function rubberbandInverse(displayed, dimension, constant = RUBBER_BAND_CONSTANT) {
  if (!(dimension > 0)) return 0;
  const x = Math.min(Math.abs(displayed), dimension * 0.999);
  const o = (x * dimension) / (constant * (dimension - x));
  return displayed < 0 ? -o : o;
}

/**
 * Value inside [min, max] follows 1:1; past either bound it rubber-bands.
 * `dimension` scales the resistance (usually the element/viewport size).
 */
export function rubberbandClamp(value, min, max, dimension, constant = RUBBER_BAND_CONSTANT) {
  if (value < min) return min + rubberband(value - min, dimension, constant);
  if (value > max) return max + rubberband(value - max, dimension, constant);
  return value;
}

/** Snap target nearest to the projected resting point (momentum projection, §6). */
export function nearestSnap(position, velocityPxPerMs, snapPoints, decelerationRate = DECELERATION_NORMAL) {
  const points = Array.isArray(snapPoints) ? snapPoints.filter(Number.isFinite) : [];
  if (!points.length) return position;
  const projected = position + project((velocityPxPerMs || 0) * 1000, decelerationRate);
  let best = points[0];
  for (const p of points) if (Math.abs(p - projected) < Math.abs(best - projected)) best = p;
  return best;
}

/**
 * Spring with Apple's designer parameters. Position px, velocity px/ms.
 * `response` ≈ the settle time constant in ms; `dampingRatio` 1 = no overshoot.
 * restDelta/restSpeed end the motion (defaults suit px; use ~0.001 for scale/opacity).
 * Optional min/max are physical bounds the value never leaves (reaching the
 * target bound ends the motion).
 */
export function createSpring({ from, to, velocity = 0, response = 330, dampingRatio = 1, min = -Infinity, max = Infinity, restDelta = 0.5, restSpeed = 0.02 }) {
  const omega = (2 * Math.PI) / Math.max(1, response); // rad/ms
  const zeta = dampingRatio;
  let x = from;
  let v = velocity;
  let done = Math.abs(to - from) < restDelta && Math.abs(velocity) < restSpeed;
  const lo = Math.min(min, from, to);
  const hi = Math.max(max, from, to);
  return {
    get value() {
      return x;
    },
    get velocity() {
      return v;
    },
    get done() {
      return done;
    },
    /** Advance by dt ms; returns the new position. Semi-implicit Euler in 4 ms substeps. */
    step(dt) {
      if (done) return x;
      let remaining = clamp(dt, 0, 64);
      while (remaining > 0) {
        const h = Math.min(4, remaining);
        const accel = -omega * omega * (x - to) - 2 * zeta * omega * v;
        v += accel * h;
        x += v * h;
        remaining -= h;
      }
      if (x <= lo || x >= hi || (to === hi && x >= to) || (to === lo && x <= to)) {
        const clamped = clamp(x, lo, hi);
        if ((to === hi && clamped >= to) || (to === lo && clamped <= to)) {
          x = to;
          v = 0;
          done = true;
          return x;
        }
        x = clamped;
        if ((to - x) * v < 0) v = 0;
      }
      if (Math.abs(to - x) < restDelta && Math.abs(v) < restSpeed) {
        x = to;
        v = 0;
        done = true;
      }
      return x;
    },
  };
}

/** Linear-in-time tween with an ease, used for reduced-motion fades. */
export function easeOutCubic(t) {
  const c = clamp(t, 0, 1);
  return 1 - (1 - c) ** 3;
}
