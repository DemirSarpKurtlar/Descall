/**
 * Yönetici Paneli › Kayıt İstatistikleri (Descall 3.0.0, mockups 25 / 26).
 *
 * Opens in its own window:
 *  - Electron desktop: a separate frameless BrowserWindow on /admin/signup-stats
 *    (electron/adminStatsWindow.cjs) with the same title bar.
 *  - Web desktop: an in-app window over the panel (drag by the title bar, ⤢ fills the screen).
 *  - iPad / iPhone: an in-app window with a grabber (drag down or tap the grabber to close).
 * Data: GET /api/admin/signup-stats (admin only on the server; moderators get 403).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../api/adminHttp";
import { API_BASE_URL } from "../../../config/api";
import { getToken } from "../../../lib/storage";
import logoIcon from "../../../assets/admin-logo-icon.png";
import {
  AUTH_SEGMENTS,
  GRANULARITIES,
  PRESETS,
  addDays,
  axisLabel,
  countryRow,
  dec1,
  istToday,
  kpiDelta,
  niceMax,
  num,
  pctOf,
  peakIndex,
  rangeCaption,
  rangeLabel,
  sinceText,
  tickIndexes,
} from "./statsModel.js";
import "../../../styles/admin-signup-stats.css";

export const STATS_PATH = "/admin/signup-stats";
const WIN_W = 1240;
const WIN_H = 856;

const P = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  minus: '<path d="M6 12h12"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
function I({ n, s = 18, w = 2 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: P[n] || "" }}
    />
  );
}

const isElectron = () => typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);

/** Electron desktop: open the real window. Returns false when the caller should show the in-app one. */
export function openSignupStatsWindow(layout) {
  if (!isElectron() || layout !== "desktop") return false;
  try {
    const w = window.open(STATS_PATH, "descall-signup-stats");
    return Boolean(w);
  } catch {
    return false;
  }
}

// ---- chart --------------------------------------------------------------------

function TrendChart({ series, granularity, W, H }) {
  const [hi, setHi] = useState(() => peakIndex(series));
  useEffect(() => setHi(peakIndex(series)), [series]);
  if (!W || !series.length) return <div style={{ height: H }} />;
  const pl = 34;
  const pr = 10;
  const pt = 14;
  const pb = 26;
  const cw = W - pl - pr;
  const ch = H - pt - pb;
  const n = series.length;
  const max = niceMax(Math.max(...series.map((s) => Math.max(s.count, s.avg))));
  const bw = cw / n;
  const y = (v) => pt + ch - (v / max) * ch;
  const line = series.map((s, i) => `${i ? "L" : "M"}${(pl + i * bw + bw / 2).toFixed(1)} ${y(s.avg).toFixed(1)}`).join(" ");
  const cur = series[Math.min(hi, n - 1)];
  const tx = pl + hi * bw + bw / 2;
  const flip = tx + 10 + 128 > W;
  const bx = flip ? tx - 10 - 128 : tx + 10;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHi(peakIndex(series))} role="img" aria-label="Kayıt trendi">
      {[0, max / 2, max].map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.08)" />
          <text x={pl - 8} y={y(v) + 4} fill="rgba(235,238,255,.4)" fontSize="11" textAnchor="end">
            {num(v)}
          </text>
        </g>
      ))}
      {series.map((s, i) => (
        <rect
          key={s.key}
          x={pl + i * bw + bw * 0.18}
          y={y(s.count)}
          width={bw * 0.64}
          height={ch - (y(s.count) - pt)}
          rx="3"
          fill={i === hi ? "#8FA6FF" : "rgba(88,122,246,.55)"}
        />
      ))}
      <path d={line} fill="none" stroke="#FFD60A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
      {cur ? (
        <g pointerEvents="none">
          <line x1={tx} x2={tx} y1={pt} y2={pt + ch} stroke="rgba(143,166,255,.35)" strokeDasharray="3 3" />
          <rect x={bx} y={pt + 22} width="128" height="40" rx="10" fill="rgba(36,38,54,.96)" stroke="rgba(255,255,255,.12)" />
          <text x={bx + 64} y={pt + 38} fill="rgba(235,238,255,.6)" fontSize="11" textAnchor="middle">
            {cur.tip}
          </text>
          <text x={bx + 64} y={pt + 54} fill="#fff" fontSize="13" fontWeight="650" textAnchor="middle">
            {`${num(cur.count)} kayıt · ort. ${dec1(cur.avg)}`}
          </text>
        </g>
      ) : null}
      {tickIndexes(n).map((i) => (
        <text key={i} x={pl + i * bw + bw / 2} y={H - 6} fill="rgba(235,238,255,.45)" fontSize="11" textAnchor="middle">
          {axisLabel(series[i], granularity)}
        </text>
      ))}
      {series.map((s, i) => (
        <rect key={`h${s.key}`} className="hit" x={pl + i * bw} y={pt} width={bw} height={ch} onMouseEnter={() => setHi(i)} onClick={() => setHi(i)} />
      ))}
    </svg>
  );
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(el.clientWidth);
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function Card({ title, extra, children, style }) {
  return (
    <div className="st-card" style={style}>
      <div className="st-ch">
        <b>{title}</b>
        {extra}
      </div>
      {children}
    </div>
  );
}

