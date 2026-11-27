/** Small drawing pieces of the passkey control center (tile, 30-day bars, score ring). */
import { AndroidLogo, Globe, Monitor, Smartphone, Usb, WindowsLogo } from "../../ui/Icon.jsx";
import { KIND_TILE } from "./centerFormat.js";

const KIND_GLYPH = { windows: WindowsLogo, ios: Smartphone, mac: Monitor, android: AndroidLogo, key: Usb, web: Globe };

export function KindTile({ kind = "web", size = 34 }) {
  const Glyph = KIND_GLYPH[kind] || Globe;
  return (
    <span className={`pkc-tile ${KIND_TILE[kind] || "t-web"}`} style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }} aria-hidden="true">
      <Glyph size={Math.round(size * 0.52)} weight={kind === "windows" || kind === "android" ? "fill" : "regular"} />
    </span>
  );
}

/** Bars of the last 30 days (oldest left). Empty days are short grey ticks. */
export function Spark({ values = [], width = 62, height = 22, label, stretch = false }) {
  const max = Math.max(1, ...values);
  const bw = width / Math.max(1, values.length);
  return (
    <svg className="pkc-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={stretch ? "none" : undefined} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
      {values.map((v, i) => {
        const bh = v ? Math.max(3, (v / max) * (height - 2)) : 2;
        return <rect key={i} x={(i * bw + 0.8).toFixed(1)} y={(height - bh).toFixed(1)} width={Math.max(0.6, bw - 1.6).toFixed(1)} height={bh.toFixed(1)} rx="1" className={v ? "on" : "off"} />;
      })}
    </svg>
  );
}

export function ScoreRing({ value = 0, level = "fair", size = 44 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <svg className={`pkc-ring lv-${level}`} width={size} height={size} viewBox="0 0 54 54" aria-hidden="true">
      <circle cx="27" cy="27" r="22" fill="none" className="track" strokeWidth="6" />
      <circle cx="27" cy="27" r="22" fill="none" className="arc" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${((v / 100) * 138.2).toFixed(1)} 200`} transform="rotate(-90 27 27)" />
      <text x="27" y="32" textAnchor="middle" fontSize="15" fontWeight="800" className="num">
        {v}
      </text>
    </svg>
  );
}
