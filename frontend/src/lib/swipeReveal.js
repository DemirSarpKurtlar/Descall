// Pure geometry for the iPhone swipe-to-reveal rows (unit-tested).

// Glass action slot: 50px circle+label column, 6px gap, 6px/2px side padding.
export const GLASS_SWIPE_SLOT = 50;
export const GLASS_SWIPE_GAP = 6;
export const GLASS_SWIPE_PAD = 8;
/** Extra drag past full reveal that commits the destructive (last) action. */
export const FULL_SWIPE_EXTRA = 56;

/** Width that fits exactly `count` glass actions (no clipping at the edge). */
export function swipeActionsWidth(count, { slot = GLASS_SWIPE_SLOT, gap = GLASS_SWIPE_GAP, pad = GLASS_SWIPE_PAD } = {}) {
  const n = Math.max(0, Math.floor(count || 0));
  if (!n) return 0;
  return n * slot + (n - 1) * gap + pad;
}

/** Revealed width for a track value x (<= 0); rubber-banded overshoot shows as extra width. */
export function revealFor(x) {
  return Math.max(0, -Number(x || 0));
}

/** True when the finger dragged far enough past full reveal to fire the destructive action. */
export function isFullSwipe(x, width, extra = FULL_SWIPE_EXTRA) {
  return width > 0 && revealFor(x) >= width + extra;
}


/** The single transform that moves the row front and its trailing action strip together. */
export function trackTransform(x) {
  const v = Math.min(0, Number(x) || 0);
  return `translate3d(${Math.round(v * 100) / 100}px, 0, 0)`;
}
