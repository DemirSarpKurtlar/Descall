import { useMemo, useRef, useState } from "react";

/**
 * Small hand-made SVG charts for Elde tutma / Ekonomi (3.7.5). One y-axis,
 * thin bars with a 2px gap, rounded data-end, recessive grid, hover tooltip
 * per column, legend for 2+ series (identity is never colour alone).
 * Colours: validated pair (dark surface) #3987e5 / #d95926.
 */
export const SERIES_A = "#3987e5";
export const SERIES_B = "#d95926";

export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return step * p;
}

export function fmtNum(n, locale = "tr") {
  if (n == null || Number.isNaN(n)) return "–";
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "tr-TR", { maximumFractionDigits: 1 }).format(n);
}

/**
 * @param {{ rows: {label: string, values: number[]}[], series: {label: string, color: string}[], stacked?: boolean, height?: number, ariaLabel: string, locale?: string, tick?: (label: string) => string }} p
 */
export function ColumnChart({ rows, series, stacked = false, height = 180, ariaLabel, locale = "tr", tick = (l) => l }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = height;
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const max = useMemo(() => {
    const vals = rows.map((r) => (stacked ? r.values.reduce((a, b) => a + b, 0) : Math.max(0, ...r.values)));
    return niceMax(Math.max(0, ...vals));
  }, [rows, stacked]);
  const n = rows.length || 1;
  const slot = (W - pad.l - pad.r) / n;
  const innerH = H - pad.t - pad.b;
  const y = (v) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const every = Math.ceil(n / 8);

  const onMove = (e) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((e.clientX - box.left) / box.width) * W;
    const i = Math.floor((x - pad.l) / slot);
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div className="agr-chart" ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {series.length > 1 ? (
        <div className="agr-legend">
          {series.map((s) => (
            <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? "agr-base" : "agr-grid"} />
            <text x={pad.l - 6} y={y(v) + 3} className="agr-axis" textAnchor="end">{fmtNum(v, locale)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = pad.l + i * slot + 1;
          const w = Math.max(1, slot - 2);
          if (stacked) {
            let acc = 0;
            return (
              <g key={r.label} opacity={hover == null || hover === i ? 1 : 0.55}>
                {r.values.map((v, k) => {
                  if (!v) return null;
                  const top = y(acc + v);
                  const h = y(acc) - top - (acc > 0 ? 2 : 0);
                  acc += v;
                  return <rect key={k} x={x0} y={top} width={w} height={Math.max(1, h)} rx={Math.min(3, w / 2)} fill={series[k].color} />;
                })}
              </g>
            );
          }
          const bw = Math.max(1, (w - 2 * (r.values.length - 1)) / r.values.length);
          return (
            <g key={r.label} opacity={hover == null || hover === i ? 1 : 0.55}>
              {r.values.map((v, k) => (v ? (
                <rect key={k} x={x0 + k * (bw + 2)} y={y(v)} width={bw} height={Math.max(1, y(0) - y(v))} rx={Math.min(3, bw / 2)} fill={series[k].color} />
              ) : null))}
            </g>
          );
        })}
        {rows.map((r, i) => (i % every === 0 ? (
          <text key={`t${r.label}`} x={pad.l + i * slot + slot / 2} y={H - 6} className="agr-axis" textAnchor="middle">{tick(r.label)}</text>
        ) : null))}
      </svg>
      {hover != null && rows[hover] ? (
        <div className="agr-tip" style={{ left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%` }}>
          <strong>{rows[hover].label}</strong>
          {series.map((s, k) => (
            <span key={s.label}><i style={{ background: s.color }} />{s.label}: {fmtNum(rows[hover].values[k], locale)}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal bars with the value written at the end (single series). */
export function BarList({ items, locale = "tr", color = SERIES_A, unit = "" }) {
  const max = Math.max(1, ...items.map((i) => i.value || 0));
  return (
    <ul className="agr-barlist">
      {items.map((it) => (
        <li key={it.key || it.label}>
          <span className="agr-bl-label">{it.label}</span>
          <span className="agr-bl-track"><span style={{ width: `${Math.max(2, ((it.value || 0) / max) * 100)}%`, background: color }} /></span>
          <span className="agr-bl-val">{fmtNum(it.value, locale)}{unit}</span>
        </li>
      ))}
    </ul>
  );
}

/** Sequential blue (dark mode: dark → light as the share grows). */
export function heatColor(p) {
  if (p == null) return "transparent";
  if (p <= 0) return "rgba(255, 255, 255, 0.04)";
  const steps = ["#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef"];
  return steps[Math.min(steps.length - 1, Math.floor((p / 100) * (steps.length - 1) + 0.0001))];
}
