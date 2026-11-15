/**
 * Sistem page cards (Draft A frame A1): health tiles, feature flags table, Edge realtime,
 * kill switches by area, limits, broadcast, backup + filter link.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { formatAppDateTime } from "../../../lib/datetime";
import {
  ArrowRight,
  Clock,
  Cloud,
  Cpu,
  Database,
  Download,
  Eye,
  FileText,
  Gauge,
  History,
  Megaphone,
  MessageCircle,
  Minus,
  Monitor,
  Plus,
  Power,
  Send,
  SlidersHorizontal,
  Smartphone,
  ToggleLeft,
  UserPlus,
  Users,
  Video,
  Wrench,
  Zap,
} from "../../ui/Icon.jsx";
import { Popover, Skel, Spark, Switch } from "./SystemUi.jsx";
import {
  EDGE_STAGES,
  agoLabel,
  agoShortLabel,
  bytesParts,
  dedupeMarkers,
  linePath,
  markerX,
  niceMax,
  normalizeRule,
  rolloutCell,
  scopeKeys,
  slowStep,
  stageStates,
  switchRows,
  untilLabel,
  uptimeLabel,
} from "./systemModel.js";

export const FLAG_ICONS = { phone: Smartphone, monitor: Monitor, users: Users, zap: Zap, cloud: Cloud };
const L = (t, l) => (l ? t(l.key, l.vars) : "");

function shortDate(at, locale) {
  return formatAppDateTime(at, locale, { day: "numeric", month: "short", year: undefined, hour: "2-digit", minute: "2-digit", second: undefined });
}

/* ---------------- health tiles ---------------- */

const LEVEL_TONE = { ok: "pos", warn: "amber", bad: "neg", unknown: "muted" };

