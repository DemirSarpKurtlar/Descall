/**
 * Line + area over a value per day, bars for hands per day, dashed markers for
 * admin adjustments (and anomalies on the statistics page). Hover / focus a day
 * to read it. Pure SVG, scales with its card.
 */
import { useId, useMemo, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { formatIstanbulDayLabel } from "../../../lib/datetime";
import { chartGeometry, sparkPath } from "./gamesModel.js";

const W = 640;

export default function GamesChart({ points, valueKey = "balance", height = 150, lineColor = "#4fe0a0", barColor = "rgba(88,122,245,0.35)", markers = [], label, valueLabel, labels = 3, testId }) {
  const { t, locale } = useLocale();
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);
  const data = points || [];
  const geo = useMemo(
    () => chartGeometry(data.map((p) => p[valueKey]), data.map((p) => p.hands), { width: W, height: height - 18 }),
    [data, valueKey, height]
  );
  const ch = height - 18;
  const tickIdx = useMemo(() => {
    if (data.length < 2) return [0];
    const n = Math.max(2, labels);
    return Array.from({ length: n }, (_, i) => Math.round((i * (data.length - 1)) / (n - 1)));
  }, [data.length, labels]);
  if (!data.length) return <div className="agm-chart-empty">{t("gamesAdmin.empty.chart")}</div>;
  const dayLabel = (k) => formatIstanbulDayLabel(k, locale, { day: "numeric", month: "short" });
  const hp = hover != null ? data[hover] : null;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    geo.xs.forEach((gx, i) => {
      if (Math.abs(gx - x) < Math.abs(geo.xs[best] - x)) best = i;
    });
    setHover(best);
  };
  return (
    <div className="agm-chart" data-testid={testId}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        tabIndex={0}
        onFocus={() => setHover(data.length - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? data.length - 1) - 1));
          if (e.key === "ArrowRight") setHover((h) => Math.min(data.length - 1, (h ?? 0) + 1));
        }}
      >
        <defs>
          <linearGradient id={`agm-g-${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={lineColor} stopOpacity="0.35" />
            <stop offset="1" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" x2={W} y1={(ch / 4) * i + 4} y2={(ch / 4) * i + 4} stroke="rgba(255,255,255,0.06)" vectorEffect="non-scaling-stroke" />
        ))}
        {geo.bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="2" fill={barColor} opacity={hover == null || hover === i ? 1 : 0.55} />
        ))}
        <path d={geo.area} fill={`url(#agm-g-${gid})`} />
        <path d={geo.line} fill="none" stroke={lineColor} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        {markers.map((m) => {
          const x = geo.xs[m.index];
          if (x == null) return null;
          return (
            <g key={`${m.index}-${m.color}`}>
              <line x1={x} x2={x} y1="4" y2={ch} stroke={m.color} strokeDasharray="3 3" opacity="0.7" vectorEffect="non-scaling-stroke" />
              <circle cx={x} cy="10" r="4" fill={m.color} />
            </g>
          );
        })}
        {hp ? <line x1={geo.xs[hover]} x2={geo.xs[hover]} y1="0" y2={ch} stroke="rgba(255,255,255,0.35)" vectorEffect="non-scaling-stroke" /> : null}
        {hp ? <circle cx={geo.xs[hover]} cy={geo.ys[hover]} r="4" fill={lineColor} stroke="#191a26" strokeWidth="2" /> : null}
      </svg>
      <div className="agm-chart-x" aria-hidden="true">
        {tickIdx.map((i, n) => (
          <span key={n} style={{ left: `${(geo.xs[i] / W) * 100}%` }} className={n === 0 ? "is-first" : n === tickIdx.length - 1 ? "is-last" : ""}>
            {dayLabel(data[i]?.day)}
          </span>
        ))}
      </div>
      {markers.filter((m) => m.text).map((m) => (
        <span key={`t-${m.index}`} className="agm-chart-mark" style={{ left: `${(geo.xs[m.index] / W) * 100}%`, color: m.color }}>
          {m.text}
        </span>
      ))}
      {hp ? (
        <div className="agm-chart-tip" style={{ left: `${(geo.xs[hover] / W) * 100}%` }} role="status">
          <b>{dayLabel(hp.day)}</b>
          <span>
            {valueLabel}: <b className="tnum">{formatNumber(hp[valueKey] || 0, locale)}</b>
          </span>
          <span>{t("gamesAdmin.chart.hands", { n: formatNumber(hp.hands || 0, locale) })}</span>
          {hp.admin ? <span className="agm-amber">{t("gamesAdmin.chart.admin", { n: `${hp.admin > 0 ? "+" : "−"}${formatNumber(Math.abs(hp.admin), locale)}` })}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function Spark({ values, color }) {
  const gid = useId().replace(/:/g, "");
  const g = sparkPath(values || [], 200, 22);
  if (!g.line) return <div style={{ height: 26 }} />;
  return (
    <svg className="agm-spark" viewBox="0 0 200 22" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`agm-s-${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={g.area} fill={`url(#agm-s-${gid})`} />
      <path d={g.line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
