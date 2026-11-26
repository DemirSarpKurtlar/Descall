/**
 * p75 trend chart (Draft A "p75 eğilimi"): one line per platform, the "good" band and its
 * threshold line, release markers (red when a release has an open regression) and
 * feature-flag markers from Sistem on the same axis, hover tooltip with every platform,
 * click a line or legend entry to filter by that platform.
 */
import { useMemo, useRef, useState } from "react";
import { PLATFORM_COLOR, chartDomain, fmtValue, niceTicks, rating } from "./perfAdminModel.js";

const W = 1000;

export function axisLabel(key, locale, hourly) {
  const d = new Date(hourly ? key : `${key}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "";
  return hourly
    ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(d)
    : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

export default function PerfChart({ chart, metric, height = 206, compact = false, locale, t, platformLabel, flagLabel, selected = [], onTogglePlatform, testId = "perf-chart" }) {
  const keys = chart?.keys || [];
  const series = chart?.series || {};
  const n = keys.length;
  const hourly = Boolean(keys[0] && keys[0].length > 10);
  const dom = useMemo(() => chartDomain(series, metric), [series, metric]);
  const ticks = useMemo(() => niceTicks(dom.min, dom.max, compact ? 2 : 3).filter((v) => v > dom.min && v < dom.max), [dom, compact]);
  const [hov, setHov] = useState(null);
  const ref = useRef(null);
  const X = (i) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const Y = (v) => height - ((v - dom.min) / (dom.max - dom.min || 1)) * height;
  const pct = (i) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const good = { lcp: 2500, inp: 200, cls: 0.1, fcp: 1800, ttfb: 800, appstart: 2000 }[metric];
  const plats = Object.keys(series);
  const worst = plats.reduce((w, p) => {
    const last = [...series[p]].reverse().find((v) => v != null);
    return last != null && (w == null || last > w.v) ? { p, v: last } : w;
  }, null);

  const path = (vals) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || n < 1) return;
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
    setHov(i);
  };

  // Marker rows: labels closer than 16 % stack below each other (draft).
  const markers = [];
  let prev = -99;
  let row = 0;
  for (const m of chart?.markers || []) {
    const p = pct(m.i);
    row = p - prev < 16 ? row + 1 : 0;
    prev = p;
    markers.push({ ...m, p, row: Math.min(row, 2) });
  }

  if (!n) return <p className="alg-empty-s">{t("perfAdmin.chart.empty")}</p>;
  const empty = !plats.length;
  return (
    <div className="apf-chart" data-testid={testId}>
      <div className="apf-ch" style={{ height }}>
        <div className="apf-ch-y" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} style={{ top: `${(Y(v) / height) * 100}%` }}>
              {compact ? fmtValue(metric, v, locale).replace(/\s.*$/, "") : fmtValue(metric, v, locale, t)}
            </span>
          ))}
        </div>
        <div className="apf-ch-p" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHov(null)} role="img" aria-label={t("perfAdmin.chart.aria", { metric: metric.toUpperCase() })}>
          <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {good != null && good > dom.min ? (
              <>
                <rect x="0" y={Y(Math.min(good, dom.max))} width={W} height={Math.max(0, height - Y(Math.min(good, dom.max)))} className="apf-band-g" />
                <rect x="0" y="0" width={W} height={Math.max(0, Y(Math.min(good, dom.max)))} className="apf-band-n" />
                <line x1="0" x2={W} y1={Y(good)} y2={Y(good)} className="apf-good-line" vectorEffect="non-scaling-stroke" />
              </>
            ) : null}
            {ticks.map((v) => (
              <line key={v} x1="0" x2={W} y1={Y(v)} y2={Y(v)} className="apf-grid" vectorEffect="non-scaling-stroke" />
            ))}
            {markers.map((m) => (
              <line key={`${m.kind}-${m.i}-${m.label || m.flag}`} x1={X(m.i)} x2={X(m.i)} y1={compact ? 4 : 14} y2={height} className={`apf-mk-line${m.bad ? " is-bad" : m.kind === "flag" ? " is-flag" : ""}`} vectorEffect="non-scaling-stroke" />
            ))}
            {plats.map((p) => {
              const hot = worst?.p === p && rating(metric, worst.v) !== "g";
              const dim = selected.length && !selected.includes(p);
              return (
                <path
                  key={p}
                  d={path(series[p])}
                  fill="none"
                  stroke={PLATFORM_COLOR[p]}
                  strokeWidth={hot ? 2.6 : 1.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={dim ? 0.25 : hot ? 1 : 0.85}
                  className="apf-line"
                  onClick={onTogglePlatform ? () => onTogglePlatform(p) : undefined}
                />
              );
            })}
            {hov != null ? <line x1={X(hov)} x2={X(hov)} y1="0" y2={height} className="apf-hov-line" vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          {good != null && good > dom.min && good < dom.max && !compact ? (
            <span className="apf-band-lbl" style={{ top: `${(Y(good) / height) * 100}%` }}>
              {t("perfAdmin.chart.goodLine", { value: fmtValue(metric, good, locale, t) })}
            </span>
          ) : null}
          {markers.map((m) => (
            <span
              key={`l-${m.kind}-${m.i}-${m.label || m.flag}`}
              className={`apf-mk${m.bad ? " is-bad" : m.kind === "flag" ? " is-flag" : ""}`}
              style={{ left: `${m.p}%`, top: -2 + m.row * 19, ...(m.p > 86 ? { transform: "translateX(-100%)", marginLeft: 6 } : {}) }}
              title={m.kind === "flag" ? flagLabel(m) : m.label}
            >
              {m.kind === "flag" ? flagLabel(m) : m.label}
            </span>
          ))}
          {hov != null && !empty ? (
            <>
              {plats.map((p) => (series[p][hov] == null ? null : <span key={p} className="apf-dot" style={{ left: `${pct(hov)}%`, top: `${(Y(series[p][hov]) / height) * 100}%`, background: PLATFORM_COLOR[p] }} />))}
              <div className="apf-tip" style={pct(hov) > 55 ? { right: `${100 - pct(hov) + 1.5}%`, top: "18%" } : { left: `${pct(hov) + 1.5}%`, top: "18%" }} role="tooltip">
                <b>{t("perfAdmin.chart.tipTitle", { when: axisLabel(keys[hov], locale, hourly) })}</b>
                {plats
                  .map((p) => ({ p, v: series[p][hov] }))
                  .sort((a, b) => (b.v ?? -1) - (a.v ?? -1))
                  .map(({ p, v }) => (
                    <div key={p}>
                      <i style={{ background: PLATFORM_COLOR[p] }} />
                      {platformLabel(p)}
                      <span className={`apf-r-${rating(metric, v)}`}>{fmtValue(metric, v, locale, t)}</span>
                    </div>
                  ))}
              </div>
            </>
          ) : null}
          {empty ? <p className="apf-ch-empty">{t("perfAdmin.chart.noData")}</p> : null}
        </div>
      </div>
      <div className="apf-ch-x" aria-hidden="true">
        {(compact ? [0, n - 1] : [0, Math.round(n * 0.18), Math.round(n * 0.36), Math.round(n * 0.54), Math.round(n * 0.72), Math.round(n * 0.86), n - 1])
          .filter((i, j, a) => a.indexOf(i) === j && i >= 0 && i < n)
          .map((i) => (
            <span key={i} style={i === 0 ? { left: 0 } : i === n - 1 ? { right: 0 } : { left: `${pct(i)}%`, transform: "translateX(-50%)" }}>
              {axisLabel(keys[i], locale, hourly)}
            </span>
          ))}
      </div>
    </div>
  );
}

/** Sparkline (KPI tiles, table rows, Lighthouse rings). */
export function Spark({ values, color, width = 84, height = 26, fill = true }) {
  const vals = (values || []).map((v) => (v == null || !Number.isFinite(v) ? null : v));
  const real = vals.filter((v) => v != null);
  if (real.length < 2) return <svg className="apf-sp" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" />;
  const mn = Math.min(...real);
  const mx = Math.max(...real);
  const r = mx - mn || 1;
  const pts = [];
  vals.forEach((v, i) => {
    if (v != null) pts.push([(i / (vals.length - 1)) * width, height - 3 - ((v - mn) / r) * (height - 6)]);
  });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const id = `apfsp${Math.abs(hash(d + color)) % 1e9}`;
  return (
    <svg className="apf-sp" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {fill ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity=".28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${pts[pts.length - 1][0]} ${height} L${pts[0][0]} ${height}Z`} fill={`url(#${id})`} />
        </>
      ) : null}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Good / needs improvement / poor bar. */
