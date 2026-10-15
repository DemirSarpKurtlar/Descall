/**
 * Horizontal shop-category strip.
 * apple-design.md §6 momentum projection, §9 rubber-band, §10 ~10px drag threshold.
 * Pure: no DOM, so the selftest can run it in Node.
 */
import { clamp, project, rubberbandClamp, DECELERATION_NORMAL } from "./fluid/physics.js";

export const CHIP_SLOP_PX = 10;
export const CHIP_PAGE_FRACTION = 0.72;

/** Pixels to add to the scroll offset. Positive moves content toward the start. */
export function wheelScrollDelta(event) {
  let dx = Number(event?.deltaX) || 0;
  let dy = Number(event?.deltaY) || 0;
  const mode = event?.deltaMode;
  if (mode === 1) {
    dx *= 16;
    dy *= 16;
  } else if (mode === 2) {
    dx *= event?.viewportWidth || 480;
    dy *= event?.viewportHeight || 640;
  }
  if (event?.shiftKey && Math.abs(dy) >= Math.abs(dx)) return dy;
  if (Math.abs(dx) > 0 && Math.abs(dx) >= Math.abs(dy)) return dx;
  if (dy) return dy;
  return 0;
}

/** 1:1 finger delta, with progressive resistance outside [min, max]. */
export function dragOffset(origin, delta, min, max, dimension) {
  return rubberbandClamp(origin + delta, min, max, Math.max(1, dimension || 0));
}

/** Where a flick comes to rest. Velocity is px/ms along the scroll offset. */
export function coastTarget(offset, velocityPxPerMs, min, max, decelerationRate = DECELERATION_NORMAL) {
  const projected = offset + project((velocityPxPerMs || 0) * 1000, decelerationRate);
  return clamp(projected, min, max);
}

export function overflowEdges(offset, max, epsilon = 1) {
  const limit = Math.max(0, max || 0);
  return {
    left: offset > epsilon,
    right: limit > epsilon && offset < limit - epsilon,
  };
}

/** Scroll offset that brings [tabStart, tabEnd] fully inside the viewport. */
export function revealOffset(offset, max, tabStart, tabEnd, viewSize, pad = 16) {
  const limit = Math.max(0, max || 0);
  const view = Math.max(0, viewSize || 0);
  let next = offset || 0;
  if (tabStart < next + pad) next = tabStart - pad;
  else if (tabEnd > next + view - pad) next = tabEnd - view + pad;
  return clamp(next, 0, limit);
}

export function pageOffset(offset, max, viewSize, direction) {
  const step = Math.max(48, (viewSize || 0) * CHIP_PAGE_FRACTION) * (direction < 0 ? -1 : 1);
  return clamp((offset || 0) + step, 0, Math.max(0, max || 0));
}

/**
 * Pointer sample against a pending drag.
 * Returns "pending", "lock", or "reject".
 */
export function classifyChipDrag(dx, dy, slop = CHIP_SLOP_PX) {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return "pending";
  if (Math.abs(dy) > Math.abs(dx)) return "reject";
  return "lock";
}
