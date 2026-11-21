/**
 * Right column of Draft B: the selected token's work area. Identity card with the six
 * facts and the grouped action bar, state and alert strips, Kullanım konsolu (24 h bars
 * with destructive marks), top endpoints with the IP allowlist, the live calls console,
 * connection snippets with the MCP server card, and the token's own audit list.
 */
import { useState } from "react";
import { copyText } from "../../../lib/copyText.js";
import {
  Activity,
  AlertCircle,
  Ban,
  Bot,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Gavel,
  Globe,
  List,
  Lock,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Terminal,
  Undo2,
  X,
  Zap,
} from "../../ui/Icon.jsx";
import { LiveBadge, Pill, Skel, TokenIcon, useFmt } from "./TokenUi.jsx";
import {
  SNIPPET_TABS,
  agoLabel,
  alertCopy,
  allowIpMode,
  autoPaused,
  auditKind,
  axisTicks,
  clientChannel,
  clock,
  daySummary,
  destructiveKind,
  expiryKey,
  hourBars,
  inGrace,
  isDestructiveRow,
  isLive,
  maskToken,
  mcpHost,
  niceMax,
  pct,
  restoreLeft,
  shareSplit,
  snippetParts,
  snippetText,
  statusTone,
  colorOf,
  topTools,
  validityLabel,
} from "./tokenModel.js";

/* ---------------- identity card ---------------- */