function Bars({ rows, total }) {
  return rows.map((r) => (
    <div className="st-br" key={r.key || r.label}>
      <span className={`k${r.muted ? " muted" : ""}`} title={r.label}>
        {r.label}
      </span>
      <span className="tr">
        <i style={{ width: `${total ? (r.count / total) * 100 : 0}%`, background: r.muted ? "rgba(255,255,255,.22)" : r.color || "#587AF6" }} />
      </span>
      <span className="v">
        {num(r.count)}
        <small>%{pctOf(r.count, total)}</small>
      </span>
    </div>
  ));
}

function Ring({ p, color }) {
  const r = 36;
  const C = 2 * Math.PI * r;
  return (
    <div className="st-ring">
      <svg width="86" height="86">
        <circle cx="43" cy="43" r={r} stroke="rgba(255,255,255,.08)" strokeWidth="9" fill="none" />
        {p > 0 ? (
          <circle cx="43" cy="43" r={r} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray={`${C * p} ${C}`} transform="rotate(-90 43 43)" />
        ) : null}
      </svg>
      <b>%{Math.round(p * 100)}</b>
    </div>
  );
}

function Kpi({ label, value, kind, delta, note }) {
  const d = kind ? kpiDelta(kind, delta) : null;
  return (
    <div className="st-kpi">
      <div className="l">{label}</div>
      <div className="n">{num(value)}</div>
      <div className="d">
        {d ? (
          <>
            {d.mark ? <b className={d.cls}>{d.mark}</b> : null}
            {d.rest}
          </>
        ) : (
          note
        )}
      </div>
    </div>
  );
}

// ---- content ----------------------------------------------------------------------

