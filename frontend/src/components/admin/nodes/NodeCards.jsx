/**
 * Sunucu Ağı cards (Draft A "Kontrol merkezi", scratchpad hibrit-sunucu-taslaklar.html#a):
 *   KpiRow        Render RAM, PC RAM with its role pill, connections split, capacity estimate
 *   MemoryChart   memory of both nodes, last hour, live; the Render 90 % line
 *   LatencyChart  network p95 latency and error rate, last hour
 *   SharePanel    PC share: RAM 0.5-8 GB, CPU 1-8 cores, load rule + thresholds, Apply,
 *                 capacity preview while dragging
 *   GamePanel     game mode, full handover, weekly schedule (mini heat map + editor)
 *   ActionsPanel  graceful drain, all to Render (emergency), failover drill, node keys
 *   EventsCard    events table (time, event, effect)
 *   AlertsCard    phone alerts (PC down, Key Value full, Render 90 %) + a test push
 *   SavedCard     what the PC saved this month
 *   Banners and the setup card (single-node mode, Key Value unreachable, PC never
 *   registered, emergency, migration not applied).
 */
import { useId, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { formatDate, formatNumber } from "../../../i18n/format.js";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Check,
  Cloud,
  Cpu,
  Database,
  FlaskConical,
  Gamepad2,
  KeyRound,
  Monitor,
  Network,
  Play,
  Power,
  RefreshCw,
  Server,
  Smartphone,
  Wallet,
  WifiOff,
  Zap,
} from "../../ui/Icon.jsx";
import { Skel, Toggle } from "../tokens/TokenUi.jsx";
import {
  ACCENT,
  BAD,
  CORES_MAX,
  CORES_MIN,
  DAY_ORDER,
  OK,
  PC_COLOR,
  PC_PCT,
  RAM_MAX_MB,
  RAM_MIN_MB,
  RAM_STEP_MB,
  RENDER_PCT,
  WARN,
  agoLabel,
  areaPath,
  capacityFor,
  eventLine,
  indexAt,
  lastValue,
  linePath,
  memPct,
  memTone,
  niceMax,
  pickNodes,
  scheduleSummary,
  shareChoices,
  slotsToGrid,
  stateKey,
} from "./nodeModel.js";

