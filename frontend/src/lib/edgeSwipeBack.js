/**
 * iOS-style edge swipe-back: pure gesture state machine + physics.
 *
 * No DOM and no React here, so the thresholds, velocity tracking, direction
 * lock and release decision are unit-tested in isolation
 * (edgeSwipeBack.selftest.mjs). The DOM driver lives in
 * hooks/useEdgeSwipeBack.js.
 *
 * Units: px, ms. Velocities are px/ms (0.45 px/ms = 450 px/s).
 *
 * Follows /workspace/design/apple-design.md (Apple "Designing Fluid
 * Interfaces"): ~10px hysteresis, 1:1 tracking, release decided by velocity
 * sign + momentum projection, velocity handed into a critically damped spring,
 * interruptible from the live value, rubber-band where there is no previous page.
 */

import {
  clamp,
  computeVelocity as computeVelocityBase,
  createSpring,
  easeOutCubic,
  project as projectBase,
  rubberband as rubberbandBase,
  rubberbandInverse as rubberbandInverseBase,
} from "./fluid/physics.js";

// Physics lives in lib/fluid/physics.js (shared with every glass gesture);
// re-exported here with the swipe-back defaults so callers/tests are unchanged.
export { clamp, createSpring, easeOutCubic };

export const SWIPE_BACK_DEFAULTS = Object.freeze({
  /** Touches that start this close to the left edge always qualify (even over horizontal scrollers). */
  edgeWidth: 28,
  /** Touches in the left part of the screen qualify too, unless they land on a horizontal scroller etc. */
  bodyZoneRatio: 0.5,
  /** Travel (px) before the gesture commits to an axis. */
  lockSlop: 10,
  /** From the edge the swipe only needs to be about as horizontal as vertical. */
  edgeDominance: 1,
  /** From the body it must be clearly horizontal (|dx| > 1.6·|dy|) so vertical scrolls never trigger it. */
  bodyDominance: 1.6,
  /** The projected resting point (release x + momentum) must pass this fraction of the width to complete. */
  completeRatio: 0.38,
  /** Below this |velocity| (px/ms) the finger counts as resting: position decides. Above it, the sign decides first. */
  restVelocity: 0.1,
  /** Apple's scroll deceleration rate for momentum projection. */
  decelerationRate: 0.998,
  /** Rubber-band constant (UIScrollView uses 0.55). */
  rubberBand: 0.55,
  /** Velocity is measured over the last few samples within this window. */
  velocityWindowMs: 90,
  /** The previous screen starts 30% to the left and slides to 0 (iOS parallax). */
  parallax: 0.3,
  /** Dim over the previous screen at the start of the swipe. */
  dimOpacity: 0.32,
});

export const PHASE = Object.freeze({
  IDLE: "idle",
  PENDING: "pending",
  DRAGGING: "dragging",
});

export function progressFor(x, width) {
  if (!(width > 0)) return 0;
  return clamp(x / width, 0, 1);
}

/**
 * Which start zone a touch belongs to, or null when the swipe must not start.
 * `edgeInset` is the left safe-area inset (landscape notch) added to the edge band.
 */
export function classifyStart(
  {
    x,
    width,
    blocked = false,
    disabled = false,
    hasSelection = false,
    onHorizontalScroller = false,
    onNoSwipeTarget = false,
    edgeInset = 0,
  },
  options = SWIPE_BACK_DEFAULTS,
) {
  if (disabled || blocked) return null;
  if (!(width > 0) || !Number.isFinite(x) || x < 0) return null;
  const edgeWidth = (options.edgeWidth ?? SWIPE_BACK_DEFAULTS.edgeWidth) + Math.max(0, edgeInset || 0);
  // A live text selection owns horizontal drags (handles / extend), even at the edge.
  if (hasSelection) return null;
  if (x <= edgeWidth) return "edge";
  const bodyZoneRatio = options.bodyZoneRatio ?? SWIPE_BACK_DEFAULTS.bodyZoneRatio;
  if (!(bodyZoneRatio > 0)) return null;
  if (x > width * bodyZoneRatio) return null;
  if (onHorizontalScroller || onNoSwipeTarget) return null;
  return "body";
}

