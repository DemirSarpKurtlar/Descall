/**
 * iOS-style edge swipe-back: pure gesture state machine + physics.
 *
 * No DOM and no React here, so the thresholds, velocity tracking, direction
 * lock and release decision are unit-tested in isolation
 * (edgeSwipeBack.selftest.mjs). The DOM driver lives in
 * hooks/useEdgeSwipeBack.js.
 *
 * Units: px, ms. Velocities are px/ms (0.45 px/ms = 450 px/s).
 */

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
  /** Release past this fraction of the width completes. */
  completeRatio: 0.38,
  /** A flick faster than this completes (or, when backwards, cancels) regardless of distance. */
  flickVelocity: 0.45,
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

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

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

/** Least-squares-free velocity: newest sample vs the oldest one inside the window. */
export function computeVelocity(samples, windowMs = SWIPE_BACK_DEFAULTS.velocityWindowMs) {
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

/** "complete" or "cancel" for a release at x with horizontal velocity v (px/ms). */
export function releaseDecision({ x, width, velocity = 0 }, options = SWIPE_BACK_DEFAULTS) {
  if (!(width > 0) || !(x > 0)) return "cancel";
  const flick = options.flickVelocity ?? SWIPE_BACK_DEFAULTS.flickVelocity;
  const ratio = options.completeRatio ?? SWIPE_BACK_DEFAULTS.completeRatio;
  if (velocity <= -flick) return "cancel";
  if (velocity >= flick) return "complete";
  return x >= width * ratio ? "complete" : "cancel";
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
    return { phase: PHASE.IDLE, zone: null, startX: 0, startY: 0, originX: 0, x: 0, width: 0, samples: [] };
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
    begin({ x, y, t, width, zone }) {
      state = { ...idleState(), phase: PHASE.PENDING, zone, startX: x, startY: y, width, originX: 0, x: 0 };
      pushSample(0, t);
      return state;
    },
    /**
     * A touch caught a page that is still animating (interruptible settle):
     * skip the axis lock and follow the finger from the page's current x.
     */
    grab({ x, y, t, width, fromX }) {
      state = { ...idleState(), phase: PHASE.DRAGGING, zone: "catch", startX: x, startY: y, width, originX: fromX, x: fromX };
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
      const next = clamp(state.originX + dx, 0, state.width);
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
      state = idleState();
      if (cancelled) return { type: "cancel", x, velocity: 0 };
      return { type: releaseDecision({ x, width, velocity }, opts), x, velocity };
    },
    reset() {
      state = idleState();
    },
  };
}

/**
 * Critically damped spring (UIKit-like: no overshoot, so the page never
 * bounces past the edge and shows a gap). Position px, velocity px/ms.
 * `response` ≈ the settle time constant in ms (UIKit's spring "response").
 */
export function createSpring({ from, to, velocity = 0, response = 330, dampingRatio = 1 }) {
  const omega = (2 * Math.PI) / Math.max(1, response); // rad/ms
  const zeta = dampingRatio;
  let x = from;
  let v = velocity;
  let done = Math.abs(to - from) < 0.5 && Math.abs(velocity) < 0.02;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
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
      // Never travel outside the from→to segment (a flick could overshoot the target edge).
      if (x <= lo || x >= hi) {
        const clamped = clamp(x, lo, hi);
        if (clamped === to) {
          x = to;
          v = 0;
          done = true;
          return x;
        }
        x = clamped;
        if ((to - x) * v < 0) v = 0;
      }
      if (Math.abs(to - x) < 0.5 && Math.abs(v) < 0.02) {
        x = to;
        v = 0;
        done = true;
      }
      return x;
    },
  };
}

/** Linear-in-time tween with an ease, used for the reduced-motion fade. */
export function easeOutCubic(t) {
  const c = clamp(t, 0, 1);
  return 1 - (1 - c) ** 3;
}
