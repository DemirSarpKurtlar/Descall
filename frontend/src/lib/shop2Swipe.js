// Pure helpers for the Market 2.0 set carousels (featured banner, phone set page).

/** Smallest horizontal travel (CSS px) that counts as a swipe. */
export const SWIPE_MIN_PX = 40;

/**
 * Direction of a finished swipe: 1 = next (finger moved left), -1 = previous, 0 = none.
 * A gesture that is mostly vertical is a page scroll, never a set change.
 */
export function swipeStep(dx, dy, min = SWIPE_MIN_PX) {
  const ax = Math.abs(Number(dx) || 0);
  const ay = Math.abs(Number(dy) || 0);
  if (ax < min || ax < ay * 1.4) return 0;
  return dx < 0 ? 1 : -1;
}

/** Index `i` moved by `d`, wrapping around a list of `n` items. */
export function wrapIndex(i, d, n) {
  if (!n || n < 1) return 0;
  return ((((Number(i) || 0) + (Number(d) || 0)) % n) + n) % n;
}

/** Arrow key to step: ArrowRight = 1, ArrowLeft = -1, Home / End jump to the ends. */
export function keyStep(key, i, n) {
  if (!n) return null;
  if (key === "ArrowRight") return wrapIndex(i, 1, n);
  if (key === "ArrowLeft") return wrapIndex(i, -1, n);
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return null;
}
