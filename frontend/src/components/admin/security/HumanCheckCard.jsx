/**
 * Güvenlik Merkezi › İnsan doğrulaması (Cloudflare Turnstile). Control-room card:
 * status pill, four live counters for the last 24 hours, an hourly stacked bar chart
 * with a hover readout, where the check is asked (per action), the mode switch
 * (Zorunlu / İzle / Kapalı; going down needs a reason, handled by SecurityCenter) and
 * the health notes (no key yet, bad secret, Cloudflare outages, no-check budget).
 * Data: overview.humanCheck (backend lib/turnstile.js adminStatus).
 */
import { useState } from "react";
import { AlertTriangle, ShieldCheck } from "../../ui/Icon.jsx";
import { HUMAN_MODES, humanActionRows, humanBars, humanKpis, humanNotes, humanStatus } from "./humanCheckModel.js";
import { fmtNum, fmtTime, relTime } from "./securityModel.js";

const COLORS = { pass: "#587af5", refused: "#f23f43", let: "#f2a93b" };

export default function HumanCheckCard({ t, locale, hc, now, loading, busy, onMode }) {
  const [hover, setHover] = useState(null);
  if (loading) return <section className="sc-card sc-human is-loading" aria-busy="true"><div className="sc-skel" style={{ height: 220 }} /></section>;
  const status = humanStatus(hc);
  const k = humanKpis(hc);
  const { bars } = humanBars(hc?.stats?.series);
  const rows = humanActionRows(hc);
  const notes = humanNotes(hc);
  const locked = Boolean(hc?.envOverride);
  const canSwitch = Boolean(hc?.configured) && !locked && !busy;
  const start = Date.parse(hc?.stats?.series?.start || "");
  const hourAt = (i) => (Number.isFinite(start) ? new Date(start + i * 3600 * 1000).toISOString() : null);
  const n = (v) => fmtNum(v, locale);
  const hovered = hover == null ? null : bars[hover];

  return (
    <section className="sc-card sc-human" aria-labelledby="sc-human-h" data-testid="sc-human">
      <h3 id="sc-human-h">
        <ShieldCheck size={16} aria-hidden="true" />
        {t("secCenter.human.title")}
        <span className="sc-sub">{t("secCenter.human.window")}</span>
        <span className={`sc-hpill is-${status.tone}`} data-testid="sc-human-status">
          <i aria-hidden="true" />
          {t(`secCenter.human.status.${status.key}`)}
        </span>
      </h3>

      <div className="sc-human-g">
        <div className="sc-human-l">
          <div className="sc-kpis">
            <div className="sc-kpi">
              <span><i style={{ background: COLORS.pass }} />{t("secCenter.human.kpi.pass")}</span>
              <b className="tnum">{n(k.pass)}</b>
              <small className="sc-muted">{k.passRate == null ? t("secCenter.human.sub.noData") : t("secCenter.human.sub.rate", { rate: fmtNum(k.passRate, locale) })}</small>
            </div>
            <div className="sc-kpi">
              <span><i style={{ background: COLORS.refused }} />{t("secCenter.human.kpi.refused")}</span>
              <b className="tnum">{n(k.refused)}</b>
              <small className="sc-muted" title={t("secCenter.human.sub.refused")}>{t("secCenter.human.sub.refused")}</small>
            </div>
            <div className="sc-kpi">
              <span title={t("secCenter.human.kpi.fallback")}><i style={{ background: COLORS.let }} />{t("secCenter.human.kpi.fallback")}</span>
              <b className="tnum">{n(k.fallback)}</b>
              <small className="sc-muted" title={t("secCenter.human.sub.fallback")}>{t("secCenter.human.sub.fallback")}</small>
            </div>
            <div className="sc-kpi">
              <span><i style={{ background: "#9b5de5" }} />{t("secCenter.human.kpi.failOpen")}</span>
              <b className="tnum">{n(k.failOpen)}</b>
              <small className={k.failOpen ? "sc-up" : "sc-muted"} title={t("secCenter.human.sub.failOpen")}>{t("secCenter.human.sub.failOpen")}</small>
            </div>
          </div>
          <div className="sc-legend">
            {["pass", "refused", "let"].map((key) => (
              <span key={key}><i style={{ background: COLORS[key] }} />{t(`secCenter.human.legend.${key}`)}</span>
            ))}
          </div>
          <div className="sc-hbars" role="img" aria-label={t("secCenter.human.chartAria")} onMouseLeave={() => setHover(null)}>
            {bars.map((b) => (
              <div key={b.i} className={`sc-hbar${hover === b.i ? " is-hover" : ""}`} onMouseEnter={() => setHover(b.i)}>
                <span style={{ height: `${b.h.let * 100}%`, background: COLORS.let }} />
                <span style={{ height: `${b.h.refused * 100}%`, background: COLORS.refused }} />
                <span style={{ height: `${b.h.pass * 100}%`, background: COLORS.pass }} />
              </div>
            ))}
            {hovered && hourAt(hovered.i) ? (
              <div className="sc-tip" style={{ left: `${((hovered.i + 0.5) / Math.max(1, bars.length)) * 100}%` }} role="status">
                {t("secCenter.human.hourTip", { time: fmtTime(hourAt(hovered.i), locale), pass: n(hovered.pass), refused: n(hovered.refused), let: n(hovered.let) })}
              </div>
            ) : null}
          </div>
          <div className="sc-axis">
            <span>{Number.isFinite(start) ? fmtTime(new Date(start).toISOString(), locale) : ""}</span>
            <span>{Number.isFinite(start) ? fmtTime(new Date(start + 12 * 3600 * 1000).toISOString(), locale) : ""}</span>
            <span>{t("secCenter.time.nowCap")}</span>
          </div>
        </div>

        <div className="sc-human-r">
          <div className="sc-lab">{t("secCenter.human.actions")}</div>
          <ul className="sc-hact">
            {rows.map((r) => (
              <li key={r.action} data-action={r.action}>
                <span className="sc-hact-n">
                  {t(`secCenter.human.action.${r.action}`)}
                  {r.action === "login" && r.challenged ? <small className="sc-muted"> · {t("secCenter.human.challenged", { n: n(r.challenged) })}</small> : null}
                </span>
                <span className="sc-hact-v tnum" title={t("secCenter.human.col.pass")} style={{ color: "#a9b9ff" }}>{n(r.pass)}</span>
                <span className="sc-hact-v tnum" title={t("secCenter.human.col.refused")} style={{ color: "#ff9a9c" }}>{n(r.refused)}</span>
                <span className="sc-hact-v tnum" title={t("secCenter.human.col.let")} style={{ color: "#ffc773" }}>{n(r.let)}</span>
              </li>
            ))}
          </ul>

          <div className="sc-lab">{t("secCenter.human.modeTitle")}</div>
          <div className="sc-hmode" role="group" aria-label={t("secCenter.human.modeTitle")}>
            {HUMAN_MODES.map((m) => {
              const on = (hc?.setting || "enforce") === m;
              return (
                <button
                  key={m}
                  type="button"
                  className={`${on ? "is-on" : ""} is-${m}`}
                  aria-pressed={on}
                  disabled={!canSwitch || on}
                  onClick={(e) => onMode(m, e.currentTarget)}
                  data-testid={`sc-human-mode-${m}`}
                >
                  {t(`secCenter.human.mode.${m}`)}
                </button>
              );
            })}
          </div>
          <p className="sc-muted sc-small sc-hhint">{locked ? t("secCenter.human.envLocked") : t(`secCenter.human.modeHint.${hc?.mode || "enforce"}`)}</p>

          {notes.length ? (
            <ul className="sc-hnotes">
              {notes.map((note) => (
                <li key={note.key} className={`is-${note.tone}`}>
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>{t(`secCenter.human.notes.${note.key}`, note.vars ? { ...note.vars, mode: note.vars.mode ? t(`secCenter.human.mode.${note.vars.mode}`) : undefined } : undefined)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {!hc?.configured ? <p className="sc-muted sc-small">{t("secCenter.human.setup")}</p> : null}

          {hc?.configured ? (
            <div className="sc-hmeta sc-muted sc-small">
              <span>{t(hc.source === "env" ? "secCenter.human.meta.sourceEnv" : "secCenter.human.meta.sourceDb")}</span>
              {hc.siteKey ? <span className="tnum">{t("secCenter.human.meta.siteKey", { key: hc.siteKey })}</span> : null}
              <span title={(hc.hostnames || []).join(", ")}>{t("secCenter.human.meta.hosts", { n: (hc.hostnames || []).length })}</span>
              {hc.updatedAt ? <span>{t("secCenter.human.meta.updated", { time: relTime(hc.updatedAt, t, now) })}</span> : null}
              {hc.fallback ? (
                <span className="tnum">{t("secCenter.human.meta.budget", { used: n(hc.fallback.usedThisHour || 0), max: n(hc.fallback.fallbackGlobal || 0), perIp: n(hc.fallback.fallbackPerIp || 0) })}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