export function HealthTiles({ health, loading }) {
  const { t, locale } = useLocale();
  const n = (v) => formatNumber(v, locale);
  if (loading || !health) {
    return (
      <div className="asx-hts" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="asx-ht" key={i}>
            <Skel w="60%" />
            <Skel w="45%" h={20} />
            <Skel h={28} />
          </div>
        ))}
      </div>
    );
  }
  const c = health.current;
  const lv = health.levels || {};
  const s = health.series || {};
  const memPct = c.memLimitMb ? Math.round((c.rssMb / c.memLimitMb) * 100) : null;
  const up = uptimeLabel(c.uptimeSec);
  const tiles = [
    {
      id: "cpu",
      icon: Cpu,
      label: t("sysx.tile.cpu"),
      em: t(`sysx.level.${lv.cpu || "unknown"}`),
      tone: LEVEL_TONE[lv.cpu] || "muted",
      value: c.cpu == null ? "–" : t("sysx.pct", { n: n(Math.round(c.cpu)) }),
      unit: t("sysx.tile.cores", { n: c.cores }),
      spark: s.cpu,
      color: "#7b93ff",
    },
    {
      id: "mem",
      icon: Database,
      label: t("sysx.tile.mem"),
      em: memPct == null ? "" : t("sysx.pct", { n: memPct }),
      tone: LEVEL_TONE[lv.memory] || "muted",
      value: n(c.rssMb),
      unit: t("sysx.tile.ofMb", { n: n(c.memLimitMb) }),
      spark: s.rss,
      color: "#9b5de5",
    },
    {
      id: "lag",
      icon: Gauge,
      label: t("sysx.tile.lag"),
      em: c.lagP99 == null ? "" : t("sysx.tile.p99", { n: n(Math.round(c.lagP99)) }),
      tone: lv.lag === "ok" ? "amber" : LEVEL_TONE[lv.lag] || "muted",
      value: c.lagMs == null ? "–" : n(Math.round(c.lagMs)),
      unit: t("sysx.tile.lagUnit"),
      spark: s.lag,
      color: "#f2a93b",
    },
    {
      id: "sockets",
      icon: Zap,
      label: t("sysx.tile.sockets"),
      em: t("sysx.tile.edgeN", { n: n(c.edgeSockets || 0) }),
      tone: "muted",
      value: n(c.sockets),
      unit: t("sysx.tile.live"),
      spark: s.sockets,
      color: "#34c77b",
    },
    {
      id: "db",
      icon: Database,
      label: t("sysx.tile.db"),
      em: c.dbMs == null ? t("sysx.tile.dbDown") : t("sysx.tile.supabase"),
      tone: c.dbMs == null ? "neg" : LEVEL_TONE[lv.db] || "pos",
      value: c.dbMs == null ? "–" : n(c.dbMs),
      unit: t("sysx.tile.dbUnit"),
      spark: s.db,
      color: "#4fc3f7",
    },
    {
      id: "uptime",
      icon: Clock,
      label: t("sysx.tile.uptime"),
      em: c.availability == null ? "" : t("sysx.pctDec", { n: formatNumber(c.availability, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }),
      tone: "muted",
      value: t(up.key, up.vars),
      unit: "",
      spark: (s.at || []).map(() => 1),
      color: "#34c77b",
    },
  ];
  return (
    <div className="asx-hts" data-testid="sys-tiles">
      {tiles.map((tile) => (
        <div className={`asx-ht is-${tile.id}`} key={tile.id}>
          <div className="asx-ht-l">
            <tile.icon size={16} />
            <span>{tile.label}</span>
            {tile.em ? <em className={`asx-${tile.tone}`}>{tile.em}</em> : null}
          </div>
          <b className="tnum">
            {tile.value}
            {tile.unit ? <small>{tile.unit}</small> : null}
          </b>
          <Spark values={tile.spark} color={tile.color} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- feature flags ---------------- */

export function flagSubtitle(t, locale, flag, now) {
  const parts = [flag.key, t(`sysx.flag.${flag.key}.desc`)];
  if (flag.lastChange?.by || flag.lastChange?.at) {
    const ago = agoLabel(flag.lastChange.at, now);
    parts.push([flag.lastChange.by ? `@${flag.lastChange.by}` : t("sysx.system"), ago ? t(ago.key, ago.vars) : ""].filter(Boolean).join(" · "));
  }
  return parts.join(" · ");
}

export function FlagsCard({ flags, loading, selected, busyKey, onOpen, onToggle, onHistory, now }) {
  const { t, locale } = useLocale();
  return (
    <section className="asx-card asx-flags" aria-labelledby="asx-flags-h">
      <h3 id="asx-flags-h">
        <ToggleLeft size={16} />
        {t("sysx.flags.title")}
        {flags ? <span className="asx-chip is-gray">{t("sysx.flags.count", { n: flags.length })}</span> : null}
        <button type="button" className="asx-x" onClick={onHistory} data-testid="sys-flag-history">
          <History size={15} />
          {t("sysx.flags.history")}
        </button>
      </h3>
      <div className="asx-fr is-head" aria-hidden="true">
        <span />
        <span>{t("sysx.col.flag")}</span>
        <span>{t("sysx.col.scope")}</span>
        <span>{t("sysx.col.reach")}</span>
        <span />
      </div>
      {loading || !flags
        ? Array.from({ length: 5 }, (_, i) => (
            <div className="asx-fr" key={i}>
              <Skel w={28} h={28} r={9} />
              <span className="asx-col">
                <Skel w="70%" />
                <Skel w="50%" h={10} />
              </span>
              <Skel w={70} h={20} />
              <Skel w={70} h={20} />
              <Skel w={34} h={20} r={10} />
            </div>
          ))
        : flags.map((flag) => {
            const Icon = FLAG_ICONS[flag.icon] || ToggleLeft;
            const cell = rolloutCell(flag.rule);
            const name = t(`sysx.flag.${flag.key}.name`);
            return (
              <div
                key={flag.key}
                className={`asx-fr is-row${selected === flag.key ? " is-sel" : ""}${flag.on ? "" : " is-off"}`}
                role="button"
                tabIndex={0}
                aria-label={t("sysx.flags.openAria", { name })}
                data-testid={`sys-flag-${flag.key}`}
                onClick={() => onOpen(flag.key)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(flag.key);
                  }
                }}
              >
                <span className="asx-ic2" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className="asx-col">
                  <b>{name}</b>
                  <small>{flagSubtitle(t, locale, flag, now)}</small>
                </span>
                <span className="asx-why">
                  <span>{scopeKeys(flag).map((k) => t(k)).join(", ")}</span>
                </span>
                <span className="asx-rbw">
                  <span className="asx-rbl">
                    <span>{t(cell.key)}</span>
                    <span>{cell.value ? L(t, cell.value) : ""}</span>
                  </span>
                  <span className={`asx-rb is-${cell.tone}`}>
                    <i style={{ width: `${cell.bar}%` }} />
                  </span>
                </span>
                <Switch checked={flag.on} disabled={busyKey === flag.key} onChange={(v) => onToggle(flag.key, v)} label={t("sysx.flags.toggleAria", { name })} testId={`sys-flag-sw-${flag.key}`} />
              </div>
            );
          })}
      <div className="asx-note is-blue">
        <small>{t("sysx.flags.tipTitle")}</small>
        {t("sysx.flags.tipBody")}
      </div>
    </section>
  );
}

/* ---------------- Edge realtime ---------------- */

export function EdgeChart({ days, markers, t }) {
  const W = 300;
  const H = 130;
  const tot = (days || []).map((d) => d.sockets || 0);
  const edg = (days || []).map((d) => d.edge || 0);
  const max = niceMax(tot.concat(edg));
  const totLine = linePath(tot, W, H, max);
  const edgLine = linePath(edg, W, H, max);
  const marks = dedupeMarkers(markers)
    .map((m) => ({ ...m, x: markerX(m.at, days) }))
    .filter((m) => m.x != null);
  return (
    <div className="asx-edge-chart" role="img" aria-label={t("sysx.edge.chartAria")}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2, 3].map((k) => (
          <line key={k} x1="0" x2={W} y1={(k * H) / 3} y2={(k * H) / 3} stroke="rgba(255,255,255,.06)" vectorEffect="non-scaling-stroke" />
        ))}
        {totLine ? (
          <>
            <path d={`${totLine} L${W} ${H} L0 ${H}Z`} fill="#587af5" fillOpacity="0.12" />
            <path d={totLine} fill="none" stroke="#587af5" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
        {edgLine ? (
          <>
            <path d={`${edgLine} L${W} ${H} L0 ${H}Z`} fill="#34c77b" fillOpacity="0.12" />
            <path d={edgLine} fill="none" stroke="#34c77b" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
        {marks.map((m) => (
          <line key={`l-${m.stage}`} x1={m.x * W} x2={m.x * W} y1="0" y2={H} stroke="rgba(155,93,229,.6)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {marks.map((m) => (
        <span key={`t-${m.stage}`} className="asx-edge-mk" style={{ left: `${Math.min(94, Math.max(6, m.x * 100))}%` }}>
          {t(`sysx.stage.${m.stage}`)}
        </span>
      ))}
      {!totLine ? <span className="asx-edge-empty">{t("sysx.edge.chartEmpty")}</span> : null}
    </div>
  );
}

export function EdgeCard({ edge, history, loading, busy, onMaster, onStage, onPlatform, onOpen }) {
  const { t, locale } = useLocale();
  const n = (v) => formatNumber(v, locale);
  if (loading || !edge) {
    return (
      <section className="asx-card asx-edge">
        <h3>
          <Cloud size={16} />
          {t("sysx.edge.title")}
        </h3>
        <Skel h={130} r={10} />
      </section>
    );
  }
  const rule = normalizeRule(edge.rule);
  const on = rule.mode !== "off";
  const platforms = rule.platforms.length ? rule.platforms : ["web", "electron", "ios", "android"];
  const bridge = edge.bridge || {};
  const bridgeKey = !bridge.configured ? "sysx.edge.bridgeNone" : bridge.open ? "sysx.edge.bridgeOpen" : "sysx.edge.bridgeDown";
  return (
    <section className="asx-card asx-edge" aria-labelledby="asx-edge-h" data-testid="sys-edge">
      <h3 id="asx-edge-h">
        <Cloud size={16} />
        {t("sysx.edge.title")}
        <span className="asx-ml">
          <Switch checked={on} disabled={busy} onChange={onMaster} label={t("sysx.edge.masterAria")} testId="sys-edge-master" />
        </span>
      </h3>
      <div className="asx-edge-st">
        <span className={`asx-dot${bridge.open ? "" : bridge.configured ? " is-r" : " is-g"}`} />
        <b>{t(bridgeKey)}</b>
        <span className="asx-muted">· {t("sysx.edge.stats", { n: n(bridge.clients || 0), p: formatNumber(edge.share || 0, locale, { maximumFractionDigits: 1 }) })}</span>
      </div>
      <div className="asx-lg">
        <span>
          <i style={{ background: "#587af5" }} />
          {t("sysx.edge.legendAll")}
        </span>
        <span>
          <i style={{ background: "#34c77b" }} />
          {t("sysx.edge.legendEdge")}
        </span>
        <span className="asx-muted asx-ml">{t("sysx.edge.days", { n: 14 })}</span>
      </div>
      {history ? <EdgeChart days={history.days} markers={history.markers} t={t} /> : <Skel h={130} r={10} />}
      <div className="asx-lab">{t("sysx.edge.stageLabel")}</div>
      <div className="asx-pipe" role="group" aria-label={t("sysx.edge.stageLabel")}>
        {stageStates(edge.stage).map((s) => (
          <button
            key={s.stage}
            type="button"
            className={`is-${s.state}`}
            aria-pressed={s.state === "current"}
            disabled={busy || s.state === "current"}
            onClick={() => onStage(s.stage)}
            data-testid={`sys-edge-stage-${s.stage}`}
          >
            {t(`sysx.stage.${s.stage}`)}
          </button>
        ))}
      </div>
      <div className="asx-lab">{t("sysx.edge.platforms")}</div>
      <div className="asx-pl" role="group" aria-label={t("sysx.edge.platforms")}>
        {["web", "electron", "ios", "android"].map((p) => {
          const active = platforms.includes(p);
          return (
            <button key={p} type="button" className={active ? "is-on" : ""} aria-pressed={active} disabled={busy || (active && platforms.length === 1)} onClick={() => onPlatform(p, !active)}>
              {t(`sysx.platform.${p}`)}
            </button>
          );
        })}
      </div>
      <button type="button" className="asx-edge-team" onClick={onOpen}>
        <span className="asx-muted">{t("sysx.edge.team")}</span>
        <b>{t("sysx.edge.teamValue", { n: rule.staff.length })}</b>
      </button>
    </section>
  );
}

export { EDGE_STAGES };

/* ---------------- kill switches ---------------- */

const GROUP_ICON = { chat: MessageCircle, account: UserPlus, media: Video, maintenance: Wrench, cut: Power, normal: SlidersHorizontal };
const SWITCH_TONE = { chatFrozen: "red", maintenanceMode: "amber" };

export function KillCard({ data, loading, busyKey, onSwitch, onSlow, onMaintenance, now }) {
  const { t, locale } = useLocale();
  const [order, setOrder] = useState("area");
  const [menu, setMenu] = useState(false);
  const anchor = useRef(null);
  const sw = data?.switches || {};
  const groups = useMemo(() => switchRows(data?.groups || [], sw, order), [data?.groups, sw, order]);
  const m = data?.maintenance;
  const until = m ? untilLabel(m.startsAt, now) : null;
  const range = m
    ? `${formatAppDateTime(m.startsAt, locale, { day: "numeric", month: "short", year: undefined, hour: "2-digit", minute: "2-digit", second: undefined })}–${formatAppDateTime(m.endsAt, locale, { day: undefined, month: undefined, year: undefined, hour: "2-digit", minute: "2-digit", second: undefined })}`
    : "";
  const stateText = (on) => t(on ? "sysx.state.on" : "sysx.state.off");

  const row = (key) => {
    if (key === "slowModeSeconds") {
      const v = Number(sw.slowModeSeconds) || 0;
      return (
        <div className="asx-ks" key={key}>
          <span className="n">{t("sysx.sw.slowModeSeconds")}</span>
          <span className="asx-stp" role="group" aria-label={t("sysx.sw.slowModeSeconds")}>
            <button type="button" aria-label={t("sysx.sw.slower")} disabled={busyKey === key || v <= 0} onClick={() => onSlow(slowStep(v, -1))}>
              <Minus size={12} />
            </button>
            <span className="tnum" aria-live="polite">
              {t("sysx.sec", { n: v })}
            </span>
            <button type="button" aria-label={t("sysx.sw.faster")} disabled={busyKey === key || v >= 600} onClick={() => onSlow(slowStep(v, 1))}>
              <Plus size={12} />
            </button>
          </span>
        </div>
      );
    }
    if (["voice", "video", "screen"].includes(key) && order === "area") return null;
    const checked = Boolean(sw[key]);
    const tone = SWITCH_TONE[key] || "green";
    return (
      <div className="asx-ks" key={key}>
        <span className="n">{t(`sysx.sw.${key}`)}</span>
        <small>{stateText(checked)}</small>
        <Switch size="sm" tone={tone} checked={checked} disabled={busyKey === key} onChange={(v) => onSwitch(key, v)} label={t(`sysx.sw.${key}`)} testId={`sys-sw-${key}`} />
      </div>
    );
  };

  return (
    <section className="asx-card asx-kill" aria-labelledby="asx-kill-h" data-testid="sys-kill">
      <h3 id="asx-kill-h">
        <Power size={16} />
        {t("sysx.kill.title")}
        <span className="asx-ml asx-rel">
          <button ref={anchor} type="button" className="asx-x" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            {t(`sysx.kill.order.${order}`)}
          </button>
          <Popover open={menu} onClose={() => setMenu(false)} anchorRef={anchor} label={t("sysx.kill.orderLabel")} width={200}>
            <div role="menu">
              {["area", "state"].map((o) => (
                <button
                  key={o}
                  type="button"
                  role="menuitemradio"
                  aria-checked={order === o}
                  className={`asx-mi${order === o ? " is-on" : ""}`}
                  onClick={() => {
                    setOrder(o);
                    setMenu(false);
                    anchor.current?.focus();
                  }}
                >
                  {t(`sysx.kill.order.${o}`)}
                </button>
              ))}
            </div>
          </Popover>
        </span>
      </h3>
      {loading || !data ? (
        Array.from({ length: 7 }, (_, i) => <Skel key={i} h={28} r={10} />)
      ) : (
        <>
          {groups.map((g) => {
            const Icon = GROUP_ICON[g.id] || SlidersHorizontal;
            return (
              <div key={g.id} className="asx-ksg-wrap" role="group" aria-labelledby={`asx-ksg-${g.id}`}>
                <div className="asx-ksg" id={`asx-ksg-${g.id}`}>
                  <Icon size={14} />
                  {t(`sysx.group.${g.id}`)}
                </div>
                {g.id === "media" && order === "area" ? (
                  <div className="asx-ks">
                    <span className="n">{t("sysx.sw.media")}</span>
                    <span className="asx-ks-sws">
                      {["voice", "video", "screen"].map((k) => (
                        <Switch key={k} size="sm" tone="green" checked={Boolean(sw[k])} disabled={busyKey === k} onChange={(v) => onSwitch(k, v)} label={t(`sysx.sw.${k}`)} testId={`sys-sw-${k}`} />
                      ))}
                    </span>
                  </div>
                ) : null}
                {g.keys.map(row)}
                {g.id === "maintenance" ? (
                  <button type="button" className={`asx-ks is-plan${m ? "" : " is-none"}`} onClick={onMaintenance} data-testid="sys-maint-link">
                    <span className="n">{m ? t(m.status === "active" ? "sysx.kill.plannedActive" : "sysx.kill.planned", { range }) : t("sysx.kill.noPlan")}</span>
                    {until ? <small>{t(until.key, until.vars)}</small> : <ArrowRight size={14} />}
                  </button>
                ) : null}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

/* ---------------- limits ---------------- */

const LIMIT_KEYS = ["maxMessageLength", "rateLimitGlobalMs", "maxMessagesPerMinute"];

export function LimitsCard({ limits, loading, busy, onSave, onReset, now }) {
  const { t, locale } = useLocale();
  const [form, setForm] = useState({});
  const [focus, setFocus] = useState(null);
  useEffect(() => {
    if (!limits) return;
    setForm(Object.fromEntries(LIMIT_KEYS.map((k) => [k, String(limits.values[k])])));
  }, [limits]);
  const commit = (k) => {
    const raw = String(form[k] ?? "").replace(/[^\d]/g, "");
    if (raw === String(limits.values[k])) return;
    const [min, max] = limits.ranges[k];
    const v = Number(raw);
    if (!raw || v < min || v > max) {
      setForm((f) => ({ ...f, [k]: String(limits.values[k]) }));
      onSave(null, { key: k, min, max });
      return;
    }
    onSave({ [k]: v });
  };
  const sub = (k) => {
    const last = limits.last?.[k];
    const val = Number(limits.values[k]);
    const isOff = k === "rateLimitGlobalMs" && val === 0;
    const isDefault = val === Number(limits.defaults[k]);
    if (last && !isDefault) {
      const ago = agoShortLabel(last.at, now);
      return [isOff ? t("sysx.lim.off") : null, [last.by ? `@${last.by}` : null, ago ? t(ago.key, ago.vars) : null].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    }
    if (isOff && last) {
      const ago = agoShortLabel(last.at, now);
      return [t("sysx.lim.off"), [last.by ? `@${last.by}` : null, ago ? t(ago.key, ago.vars) : null].filter(Boolean).join(" ")].join(" · ");
    }
    return t("sysx.lim.default", { n: formatNumber(limits.defaults[k], locale) });
  };
  return (
    <section className="asx-card asx-limits" aria-labelledby="asx-lim-h" data-testid="sys-limits">
      <h3 id="asx-lim-h">
        <SlidersHorizontal size={16} />
        {t("sysx.lim.title")}
        <button type="button" className="asx-x" onClick={onReset} disabled={busy || !limits} data-testid="sys-limits-reset">
          {t("sysx.lim.reset")}
        </button>
      </h3>
      <div className="asx-lim-grid">
        {LIMIT_KEYS.map((k) => (
          <label className="asx-fld" key={k}>
            <span className="asx-lab">{t(`sysx.lim.${k}`)}</span>
            {loading || !limits ? (
              <Skel h={36} r={11} />
            ) : (
              <span className="asx-inp">
                <input
                  inputMode="numeric"
                  className="tnum"
                  value={form[k] == null ? "" : focus === k || form[k] === "" ? form[k] : formatNumber(Number(form[k]), locale)}
                  onFocus={() => setFocus(k)}
                  disabled={busy}
                  aria-describedby={`asx-lim-${k}`}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/[^\d]/g, "") }))}
                  onBlur={() => {
                    setFocus(null);
                    commit(k);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setForm((f) => ({ ...f, [k]: String(limits.values[k]) }));
                    }
                  }}
                  data-testid={`sys-limit-${k}`}
                />
                <em>{t(`sysx.lim.unit.${k}`)}</em>
              </span>
            )}
            <small id={`asx-lim-${k}`}>{limits ? sub(k) : ""}</small>
          </label>
        ))}
      </div>
    </section>
  );
}

/* ---------------- broadcast ---------------- */

export function BroadcastCard({ data, text, setText, busy, onPreview, onSend, onHistory, historyOpen, setHistoryOpen, historyRows, onGoto }) {
  const { t, locale } = useLocale();
  const anchor = useRef(null);
  const last = data?.broadcast?.last;
  return (
    <section className="asx-card asx-bc" aria-labelledby="asx-bc-h" data-testid="sys-broadcast">
      <h3 id="asx-bc-h">
        <Megaphone size={16} />
        {t("sysx.bc.title")}
        <span className="asx-ml asx-rel">
          <button
            ref={anchor}
            type="button"
            className="asx-x"
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            onClick={() => {
              setHistoryOpen(!historyOpen);
              if (!historyOpen) onHistory();
            }}
          >
            {t("sysx.bc.history", { n: data?.broadcast?.count ?? 0 })}
          </button>
          <Popover open={historyOpen} onClose={() => setHistoryOpen(false)} anchorRef={anchor} label={t("sysx.bc.historyTitle")} width={320} testId="sys-bc-history">
            <div className="asx-pop-h">{t("sysx.bc.historyTitle")}</div>
            <div className="asx-pop-list">
              {historyRows == null ? (
                <Skel h={40} />
              ) : historyRows.length ? (
                historyRows.map((r) => (
                  <div className="asx-hrow" key={r.id}>
                    <b>{r.text || t("sysx.bc.noText")}</b>
                    <small>
                      {[shortDate(r.at, locale), r.by ? `@${r.by}` : null, r.reach != null ? t("sysx.people", { n: formatNumber(r.reach, locale) }) : null].filter(Boolean).join(" · ")}
                    </small>
                  </div>
                ))
              ) : (
                <p className="asx-empty-s">{t("sysx.bc.none")}</p>
              )}
            </div>
            <div className="asx-pop-f">
              <span>{t("sysx.bc.more")}</span>
              <button type="button" className="asx-link" onClick={() => onGoto("announcements")}>
                {t("sysx.bc.toAnnouncements")}
              </button>
              <button type="button" className="asx-link" onClick={() => onGoto("livepopup")}>
                {t("sysx.bc.toLivePopup")}
              </button>
            </div>
          </Popover>
        </span>
      </h3>
      <input
        className="asx-inp asx-bc-in"
        value={text}
        maxLength={500}
        placeholder={t("sysx.bc.ph")}
        aria-label={t("sysx.bc.ph")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) onSend();
        }}
        data-testid="sys-bc-text"
      />
      <div className="asx-row">
        <button type="button" className="asx-btn" disabled={!text.trim()} onClick={onPreview} data-testid="sys-bc-preview">
          <Eye size={16} />
          {t("sysx.bc.preview")}
        </button>
        <button type="button" className="asx-btn is-p" disabled={!text.trim() || busy} onClick={onSend} data-testid="sys-bc-send">
          <Send size={16} />
          {t("sysx.bc.send")}
        </button>
      </div>
      <div className="asx-muted asx-bc-last" aria-live="polite">
        {last
          ? t("sysx.bc.last", { date: formatAppDateTime(last.at, locale, { day: "numeric", month: "short", year: undefined, hour: undefined, minute: undefined, second: undefined }), n: formatNumber(last.reach ?? 0, locale) })
          : t("sysx.bc.none")}
      </div>
    </section>
  );
}

/* ---------------- backup + filter ---------------- */

export function BackupCard({ data, busy, onBackup, onFilters }) {
  const { t, locale } = useLocale();
  const last = data?.backup?.last;
  const size = last?.bytes ? bytesParts(last.bytes) : null;
  return (
    <section className="asx-card asx-bk" aria-labelledby="asx-bk-h">
      <h3 id="asx-bk-h">
        <FileText size={16} />
        {t("sysx.bk.title")}
      </h3>
      <button type="button" className="asx-ks is-btn" onClick={onBackup} disabled={busy} data-testid="sys-backup-row">
        <span className="n">{last ? t("sysx.bk.last", { date: shortDate(last.at, locale) }) : t("sysx.bk.none")}</span>
        {size ? <small>{t("sysx.bytes", { n: formatNumber(size.value, locale), unit: size.unit })}</small> : <Download size={14} />}
      </button>
      <button type="button" className="asx-ks is-link" onClick={onFilters} data-testid="sys-filter-link">
        <span className="n">{t("sysx.bk.filterMoved")}</span>
        <ArrowRight size={16} />
      </button>
    </section>
  );
}
