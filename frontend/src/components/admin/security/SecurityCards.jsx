/**
 * Güvenlik Merkezi cards (Draft A frame A1): Güvenlik puanı, Tehdit özeti (live KPIs +
 * 24 h chart with the brute-force marker and a hover readout), Acil kilit modları +
 * Kalıcı erişim ayarları, Canlı tehdit akışı, En çok deneme yapan kaynaklar.
 */
import { useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  ChevronRight,
  Download,
  Eye,
  Globe,
  Lock,
  MessageCircle,
  Pause,
  Play,
  Shield,
  Users,
  Zap,
} from "../../ui/Icon.jsx";
import { ICONS, Switch } from "./ui.jsx";
import {
  EVENT_META,
  FEED_FILTERS,
  FEED_PREVIEW_ROWS,
  LOCK_META,
  LOCK_MODES,
  absDelta,
  axisLabels,
  chartPaths,
  chartX,
  checkCta,
  checkLabel,
  eventActions,
  eventLine,
  fmtNum,
  fmtTime,
  lockSubtitle,
  pctDelta,
  relTime,
  ringStyle,
  sourceText,
  numWithSuffix,
} from "./securityModel.js";

const CHART_W = 468;
const CHART_H = 150;
const SERIES = [
  { key: "rate", color: "#9b5de5", label: "secCenter.legend.rate" },
  { key: "failed", color: "#f23f43", label: "secCenter.legend.failed" },
  { key: "blocked", color: "#587af5", label: "secCenter.legend.blocked" },
];

/** "3 öneriyi uygularsan <b>96</b> olur": a translated sentence with one bold number. */
function withBold(text, bold) {
  const parts = String(text).split("\u0001");
  if (parts.length < 2) return text;
  return (
    <>
      {parts[0]}
      <b>{bold}</b>
      {parts.slice(1).join("")}
    </>
  );
}

