/**
 * Mobile tab-bar press-and-hold drag (iOS 26/27 selection pill).
 *
 * Pure decisions. The hook owns the pointer, the spring, and the DOM.
 * apple-design.md §2 (down, not up), §5 (velocity handoff), §6 (projection),
 * §9 (rubber-band), §10 (10px hysteresis, hold without delaying a tap),
 * §14 (reduced motion drops the lens and the spring).
 *
 * A plain tap never waits. The pill lifts on a ~250ms hold OR as soon as the
 * finger drags horizontally. Release projects momentum and snaps to a tab.
 */
import { DECELERATION_FAST, nearestSnap } from "./physics.js";

/** Long-press that lifts the pill when the finger has not dragged yet. */
export const TAB_HOLD_MS = 250;
/** Horizontal travel that lifts immediately, before the hold timer. */
export const TAB_SLOP_PX = 10;
/** Pill scale while lifted. Reduced motion stays at 1. */
export const TAB_LIFT_SCALE = 1.06;
/** Snappier than scroll: a one-tab flick lands about one tab ahead. */
export const TAB_DECEL = DECELERATION_FAST;
/** Above this (indexes per ms ≈ 2 tabs/s) the release is a flick, not a settle. */
export const TAB_FLICK_VELOCITY = 0.002;

/**
 * Pending finger. "lift" commits the drag, "reject" gives the gesture up
 * (mostly vertical), "pending" keeps waiting for the hold timer or more travel.
 */
export function classifyTabMove({ dx = 0, dy = 0, slop = TAB_SLOP_PX } = {}) {
  const ad = Math.abs(dx);
  const ac = Math.abs(dy);
  if (ad < slop && ac < slop) return "pending";
  if (ac > ad) return "reject";
  return "lift";
}

/** Tab under the pill. Rubber-banded values outside the range stay on the end tab. */
export function previewTabIndex(value, count) {
  const n = count | 0;
  if (n <= 0) return 0;
  const clamped = value < 0 ? 0 : value > n - 1 ? n - 1 : value;
  const index = Math.round(clamped);
  return index < 0 ? 0 : index > n - 1 ? n - 1 : index;
}

/**
 * Release target. `velocityPerMs` is indexes per millisecond (the drag
 * controller's unit). Momentum projection, then the nearest tab.
 */
export function tabReleaseTarget(value, velocityPerMs, count, decelerationRate = TAB_DECEL) {
  const n = count | 0;
  if (n <= 0) return 0;
  const points = [];
  for (let i = 0; i < n; i += 1) points.push(i);
  const target = nearestSnap(value, velocityPerMs, points, decelerationRate);
  const projected = previewTabIndex(target, n);
  // A tab bar is not a scroll view: momentum may carry one tab past the
  // finger, and no further. The pill still takes that velocity into the spring.
  const nearest = previewTabIndex(value, n);
  const delta = projected - nearest;
  if (delta > 1) return nearest + 1;
  if (delta < -1) return nearest - 1;
  return projected;
}

/** Underdamped only when the finger actually threw the pill. A slow release settles critically damped. */
export function tabReleasePreset(velocityPerMs) {
  return Math.abs(velocityPerMs || 0) >= TAB_FLICK_VELOCITY ? "flick" : "move";
}
