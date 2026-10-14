/**
 * Glass volume slider math (apple-design.md §2, §5, §9).
 *
 * The thumb travels inside the track so its right edge is flush with the
 * track at max. The fill always extends to that same edge, there is no
 * gap between the fill and the thumb, and no leftover notch at 100%.
 * Inside the track the pointer and the thumb move 1:1. Past either end
 * the thumb rubber-bands and the committed value stays clamped.
 */

import { clamp, rubberbandClamp } from "./fluid/physics.js";

export const GLASS_VOL_THUMB = 22;
export const GLASS_VOL_THUMB_COMPACT = 18;

export function snapVolume(value, min, max, step = 1) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const s = step > 0 ? step : 1;
  const n = Number(value);
  if (!Number.isFinite(n)) return lo;
  const snapped = lo + Math.round((n - lo) / s) * s;
  const clamped = clamp(snapped, lo, hi);
  const decimals = (String(s).split(".")[1] || "").length;
  return Number(clamped.toFixed(Math.min(8, decimals)));
}

/** 0 at min, 1 at max. Out-of-range values clamp. */
export function volumeFraction(value, min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo;
  if (!(span > 0)) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp((n - lo) / span, 0, 1);
}

/**
 * Speaker glyph. 0 is mute. On a percent-point slider (span > 1), 1–50 is
 * low and anything louder, including unity at 100, even if the slider
 * boosts past it, is high. Fractional 0–1 ranges map onto that same scale.
 */
export function volumeIconTier(value, min, max) {
  if (!(Number(value) > Math.min(min, max))) return "mute";
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo;
  const percent = span > 1.5 ? Number(value) - lo : ((Number(value) - lo) / span) * 100;
  return percent <= 50 ? "low" : "high";
}

/** Tap the speaker: mute remembers the level; unmute restores it (or unity). */
export function nextMuteValue(value, min, max, remembered, step = 1) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (Number(value) > lo) return lo;
  if (Number(remembered) > lo && Number(remembered) <= hi) return snapVolume(remembered, lo, hi, step);
  if (lo <= 100 && hi >= 100) return snapVolume(100, lo, hi, step);
  return hi;
}

/**
 * Pixel geometry. `fraction` may leave 0..1 while rubber-banding.
 * At fraction 1 the fill width equals the track, no gap on the right.
 * At every fraction the fill ends on the thumb's right edge.
 */
export function fillAndThumbPx(fraction, trackWidth, thumb) {
  const width = Math.max(0, Number(trackWidth) || 0);
  const size = Math.max(0, Number(thumb) || 0);
  const travel = Math.max(0, width - size);
  const f = Number.isFinite(fraction) ? fraction : 0;
  const thumbLeft = f * travel;
  return { travel, thumbLeft, fill: thumbLeft + size };
}

/** CSS that stays exact before the track has been measured. */
export function volumeVisualCss(fraction, thumb) {
  const f = Number.isFinite(fraction) ? fraction : 0;
  const t = Math.max(0, Number(thumb) || 0);
  const thumbLeft = `calc(${f} * (100% - ${t}px))`;
  return {
    thumbLeft,
    fill: `calc(${f} * (100% - ${t}px) + ${t}px)`,
  };
}

/**
 * Map a pointer to a committed value and a visual fraction.
 * `grabOffset` is the distance from the thumb's left edge to the pointer
 * so a grab does not snap the thumb under the finger. Null centers it
 * (a tap on the track).
 */
export function volumeFromPointer({
  pointerX,
  trackLeft,
  trackWidth,
  thumb,
  min,
  max,
  step = 1,
  grabOffset = null,
}) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const width = Math.max(0, Number(trackWidth) || 0);
  const size = Math.max(1, Number(thumb) || 1);
  const travel = Math.max(1, width - size);
  const local = (Number(pointerX) || 0) - (Number(trackLeft) || 0);
  const offset = grabOffset == null ? size / 2 : grabOffset;
  const rawLeft = local - offset;
  const shownLeft = rubberbandClamp(rawLeft, 0, travel, travel);
  const visualFraction = shownLeft / travel;
  const clampedLeft = clamp(rawLeft, 0, travel);
  const rawValue = lo + (clampedLeft / travel) * (hi - lo);
  return {
    value: snapVolume(rawValue, lo, hi, step),
    visualFraction,
  };
}
