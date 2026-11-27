/** Timing and wake zone of components/ui/TransientTopHint.jsx (pure, for the selftest). */
export const HINT_VISIBLE_MS = 2500;
/** The top strip of the video box that brings the hint back. */
export const TOP_ZONE_PX = 96;

/** True when a pointer at clientY is inside the top strip of `rect`. */
export function hintShouldWake(clientY, rect, zone = TOP_ZONE_PX) {
  if (!rect || !Number.isFinite(clientY)) return false;
  const y = clientY - rect.top;
  return y >= 0 && y <= Math.min(zone, rect.height / 3);
}