export function TokenHero({ token, usage, now, busy, onPause, onResume, onRotate, onIp, onAudit, onRevoke, onReplay, onRestore, limited = false }) {
  const f = useFmt();
  const { t } = f;
  const split = shareSplit(usage?.mcpShare, usage?.restShare);
  const channel = clientChannel(usage);
  const ips = token.ipAllowlist || [];
  const left = restoreLeft(token, now);
  return (
    <section className="atk-glass atk-hero" aria-label={token.name} data-testid="atk-hero">
      <div className="atk-hero-top">
        <TokenIcon token={token} size="lg" />
        <div className="atk-hero-t">
          <h2>
            <span className="atk-ell">{token.name}</span> <Pill status={token.status} />
          </h2>
          <span className="atk-hero-mask">
            <span className="atk-mask">{maskToken(token)}</span>
            <span className="atk-tag is-acc">{t("atok.fullAccess")}</span>
            {split.mcp ? <span className="atk-tag is-mcp">{t("atok.mcpShare", { n: f.n(split.mcp) })}</span> : null}
          </span>
        </div>
        {isLive(token) ? <LiveBadge muted={token.status !== "active"}>{t("atok.liveConsole")}</LiveBadge> : null}
      </div>
      <div className="atk-hero-meta">
        <div>
          <span className="l">{t("atok.hero.created")}</span>
          <span className="v">
            {f.day(token.createdAt)}
            <small>{t("atok.hero.createdSub", { time: f.time(token.createdAt) })}</small>
          </span>
        </div>
        <div>
          <span className="l">{t("atok.hero.validity")}</span>
          <span className={`v${token.status === "active" && token.expiresAt && Date.parse(token.expiresAt) - now < 86400e3 ? " is-warn" : ""}`}>
            {t(expiryKey(token.expiresIn))}
            <small>
              {token.expiresAt && token.status !== "revoked" ? `${f.day(token.expiresAt)} · ` : ""}
              {f.label(validityLabel(token, now))}
            </small>
          </span>
        </div>
        <div>
          <span className="l">{t("atok.hero.lastUsed")}</span>
          <span className="v">
            {f.label(agoLabel(token.lastUsedAt, now))}
            <small className="atk-ell">{token.lastUsedIp ? `${token.lastUsedIp}${token.lastUsedCountry ? ` · ${f.country(token.lastUsedCountry)}` : ""}` : t("atok.dash")}</small>
          </span>
        </div>
        <div>
          <span className="l">{t("atok.hero.client")}</span>
          <span className="v">
            <span className="atk-ell">{token.lastClient || t("atok.hero.clientNone")}</span>
            <small>{channel ? t(`atok.hero.${channel}`) : t("atok.dash")}</small>
          </span>
        </div>
        <div>
          <span className="l">{t("atok.hero.total")}</span>
          <span className="v tnum">
            {f.n(token.requestCount || 0)}
            <small>{t("atok.hero.totalSub")}</small>
          </span>
        </div>
        <div>
          <span className="l">{t("atok.hero.ipRule")}</span>
          <span className="v">
            {ips.length ? t("atok.hero.ipRules", { n: ips.length }) : <span className="atk-amber">{t("atok.hero.ipNone")}</span>}
            <small className="atk-ell">{ips[0] || t("atok.hero.ipAny")}</small>
          </span>
        </div>
      </div>
      <div className="atk-actbar" data-testid="atk-actions">
        {isLive(token) ? (
          <>
            <div className="atk-grp" role="group" aria-label={t("atok.act.state")}>
              <span className="atk-grp-l">{t("atok.act.state")}</span>
              {token.status === "active" ? (
                <button type="button" className="atk-btn is-sm" disabled={busy} onClick={onPause} data-testid="atk-act-pause">
                  <Pause size={13} />
                  {t("atok.act.pause")}
                </button>
              ) : (
                <button type="button" className="atk-btn is-sm" disabled={busy || limited} title={limited ? t("atok.tokenSession.blocked") : undefined} onClick={onResume} data-testid="atk-act-resume">
                  <Play size={13} />
                  {t("atok.act.resume")}
                </button>
              )}
              <button type="button" className="atk-btn is-sm" disabled={busy || limited} title={limited ? t("atok.tokenSession.blocked") : undefined} onClick={onRotate} data-testid="atk-act-rotate">
                <RefreshCw size={13} />
                {t("atok.act.rotate")}
              </button>
            </div>
            <div className="atk-grp" role="group" aria-label={t("atok.act.access")}>
              <span className="atk-grp-l">{t("atok.act.access")}</span>
              <button type="button" className="atk-btn is-sm" disabled={busy || limited} title={limited ? t("atok.tokenSession.blocked") : undefined} onClick={onIp} data-testid="atk-act-ip">
                <Globe size={13} />
                {t("atok.act.ip")}
              </button>
              <button type="button" className="atk-btn is-sm is-ghost" onClick={onAudit}>
                <List size={13} />
                {t("atok.act.audit")}
              </button>
            </div>
            <div className="atk-grp is-end">
              <button type="button" className="atk-btn is-sm is-dan" disabled={busy} onClick={onRevoke} data-testid="atk-act-revoke">
                <Ban size={13} />
                {t("atok.act.revoke")}
              </button>
            </div>
          </>
        ) : (
          <div className="atk-grp">
            {left > 0 ? (
              <button type="button" className="atk-btn is-sm is-pri" disabled={busy || limited} title={limited ? t("atok.tokenSession.blocked") : undefined} onClick={onRestore} data-testid="atk-act-restore">
                <RotateCcw size={13} />
                {t("atok.act.restore", { t: clock(left) })}
              </button>
            ) : null}
            <button type="button" className={`atk-btn is-sm${left > 0 ? "" : " is-pri"}`} onClick={onReplay} disabled={limited} title={limited ? t("atok.tokenSession.blocked") : undefined} data-testid="atk-act-replay">
              <Plus size={13} />
              {t("atok.act.replay")}
            </button>
            <button type="button" className="atk-btn is-sm is-ghost" onClick={onAudit}>
              <List size={13} />
              {t("atok.act.audit")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------- strips ---------------- */

export function StateBanner({ token, now, busy, onResume, onRestore, limited = false }) {
  const f = useFmt();
  const { t } = f;
  if (token.status === "revoked") {
    const left = restoreLeft(token, now);
    return (
      <div className="atk-banner is-bad" role="status" data-testid="atk-banner-revoked">
        <Ban size={20} aria-hidden="true" />
        <div className="atk-banner-t">
          <b>{t("atok.banner.revoked")}</b>
          {t("atok.banner.revokedBody", { when: f.dt(token.revokedAt), reason: t(`atok.revoke.r.${["leaked", "unused", "replaced"].includes(token.revokeReason) ? token.revokeReason : "other"}`) })}
          {token.revokeNote ? ` ${t("atok.banner.revokedNote", { note: token.revokeNote })}` : ""}
          {left > 0 ? ` ${t("atok.banner.restoreHint", { t: clock(left) })}` : ""}
        </div>
        {left > 0 ? (
          <button type="button" className="atk-btn is-sm" disabled={busy || limited} title={limited ? t("atok.tokenSession.blocked") : undefined} onClick={onRestore}>
            <RotateCcw size={13} />
            {t("atok.undo")}
          </button>
        ) : null}
      </div>
    );
  }
  if (token.status === "expired") {
    return (
      <div className="atk-banner is-mute" role="status">
        <Clock size={20} aria-hidden="true" />
        <div className="atk-banner-t">
          <b>{t("atok.banner.expired")}</b>
          {t("atok.banner.expiredBody", { when: f.dt(token.expiresAt) })}
        </div>
      </div>
    );
  }
  return (
    <>
      {token.status === "paused" ? (
        <div className="atk-banner is-med" role="status" data-testid="atk-banner-paused">
          <Pause size={20} aria-hidden="true" />
          <div className="atk-banner-t">
            <b>{t("atok.banner.paused")}</b>
            {autoPaused(token) ? t("atok.banner.pausedAuto") : t("atok.banner.pausedBody")}
          </div>
          <button type="button" className="atk-btn is-sm" disabled={busy || limited} title={limited ? t("atok.tokenSession.blocked") : undefined} onClick={onResume}>
            <Play size={13} />
            {t("atok.act.resume")}
          </button>
        </div>
      ) : null}
      {inGrace(token, now) ? (
        <div className="atk-banner is-info" role="status">
          <RefreshCw size={20} aria-hidden="true" />
          <div className="atk-banner-t">
            <b>{t("atok.banner.grace")}</b>
            {t("atok.banner.graceBody", { when: f.dt(token.graceUntil) })}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function TokenAlertBanner({ alert, token, busy, onAction, limited = false }) {
  const f = useFmt();
  const { t } = f;
  if (!alert) return null;
  const copy = alertCopy({ ...alert, country: f.country(alert.country) || alert.country, detail: { ...(alert.detail || {}), previousCountry: f.country(alert.detail?.previousCountry) || alert.detail?.previousCountry } });
  return (
    <div className={`atk-banner ${copy.tone === "high" ? "is-bad" : "is-med"}`} role="alert" data-testid="atk-token-alert">
      {copy.icon === "burst" ? <Zap size={20} aria-hidden="true" /> : <Globe size={20} aria-hidden="true" />}
      <div className="atk-banner-t">
        <b>{t(copy.title.key, { ...copy.title.vars, count: f.n(copy.title.vars.count || 0) })}</b>
        {t(copy.body.key, { ...copy.body.vars, prevCount: f.n(copy.body.vars.prevCount || 0) })}
        {copy.reason ? ` ${t(copy.reason.key, copy.reason.vars)}` : ""}
      </div>
      <div className="atk-grp is-plain">
        {token.status === "active" ? (
          <button type="button" className="atk-btn is-sm is-dan" disabled={busy} onClick={() => onAction(alert, "pause")}>
            {t("atok.alerts.pause")}
          </button>
        ) : null}
        {alert.kind !== "burst" && alert.ip && !limited ? (
          <button type="button" className="atk-btn is-sm" disabled={busy} onClick={() => onAction(alert, "allow_ip")}>
            {allowIpMode(token) === "add" ? t("atok.alerts.allowIpShort") : t("atok.alerts.trustIp")}
          </button>
        ) : null}
        {limited ? null : (
          <button type="button" className="atk-btn is-sm is-ghost" disabled={busy} onClick={() => onAction(alert, "dismiss")}>
            {t("atok.dismiss")}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- usage console ---------------- */

function hourLabel(f, iso, i, n) {
  if (i === n - 1) return f.t("atok.usage.now");
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const same = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  return i === 0 && !same ? f.t("atok.usage.yesterdayAt", { t: f.time(iso) }) : f.time(iso);
}

export function UsageCard({ token, usage, loading }) {
  const f = useFmt();
  const { t } = f;
  const hourly = usage?.hourly24 || [];
  const top = niceMax(hourly.map((h) => h.count));
  const bars = hourBars(hourly, top);
  const dest24 = hourly.reduce((a, h) => a + (Number(h.destructive) || 0), 0);
  const split = shareSplit(usage?.mcpShare, usage?.restShare);
  const sum = daySummary(hourly);
  const errPct = pct(usage?.errorRate || 0);
  const seen = usage?.ips7d || [];
  const newIps = seen.filter((s) => !s.allowed && (token.ipAllowlist || []).length).length;
  const color = colorOf(token);
  const ticks = axisTicks(bars.length);
  const n = bars.length;
  const dayFirst = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const today = new Date();
    const same = d.toDateString() === today.toDateString();
    return same ? t("atok.usage.today") : t("atok.usage.yesterday");
  };
  return (
    <section className="atk-glass atk-card atk-usage" aria-label={t("atok.usage.title")} data-testid="atk-usage">
      <div className="atk-card-h">
        <div>
          <h3>
            <Activity size={15} aria-hidden="true" />
            {t("atok.usage.title")}
          </h3>
          <span className="atk-sub">{t("atok.usage.sub")}</span>
        </div>
      </div>
      {loading ? (
        <>
          <div className="atk-kpis">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="atk-kpi">
                <Skel w="50%" h={9} />
                <Skel w="70%" h={18} />
                <Skel w="40%" h={9} />
              </div>
            ))}
          </div>
          <Skel h={130} r={10} />
        </>
      ) : (
        <>
          <div className="atk-kpis">
            <div className="atk-kpi">
              <span className="l">{t("atok.usage.req")}</span>
              <b className="tnum">{f.n(usage?.total24h ?? token.requests24h ?? 0)}</b>
              <span className="s">{t("atok.usage.reqSub", { n: f.n(token.requestCount || 0) })}</span>
            </div>
            <div className="atk-kpi">
              <span className="l">{t("atok.usage.err")}</span>
              <b className={`tnum${errPct > 1 ? " is-warn" : ""}`}>{f.pct(errPct)}</b>
              <span className="s">{t(errPct > 1 ? "atok.usage.errHigh" : "atok.usage.errOk")}</span>
            </div>
            <div className="atk-kpi">
              <span className="l">{t("atok.usage.avg")}</span>
              <b className="tnum">{usage?.avgMs ? t("atok.ms", { n: f.n(Math.round(usage.avgMs)) }) : t("atok.dash")}</b>
              <span className="s">{usage?.p95Ms ? t("atok.usage.p95", { n: f.n(Math.round(usage.p95Ms)) }) : t("atok.dash")}</span>
            </div>
            <div className="atk-kpi">
              <span className="l">{t("atok.usage.dest")}</span>
              <b className={`tnum${dest24 ? " is-bad" : ""}`}>{f.n(dest24)}</b>
              <span className="s">{t("atok.usage.destSub")}</span>
            </div>
          </div>
          {split.mcp + split.rest ? (
            <>
              <div className="atk-split-l">
                <span>{t("atok.mcpShare", { n: f.n(split.mcp) })}</span>
                <span>{t("atok.usage.rest", { n: f.n(split.rest) })}</span>
              </div>
              <div className="atk-split" aria-hidden="true">
                <i style={{ width: `${split.mcp}%` }} className="is-mcp" />
                <i style={{ width: `${split.rest}%` }} className="is-rest" />
              </div>
            </>
          ) : null}
          <div className="atk-b24" role="img" aria-label={t("atok.usage.chartLabel")}>
            <div className="atk-b24-y tnum" aria-hidden="true">
              <span>{f.n(top)}</span>
              <span>{f.n(Math.round(top / 2))}</span>
              <span>0</span>
            </div>
            <div className="atk-b24-bars">
              {bars.map((b, i) => (
                <div
                  key={b.hour || i}
                  className={`atk-bar${i === n - 1 ? " is-now" : ""}`}
                  title={b.destructive ? t("atok.usage.barTipDest", { t: f.time(b.hour), n: f.n(b.count), d: f.n(b.destructive) }) : t("atok.usage.barTip", { t: f.time(b.hour), n: f.n(b.count) })}
                >
                  <i style={{ height: `${b.normal}%`, "--c": color }} />
                  {b.destructive ? <i className="is-dest" style={{ height: `${b.dest}%` }} /> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="atk-b24-x" aria-hidden="true">
            {ticks.map((i) => (
              <span key={i}>{hourLabel(f, bars[i]?.hour, i, n)}</span>
            ))}
          </div>
          <div className="atk-mini4">
            <div>
              <span className="l">{t("atok.usage.peak")}</span>
              <b className="tnum">{sum.peakHour ? f.time(sum.peakHour) : t("atok.dash")}</b>
              <span className="l">{sum.peakHour ? t("atok.usage.peakSub", { n: f.n(sum.peakCount) }) : t("atok.usage.noTraffic")}</span>
            </div>
            <div>
              <span className="l">{t("atok.usage.first")}</span>
              <b className="tnum">{sum.firstHour ? f.time(sum.firstHour) : t("atok.dash")}</b>
              <span className="l">{sum.firstHour ? dayFirst(sum.firstHour) : t("atok.dash")}</span>
            </div>
            <div>
              <span className="l">{t("atok.usage.uniq")}</span>
              <b className="tnum">{f.n(seen.length)}</b>
              <span className="l">{newIps ? t("atok.usage.uniqNew", { n: f.n(newIps) }) : t("atok.usage.uniqKnown")}</span>
            </div>
            <div>
              <span className="l">{t("atok.usage.perHour")}</span>
              <b className="tnum">{f.n(sum.perHour)}</b>
              <span className="l">{t("atok.usage.perHourSub")}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/* ---------------- endpoints + IP allowlist ---------------- */

export function EndpointsCard({ token, usage, loading, onEditIp, onAddSeen, limited = false }) {
  const f = useFmt();
  const { t } = f;
  const eps = usage?.topEndpoints || [];
  const max = Math.max(1, ...eps.map((e) => Number(e.count) || 0));
  const ips = token.ipAllowlist || [];
  const seen = usage?.ips7d || [];
  const live = isLive(token) && !limited;
  return (
    <section className="atk-glass atk-card atk-eps-card" aria-label={t("atok.ep.title")} data-testid="atk-endpoints">
      <div className="atk-card-h">
        <div>
          <h3>
            <List size={15} aria-hidden="true" />
            {t("atok.ep.title")}
          </h3>
          <span className="atk-sub">{t("atok.ep.sub")}</span>
        </div>
      </div>
      {loading ? (
        <div className="atk-eps">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skel key={i} h={16} />
          ))}
        </div>
      ) : eps.length ? (
        <div className="atk-eps">
          {eps.slice(0, 8).map((e, i) => {
            const d = isDestructiveRow(e);
            return (
              <div key={`${e.method}-${e.path}-${i}`} className="atk-ep">
                <span className={`atk-m m-${String(e.method || "").toUpperCase()}`}>{String(e.method || "").toUpperCase()}</span>
                <span className="p" title={e.path}>
                  {e.path}
                  <em className={d ? "is-d" : ""} style={{ width: `${((Number(e.count) || 0) / max) * 100}%` }} />
                </span>
                <span className="n tnum">
                  {f.n(e.count || 0)}
                  {d ? (
                    <span className="atk-tag is-dest" title={t("atok.ep.destTip")}>
                      {t("atok.ep.destTag")}
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="atk-empty-s">{t("atok.ep.none")}</p>
      )}
      <div className="atk-ipsec">
        <div className="atk-sec-h">
          <h4>{t("atok.ip.title")}</h4>
          {live ? (
            <button type="button" className="atk-btn is-sm" onClick={onEditIp}>
              <Pencil size={13} />
              {t("atok.ip.edit")}
            </button>
          ) : null}
        </div>
        {ips.length ? (
          <div className="atk-ipcs">
            {ips.map((ip) => (
              <span key={ip} className="atk-ipc">
                <Lock size={12} aria-hidden="true" />
                {ip}
              </span>
            ))}
          </div>
        ) : (
          <div className="atk-warnbox">
            <AlertCircle size={15} aria-hidden="true" />
            <span>
              <b>{t("atok.ip.noneTitle")}</b> {t("atok.ip.noneBody")}
            </span>
          </div>
        )}
        <div className="atk-sub atk-mb4">{t("atok.ip.seen")}</div>
        {loading ? (
          <Skel h={14} />
        ) : seen.length ? (
          <div className="atk-seen">
            {seen.map((s) => {
              const restricted = ips.length > 0;
              const ok = restricted && s.allowed;
              return (
                <div key={s.ip}>
                  <span className={`atk-cc${restricted && !s.allowed ? " is-new" : ""}`} title={f.country(s.country)}>
                    {String(s.country || "--").toUpperCase()}
                  </span>
                  <code className="atk-ell">{s.ip}</code>
                  <span className="atk-sub atk-ell">{t("atok.ip.seenRow", { country: f.country(s.country) || t("atok.dash"), n: f.n(s.count || 0) })}</span>
                  {ok ? (
                    <span className="atk-ok">{t("atok.ip.allowed")}</span>
                  ) : live ? (
                    <button type="button" className="atk-link" onClick={() => onAddSeen(s.ip)}>
                      {t("atok.ip.add")}
                    </button>
                  ) : (
                    <span className="atk-sub">{t("atok.dash")}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="atk-empty-s">{t("atok.ip.seenNone")}</p>
        )}
      </div>
    </section>
  );
}

/* ---------------- live calls ---------------- */

export function CallsCard({ calls, loading, live, hidden, freshIds, onOpenAudit }) {
  const f = useFmt();
  const { t } = f;
  return (
    <section className="atk-glass atk-card atk-calls-card" aria-label={t("atok.calls.title")} data-testid="atk-calls">
      <div className="atk-card-h">
        <div>
          <h3>
            <Zap size={15} aria-hidden="true" />
            {t("atok.calls.title")}
          </h3>
          <span className="atk-sub">{t("atok.calls.sub")}</span>
        </div>
        {live ? <LiveBadge muted={hidden}>{hidden ? t("atok.pausedLive") : t("atok.live")}</LiveBadge> : null}
      </div>
      {loading ? (
        <div className="atk-calls">
          {Array.from({ length: 8 }, (_, i) => (
            <Skel key={i} h={18} />
          ))}
        </div>
      ) : calls.length ? (
        <div className="atk-calls" aria-live="off">
          {calls.slice(0, 14).map((c) => {
            const kind = c.destructive ? destructiveKind(c) || "other" : null;
            const m = String(c.via === "mcp" ? "MCP" : c.method || "").toUpperCase();
            return (
              <div key={c.id} className={`atk-call${freshIds?.has(c.id) ? " is-fresh" : ""}`}>
                <span className="atk-c-tm tnum">{f.clock(c.at)}</span>
                <span className={`atk-m m-${m}`}>{m}</span>
                <span className="atk-c-p" title={c.via === "mcp" && c.tool ? `tools/call ${c.tool}` : c.path}>
                  {c.via === "mcp" && c.tool ? `tools/call ${c.tool}` : c.path}
                </span>
                <span className={`atk-c-sc tnum is-${statusTone(c.status)}`}>{c.status}</span>
                <span className="atk-c-ms tnum">{t("atok.ms", { n: f.n(c.ms || 0) })}</span>
                <span className="atk-c-x">
                  {kind ? <span className="atk-tag is-dest">{t(`atok.calls.kind.${kind}`)}</span> : null}
                  {kind && c.auditId ? (
                    <button type="button" className="atk-link" onClick={() => onOpenAudit(c.auditId)}>
                      {t("atok.calls.undo")}
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="atk-empty-s">{t("atok.calls.none")}</p>
      )}
    </section>
  );
}

/* ---------------- connection ---------------- */

const CLS = { c: "hl-c", s: "hl-s", k: "hl-k", p: "", ph: "hl-ph", tok: "hl-tok" };

export function Snippets({ mcpUrl, secret, tab, onTab, onCopied, testId = "atk-snip" }) {
  const f = useFmt();
  const { t } = f;
  const [done, setDone] = useState(false);
  const cur = SNIPPET_TABS.includes(tab) ? tab : "claudeCode";
  const parts = snippetParts(cur, mcpUrl, secret);
  const icon = { claudeCode: Terminal, desktop: Bot, curl: Globe };
  return (
    <div className="atk-snip" data-testid={testId}>
      <div className="atk-snip-tabs" role="tablist">
        {SNIPPET_TABS.map((k) => {
          const Ic = icon[k];
          return (
            <button key={k} type="button" role="tab" aria-selected={cur === k} className={cur === k ? "is-on" : ""} onClick={() => onTab(k)}>
              <Ic size={13} aria-hidden="true" />
              {t(`atok.conn.tab.${k}`)}
            </button>
          );
        })}
        <button
          type="button"
          className="atk-btn is-sm atk-snip-copy"
          onClick={async () => {
            const ok = await copyText(snippetText(cur, mcpUrl, secret));
            onCopied?.(ok);
            if (ok) {
              setDone(true);
              setTimeout(() => setDone(false), 1600);
            }
          }}
          data-testid={`${testId}-copy`}
        >
          {done ? <Check size={13} /> : <Copy size={13} />}
          {done ? t("atok.copied") : t("atok.copy")}
        </button>
      </div>
      <pre className="atk-snip-pre">
        {parts.map(([cls, text], i) =>
          CLS[cls] ? (
            <span key={i} className={CLS[cls]}>
              {text}
            </span>
          ) : (
            text
          )
        )}
      </pre>
    </div>
  );
}

export function SnipFoot({ full, onOpenapi, onForget }) {
  const { t } = useFmt();
  return (
    <div className="atk-snip-foot">
      <span>{full ? t("atok.conn.footFull") : t("atok.conn.footPh")}</span>
      {full && onForget ? (
        <button type="button" className="atk-link" onClick={onForget}>
          <X size={12} />
          {t("atok.conn.forget")}
        </button>
      ) : null}
      <button type="button" className="atk-link" onClick={onOpenapi}>
        <FileText size={12} />
        {t("atok.openapi")}
      </button>
      <span className="atk-mono">/api/admin/openapi.json</span>
    </div>
  );
}

export function ConnectionCard({ mcp, usage, secret, tab, onTab, onCopied, onOpenapi, onForget }) {
  const f = useFmt();
  const { t } = f;
  const tools = topTools(usage?.topEndpoints);
  const toolCount = Array.isArray(mcp?.tools) ? mcp.tools.length : Number(mcp?.tools) || 0;
  const tiles = [
    ["sessions", f.n(mcp?.openSessions || 0)],
    ["tools", f.n(toolCount)],
    ...(mcp?.restEndpoints != null ? [["endpoints", f.n(mcp.restEndpoints)]] : []),
    ["latency", mcp?.p50Ms != null ? t("atok.ms", { n: f.n(Math.round(mcp.p50Ms)) }) : t("atok.dash")],
  ];
  return (
    <section className="atk-glass atk-card" aria-label={t("atok.conn.title")} data-testid="atk-connection">
      <div className="atk-card-h">
        <div>
          <h3>
            <Terminal size={15} aria-hidden="true" />
            {t("atok.conn.title")}
          </h3>
          <span className="atk-sub">{t("atok.conn.sub")}</span>
        </div>
      </div>
      <Snippets mcpUrl={mcp?.url} secret={secret} tab={tab} onTab={onTab} onCopied={onCopied} />
      <SnipFoot full={Boolean(secret)} onOpenapi={onOpenapi} onForget={onForget} />
      <div className="atk-mcp">
        <div className="atk-sec-h">
          <h4 className="atk-ell">{t("atok.conn.mcpTitle", { host: mcpHost(mcp?.url) })}</h4>
          <span className="atk-pill st-active">{t("atok.conn.running")}</span>
        </div>
        <div className="atk-mini4" style={{ "--cols": tiles.length }}>
          {tiles.map(([k, v]) => (
            <div key={k}>
              <span className="l">{t(`atok.conn.${k}`)}</span>
              <b className="tnum">{v}</b>
            </div>
          ))}
        </div>
        <div className="atk-tools">
          {tools.length ? (
            <>
              <span className="atk-sub">{t("atok.conn.topTools")}</span>
              {tools.map((x) => (
                <code key={x.name} className={x.destructive ? "is-d" : ""}>
                  {x.name}
                </code>
              ))}
            </>
          ) : (
            <span className="atk-sub">{t("atok.conn.noTools")}</span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------- audit ---------------- */

const AUDIT_ICON = { edit: Pencil, dest: Gavel, alert: AlertCircle, create: Plus, ip: Globe, rotate: RefreshCw, pause: Pause, resume: Play, revoke: Ban, panic: AlertCircle, restore: Undo2 };

export function AuditCard({ audit, loading, now, onOpenToken, onOpenEntry }) {
  const f = useFmt();
  const { t } = f;
  return (
    <section className="atk-glass atk-card" aria-label={t("atok.audit.title")} data-testid="atk-audit">
      <div className="atk-card-h">
        <div>
          <h3>
            <List size={15} aria-hidden="true" />
            {t("atok.audit.title")}
          </h3>
          <span className="atk-sub">{t("atok.audit.sub")}</span>
        </div>
        <button type="button" className="atk-btn is-sm is-ghost" onClick={onOpenToken}>
          <ExternalLink size={13} />
          {t("atok.audit.open")}
        </button>
      </div>
      {loading ? (
        <div className="atk-auditl">
          {[0, 1, 2].map((i) => (
            <div key={i} className="atk-au">
              <Skel w={26} h={26} r={8} />
              <div className="atk-au-b">
                <Skel w="60%" />
                <Skel w="30%" h={9} />
              </div>
            </div>
          ))}
        </div>
      ) : (audit || []).length ? (
        <div className="atk-auditl">
          {audit.slice(0, 8).map((e) => {
            const kind = auditKind(e.action);
            const Ic = AUDIT_ICON[kind] || Gavel;
            return (
              <div key={e.id} className="atk-au">
                <span className={`atk-au-ic k-${kind}`} aria-hidden="true">
                  <Ic size={13} />
                </span>
                <div className="atk-au-b">
                  <div className="atk-au-t">{e.summary || e.action}</div>
                  <div className="atk-au-m">
                    {f.dt(e.at)} · {f.label(agoLabel(e.at, now))}
                  </div>
                  {e.auditId || e.id ? (
                    <div className="atk-au-l">
                      <button type="button" className="atk-link" onClick={() => onOpenEntry(e.auditId || e.id)}>
                        {t("atok.audit.view")}
                      </button>
                      {e.undoable && e.auditId ? (
                        <button type="button" className="atk-link" onClick={() => onOpenEntry(e.auditId)} data-testid="atk-audit-undo">
                          {t("atok.audit.undo")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="atk-empty-s">{t("atok.audit.none")}</p>
      )}
    </section>
  );
}