/**
 * Axis decision after the finger moved (dx, dy) from the start point.
 * Returns "horizontal" (swipe-back owns the touch), "vertical"/"reverse"
 * (give it back to the page) or null (not decided yet).
 */
export function lockDirection(dx, dy, zone, options = SWIPE_BACK_DEFAULTS) {
  const slop = options.lockSlop ?? SWIPE_BACK_DEFAULTS.lockSlop;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < slop && ady < slop) return null;
  const dominance =
    zone === "edge"
      ? options.edgeDominance ?? SWIPE_BACK_DEFAULTS.edgeDominance
      : options.bodyDominance ?? SWIPE_BACK_DEFAULTS.bodyDominance;
  if (dx > 0 && adx >= slop && adx > ady * dominance) return "horizontal";
  if (dx < 0 && adx >= ady) return "reverse";
  return "vertical";
}

/**
 * "complete" or "cancel" for a release at x with horizontal velocity v (px/ms).
 * Velocity sign first (moving back = cancel, moving forward = it may commit),
 * then where the momentum would carry the page: release x + project(v).
 */
export function releaseDecision({ x, width, velocity = 0 }, options = SWIPE_BACK_DEFAULTS) {
  if (!(width > 0) || !(x > 0)) return "cancel";
  const rest = options.restVelocity ?? SWIPE_BACK_DEFAULTS.restVelocity;
  const ratio = options.completeRatio ?? SWIPE_BACK_DEFAULTS.completeRatio;
  const rate = options.decelerationRate ?? SWIPE_BACK_DEFAULTS.decelerationRate;
  if (velocity <= -rest) return "cancel";
  const projected = velocity >= rest ? x + project(velocity * 1000, rate) : x;
  return projected >= width * ratio ? "complete" : "cancel";
}

/** Transform/opacity values for one frame at finger position x. */
export function layerFrame(x, width, options = SWIPE_BACK_DEFAULTS, reduceMotion = false) {
  const p = progressFor(x, width);
  const parallax = options.parallax ?? SWIPE_BACK_DEFAULTS.parallax;
  const dim = options.dimOpacity ?? SWIPE_BACK_DEFAULTS.dimOpacity;
  if (reduceMotion) {
    // Reduced motion: nothing slides — the current screen fades over the previous one.
    return {
      progress: p,
      surfaceX: 0,
      surfaceOpacity: 1 - p,
      underlayX: 0,
      dimOpacity: dim * (1 - p),
      shadowOpacity: 0,
    };
  }
  return {
    progress: p,
    surfaceX: clamp(x, 0, width),
    surfaceOpacity: 1,
    underlayX: -parallax * width * (1 - p),
    dimOpacity: dim * (1 - p),
    // The edge shadow softens as the page leaves, like UIKit's pop.
    shadowOpacity: 1 - 0.6 * p,
  };
}

/**
 * Gesture state machine. Feed it begin/move/end and it tells the driver
 * what to do; it never touches the DOM.
 */
