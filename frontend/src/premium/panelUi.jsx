/** Small building blocks for the Descall+ feature panels (src/premium/settings/*.jsx). */
import { S3Toggle } from "../components/settings/SettingsV3.jsx";
import RangeSlider from "./ui/RangeSlider.jsx";

export function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="pp-set-row">
      <span>{label}</span>
      <S3Toggle checked={Boolean(checked)} onChange={onChange} label={label} />
    </div>
  );
}

export function SliderRow({ label, value, min = 30, max = 100, step = 5, onChange, display }) {
  return (
    <div className="pp-set-row">
      <span>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex", width: 160 }}>
          <RangeSlider value={value} min={min} max={max} step={step} label={label} valueText={display} onChange={onChange} />
        </span>
        <span className="pp-hint tnum" style={{ minWidth: 40, textAlign: "right" }}>{display}</span>
      </span>
    </div>
  );
}

export function SegRow({ label, value, options, onChange }) {
  return (
    <div className="pp-set-row">
      <span>{label}</span>
      <span className="pp-seg" role="group" aria-label={label}>
        {options.map(([id, text]) => (
          <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>
        ))}
      </span>
    </div>
  );
}

export function premiumBridge() {
  return typeof window !== "undefined" ? window.descallPremium || null : null;
}
