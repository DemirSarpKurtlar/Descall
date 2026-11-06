/**
 * The one range input of the Descall+ settings. It reaches both ends exactly:
 *  - range.css removes the padding, border and background base.css gives every <input>,
 *    so the thumb runs from the very left edge to the very right edge of the control;
 *  - the filled part ends at the thumb centre (rangeMath.fillStop: thumb width aware);
 *  - fractional ranges (0.3 .. 1 by 0.05) run on an integer scale, so max is a real step.
 * onChange receives the value on the caller's scale.
 */
import { clampValue, integerScale, rangeFraction } from "./rangeMath.js";
import "./range.css";

export default function RangeSlider({ value, min, max, step = 1, onChange, label, valueText, className = "", disabled, id, ds }) {
  const sc = integerScale(min, max, step);
  const v = clampValue(value, min, max);
  const iv = Math.round(v * sc.factor);
  const frac = rangeFraction(v, min, max);
  return (
    <input
      id={id}
      type="range"
      className={`dsc-range ${className}`.trim()}
      min={sc.min}
      max={sc.max}
      step={sc.step}
      value={iv}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={valueText}
      data-s={ds}
      style={{ "--p": frac }}
      onChange={(e) => onChange(Number(e.target.value) / sc.factor)}
    />
  );
}
