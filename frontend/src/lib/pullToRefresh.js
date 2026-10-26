/**
 * Pull-to-refresh for the mobile lists (chats, groups, servers, friends,
 * activity, calls).
 *
 * Feel (apple-design.md):
 * - The list follows the finger 1:1 up to the trigger point, then
 *   rubber-bands (rubberband(), c = 0.55) so it can always be pulled a bit
 *   further but never runs away.
 * - Refresh starts the moment the pull crosses the threshold, like
 *   UIRefreshControl, with the haptic on that same move event.
 * - Release springs (critically damped) to the spinner's resting slot while
 *   the fetch runs, then back to 0. Reduce Motion: no spring, the list
 *   returns at once and the spinner fades.
 * - Only claims a touch that starts with the list at the very top and moves
 *   down. A sideways move (swipe-back, row swipe) or an upward move stays a
 *   normal scroll.
 *
 * `createPullMachine` is pure (unit-tested). `attachPullToRefresh` is the
 * touch driver for one scroller.
 */

import { rubberband } from "./fluid/physics.js";
import { createValueAnimator } from "./fluid/animator.js";
import { SPRINGS } from "./fluid/springs.js";

export const PULL_DEFAULTS = Object.freeze({
  /** Movement before the gesture is decided (same scale as swipe-back lockSlop). */
  slop: 8,
  /** Displayed pull that starts a refresh (px). */
  threshold: 64,
  /** Where the list rests while the spinner turns (px). */
  hold: 52,
  /** The spinner stays at least this long so a fast reply does not flash. */
  minSpinMs: 450,
  /** Rubber-band dimension past the threshold (px). */
  dimension: 420,
});

/** Displayed offset for a raw finger distance: 1:1, then rubber band. */
export function pullOffset(raw, { threshold = PULL_DEFAULTS.threshold, dimension = PULL_DEFAULTS.dimension } = {}) {
  const r = Math.max(0, Number(raw) || 0);
  if (r <= threshold) return r;
  return threshold + rubberband(r - threshold, dimension);
}

export function createPullMachine(options = {}) {
  const opts = { ...PULL_DEFAULTS, ...options };
  let phase = "idle"; // idle | pending | pulling | yielded
  let refreshing = false;
  let x0 = 0;
  let y0 = 0;
  let base = 0;
  let offset = 0;

  return {
    get phase() {
      return phase;
    },
    get refreshing() {
      return refreshing;
    },
    get offset() {
      return offset;
    },
    get options() {
      return opts;
    },
    /** Touch down. `atTop`: the list is scrolled to the very top. `current`: displayed offset now. */
    begin({ x, y, atTop, current = 0 }) {
      if (!atTop) {
        phase = "yielded";
        return { claim: false };
      }
      phase = "pending";
      x0 = x;
      y0 = y;
      base = Math.max(0, current);
      return { claim: false };
    },
    move({ x, y, atTop = true }) {
      if (phase === "idle" || phase === "yielded") return { claim: false, offset, triggered: false };
      const dx = x - x0;
      const dy = y - y0;
      if (phase === "pending") {
        if (Math.abs(dx) > opts.slop && Math.abs(dx) > Math.abs(dy)) {
          phase = "yielded";
          return { claim: false, offset, triggered: false };
        }
        if (dy < -opts.slop || (!atTop && base === 0)) {
          phase = "yielded";
          return { claim: false, offset, triggered: false };
        }
        // Still deciding, but a downward move at the top must not start the
        // native bounce: once iOS starts scrolling, touchmove can no longer be
        // cancelled and the list would move twice.
        if (dy <= opts.slop) return { claim: false, block: dy > 0 && Math.abs(dy) >= Math.abs(dx), offset, triggered: false };
        // Decided: pull. Measure from here so the list does not jump by the slop.
        phase = "pulling";
        y0 = y;
      }
      const raw = base > 0 ? base + (y - y0) : y - y0;
      offset = pullOffset(raw, opts);
      let triggered = false;
      if (!refreshing && offset >= opts.threshold) {
        refreshing = true;
        triggered = true;
      }
      return { claim: true, offset, triggered };
    },
    /** The platform already scrolls this touch; give it up. */
    cancel() {
      if (phase === "pulling") offset = refreshing ? opts.hold : 0;
      phase = "yielded";
    },
    /** Finger up. Returns where the list should settle. */
    end() {
      const wasPulling = phase === "pulling";
      phase = "idle";
      const target = refreshing ? opts.hold : 0;
      if (wasPulling) offset = target;
      return { target, wasPulling };
    },
    /** The fetch finished. Returns the settle target (0) unless a finger is still down. */
    finish() {
      refreshing = false;
      if (phase === "pulling") return { target: null };
      offset = 0;
      return { target: 0 };
    },
  };
}

const SPOKES = 8;

