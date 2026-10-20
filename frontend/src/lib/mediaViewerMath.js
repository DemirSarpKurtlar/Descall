/** Pure helpers for the chat image viewer (zoom/pan/dismiss maths). */
export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
export const DOUBLE_TAP_SCALE = 2.5;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Rubber band (Apple style): resistance grows with distance; d = drag, dim = viewport size. */
export function rubberBand(d, dim, c = 0.55) {
  if (!dim) return d * c;
  const s = Math.sign(d);
  const a = Math.abs(d);
  return s * (1 - 1 / ((a * c) / dim + 1)) * dim;
}

/** Zoom to `next` keeping the point (px, py) (relative to the stage centre) fixed. */
export function zoomAt(state, next, px, py) {
  const scale = clamp(next, MIN_SCALE, MAX_SCALE);
  const k = scale / state.scale;
  const x = px - (px - state.x) * k;
  const y = py - (py - state.y) * k;
  return scale === 1 ? { scale, x: 0, y: 0 } : { scale, x, y };
}

/** Keep the zoomed image covering the stage (no empty gutters beyond the edges). */
export function clampPan(state, imgW, imgH, stageW, stageH) {
  const maxX = Math.max(0, (imgW * state.scale - stageW) / 2);
  const maxY = Math.max(0, (imgH * state.scale - stageH) / 2);
  return { ...state, x: clamp(state.x, -maxX, maxX) + 0, y: clamp(state.y, -maxY, maxY) + 0 };
}

/** Swipe-down dismiss: far enough or fast enough (px, px/ms). */
export function shouldDismiss(dy, vy, stageH) {
  return dy > Math.min(140, stageH * 0.18) || (dy > 24 && vy > 0.6);
}

/** Horizontal gallery swipe → -1 (prev), 1 (next) or 0. */
export function swipeStep(dx, vx, stageW) {
  if (dx < -Math.min(90, stageW * 0.15) || (dx < -20 && vx < -0.5)) return 1;
  if (dx > Math.min(90, stageW * 0.15) || (dx > 20 && vx > 0.5)) return -1;
  return 0;
}