export function Dist({ dist, thick = false }) {
  const [g = 0, ni = 0, p = 0] = dist || [];
  return (
    <div className={`apf-dist${thick ? " is-thick" : ""}`} aria-hidden="true">
      <i style={{ width: `${g}%` }} />
      <i style={{ width: `${ni}%` }} />
      <i style={{ width: `${p}%` }} />
    </div>
  );
}

/** Platform share bar. */
export function Mix({ mix }) {
  return (
    <div className="apf-mix" aria-hidden="true">
      {Object.entries(mix || {}).map(([p, v]) => (v ? <i key={p} style={{ width: `${v}%`, background: PLATFORM_COLOR[p] }} /> : null))}
    </div>
  );
}

/** Lighthouse score ring. */
export function Ring({ score, size = 52, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const s = Number(score) || 0;
  const tone = s >= 90 ? "g" : s >= 50 ? "n" : "p";
  return (
    <span className={`apf-ring is-${tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="apf-ring-bg" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="apf-ring-fg" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * s) / 100} ${c}`} />
      </svg>
      <b style={{ fontSize: Math.round(size * 0.32) }}>{score == null ? "—" : s}</b>
    </span>
  );
}

/** Lighthouse score chip (90+ green, 50+ amber, else red). */
export function Score({ v }) {
  if (v == null) return <span className="apf-sc is-x">—</span>;
  return <span className={`apf-sc is-${v >= 90 ? "g" : v >= 50 ? "n" : "p"}`}>{v}</span>;
}
