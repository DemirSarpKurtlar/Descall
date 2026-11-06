/**
 * Range slider math for the Descall+ settings (owner report: sliders "en sonuna kadar
 * kaymıyor"). Pure, unit-tested in rangeMath.selftest.mjs.
 *
 * Two things kept a slider from reaching its ends:
 *  1. base.css styles every <input> with padding, a border and a background, range inputs
 *     included, so the native track sat inset in a padded box and the thumb stopped short
 *     of the visible end. RangeSlider (range.css) resets those for its own input.
 *  2. A percentage fill (background 0..100 %) ignores the thumb: the thumb centre travels
 *     from thumb/2 to width - thumb/2, so at both ends the fill and the thumb disagreed.
 *     The fill stop is thumb/2 + (100 % - thumb) * fraction (fillStop below).
 * Fractional steps (0.3 .. 1 by 0.05) are run on an integer scale so float rounding can
 * never leave the last step one notch short of max.
 */

/** Decimal places of a step ("0.05" -> 2). */
export function stepDecimals(step) {
  const s = String(step);
  if (/e-/i.test(s)) return Number(s.split(/e-/i)[1]) || 0;
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

/** Integer scale for a slider: { factor, min, max, step } with integer min/max/step. */
export function integerScale(min, max, step = 1) {
  const st = Number(step) > 0 ? Number(step) : 1;
  const d = Math.max(stepDecimals(st), stepDecimals(min), stepDecimals(max));
  const factor = 10 ** d;
  return {
    factor,
    min: Math.round(Number(min) * factor),
    max: Math.round(Number(max) * factor),
    step: Math.max(1, Math.round(st * factor)),
  };
}

/** True when stepping from min by step lands exactly on max. */
export function stepReachesEnds(min, max, step = 1) {
  const s = integerScale(min, max, step);
  return s.max > s.min && (s.max - s.min) % s.step === 0;
}

/** Value clamped into [min, max] (NaN -> min). */
export function clampValue(value, min, max) {
  const v = Number(value);
  if (!Number.isFinite(v)) return Number(min);
  return Math.min(Number(max), Math.max(Number(min), v));
}

/** 0..1 position of value between min and max. */
export function rangeFraction(value, min, max) {
  const lo = Number(min);
  const hi = Number(max);
  if (!(hi > lo)) return 0;
  return (clampValue(value, lo, hi) - lo) / (hi - lo);
}

/** Pixel x of the thumb centre (and of the fill end) on a track `width` px wide. */
export function thumbCenter(fraction, width, thumb) {
  return thumb / 2 + (width - thumb) * Math.min(1, Math.max(0, fraction));
}

/** CSS length of the fill end, matching thumbCenter: "calc(9px + (100% - 18px) * 0.25)". */
export function fillStop(fraction, thumb = 18) {
  const f = Math.round(Math.min(1, Math.max(0, fraction)) * 10000) / 10000;
  return `calc(${thumb / 2}px + (100% - ${thumb}px) * ${f})`;
}