export function createSwipeBackMachine(options = SWIPE_BACK_DEFAULTS) {
  const opts = { ...SWIPE_BACK_DEFAULTS, ...options };
  let state = idleState();

  function idleState() {
    return { phase: PHASE.IDLE, zone: null, startX: 0, startY: 0, originX: 0, x: 0, width: 0, samples: [], canGoBack: true };
  }

  function pushSample(x, t) {
    state.samples.push({ x, t });
    if (state.samples.length > 8) state.samples.shift();
  }

  return {
    get state() {
      return state;
    },
    get options() {
      return opts;
    },
    /** A touch began in `zone` ("edge" / "body"); the axis is not known yet. */
    begin({ x, y, t, width, zone, canGoBack = true }) {
      state = { ...idleState(), phase: PHASE.PENDING, zone, startX: x, startY: y, width, originX: 0, x: 0, canGoBack };
      pushSample(0, t);
      return state;
    },
    /**
     * A touch caught a page that is still animating (interruptible settle):
     * skip the axis lock and follow the finger from the page's current x.
     */
    grab({ x, y, t, width, fromX, canGoBack = true }) {
      // originX lives in finger space; a rubber-banded page maps back through the inverse.
      const originX = canGoBack ? fromX : rubberbandInverse(fromX, width, opts.rubberBand);
      state = { ...idleState(), phase: PHASE.DRAGGING, zone: "catch", startX: x, startY: y, width, originX, x: fromX, canGoBack };
      pushSample(fromX, t);
      return state;
    },
    /** Returns { type: "none" | "lock" | "abort" | "drag", x } */
    move({ x, y, t }) {
      if (state.phase === PHASE.IDLE) return { type: "none", x: 0 };
      const dx = x - state.startX;
      const dy = y - state.startY;
      if (state.phase === PHASE.PENDING) {
        const lock = lockDirection(dx, dy, state.zone, opts);
        if (lock === null) return { type: "none", x: 0 };
        if (lock !== "horizontal") {
          state = idleState();
          return { type: "abort", reason: lock, x: 0 };
        }
        // Start from 0 instead of jumping by the slop distance — iOS hides the slop.
        state.phase = PHASE.DRAGGING;
        state.startX = x;
        state.startY = y;
        state.originX = 0;
        state.x = 0;
        state.samples = [];
        pushSample(0, t);
        return { type: "lock", x: 0 };
      }
      const raw = state.originX + dx;
      // No previous page: the page still follows, with progressive resistance, and always returns.
      const next = state.canGoBack ? clamp(raw, 0, state.width) : rubberband(Math.max(0, raw), state.width, opts.rubberBand);
      state.x = next;
      pushSample(next, t);
      return { type: "drag", x: next };
    },
    /** Returns { type: "none" } or { type: "complete" | "cancel", x, velocity } */
    end({ t, cancelled = false } = {}) {
      if (state.phase !== PHASE.DRAGGING) {
        state = idleState();
        return { type: "none" };
      }
      // A finger that stopped before lifting has no flick velocity.
      const last = state.samples[state.samples.length - 1];
      const stale = last && Number.isFinite(t) && t - last.t > opts.velocityWindowMs;
      const velocity = stale ? 0 : computeVelocity(state.samples, opts.velocityWindowMs);
      const x = state.x;
      const width = state.width;
      const canGoBack = state.canGoBack;
      state = idleState();
      if (cancelled) return { type: "cancel", x, velocity: 0 };
      if (!canGoBack) {
        // Nothing to go back to: always return. Hand off the page's own (resisted) velocity.
        const c = opts.rubberBand;
        const o = rubberbandInverse(x, width, c);
        const slope = (c * width * width) / (width + c * o) ** 2;
        return { type: "cancel", x, velocity: velocity * slope };
      }
      return { type: releaseDecision({ x, width, velocity }, opts), x, velocity };
    },
    reset() {
      state = idleState();
    },
  };
}

export function computeVelocity(samples, windowMs = SWIPE_BACK_DEFAULTS.velocityWindowMs) {
  return computeVelocityBase(samples, windowMs);
}

/** Apple's momentum projection. Velocity in px/s, result in px. */
export function project(velocityPxPerSec, decelerationRate = SWIPE_BACK_DEFAULTS.decelerationRate) {
  return projectBase(velocityPxPerSec, decelerationRate);
}

/** Progressive resistance past a boundary: follows less the further you pull. */
export function rubberband(overshoot, dimension, constant = SWIPE_BACK_DEFAULTS.rubberBand) {
  return rubberbandBase(overshoot, dimension, constant);
}

/** Inverse of rubberband(): the raw finger travel that shows `displayed` px. */
export function rubberbandInverse(displayed, dimension, constant = SWIPE_BACK_DEFAULTS.rubberBand) {
  return rubberbandInverseBase(displayed, dimension, constant);
}