/** Locale formatters for the page. */
export function useNx() {
  const { t, locale } = useLocale();
  return useMemo(
    () => ({
      t,
      locale,
      L: (l) => (l ? t(l.key, l.vars) : ""),
      n: (v) => formatNumber(Math.round(Number(v) || 0), locale),
      d1: (v) => formatNumber(Number(v) || 0, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      d2: (v) => formatNumber(Number(v) || 0, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      gb: (mb) => formatNumber((Number(mb) || 0) / 1024, locale, { maximumFractionDigits: 2 }),
      gb1: (mb) => formatNumber((Number(mb) || 0) / 1024, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      usd: (v) => formatNumber(Number(v) || 0, locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      time: (iso) => formatDate(iso, locale, { hour: "2-digit", minute: "2-digit" }),
      dt: (iso) => formatDate(iso, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    }),
    [t, locale]
  );
}

const TONE_COLOR = { ok: OK, warn: WARN, bad: BAD };

function Bar({ pct, color, testId }) {
  return (
    <span className="anx-bar" aria-hidden="true" data-testid={testId}>
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </span>
  );
}

function NewTag() {
  const { t } = useLocale();
  return <span className="anx-new">{t("anodes.new")}</span>;
}

/* ---------------- KPI row ---------------- */

export function KpiRow({ data, loading, draft, onSetup }) {
  const f = useNx();
  const { t } = f;
  const { render, pc } = pickNodes(data);
  const highPct = data?.cfg?.loadRule?.renderHighPct || 60;
  const rPct = memPct(render);
  const pPct = memPct(pc);
  const total = data?.totals?.conns || 0;
  const rConns = render ? data?.totals?.byNode?.[render.id] || 0 : 0;
  const pConns = pc ? data?.totals?.byNode?.[pc.id] || 0 : 0;
  const cap = data?.capacity;
  const preview = draft && data && draft.ramMb !== data.cfg?.ramMb ? capacityFor(data, draft.ramMb) : null;
  const delta = preview && cap ? preview.estimate - capacityFor(data, data.cfg.ramMb).estimate : 0;
  const isLeader = render && data?.leader === render.id;
  return (
    <section className="anx-g4" aria-label={t("anodes.kpi.label")} data-testid="anx-kpis">
      <div className="atk-glass anx-kpi">
        <div className="anx-row anx-sp">
          <span className="anx-l">
            <Cloud size={13} aria-hidden="true" />
            {t("anodes.kpi.render")}
          </span>
          {render ? <span className={`anx-pill ${isLeader ? "is-ok" : ""}`}>{t(isLeader ? "anodes.kpi.leader" : "anodes.kpi.follower")}</span> : null}
        </div>
        {loading ? (
          <Skel w={110} h={26} />
        ) : (
          <div className="anx-v tnum">
            {f.n(render?.memRss)} <small>{t("anodes.kpi.ofMb", { n: f.n(render?.memLimit || 512) })}</small>
          </div>
        )}
        <Bar pct={rPct} color={TONE_COLOR[memTone(rPct, highPct)]} testId="anx-render-bar" />
        <span className="anx-s">{render ? t("anodes.kpi.renderSub", { cpu: f.n(render.cpu), p95: f.n(render.p95ms), pct: f.n(rPct) }) : t("anodes.kpi.noData")}</span>
      </div>

      <div className="atk-glass anx-kpi is-pc">
        <div className="anx-row anx-sp">
          <span className="anx-l">
            <Monitor size={13} aria-hidden="true" />
            {t("anodes.kpi.pc")}
          </span>
          <span className={`anx-pill is-pc st-${pc ? pc.state : "down"}`} data-testid="anx-pc-state">
            {t(pc ? stateKey(pc.state) : data?.pc?.registered ? "anodes.state.down" : "anodes.state.none")}
          </span>
        </div>
        {loading ? (
          <Skel w={110} h={26} />
        ) : pc ? (
          <div className="anx-v tnum">
            {f.gb(pc.memRss)} <small>{t("anodes.kpi.ofGb", { n: f.gb(pc.memLimit || data?.cfg?.ramMb) })}</small>
          </div>
        ) : (
          <div className="anx-v is-dim">{t("anodes.dash")}</div>
        )}
        <Bar pct={pPct} color={PC_COLOR} />
        {pc ? (
          <span className="anx-s">{t(pc.gameMode ? "anodes.kpi.pcSubGame" : "anodes.kpi.pcSub", { cores: f.n(pc.cores), pct: f.n(pPct), p95: f.n(pc.p95ms) })}</span>
        ) : (
          <button type="button" className="atk-link anx-s" onClick={onSetup}>
            {data?.pc?.registered ? t("anodes.kpi.pcLastSeen", { when: f.L(agoLabel(data.pc.lastSeenAt)) }) : t("anodes.kpi.pcSetup")}
          </button>
        )}
      </div>

      <div className="atk-glass anx-kpi">
        <span className="anx-l">
          <Activity size={13} aria-hidden="true" />
          {t("anodes.kpi.conns")}
        </span>
        {loading ? <Skel w={70} h={26} /> : <div className="anx-v tnum">{f.n(total)}</div>}
        <span className="anx-split" aria-hidden="true">
          <i style={{ flex: Math.max(0.0001, rConns), background: ACCENT }} />
          <i style={{ flex: Math.max(0.0001, pConns), background: PC_COLOR }} />
        </span>
        <span className="anx-s">
          <span className="anx-acc">{t("anodes.kpi.connRender", { n: f.n(rConns) })}</span>
          <span className="anx-dotsep" aria-hidden="true" />
          <span className="anx-pcc">{t("anodes.kpi.connPc", { n: f.n(pConns) })}</span>
        </span>
      </div>

      <div className="atk-glass anx-kpi">
        <span className="anx-l">
          <Zap size={13} aria-hidden="true" />
          {t("anodes.kpi.capacity")}
          <NewTag />
        </span>
        {loading ? (
          <Skel w={80} h={26} />
        ) : (
          <div className="anx-v anx-ok tnum" data-testid="anx-capacity">
            {t("anodes.approx", { n: f.n(preview ? preview.estimate : cap?.estimate) })}
          </div>
        )}
        <span className="anx-s">
          {preview ? (
            <b className={delta >= 0 ? "anx-ok" : "anx-warn"}>{t(delta >= 0 ? "anodes.kpi.previewUp" : "anodes.kpi.previewDown", { n: f.n(Math.abs(delta)) })}</b>
          ) : (
            t("anodes.kpi.capacitySub")
          )}
        </span>
      </div>
    </section>
  );
}

/* ---------------- charts ---------------- */

const W = 560;
const H = 150;

function useHover(n) {
  const [i, setI] = useState(null);
  const ref = useRef(null);
  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setI(indexAt((e.clientX - r.left) / r.width, n));
  };
  return { i, ref, onMove, onLeave: () => setI(null) };
}

function Axis({ t0, t1 }) {
  const f = useNx();
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => t0 + (t1 - t0) * p);
  return (
    <div className="anx-axis" aria-hidden="true">
      {ticks.map((tt, k) => (
        <span key={k}>{k === ticks.length - 1 ? f.t("anodes.chart.now") : f.time(new Date(tt).toISOString())}</span>
      ))}
    </div>
  );
}

function ChartFrame({ chart, lines, lines2 = [], max, max2, thresholds = [], tooltip, empty, testId }) {
  const { t } = useLocale();
  const gid = useId().replace(/:/g, "");
  const hv = useHover(chart.n);
  const xAt = (i) => (i / (chart.n - 1)) * W;
  return (
    <div className="anx-chart" data-testid={testId}>
      <div className="anx-chart-plot" ref={hv.ref} onPointerMove={hv.onMove} onPointerLeave={hv.onLeave}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t("anodes.chart.aria")}>
          <defs>
            {lines.map((l, k) => (
              <linearGradient key={k} id={`${gid}-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={l.color} stopOpacity="0.28" />
                <stop offset="1" stopColor={l.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {[0.25, 0.5, 0.75].map((p) => (
            <line key={p} x1="0" x2={W} y1={H * p} y2={H * p} className="anx-grid" vectorEffect="non-scaling-stroke" />
          ))}
          {thresholds.map((th) => (
            <line key={th.label} x1="0" x2={W} y1={H - (th.value / max) * H} y2={H - (th.value / max) * H} stroke={th.color} strokeDasharray="4 4" strokeOpacity={th.faint ? 0.45 : 0.9} vectorEffect="non-scaling-stroke" />
          ))}
          {lines.map((l, k) => (l.area ? <path key={`a${k}`} d={areaPath(l.values, W, H, max)} fill={`url(#${gid}-${k})`} /> : null))}
          {lines.map((l, k) => (
            <path key={`l${k}`} d={linePath(l.values, W, H, max)} fill="none" stroke={l.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {lines2.map((l, k) => (
            <path key={`s${k}`} d={linePath(l.values, W, H, max2)} fill="none" stroke={l.color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
          {hv.i != null ? <line x1={xAt(hv.i)} x2={xAt(hv.i)} y1="0" y2={H} className="anx-cross" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {thresholds.filter((th) => !th.faint).map((th) => (
          <span key={th.label} className="anx-th" style={{ top: `${(1 - th.value / max) * 100}%`, color: th.color }}>
            {th.label}
          </span>
        ))}
        {empty ? <span className="anx-chart-empty">{t("anodes.chart.empty")}</span> : null}
        {hv.i != null && !empty ? (
          <div className={`anx-tip${hv.i > chart.n * 0.62 ? " is-left" : ""}`} style={{ left: `${(hv.i / (chart.n - 1)) * 100}%` }} role="status">
            {tooltip(hv.i)}
          </div>
        ) : null}
      </div>
      <Axis t0={chart.t0} t1={chart.t1} />
    </div>
  );
}

export function MemoryChart({ chart, data, loading }) {
  const f = useNx();
  const { t } = f;
  const hasPc = Boolean(pickNodes(data).pc) || chart.pc.some((v) => v != null);
  const highPct = data?.cfg?.loadRule?.renderHighPct || 60;
  const empty = !loading && !chart.render.some((v) => v != null) && !chart.pc.some((v) => v != null);
  return (
    <section className="atk-glass anx-card" data-testid="anx-mem-chart">
      <div className="anx-card-h">
        <h3>{t("anodes.chart.memTitle")}</h3>
        <span className="atk-live">{t("anodes.live")}</span>
      </div>
      {loading ? (
        <Skel h={150} r={10} />
      ) : (
        <ChartFrame
          chart={chart}
          max={100}
          empty={empty}
          lines={[{ values: chart.render, color: ACCENT, area: true }, ...(hasPc ? [{ values: chart.pc, color: PC_COLOR, area: true }] : [])]}
          thresholds={[
            { value: 90, label: t("anodes.chart.limit90"), color: BAD },
            { value: highPct, label: t("anodes.chart.rule", { pct: f.n(highPct) }), color: WARN, faint: true },
          ]}
          tooltip={(i) => (
            <>
              <b>{f.time(new Date(chart.t0 + i * 10000).toISOString())}</b>
              <span className="anx-acc">{chart.renderMb[i] != null ? t("anodes.chart.tipRender", { mb: f.n(chart.renderMb[i]), pct: f.n(chart.render[i]) }) : t("anodes.chart.tipNone")}</span>
              {hasPc ? <span className="anx-pcc">{chart.pcMb[i] != null ? t("anodes.chart.tipPc", { gb: f.gb(chart.pcMb[i]), pct: f.n(chart.pc[i]) }) : t("anodes.chart.tipPcOff")}</span> : null}
            </>
          )}
          testId="anx-mem-plot"
        />
      )}
      <div className="anx-legend">
        <span className="anx-acc">
          <i style={{ background: ACCENT }} />
          {t("anodes.kpi.render")}
        </span>
        {hasPc ? (
          <span className="anx-pcc">
            <i style={{ background: PC_COLOR }} />
            {t("anodes.chart.pc")}
          </span>
        ) : null}
        <span className="anx-sub">{t("anodes.chart.memNote")}</span>
      </div>
    </section>
  );
}

export function LatencyChart({ chart, loading }) {
  const f = useNx();
  const { t } = f;
  const p95Now = lastValue(chart.p95);
  const errNow = lastValue(chart.err);
  const max = niceMax(chart.p95, 100);
  const max2 = Math.max(4, niceMax(chart.err, 1) * 2.5);
  const tone = p95Now == null ? "" : p95Now < 150 ? "is-ok" : p95Now < 400 ? "is-warn" : "is-bad";
  const empty = !loading && !chart.p95.some((v) => v != null);
  return (
    <section className="atk-glass anx-card" data-testid="anx-lat-chart">
      <div className="anx-card-h">
        <h3>{t("anodes.chart.latTitle")}</h3>
        <span className={`anx-pill ${tone}`} data-testid="anx-p95">
          {p95Now == null ? t("anodes.chart.p95None") : t("anodes.chart.p95", { ms: f.n(p95Now) })}
        </span>
      </div>
      {loading ? (
        <Skel h={150} r={10} />
      ) : (
        <ChartFrame
          chart={chart}
          max={max}
          max2={max2}
          empty={empty}
          lines={[{ values: chart.p95, color: OK, area: true }]}
          lines2={[{ values: chart.err, color: WARN }]}
          tooltip={(i) => (
            <>
              <b>{f.time(new Date(chart.t0 + i * 10000).toISOString())}</b>
              <span className="anx-ok">{chart.p95[i] != null ? t("anodes.chart.tipP95", { ms: f.n(chart.p95[i]) }) : t("anodes.chart.tipNone")}</span>
              <span className="anx-warn">{chart.err[i] != null ? t("anodes.chart.tipErr", { pct: f.d1(chart.err[i]) }) : t("anodes.dash")}</span>
              {chart.conns[i] != null ? <span>{t("anodes.chart.tipConns", { n: f.n(chart.conns[i]) })}</span> : null}
            </>
          )}
          testId="anx-lat-plot"
        />
      )}
      <div className="anx-legend">
        <span className="anx-ok">
          <i style={{ background: OK }} />
          {t("anodes.chart.p95Legend")}
        </span>
        <span className="anx-warn">
          <i style={{ background: WARN }} />
          {t("anodes.chart.errLegend")}
        </span>
        <span className="anx-sub">{errNow == null ? t("anodes.chart.latNote") : t("anodes.chart.errNow", { pct: f.d1(errNow) })}</span>
      </div>
    </section>
  );
}

/* ---------------- PC share ---------------- */

function Range({ id, min, max, step, value, onChange, disabled, label, valueText, color = ACCENT, testId }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      id={id}
      type="range"
      className="anx-range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={valueText}
      style={{ "--p": `${pct}%`, "--c": color }}
      onChange={(e) => onChange(Number(e.target.value))}
      data-testid={testId}
    />
  );
}

export function SharePanel({ data, draft, setDraft, dirty, busy, disabled, onApply, onReset }) {
  const f = useNx();
  const { t } = f;
  const [preview, setPreview] = useState(false);
  const ids = { ram: useId(), cpu: useId(), r: useId(), p: useId() };
  const now = data ? capacityFor(data, data.cfg?.ramMb || draft.ramMb) : null;
  const next = data ? capacityFor(data, draft.ramMb) : null;
  const maxUsers = next ? Math.max(1, next.estimate, now?.estimate || 0) : 1;
  const lr = draft.loadRule;
  return (
    <section className="atk-glass anx-card anx-panel" data-testid="anx-share">
      <div className="anx-card-h">
        <h3>
          <Cpu size={15} aria-hidden="true" />
          {t("anodes.share.title")}
        </h3>
        {dirty ? <span className="anx-pill is-warn">{t("anodes.share.unsaved")}</span> : null}
      </div>
      <label className="anx-kv" htmlFor={ids.ram}>
        <span>{t("anodes.share.ram")}</span>
        <b className="tnum">{t("anodes.gbUnit", { n: f.gb1(draft.ramMb) })}</b>
      </label>
      <Range id={ids.ram} min={RAM_MIN_MB} max={RAM_MAX_MB} step={RAM_STEP_MB} value={draft.ramMb} disabled={disabled} label={t("anodes.share.ram")} valueText={t("anodes.gbUnit", { n: f.gb1(draft.ramMb) })} color={PC_COLOR} onChange={(v) => setDraft((d) => ({ ...d, ramMb: v }))} testId="anx-ram" />
      <div className="anx-scale" aria-hidden="true">
        <span>{t("anodes.gbUnit", { n: f.gb1(RAM_MIN_MB) })}</span>
        <span>{t("anodes.gbUnit", { n: f.gb1(RAM_MAX_MB) })}</span>
      </div>
      <label className="anx-kv" htmlFor={ids.cpu}>
        <span>{t("anodes.share.cores")}</span>
        <b className="tnum">{f.n(draft.cores)}</b>
      </label>
      <Range id={ids.cpu} min={CORES_MIN} max={CORES_MAX} step={1} value={draft.cores} disabled={disabled} label={t("anodes.share.cores")} valueText={t("anodes.share.coresN", { n: draft.cores })} onChange={(v) => setDraft((d) => ({ ...d, cores: v }))} testId="anx-cores" />
      <div className="anx-kv anx-mt8">
        <span>{t("anodes.share.rule", { pct: f.n(lr.renderHighPct) })}</span>
        <Toggle checked={lr.enabled} disabled={disabled} label={t("anodes.share.ruleAria")} onChange={(v) => setDraft((d) => ({ ...d, loadRule: { ...d.loadRule, enabled: v } }))} testId="anx-rule" />
      </div>
      {lr.enabled ? (
        <div className="anx-rule">
          <label htmlFor={ids.r}>
            <span>{t("anodes.share.renderHigh")}</span>
            <b className="tnum">{t("anodes.pctN", { n: f.n(lr.renderHighPct) })}</b>
          </label>
          <Range id={ids.r} min={RENDER_PCT[0]} max={RENDER_PCT[1]} step={5} value={lr.renderHighPct} disabled={disabled} label={t("anodes.share.renderHigh")} valueText={t("anodes.pctN", { n: lr.renderHighPct })} onChange={(v) => setDraft((d) => ({ ...d, loadRule: { ...d.loadRule, renderHighPct: v } }))} />
          <label htmlFor={ids.p}>
            <span>{t("anodes.share.pcHigh")}</span>
            <b className="tnum">{t("anodes.pctN", { n: f.n(lr.pcHighPct) })}</b>
          </label>
          <Range id={ids.p} min={PC_PCT[0]} max={PC_PCT[1]} step={1} value={lr.pcHighPct} disabled={disabled} label={t("anodes.share.pcHigh")} valueText={t("anodes.pctN", { n: lr.pcHighPct })} color={PC_COLOR} onChange={(v) => setDraft((d) => ({ ...d, loadRule: { ...d.loadRule, pcHighPct: v } }))} />
        </div>
      ) : (
        <p className="anx-note">{t("anodes.share.ruleOff")}</p>
      )}
      {preview && next ? (
        <div className="anx-preview" data-testid="anx-preview">
          <div className="anx-kv">
            <span>{t("anodes.share.previewTitle")}</span>
            <b className="anx-ok tnum">{t("anodes.approx", { n: f.n(next.estimate) })}</b>
          </div>
          <div className="anx-pbar">
            <span>{t("anodes.kpi.render")}</span>
            <span className="anx-bar">
              <i style={{ width: `${(next.renderUsers / maxUsers) * 100}%`, background: ACCENT }} />
            </span>
            <b className="tnum">{f.n(next.renderUsers)}</b>
          </div>
          <div className="anx-pbar">
            <span>{t("anodes.chart.pc")}</span>
            <span className="anx-bar">
              <i style={{ width: `${(next.pcUsers / maxUsers) * 100}%`, background: PC_COLOR }} />
            </span>
            <b className="tnum">{f.n(next.pcUsers)}</b>
          </div>
          <span className="anx-sub">{t("anodes.share.perUser", { mb: f.d1(next.perUserMb) })}</span>
        </div>
      ) : null}
      <div className="anx-acts">
        <button type="button" className="atk-btn is-pri" disabled={disabled || busy || !dirty} onClick={onApply} data-testid="anx-apply">
          {busy ? <RefreshCw size={14} className="anx-spin" /> : <Check size={14} />}
          {t("anodes.share.apply")}
        </button>
        <button type="button" className={`atk-btn${preview ? " is-on" : ""}`} aria-pressed={preview} onClick={() => setPreview((v) => !v)} data-testid="anx-preview-btn">
          {t("anodes.share.preview")}
        </button>
        {dirty ? (
          <button type="button" className="atk-btn is-ghost" onClick={onReset} disabled={busy}>
            {t("anodes.share.reset")}
          </button>
        ) : null}
      </div>
      <p className="anx-note">{t("anodes.share.stepUp")}</p>
    </section>
  );
}

/* ---------------- game mode + plan ---------------- */

export function MiniHeat({ slots, enabled = true }) {
  const { t } = useLocale();
  const grid = slotsToGrid(slots);
  return (
    <div className={`anx-mheat${enabled ? "" : " is-off"}`} aria-hidden="true">
      {DAY_ORDER.map((d) => (
        <div key={d} className="anx-mheat-row">
          <span>{t(`anodes.day.s${d}`)}</span>
          {grid[d].map((on, h) => (
            <i key={h} className={on ? "is-on" : ""} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function GamePanel({ data, busyKey, disabled, onPatch, onEditPlan }) {
  const f = useNx();
  const { t } = f;
  const cfg = data?.cfg;
  const gm = cfg?.gameMode || { enabled: true, shareMb: 1024, fullHandover: false };
  const sch = cfg?.schedule || { enabled: true, slots: [] };
  const { pc } = pickNodes(data);
  const choices = shareChoices(cfg?.ramMb || 2048);
  const nowBits = [
    t(pc?.gameMode ? "anodes.game.nowGame" : "anodes.game.nowNoGame"),
    t(sch.enabled === false ? "anodes.game.nowNoPlan" : data?.schedule?.now ? "anodes.game.nowIn" : "anodes.game.nowOut"),
    t("anodes.game.nowHours", { n: f.n(data?.schedule?.hoursPerWeek ?? 168) }),
  ];
  return (
    <section className="atk-glass anx-card anx-panel" data-testid="anx-game">
      <div className="anx-card-h">
        <h3>
          <Gamepad2 size={15} aria-hidden="true" />
          {t("anodes.game.title")}
        </h3>
      </div>
      <div className="anx-kv">
        <span>{t("anodes.game.drop", { size: f.gb1(gm.shareMb) })}</span>
        <Toggle checked={gm.enabled} disabled={disabled || busyKey === "gm"} label={t("anodes.game.dropAria")} onChange={(v) => onPatch({ gameMode: { enabled: v } }, "gm")} testId="anx-game-toggle" />
      </div>
      {gm.enabled ? (
        <div className="anx-seg" role="radiogroup" aria-label={t("anodes.game.shareAria")}>
          {choices.map((mb) => (
            <button key={mb} type="button" role="radio" aria-checked={gm.shareMb === mb} className={gm.shareMb === mb ? "is-on" : ""} disabled={disabled || busyKey === "gm"} onClick={() => onPatch({ gameMode: { shareMb: mb } }, "gm")}>
              {t("anodes.gbUnit", { n: f.gb1(mb) })}
            </button>
          ))}
        </div>
      ) : null}
      <div className="anx-kv anx-mt8">
        <span>{t("anodes.game.full")}</span>
        <Toggle checked={gm.fullHandover} disabled={disabled || busyKey === "full"} label={t("anodes.game.fullAria")} onChange={(v) => onPatch({ gameMode: { fullHandover: v } }, "full")} testId="anx-full-toggle" />
      </div>
      <div className="anx-kv anx-mt8">
        <span>
          {t("anodes.game.plan")} <b className="anx-strong">{f.L(scheduleSummary(sch))}</b>
        </span>
        <button type="button" className="atk-btn is-sm" onClick={onEditPlan} disabled={disabled} data-testid="anx-plan-edit">
          {t("anodes.game.edit")}
        </button>
      </div>
      <button type="button" className="anx-mheat-btn" onClick={onEditPlan} disabled={disabled} aria-label={t("anodes.game.edit")}>
        <MiniHeat slots={sch.slots} enabled={sch.enabled !== false} />
      </button>
      <p className="anx-now">{t("anodes.game.now", { list: nowBits.join(" · ") })}</p>
    </section>
  );
}

/* ---------------- quick actions ---------------- */

export function ActionsPanel({ data, disabled, lastDrill, onDrain, onResume, onEmergency, onDrill, onKeys, onRevokeKey }) {
  const f = useNx();
  const { t } = f;
  const { pc } = pickNodes(data);
  const active = pc?.state === "active";
  const parked = pc && (pc.state === "draining" || pc.state === "paused");
  const keys = data?.keys || { active: 0, max: 5, available: false };
  return (
    <section className="atk-glass anx-card anx-panel" data-testid="anx-actions">
      <div className="anx-card-h">
        <h3>
          <Zap size={15} aria-hidden="true" />
          {t("anodes.act.title")}
        </h3>
      </div>
      <div className="anx-actlist">
        {parked || data?.emergency ? (
          <button type="button" className="atk-btn is-pri" onClick={onResume} disabled={disabled || !pc} data-testid="anx-resume">
            <Play size={14} />
            {t("anodes.act.resume")}
          </button>
        ) : null}
        <button type="button" className="atk-btn" onClick={onDrain} disabled={disabled || !active} title={active ? undefined : t("anodes.act.needPc")} data-testid="anx-drain">
          <Power size={14} />
          {t("anodes.act.drain")}
        </button>
        <button type="button" className="atk-btn" onClick={onEmergency} disabled={disabled} data-testid="anx-emergency">
          <AlertTriangle size={14} />
          {t("anodes.act.emergency")}
        </button>
        <button type="button" className="atk-btn" onClick={onDrill} disabled={disabled || !active} title={active ? undefined : t("anodes.act.needPc")} data-testid="anx-drill">
          <FlaskConical size={14} />
          {t("anodes.act.drill")}
          <NewTag />
        </button>
        <button type="button" className="atk-btn is-dan" onClick={onRevokeKey} disabled={!keys.available || !keys.active} data-testid="anx-revoke-key">
          <KeyRound size={14} />
          {t("anodes.act.revokeKey")}
        </button>
      </div>
      <button type="button" className="anx-keysline" onClick={onKeys} data-testid="anx-keys-open">
        <KeyRound size={13} aria-hidden="true" />
        <span>{keys.available ? t("anodes.act.keys", { n: f.n(keys.active), max: f.n(keys.max) }) : t("anodes.act.keysOff")}</span>
        <span className="atk-link">{t("anodes.act.manage")}</span>
      </button>
      {lastDrill ? (
        <p className={`anx-now ${lastDrill.dropped ? "anx-warn" : "anx-ok"}`} data-testid="anx-last-drill">
          {t(lastDrill.dropped ? "anodes.act.lastDrillLoss" : "anodes.act.lastDrill", { moved: f.n(lastDrill.moved), dropped: f.n(lastDrill.dropped), sec: f.d1((lastDrill.ms || 0) / 1000) })}
        </p>
      ) : (
        <p className="anx-now">{t("anodes.act.drillHint")}</p>
      )}
    </section>
  );
}

/* ---------------- events ---------------- */

export function EventsCard({ events, loading, onAudit }) {
  const f = useNx();
  const { t } = f;
  const [all, setAll] = useState(false);
  const list = Array.isArray(events) ? events : [];
  const rows = all ? list : list.slice(0, 8);
  return (
    <section className="atk-glass anx-card anx-events" data-testid="anx-events">
      <div className="anx-card-h">
        <h3>{t("anodes.ev.title")}</h3>
        <span className="anx-row">
          {list.length > 8 ? (
            <button type="button" className="atk-link" onClick={() => setAll((v) => !v)}>
              {all ? t("anodes.ev.less") : t("anodes.ev.all", { n: f.n(list.length) })}
            </button>
          ) : null}
          {onAudit ? (
            <button type="button" className="atk-link" onClick={onAudit} data-testid="anx-audit-link">
              {t("anodes.ev.audit")}
            </button>
          ) : null}
        </span>
      </div>
      {loading ? (
        <>
          <Skel h={14} />
          <Skel h={14} />
          <Skel h={14} />
        </>
      ) : !list.length ? (
        <p className="atk-empty-s">{t("anodes.ev.empty")}</p>
      ) : (
        <div className="anx-tablewrap">
          <table className="anx-table">
            <thead>
              <tr>
                <th scope="col">{t("anodes.ev.time")}</th>
                <th scope="col">{t("anodes.ev.event")}</th>
                <th scope="col">{t("anodes.ev.effect")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, k) => {
                const line = eventLine(e);
                return (
                  <tr key={`${e.at}-${e.kind}-${k}`}>
                    <td className="tnum anx-nowrap" title={f.dt(e.at)}>
                      {f.time(e.at)}
                    </td>
                    <td>
                      <span className={`anx-evdot is-${line.tone}`} aria-hidden="true" />
                      {f.L(line.what)}
                    </td>
                    <td className={`anx-eff is-${line.tone}`}>{line.effect ? f.L(line.effect) : t("anodes.dash")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------------- alerts, saved cost ---------------- */

export function AlertsCard({ data, busyKey, disabled, onToggle, onTest }) {
  const { t } = useLocale();
  const a = data?.cfg?.alerts || { pcDown: true, kvFull: true, render90: true };
  const rows = [
    ["pcDown", WifiOff],
    ["kvFull", Database],
    ["render90", Server],
  ];
  return (
    <section className="atk-glass anx-card" data-testid="anx-alerts">
      <div className="anx-card-h">
        <h3>
          <BellRing size={15} aria-hidden="true" />
          {t("anodes.alerts.title")}
        </h3>
        <NewTag />
      </div>
      <ul className="anx-alist">
        {rows.map(([k, Icon]) => (
          <li key={k}>
            <span className="anx-aic" aria-hidden="true">
              <Icon size={14} />
            </span>
            <span className="anx-at">
              <b>{t(`anodes.alerts.${k}`)}</b>
              <span>{t(`anodes.alerts.${k}Sub`)}</span>
            </span>
            <Toggle checked={a[k] !== false} disabled={disabled || busyKey === `al-${k}`} label={t(`anodes.alerts.${k}`)} onChange={(v) => onToggle(k, v)} testId={`anx-alert-${k}`} />
          </li>
        ))}
      </ul>
      <div className="anx-acts">
        <button type="button" className="atk-btn is-sm" onClick={onTest} disabled={busyKey === "test"} data-testid="anx-alert-test">
          <Smartphone size={13} />
          {t("anodes.alerts.test")}
        </button>
        <span className="anx-sub">{t("anodes.alerts.where")}</span>
      </div>
    </section>
  );
}

export function SavedCard({ data, loading }) {
  const f = useNx();
  const { t } = f;
  return (
    <section className="atk-glass anx-card anx-saved" data-testid="anx-saved">
      <div className="anx-card-h">
        <h3>
          <Wallet size={15} aria-hidden="true" />
          {t("anodes.saved.title")}
        </h3>
        <NewTag />
      </div>
      {loading ? (
        <Skel w={90} h={28} />
      ) : (
        <div className="anx-v anx-ok tnum" data-testid="anx-saved-usd">
          {f.usd(data?.savedUsdMonth)}
        </div>
      )}
      <p className="anx-s">{t("anodes.saved.line", { gbh: f.n(data?.saved?.gbHours), h: f.n(data?.saved?.pcHours) })}</p>
      <p className="anx-note">{t("anodes.saved.basis")}</p>
    </section>
  );
}

/* ---------------- banners, setup ---------------- */

export function Banner({ tone = "info", icon: Icon = AlertTriangle, title, children, action, testId }) {
  return (
    <div className={`atk-banner anx-banner is-${tone}`} role={tone === "bad" ? "alert" : "note"} data-testid={testId}>
      <Icon size={20} aria-hidden="true" />
      <div className="atk-banner-t">
        <b>{title}</b>
        {children}
      </div>
      {action}
    </div>
  );
}

export function SetupCard({ data, view, onCreateKey, cardRef }) {
  const { t } = useLocale();
  const kvOn = !data?.single;
  const hasKey = (data?.keys?.active || 0) > 0;
  const steps = [
    ["kv", kvOn, Database],
    ["key", hasKey, KeyRound],
    ["app", false, Monitor],
    ["drill", false, FlaskConical],
  ];
  return (
    <section className="atk-glass anx-card anx-setup" ref={cardRef} data-testid="anx-setup">
      <div className="anx-card-h">
        <h3>
          <Network size={15} aria-hidden="true" />
          {t(view === "pcOff" ? "anodes.setup.titleOff" : "anodes.setup.title")}
        </h3>
      </div>
      <p className="anx-s">{t(view === "pcOff" ? "anodes.setup.leadOff" : "anodes.setup.lead")}</p>
      <ol className="anx-steps">
        {steps.map(([k, done, Icon], i) => (
          <li key={k} className={done ? "is-done" : ""}>
            <span className="anx-stepn" aria-hidden="true">
              {done ? <Check size={13} /> : i + 1}
            </span>
            <span className="anx-at">
              <b>
                <Icon size={13} aria-hidden="true" /> {t(`anodes.setup.${k}`)}
              </b>
              <span>{t(`anodes.setup.${k}Sub`)}</span>
            </span>
            {k === "key" && !hasKey ? (
              <button type="button" className="atk-btn is-sm is-pri" onClick={onCreateKey} disabled={!data?.keys?.available} data-testid="anx-setup-key">
                {t("anodes.setup.keyCta")}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