function StatsContent({ data, W, controls }) {
  const trendRef = useRef(null);
  const trendW = useWidth(trendRef);
  const wide = W > 1100;
  const narrow = W > 0 && W < 760;
  const today = istToday();
  const cap = rangeCaption(data.range.from, data.range.to, today);
  const g = data.range.granularity;
  const unitLabel = g === "week" ? "Haftalık kayıt" : g === "month" ? "Aylık kayıt" : "Günlük kayıt";
  const avgLabel = g === "week" ? "4 haftalık ortalama" : g === "month" ? "3 aylık ortalama" : "7 günlük ortalama";
  const k = data.kpis;
  const f = data.funnel;
  const total = data.total;
  const authTotal = AUTH_SEGMENTS.reduce((n, [key]) => n + (data.authMethods[key] || 0), 0);
  const unknownCountries = data.countries.find((c) => c.code === "unknown")?.count || 0;
  const r = data.retention;
  const d1 = r.d1.eligible ? r.d1.returned / r.d1.eligible : 0;
  const d7 = r.d7.eligible ? r.d7.returned / r.d7.eligible : 0;

  const trend = (
    <Card
      title="Kayıt trendi"
      extra={
        <span className="st-lg">
          <span>
            <i style={{ background: "rgba(88,122,246,.75)" }} />
            {unitLabel}
          </span>
          <span>
            <i style={{ background: "#FFD60A", height: 3, verticalAlign: 2 }} />
            {avgLabel}
          </span>
        </span>
      }
    >
      <div className="st-chart" ref={trendRef}>
        <TrendChart series={data.series} granularity={g} W={trendW} H={wide ? 176 : 150} />
      </div>
    </Card>
  );
  const funnel = (
    <Card title="Kayıt akışı" extra={<span className="mut">{cap}</span>}>
      <div className="st-fun">
        <div className="st-fs">
          <div className="bar" style={{ width: "100%" }}>{`Başladı · ${num(f.started)}`}</div>
        </div>
        <div className="st-fs">
          <div className="bar" style={{ width: `${pctOf(f.completed, f.started)}%`, background: "rgba(48,209,88,.5)" }}>
            {`Tamamlandı · ${num(f.completed)} · %${f.completedPct}`}
          </div>
        </div>
        <div className="st-fs">
          <div className="bar" style={{ width: `${pctOf(f.appOpened, f.started)}%`, background: "rgba(48,209,88,.36)" }}>
            {`Uygulamayı açtı · ${num(f.appOpened)}`}
          </div>
        </div>
      </div>
      <div className="st-chips">
        <div className="st-chip">
          Yarım bıraktı<b>{num(f.abandoned)}</b>
        </div>
        <div className="st-chip">
          Başarısız<b>{num(f.failed)}</b>
        </div>
      </div>
      <div className="st-note">
        <I n="bolt" s={13} w={2} />
        <span>
          Başarısız = doğrulama/hata ile biten kayıt (yeni <code>signup_attempts</code>).
        </span>
      </div>
    </Card>
  );
  const src = (
    <Card title="Kaynak" extra={<span className="mut">{`tümü · ${num(total)}`}</span>}>
      <Bars rows={data.sources} total={total} />
      <div className="st-sep" />
      <div className="st-sub">Giriş yöntemi</div>
      <div className="st-stack">
        {AUTH_SEGMENTS.map(([key, , color]) =>
          data.authMethods[key] ? <i key={key} style={{ width: `${(data.authMethods[key] / authTotal) * 100}%`, background: color }} /> : null,
        )}
      </div>
      <div className="st-leg2">
        {AUTH_SEGMENTS.map(([key, label, color]) => (
          <span key={key}>
            <i style={{ background: color }} />
            {`${label} ${num(data.authMethods[key] || 0)}`}
          </span>
        ))}
      </div>
    </Card>
  );
  const ret = (
    <Card title="Geri dönüş" extra={<span className="mut">{cap}</span>}>
      <div className="st-ret">
        <div>
          <Ring p={d1} color="#587AF6" />
          <div className="t">D1 · ertesi gün</div>
          <div className="s">{`${num(r.d1.returned)} / ${num(r.d1.eligible)} geri geldi`}</div>
        </div>
        <div>
          <Ring p={d7} color="#30D158" />
          <div className="t">D7 · 7. gün</div>
          <div className="s">{`${num(r.d7.returned)} / ${num(r.d7.eligible)} hâlâ aktif`}</div>
        </div>
      </div>
      <div className="st-note">
        <I n="clock" s={13} w={2} />
        <span>
          Gün sınırı İstanbul saatine göre (00:00, UTC+3). Ölçüm için yeni <code>user_active_days</code> tablosu.
        </span>
      </div>
    </Card>
  );
  const ctry = (
    <Card title="Ülke" extra={<span className="mut">{`tümü · ${num(total)}`}</span>}>
      <Bars rows={data.countries.map((c, i) => ({ key: c.code, ...countryRow(c, i) }))} total={total} />
      {unknownCountries > 0 && data.countrySinceDay ? (
        <div className="st-note">
          <I n="globe" s={13} w={2} />
          <span>
            {`${sinceText(data.countrySinceDay).replace(/ beri$/, "")} önceki kayıtlarda ülke tutulmuyordu → `}
            <b>Bilinmiyor</b>.
          </span>
        </div>
      ) : null}
    </Card>
  );

  return (
    <div className={narrow ? "st-narrow" : ""}>
      <div className="st-hd">
        <div>
          <h1>
            Kayıt İstatistikleri {data.sample ? <span className="st-ex">ÖRNEK VERİ</span> : null}
          </h1>
          <p>{`Sadece yöneticiler görür · Saat dilimi: İstanbul (UTC+3) · Son güncelleme ${data.updatedLabel}`}</p>
        </div>
        {controls}
      </div>
      <div className="st-kpis">
        <Kpi label="Bugün" value={k.today.value} kind="today" delta={k.today.delta} />
        <Kpi label="Bu hafta" value={k.week.value} kind="week" delta={k.week.delta} />
        <Kpi label="Son 30 gün" value={k.month.value} kind="month" delta={k.month.delta} />
        <Kpi
          label="Toplam kayıt"
          value={k.total.value}
          note={k.total.since ? `${sinceText(k.total.since)} · ${num(k.total.deleted)} silinmiş` : `${num(k.total.deleted)} silinmiş`}
        />
      </div>
      {wide ? (
        <>
          <div className="st-grid" style={{ gridTemplateColumns: "64fr 36fr" }}>
            {trend}
            {funnel}
          </div>
          <div className="st-grid" style={{ gridTemplateColumns: "1.25fr 1fr 1fr", marginTop: 12 }}>
            {src}
            {ret}
            {ctry}
          </div>
        </>
      ) : (
        <>
          {trend}
          <div className="st-grid st-g2" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}>
            {funnel}
            {ret}
            {src}
            {ctry}
          </div>
        </>
      )}
    </div>
  );
}