/** Spokes visible for a pull progress 0..1 (UIRefreshControl draws them in as you pull). */
export function spokesForProgress(p) {
  const c = Math.max(0, Math.min(1, Number(p) || 0));
  return Math.round(c * SPOKES);
}

function prefersReducedMotion(win) {
  try {
    return Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

function defaultAtTop(scroller, win) {
  const doc = win?.document;
  const pageY = Number(win?.scrollY ?? doc?.scrollingElement?.scrollTop ?? 0) || 0;
  return (scroller?.scrollTop ?? 0) <= 0 && pageY <= 0;
}

/**
 * Wire one scroller. `track` moves, `indicator` is the spinner slot above it.
 * `onRefresh` returns a promise (the real refetch). Returns a cleanup.
 */
export function attachPullToRefresh(scroller, { track, indicator, onRefresh, onHaptic, onState, isAtTop, win = typeof window !== "undefined" ? window : null, options } = {}) {
  if (!scroller || !track) return () => {};
  const machine = createPullMachine(options);
  const { threshold, hold, minSpinMs } = machine.options;
  let touching = false;
  let lastSpokes = -1;

  const paint = (v) => {
    const y = Math.max(0, v);
    // Relative `top`, not a transform: a transform would become the containing
    // block of fixed children inside lists (the Calls filter chips) and move them.
    track.style.top = y > 0.25 ? `${y.toFixed(2)}px` : "";
    if (!indicator) return;
    const progress = machine.refreshing ? 1 : Math.min(1, y / threshold);
    // Fades in once there is room for it, sits a little below the gap's middle
    // so it clears pinned chrome above the list (Calls filter chips).
    indicator.style.opacity = String(Math.max(0, Math.min(1, (y - 16) / 24)));
    indicator.style.transform = `translate3d(-50%, ${(y / 2 - 10).toFixed(2)}px, 0)`;
    const n = machine.refreshing ? SPOKES : spokesForProgress(progress);
    if (n !== lastSpokes) {
      lastSpokes = n;
      indicator.setAttribute("data-spokes", String(n));
    }
  };
  const anim = createValueAnimator(0, paint);

  const settle = (target) => {
    if (prefersReducedMotion(win)) {
      anim.set(target);
      return;
    }
    anim.to(target, { preset: SPRINGS.default });
  };

  const setState = (s) => {
    if (indicator) indicator.setAttribute("data-state", s);
    scroller.classList?.toggle?.("ptr-pulling", s === "pulling");
    onState?.(s);
  };

  const runRefresh = () => {
    setState("refreshing");
    const started = Date.now();
    let p;
    try {
      p = Promise.resolve(onRefresh?.());
    } catch (err) {
      p = Promise.reject(err);
    }
    p.catch(() => {}).then(() => {
      const wait = Math.max(0, minSpinMs - (Date.now() - started));
      setTimeout(() => {
        const { target } = machine.finish();
        setState(touching ? "pulling" : "idle");
        if (target !== null) settle(target);
      }, wait);
    });
  };

  const atTop = () => (isAtTop ? isAtTop() : defaultAtTop(scroller, win));

  const onStart = (e) => {
    if (e.touches?.length !== 1) return;
    const t = e.touches[0];
    touching = true;
    machine.begin({ x: t.clientX, y: t.clientY, atTop: atTop(), current: anim.value });
  };
  const onMove = (e) => {
    if (!touching || e.touches?.length !== 1) return;
    const t = e.touches[0];
    const wasPulling = machine.phase === "pulling";
    const r = machine.move({ x: t.clientX, y: t.clientY, atTop: atTop() });
    if (r.block && e.cancelable) e.preventDefault();
    if (!r.claim) return;
    if (!e.cancelable && !wasPulling) {
      // Native scrolling already owns this touch.
      machine.cancel();
      return;
    }
    if (e.cancelable) e.preventDefault();
    if (!machine.refreshing || r.triggered) setState("pulling");
    anim.set(r.offset);
    if (r.triggered) {
      onHaptic?.();
      runRefresh();
    }
  };
  const onEnd = () => {
    if (!touching) return;
    touching = false;
    const { target, wasPulling } = machine.end();
    if (!wasPulling) return;
    if (!machine.refreshing) setState("idle");
    settle(target);
  };

  scroller.addEventListener("touchstart", onStart, { passive: true });
  scroller.addEventListener("touchmove", onMove, { passive: false });
  scroller.addEventListener("touchend", onEnd, { passive: true });
  scroller.addEventListener("touchcancel", onEnd, { passive: true });
  setState("idle");
  paint(0);

  return () => {
    anim.stop();
    scroller.removeEventListener("touchstart", onStart);
    scroller.removeEventListener("touchmove", onMove);
    scroller.removeEventListener("touchend", onEnd);
    scroller.removeEventListener("touchcancel", onEnd);
    scroller.classList?.remove?.("ptr-pulling");
    track.style.top = "";
  };
}

export const PULL_HOLD = PULL_DEFAULTS.hold;