export function countryName(code, locale) {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return code || "";
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

/* ---------------- Güvenlik puanı ---------------- */

export function ScoreCard({ t, locale, score, onExplain, onCheck, loading }) {
  const explainRef = useRef(null);
  if (loading || !score) return <section className="sc-card sc-score is-loading" aria-busy="true"><div className="sc-skel" style={{ height: 300 }} /></section>;
  const delta = score.delta;
  return (
    <section className="sc-card sc-score" aria-labelledby="sc-score-h">
      <h3 id="sc-score-h">
        <Shield size={16} aria-hidden="true" />
        {t("secCenter.score.title")}
        <button type="button" ref={explainRef} className="sc-x" onClick={() => onExplain(explainRef)} data-testid="sc-score-explain">
          {t("secCenter.score.how")}
        </button>
      </h3>
      <div className="sc-score-top">
        <div className="sc-ring" style={ringStyle(score.score, score.grade)} role="img" aria-label={t("secCenter.score.aria", { score: score.score })}>
          <div>
            <b className="tnum">{score.score}</b>
            <span className={`is-${score.grade}`}>{t(`secCenter.grade.${score.grade}`)}</span>
          </div>
        </div>
        <div className="sc-score-txt">
          <div className="sc-score-h">{t("secCenter.score.passed", { passed: numWithSuffix(score.passedCount, locale), total: score.total })}</div>
          <div className="sc-muted">
            {score.weekAgo == null ? (
              t("secCenter.score.firstWeek")
            ) : (
              <>
                {t("secCenter.score.lastWeek", { n: score.weekAgo })} ·{" "}
                <span className={delta > 0 ? "sc-dn" : delta < 0 ? "sc-up" : ""}>{delta > 0 ? `+${delta}` : delta}</span>
              </>
            )}
          </div>
          <div className="sc-muted sc-score-pot">
            {score.recommendations > 0 ? withBold(t("secCenter.score.potential", { n: score.recommendations, score: "\u0001" }), score.potential) : t("secCenter.score.allApplied")}
          </div>
        </div>
      </div>
      <ul className="sc-cl" aria-label={t("secCenter.score.checks")}>
        {score.checks.map((c) => {
          const cta = checkCta(c, t);
          return (
            <li key={c.id} className="sc-cli" data-check={c.id}>
              <span className={c.ok ? "sc-ok" : "sc-wa"} aria-hidden="true">
                {c.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
              </span>
              <span className="sc-cli-t" title={checkLabel(c, t, locale)}>{checkLabel(c, t, locale)}</span>
              {cta ? (
                <button type="button" className={`sc-cli-cta${cta.link ? " is-link" : ""}`} onClick={(e) => onCheck(c, cta.kind, e.currentTarget)} data-testid={`sc-check-${c.id}`}>
                  {cta.text}
                </button>
              ) : (
                <span className="sr-only">{t("secCenter.score.okSr")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------- Tehdit özeti ---------------- */

export function ThreatCard({ t, locale, stats, now, live, onSpike, loading }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const paths = useMemo(() => chartPaths(stats?.series, CHART_W, CHART_H, SERIES.map((s) => s.key)), [stats]);
  if (loading || !stats) return <section className="sc-card sc-threat is-loading" aria-busy="true"><div className="sc-skel" style={{ height: 300 }} /></section>;
  const k = stats.kpis;
  const failed = pctDelta(k.failedLogins.pct, t);
  const locked = absDelta(k.lockedAccounts.delta);
  const rate = pctDelta(k.rateLimits.pct, t);
  const axis = axisLabels(stats.series.start, t, locale, now);
  const spikeX = stats.spike ? chartX(stats.series.start, stats.spike.at, now) : null;
  const n = stats.series.failed.length;
  const onMove = (e) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r || n < 2) return;
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
    setHover(i);
  };
  const hoverAt = hover == null ? null : new Date(Date.parse(stats.series.start) + hover * stats.series.bucketMs).toISOString();
  return (
    <section className="sc-card sc-threat" aria-labelledby="sc-threat-h">
      <h3 id="sc-threat-h">
        <Activity size={16} aria-hidden="true" />
        {t("secCenter.threat.title")}
        <span className="sc-sub">{t("secCenter.threat.window")}</span>
        <span className="sc-x">
          <span className={`sc-live${live ? "" : " is-off"}`}>{live ? t("secCenter.live") : t("secCenter.polling")}</span>
        </span>
      </h3>
      <div className="sc-kpis">
        <div className="sc-kpi">
          <span><i style={{ background: "#f23f43" }} />{t("secCenter.kpi.failed")}</span>
          <b className="tnum">{fmtNum(k.failedLogins.value, locale)}</b>
          <small className={`sc-${failed.tone}`} title={failed.text}>{failed.text}</small>
        </div>
        <div className="sc-kpi">
          <span title={t("secCenter.kpi.locked")}><i style={{ background: "#f2a93b" }} />{t("secCenter.kpi.locked")}</span>
          <b className="tnum">{fmtNum(k.lockedAccounts.value, locale)}</b>
          <small className={`sc-${locked.tone}`}>{locked.text}</small>
        </div>
        <div className="sc-kpi">
          <span><i style={{ background: "#587af5" }} />{t("secCenter.kpi.blocked")}</span>
          <b className="tnum">{fmtNum(k.blockedIps.value, locale)}</b>
          <small className="sc-muted">{t("secCenter.kpi.activeBans", { n: fmtNum(k.blockedIps.activeBans, locale) })}</small>
        </div>
        <div className="sc-kpi">
          <span><i style={{ background: "#9b5de5" }} />{t("secCenter.kpi.rate")}</span>
          <b className="tnum">{fmtNum(k.rateLimits.value, locale)}</b>
          <small className={`sc-${rate.tone === "up" ? "up" : rate.tone}`} title={rate.text}>{rate.text}</small>
        </div>
      </div>
      <div className="sc-legend">
        {[SERIES[1], SERIES[0], SERIES[2]].map((s) => (
          <span key={s.key}><i style={{ background: s.color }} />{t(s.label)}</span>
        ))}
        {stats.spike ? (
          <button type="button" className="sc-spike" onClick={() => onSpike(stats.spike.id)} data-testid="sc-spike">
            <AlertTriangle size={14} aria-hidden="true" />
            {t("secCenter.threat.spike", { time: fmtTime(stats.spike.at, locale) })}
          </button>
        ) : (
          <span className="sc-spike is-calm">{t("secCenter.threat.calm")}</span>
        )}
      </div>
      <div className="sc-chart" ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" role="img" aria-label={t("secCenter.threat.chartAria")}>
          {[1, 2, 3].map((i) => (
            <line key={i} x1="0" x2={CHART_W} y1={(CHART_H * i) / 4} y2={(CHART_H * i) / 4} stroke="rgba(255,255,255,.06)" vectorEffect="non-scaling-stroke" />
          ))}
          {paths.series.map((p) => {
            const color = SERIES.find((s) => s.key === p.key).color;
            return (
              <g key={p.key}>
                <path d={p.area} fill={color} opacity="0.13" />
                <path d={p.line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {spikeX != null ? <line x1={spikeX * CHART_W} x2={spikeX * CHART_W} y1="0" y2={CHART_H} stroke="rgba(255,154,156,.55)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null}
          {hover != null ? <line x1={(hover / (n - 1)) * CHART_W} x2={(hover / (n - 1)) * CHART_W} y1="0" y2={CHART_H} stroke="rgba(255,255,255,.35)" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {hover != null ? (
          <div className="sc-tip" style={{ left: `${(hover / (n - 1)) * 100}%` }} role="status">
            <b>{fmtTime(hoverAt, locale)}</b>
            {[SERIES[1], SERIES[0], SERIES[2]].map((s) => (
              <span key={s.key}>
                <i style={{ background: s.color }} />
                {t(s.label)} <b className="tnum">{fmtNum(stats.series[s.key][hover], locale)}</b>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="sc-axis">
        {axis.map((a, i) => (
          <span key={i}>{a}</span>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Acil kilit modları ---------------- */

const LOCK_DESC = { registration: "secCenter.lockMode.registration.desc", dm: "secCenter.lockMode.dm.desc", readOnly: "secCenter.lockMode.readOnly.desc" };

export function LockCard({ t, settings, now, onToggleLock, onLockDetail, onLiftAll, onToggleSetting, onOpenSystem, busyKey, loading }) {
  if (loading || !settings) return <section className="sc-card sc-locks is-loading" aria-busy="true"><div className="sc-skel" style={{ height: 300 }} /></section>;
  const locks = settings.locks || {};
  const anyLock = LOCK_MODES.some((m) => locks[m]);
  const Ic = (name) => ICONS[name];
  return (
    <section className="sc-card sc-locks" aria-labelledby="sc-locks-h">
      <h3 id="sc-locks-h">
        <Lock size={16} aria-hidden="true" />
        {t("secCenter.locks.title")}
        <button type="button" className="sc-x" disabled={!anyLock} onClick={(e) => onLiftAll(e.currentTarget)} data-testid="sc-lift-all">
          {t("secCenter.locks.liftAll")}
        </button>
      </h3>
      {LOCK_MODES.map((mode) => {
        const meta = LOCK_META[mode];
        const Icon = Ic(meta.icon);
        const lock = locks[mode];
        return (
          <div key={mode} className={`sc-lm${lock ? " is-act" : ""}`} data-testid={`sc-lock-${mode}`}>
            <span className={`sc-ic is-${lock ? "amber" : meta.tone}`} aria-hidden="true">
              <Icon size={16} />
            </span>
            <button type="button" className="sc-lm-txt" onClick={(e) => (lock ? onLockDetail(mode, e.currentTarget) : onToggleLock(mode, true, e.currentTarget))} aria-label={lock ? t("secCenter.locks.detailAria", { name: t(`secCenter.lockMode.${mode}.name`) }) : undefined}>
              <b>{t(`secCenter.lockMode.${mode}.name`)}</b>
              <small>{lock ? lockSubtitle(lock, t, now) : t(LOCK_DESC[mode])}</small>
            </button>
            <Switch
              checked={Boolean(lock)}
              tone="amber"
              label={t(`secCenter.lockMode.${mode}.name`)}
              disabled={busyKey === `lock:${mode}`}
              onChange={(on) => onToggleLock(mode, on, document.querySelector(`[data-testid="sc-lock-${mode}"] .sc-sw`))}
              testId={`sc-lock-sw-${mode}`}
            />
          </div>
        );
      })}
      {/* Sistem's kill switches cut the same paths: show them here so "Normal" is never
          the whole story while chat is frozen or sign-ups are off (polish admin-b-18). */}
      {settings.chatFrozen || settings.registrationEnabled === false ? (
        <>
          <div className="sc-lab">{t("secCenter.locks.fromSystem")}</div>
          {[
            settings.chatFrozen ? { key: "chat", name: "sysChatFrozen", sub: "chatFrozenSub", Icon: MessageCircle } : null,
            settings.registrationEnabled === false ? { key: "reg", name: "regOff", sub: "regOffSub", Icon: Users } : null,
          ].filter(Boolean).map((row) => (
            <div key={row.key} className="sc-lm is-act" data-testid={`sc-sys-${row.key}`}>
              <span className="sc-ic is-amber" aria-hidden="true"><row.Icon size={16} /></span>
              {onOpenSystem ? (
                <button type="button" className="sc-lm-txt" onClick={onOpenSystem} title={t("secCenter.locks.openSystem")} aria-label={`${t(`secCenter.locks.${row.name}`)} · ${t("secCenter.locks.openSystem")}`}>
                  <b>{t(`secCenter.locks.${row.name}`)}</b>
                  <small>{t(`secCenter.locks.${row.sub}`)}</small>
                </button>
              ) : (
                <div className="sc-lm-txt is-static">
                  <b>{t(`secCenter.locks.${row.name}`)}</b>
                  <small>{t(`secCenter.locks.${row.sub}`)}</small>
                </div>
              )}
              {onOpenSystem ? <ChevronRight size={14} aria-hidden="true" className="sc-lm-go" /> : null}
            </div>
          ))}
        </>
      ) : null}
      <div className="sc-lab">{t("secCenter.locks.permanent")}</div>
      <div className="sc-lm" data-testid="sc-perm-groups">
        <span className="sc-ic is-gray" aria-hidden="true"><Users size={16} /></span>
        <div className="sc-lm-txt is-static">
          <b>{t("secCenter.perm.groups.name")}</b>
          <small>{settings.groupCreationEnabled ? t("secCenter.perm.groups.on") : t("secCenter.perm.groups.off")}</small>
        </div>
        <Switch
          checked={settings.groupCreationEnabled}
          label={t("secCenter.perm.groups.name")}
          disabled={busyKey === "groupCreationEnabled"}
          onChange={(on) => onToggleSetting("groupCreationEnabled", on, document.querySelector('[data-testid="sc-perm-groups"] .sc-sw'))}
          testId="sc-perm-sw-groups"
        />
      </div>
      <div className="sc-lm" data-testid="sc-perm-dm">
        <span className="sc-ic is-gray" aria-hidden="true"><MessageCircle size={16} /></span>
        <div className="sc-lm-txt is-static">
          <b>{t("secCenter.perm.dm.name")}</b>
          <small>{settings.dmEnabled ? t("secCenter.perm.dm.on") : t("secCenter.perm.dm.off")}</small>
        </div>
        <Switch
          checked={settings.dmEnabled}
          label={t("secCenter.perm.dm.name")}
          disabled={busyKey === "dmEnabled"}
          onChange={(on) => onToggleSetting("dmEnabled", on, document.querySelector('[data-testid="sc-perm-dm"] .sc-sw'))}
          testId="sc-perm-sw-dm"
        />
      </div>
    </section>
  );
}

/* ---------------- Canlı tehdit akışı ---------------- */

const ACTION_ICON = { banIp: Lock, banUser: Ban, inspect: Eye, viewBan: Eye, session: Eye };

export function FeedCard({ t, locale, now, counts, filter, onFilter, events, loading, error, expanded, onToggleExpanded, paused, onTogglePaused, newCount, onShowNew, onAction, onExport, onLoadMore, canLoadMore, loadingMore, actionCtx }) {
  const shown = expanded ? events : events.slice(0, FEED_PREVIEW_ROWS);
  return (
    <section className="sc-card sc-feed" aria-labelledby="sc-feed-h">
      <h3 id="sc-feed-h">
        <Zap size={16} aria-hidden="true" />
        {t("secCenter.feed.title")}
        <span className="sc-sub">{t("secCenter.feed.sub")}</span>
        <span className="sc-x sc-feed-tools">
          <button type="button" className="sc-ib" onClick={onTogglePaused} aria-pressed={paused} title={paused ? t("secCenter.feed.resume") : t("secCenter.feed.pause")} aria-label={paused ? t("secCenter.feed.resume") : t("secCenter.feed.pause")} data-testid="sc-feed-pause">
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button type="button" className="sc-ib" onClick={onExport} title={t("secCenter.feed.export")} aria-label={t("secCenter.feed.export")} disabled={!events.length} data-testid="sc-feed-csv">
            <Download size={14} />
          </button>
          <button type="button" className="sc-x-link" onClick={onToggleExpanded} aria-expanded={expanded} data-testid="sc-feed-all">
            {expanded ? t("secCenter.feed.collapse") : t("secCenter.feed.openAll")}
          </button>
        </span>
      </h3>
      <div className="sc-filters" role="tablist" aria-label={t("secCenter.feed.filters")}>
        {FEED_FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={`sc-fp${filter === f ? " is-on" : ""}`} onClick={() => onFilter(f)} data-testid={`sc-filter-${f}`}>
            {t(`secCenter.filter.${f}`)} · <span className="tnum">{fmtNum(counts?.[f] ?? 0, locale)}</span>
          </button>
        ))}
      </div>
      {newCount > 0 ? (
        <button type="button" className="sc-newbar" onClick={onShowNew} data-testid="sc-feed-new">
          {t("secCenter.feed.newEvents", { n: newCount })}
        </button>
      ) : null}
      {error ? <p className="sc-err" role="alert">{error}</p> : null}
      {loading ? (
        <div className="sc-feed-list">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="sc-skel" style={{ height: 50 }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="sc-empty">
          <Shield size={22} aria-hidden="true" />
          <b>{t("secCenter.feed.emptyTitle")}</b>
          <span>{filter === "all" ? t("secCenter.feed.emptyBody") : t("secCenter.feed.emptyFilter")}</span>
        </div>
      ) : (
        <ul className={`sc-feed-list${expanded ? " is-expanded" : ""}`} aria-live={paused ? "off" : "polite"}>
          {shown.map((e) => {
            const meta = EVENT_META[e.type] || EVENT_META.failed_login;
            const Icon = ICONS[meta.icon];
            const actions = eventActions(e, actionCtx);
            return (
              <li key={e.id} className="sc-fr" data-type={e.type}>
                <span className={`sc-sv is-${meta.tone}`} aria-hidden="true">
                  <Icon size={16} />
                </span>
                <div className="sc-fr-main">
                  <b>
                    {t(`secCenter.ev.${e.type}.title`)}
                    {e.count > 1 && e.type !== "brute_force" ? <em className="sc-count tnum">×{fmtNum(e.count, locale)}</em> : null}
                  </b>
                  <small>{eventLine(e, t, locale)}</small>
                </div>
                <span className="sc-src tnum">{sourceText({ ...e, country: countryName(e.country, locale) })}</span>
                <time dateTime={e.at} title={new Date(e.at).toLocaleString(locale)}>{relTime(e.at, t, now)}</time>
                <span className="sc-ac">
                  {actions.map((a) => {
                    const AIc = ACTION_ICON[a];
                    return (
                      <button key={a} type="button" className={`sc-sb${a === "banIp" || a === "banUser" ? " is-r" : ""}`} onClick={(ev) => onAction(a, e, ev.currentTarget)} data-testid={`sc-act-${a}`}>
                        <AIc size={13} aria-hidden="true" />
                        {t(`secCenter.act.${a}`)}
                      </button>
                    );
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {expanded && canLoadMore ? (
        <button type="button" className="sc-more" onClick={onLoadMore} disabled={loadingMore} data-testid="sc-feed-more">
          {loadingMore ? t("secCenter.loading") : t("secCenter.feed.loadMore")}
        </button>
      ) : null}
    </section>
  );
}

/* ---------------- En çok deneme yapan kaynaklar ---------------- */

export function SourcesCard({ t, locale, sources, onBan, onOpen, canBan, loading }) {
  return (
    <section className="sc-card sc-sources" aria-labelledby="sc-src-h">
      <h3 id="sc-src-h">
        <Globe size={16} aria-hidden="true" />
        {t("secCenter.sources.title")}
      </h3>
      {loading ? (
        <div className="sc-srcl">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="sc-skel" style={{ height: 76 }} />
          ))}
        </div>
      ) : !sources?.length ? (
        <div className="sc-empty is-small">
          <Globe size={20} aria-hidden="true" />
          <span>{t("secCenter.sources.empty")}</span>
        </div>
      ) : (
        <ul className="sc-srcl">
          {sources.map((s) => {
            const place = [s.city, countryName(s.country, locale)].filter(Boolean).join(" · ") || s.netLabel || t("secCenter.sources.unknownPlace");
            return (
              <li key={s.sourceRef} className="sc-sr">
                <button type="button" className="sc-sr-ip" onClick={() => onOpen(s)} title={t("secCenter.sources.openFeed")}>
                  <b className="tnum">{s.ipMasked}</b>
                </button>
                <b className="tnum sc-sr-n">{fmtNum(s.attempts, locale)}</b>
                <small>{place}</small>
                {s.banned ? (
                  <span className="sc-chip is-gray">{t("secCenter.sources.banned")}</span>
                ) : canBan ? (
                  <button type="button" className="sc-sb is-r sc-sr-ban" onClick={(e) => onBan(s, e.currentTarget)} data-testid="sc-src-ban">
                    {t("secCenter.sources.ban")}
                  </button>
                ) : (
                  <span />
                )}
                <div className="sc-m" aria-hidden="true">
                  <i style={{ width: `${s.pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