function Controls({ data, query, setQuery, onCsv, csvBusy }) {
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState({ from: data?.range.from || "", to: data?.range.to || "" });
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => {
      if (!ref.current?.contains(e.target)) setMenu(false);
    };
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [menu]);
  useEffect(() => {
    if (data) setCustom({ from: data.range.from, to: data.range.to });
  }, [data]);
  const today = istToday();
  const pick = (preset) => {
    const [, , days] = PRESETS.find(([id]) => id === preset);
    const from = days ? addDays(today, -(days - 1)) : data?.kpis?.total?.since || addDays(today, -1100);
    setQuery((q) => ({ ...q, preset, from, to: today }));
    setMenu(false);
  };
  return (
    <div className="st-tools" ref={ref}>
      <div className="st-seg" role="tablist" aria-label="Zaman aralığı">
        {GRANULARITIES.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={query.granularity === id} className={query.granularity === id ? "on" : ""} onClick={() => setQuery((q) => ({ ...q, granularity: id }))}>
            {label}
          </button>
        ))}
      </div>
      <button type="button" className="st-pill" aria-label={data ? `Tarih aralığı: ${rangeLabel(data.range.from, data.range.to)}` : "Tarih aralığı"} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
        <I n="clock" s={14} w={2} /> {data ? rangeLabel(data.range.from, data.range.to) : "…"} <I n="down" s={13} w={2.2} />
      </button>
      <button type="button" className="st-pill" onClick={onCsv} disabled={!data || csvBusy}>
        <I n="down" s={14} w={2} /> CSV
      </button>
      {menu ? (
        <div className="st-menu" role="menu">
          {PRESETS.map(([id, label]) => (
            <button key={id} type="button" role="menuitemradio" aria-checked={query.preset === id} className={query.preset === id ? "on" : ""} onClick={() => pick(id)}>
              {label}
              {query.preset === id ? <I n="check" s={15} w={2.4} /> : null}
            </button>
          ))}
          <form
            className="cust"
            onSubmit={(e) => {
              e.preventDefault();
              if (!custom.from || !custom.to) return;
              const [a, b] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
              setQuery((q) => ({ ...q, preset: "custom", from: a, to: b }));
              setMenu(false);
            }}
          >
            <label>
              Başlangıç
              <input type="date" value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </label>
            <label>
              Bitiş
              <input type="date" value={custom.to} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </label>
            <button type="submit" className="go">
              Aralığı uygula
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function qs(query) {
  const p = new URLSearchParams({ granularity: query.granularity });
  if (query.from) p.set("from", query.from);
  if (query.to) p.set("to", query.to);
  return p.toString();
}

function useSignupStats() {
  const [query, setQuery] = useState({ granularity: "day", preset: "30", from: null, to: null });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const d = await adminFetch(`/signup-stats?${qs(query)}`);
      if (id !== seq.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (id !== seq.current) return;
      setError(e?.status === 403 ? "forbidden" : e?.status === 401 ? "auth" : "error");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  return { query, setQuery, data, error, loading, reload: load };
}

async function downloadCsv(query) {
  const res = await fetch(`${API_BASE_URL}/admin/signup-stats/csv?${qs(query)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "kayit-istatistikleri.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- window ----------------------------------------------------------------------

export default function SignupStatsWindow({ layout = "desktop", onClose, standalone = false, embedded = false }) {
  const { query, setQuery, data, error, loading, reload } = useSignupStats();
  const winRef = useRef(null);
  const W = useWidth(winRef);
  const [pos, setPos] = useState(null);
  const [max, setMax] = useState(false);
  const [toast, setToast] = useState(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [dragY, setDragY] = useState(0);
  const chrome = standalone ? "page" : layout === "desktop" ? "desktop" : layout;
  const electron = standalone && isElectron();

  const close = useCallback(() => {
    if (standalone) {
      if (electron) window.electronAPI.closeWindow?.();
      else window.close();
      return;
    }
    onClose?.();
  }, [standalone, electron, onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !standalone && !embedded) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, standalone, embedded]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (standalone) document.title = "Kayıt İstatistikleri — Descall Yönetici";
  }, [standalone]);

  const onCsv = async () => {
    setCsvBusy(true);
    try {
      await downloadCsv(query);
      setToast("CSV indirildi");
    } catch {
      setToast("CSV indirilemedi");
    } finally {
      setCsvBusy(false);
    }
  };

  // Desktop in-app window: 1240×856 like the Electron one, nudged right of centre, draggable.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const w = Math.min(WIN_W, vw - 24);
  const h = Math.min(WIN_H, vh - 34);
  const base = { left: Math.max(12, Math.min((vw - w) / 2 + 60, vw - w - 12)), top: Math.min(22, Math.max(0, vh - h - 12)) };
  const at = pos || base;
  const startDrag = (e) => {
    if (chrome !== "desktop" || max || e.button !== 0 || e.target.closest(".wc")) return;
    const sx = e.clientX - at.left;
    const sy = e.clientY - at.top;
    const move = (ev) => setPos({ left: Math.min(Math.max(ev.clientX - sx, 40 - w), vw - 80), top: Math.min(Math.max(ev.clientY - sy, 0), vh - 40) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const grab = (e) => {
    const sy = e.clientY;
    let dy = 0;
    const move = (ev) => {
      dy = Math.max(0, ev.clientY - sy);
      setDragY(dy);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragY(0);
      if (dy > 90 || dy < 4) close();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const style =
    chrome === "desktop" && !max
      ? { left: at.left, top: at.top, width: w, height: h }
      : dragY
        ? { transform: `translateY(${dragY}px)` }
        : undefined;

  let body;
  if (error && !data) {
    body = (
      <div className="st-state">
        <div>
          {error === "forbidden"
            ? "Kayıt İstatistikleri sadece yöneticilere açık."
            : error === "auth"
              ? "Bu pencere için oturum açman gerekiyor."
              : "İstatistikler yüklenemedi."}
          {error === "error" ? (
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={reload} disabled={loading} aria-busy={loading || undefined}>
                {loading ? "Yükleniyor…" : "Tekrar dene"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  } else if (!data) {
    body = <div className="st-state">Yükleniyor…</div>;
  } else {
    body = (
      <div className={loading ? "st-loading" : ""}>
        <StatsContent
          data={data}
          W={W}
          controls={<Controls data={data} query={query} setQuery={setQuery} onCsv={onCsv} csvBusy={csvBusy} />}
        />
      </div>
    );
  }

  // 3.1: a section inside the admin shell, no window chrome of its own.
  if (embedded) {
    return (
      <div className={`st3 st3-embedded${layout === "phone" ? " st3-phone" : ""}`} aria-label="Kayıt İstatistikleri">
        <div ref={winRef} className="st-win">
          <div className="st-body">{body}</div>
        </div>
        {toast ? <div className="st-toast" role="status">{toast}</div> : null}
      </div>
    );
  }

  const tree = (
    <div className={`st3 st3-${chrome}`} role={standalone ? "main" : "dialog"} aria-modal={standalone ? undefined : "true"} aria-label="Kayıt İstatistikleri">
      {standalone ? null : <div className="st3-dim" onClick={chrome === "desktop" ? undefined : close} />}
      <div ref={winRef} className={`st-win${max ? " max" : ""}`} style={style}>
        {chrome === "desktop" || electron ? (
          <div className="st-tb" onPointerDown={startDrag} onDoubleClick={() => (electron ? window.electronAPI.maximizeWindow?.() : setMax((v) => !v))}>
            <img src={logoIcon} alt="" />
            <span>Kayıt İstatistikleri — Descall Yönetici</span>
            <span className="sp" />
            <button type="button" className="wc" aria-label="Küçült" onClick={() => (electron ? window.electronAPI.minimizeWindow?.() : close())}>
              <I n="minus" s={15} w={1.6} />
            </button>
            <button type="button" className="wc" aria-label="Büyüt" onClick={() => (electron ? window.electronAPI.maximizeWindow?.() : setMax((v) => !v))}>
              <svg width="12" height="12" aria-hidden="true">
                <rect x="1" y="1" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
            <button type="button" className="wc x" aria-label="Kapat" onClick={close}>
              <I n="x" s={15} w={1.6} />
            </button>
          </div>
        ) : chrome === "page" ? null : (
          <div className="st-grab" onPointerDown={grab} role="button" aria-label="Kapat" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && close()}>
            <span />
          </div>
        )}
        <div className="st-body">{body}</div>
      </div>
      {toast ? <div className="st-toast" role="status">{toast}</div> : null}
    </div>
  );
  return standalone || typeof document === "undefined" ? tree : createPortal(tree, document.body);
}
