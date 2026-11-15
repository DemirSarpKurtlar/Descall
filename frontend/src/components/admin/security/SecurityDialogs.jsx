/**
 * Güvenlik Merkezi side panels and popovers: event drawer ("İncele": the source's and
 * the account's recent events, ban shortcuts), source ban dialog (access ban by the
 * event's hash, IP or /24 network), reason popover (lift a lock, switch something off),
 * recommendation / explanation / 2FA reminder popovers, lock detail (extend, lift),
 * and the "Uyarılar" menu.
 */
import { useEffect, useId, useState } from "react";
import { AlertTriangle, Ban, Bell, Check, Copy, ExternalLink, Info, Lock, Network, Shield, Undo2, User, X } from "../../ui/Icon.jsx";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { Dialog, Drawer, ICONS, Popover } from "./ui.jsx";
import { securityApi } from "./securityApi.js";
import { copyText } from "../../../lib/copyText.js";
import { countryName } from "./SecurityCards.jsx";
import {
  BAN_DURATIONS,
  EVENT_META,
  errorKey,
  eventLine,
  fmtNum,
  fmtStamp,
  fixSummary,
  relTime,
  remainingText,
  scoreAfter,
  sourceText,
  numWithSuffix,
} from "./securityModel.js";

/* ---------------- event drawer ---------------- */

export function EventDrawer({ open, eventId, onClose, t, locale, now, onBanSource, onBanUser, onOpenUser, onOpenAccessBans, onFilterSource, canAccessBans, canModerate, suspended }) {
  const titleId = useId();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !eventId) return undefined;
    let alive = true;
    setData(null);
    setError("");
    securityApi
      .event(eventId)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err?.message || t("secCenter.err.generic")));
    return () => {
      alive = false;
    };
  }, [open, eventId, t]);

  const e = data?.event;
  const meta = e ? EVENT_META[e.type] || EVENT_META.failed_login : null;
  const Icon = meta ? ICONS[meta.icon] : Shield;
  const timeline = e ? [...(data.related?.bySource || []), ...(data.related?.byUser || [])].filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 20) : [];

  return (
    <Drawer open={open} onClose={onClose} labelledBy={titleId} suspended={suspended} className="sc-evd" testId="sc-event-drawer">
      <header className="sc-dh">
        <span className={`sc-dh-ic is-soft-${meta?.tone || "gray"}`} aria-hidden="true">
          <Icon size={20} />
        </span>
        <div>
          <h2 id={titleId}>{e ? t(`secCenter.ev.${e.type}.title`) : t("secCenter.evd.title")}</h2>
          <p>{e ? eventLine(e, t, locale) : t("secCenter.loading")}</p>
        </div>
        <button type="button" className="sc-btn sc-close" onClick={onClose} aria-label={t("secCenter.close")} data-autofocus>
          <X size={16} />
        </button>
      </header>
      {error ? <p className="sc-err" role="alert">{error}</p> : null}
      {!e && !error ? <div className="sc-skel" style={{ height: 220 }} /> : null}
      {e ? (
        <>
          <dl className="sc-facts">
            <dt>{t("secCenter.evd.when")}</dt>
            <dd>{fmtStamp(e.at, t, locale, now)} · {relTime(e.at, t, now)}</dd>
            {e.count > 1 ? (
              <>
                <dt>{t("secCenter.evd.count")}</dt>
                <dd className="tnum">{t("secCenter.evd.countVal", { n: fmtNum(e.count, locale), from: fmtStamp(e.firstAt, t, locale, now) })}</dd>
              </>
            ) : null}
            <dt>{t("secCenter.evd.source")}</dt>
            <dd className="tnum">{e.ipMasked ? sourceText({ ...e, country: countryName(e.country, locale) }) : t("secCenter.evd.noSource")}</dd>
            {e.netLabel ? (
              <>
                <dt>{t("secCenter.evd.network")}</dt>
                <dd className="tnum">{e.netLabel}</dd>
              </>
            ) : null}
            <dt>{t("secCenter.evd.account")}</dt>
            <dd>{e.username ? `@${e.username}` : e.detail?.unknownAccount ? t("secCenter.ev.unknownAccount") : t("secCenter.evd.noAccount")}</dd>
            <dt>{t("secCenter.evd.status")}</dt>
            <dd>{data.sourceBanned ? <span className="sc-chip is-blue">{t("secCenter.evd.sourceBanned")}</span> : <span className="sc-muted">{t("secCenter.evd.sourceOpen")}</span>}</dd>
          </dl>
          <div className="sc-evd-acts">
            {canAccessBans && e.sourceRef && !data.sourceBanned ? (
              <>
                <button type="button" className="sc-btn is-soft-r" onClick={(ev) => onBanSource({ sourceRef: e.sourceRef, ipMasked: e.ipMasked, netLabel: e.netLabel }, "ip", ev.currentTarget)}>
                  <Lock size={15} aria-hidden="true" />
                  {t("secCenter.act.banIp")}
                </button>
                {e.netLabel ? (
                  <button type="button" className="sc-btn is-soft-r" onClick={(ev) => onBanSource({ sourceRef: e.sourceRef, ipMasked: e.ipMasked, netLabel: e.netLabel }, "network", ev.currentTarget)}>
                    <Network size={15} aria-hidden="true" />
                    {t("secCenter.act.banNet")}
                  </button>
                ) : null}
              </>
            ) : null}
            {canModerate && e.userId ? (
              <button type="button" className="sc-btn is-soft-r" onClick={() => onBanUser({ id: e.userId, username: e.username })}>
                <Ban size={15} aria-hidden="true" />
                {t("secCenter.act.banUser")}
              </button>
            ) : null}
            {e.userId ? (
              <button type="button" className="sc-btn" onClick={() => onOpenUser(e.userId)}>
                <User size={15} aria-hidden="true" />
                {t("secCenter.evd.openUser")}
              </button>
            ) : null}
            {e.type === "access_ban" && canAccessBans ? (
              <button type="button" className="sc-btn" onClick={onOpenAccessBans}>
                <ExternalLink size={15} aria-hidden="true" />
                {t("secCenter.evd.openBans")}
              </button>
            ) : null}
            {e.sourceRef ? (
              <button type="button" className="sc-btn" onClick={() => onFilterSource(e)}>
                <Shield size={15} aria-hidden="true" />
                {t("secCenter.evd.allFromSource")}
              </button>
            ) : null}
            <button
              type="button"
              className="sc-btn"
              onClick={async () => {
                if (!(await copyText(`${t(`secCenter.ev.${e.type}.title`)} · ${eventLine(e, t, locale)} · ${e.ipMasked || ""} · ${e.at} · ${e.id}`))) return;
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? t("secCenter.evd.copied") : t("secCenter.evd.copy")}
            </button>
          </div>
          <div className="sc-lab">{t("secCenter.evd.timeline")}</div>
          {timeline.length ? (
            <ol className="sc-tl">
              {timeline.map((x) => {
                const m = EVENT_META[x.type] || EVENT_META.failed_login;
                return (
                  <li key={x.id} className={`is-${m.tone}`}>
                    <b>{t(`secCenter.ev.${x.type}.title`)}{x.count > 1 ? <em className="sc-count tnum">×{fmtNum(x.count, locale)}</em> : null}</b>
                    <p>{eventLine(x, t, locale)}</p>
                    <time dateTime={x.at}>{relTime(x.at, t, now)}</time>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="sc-muted">{t("secCenter.evd.noRelated")}</p>
          )}
        </>
      ) : null}
    </Drawer>
  );
}

/* ---------------- source ban ---------------- */

export function SourceBanDialog({ open, source, initialKind = "ip", onClose, onDone, t }) {
  const titleId = useId();
  const [kind, setKind] = useState(initialKind);
  const [duration, setDuration] = useState("30d");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setDuration("30d");
    setReason("");
    setError("");
  }, [open, initialKind]);
  if (!source) return null;
  const submit = async () => {
    if (busy || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const res = await securityApi.banSource({ sourceRef: source.sourceRef, kind, duration, reason: reason.trim() });
      onDone?.(res, kind);
    } catch (err) {
      const key = errorKey(err);
      setError(key ? t(key) : err?.message || t("secCenter.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} busy={busy} labelledBy={titleId} className="sc-bandlg" testId="sc-source-ban">
      <header className="sc-dh">
        <span className="sc-dh-ic is-red" aria-hidden="true">
          <Ban size={20} />
        </span>
        <div>
          <h2 id={titleId}>{t("secCenter.srcBan.title", { ip: source.ipMasked || "" })}</h2>
          <p>{t("secCenter.srcBan.sub")}</p>
        </div>
      </header>
      <div>
        <div className="sc-lab">{t("secCenter.srcBan.what")}</div>
        <div className="sc-modes is-row" role="radiogroup" aria-label={t("secCenter.srcBan.what")}>
          <button type="button" role="radio" aria-checked={kind === "ip"} className={`sc-mode${kind === "ip" ? " is-on" : ""}`} onClick={() => setKind("ip")} data-autofocus>
            <span className="sc-mode-txt">
              <b>{t("secCenter.srcBan.ip")}</b>
              <small>{source.ipMasked}</small>
            </span>
          </button>
          <button type="button" role="radio" aria-checked={kind === "network"} className={`sc-mode${kind === "network" ? " is-on" : ""}`} onClick={() => setKind("network")} disabled={!source.netLabel}>
            <span className="sc-mode-txt">
              <b>{t("secCenter.srcBan.network")}</b>
              <small>{source.netLabel || "—"}</small>
            </span>
          </button>
        </div>
        {kind === "network" ? (
          <p className="sc-warnline">
            <AlertTriangle size={14} aria-hidden="true" /> {t("secCenter.srcBan.netWarn")}
          </p>
        ) : null}
      </div>
      <div>
        <div className="sc-lab">{t("secCenter.srcBan.duration")}</div>
        <div className="sc-pills" role="radiogroup" aria-label={t("secCenter.srcBan.duration")}>
          {BAN_DURATIONS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={duration === d} className={duration === d ? "is-onr" : ""} onClick={() => setDuration(d)}>
              {t(`secCenter.banDur.${d}`)}
            </button>
          ))}
        </div>
      </div>
      <label className="sc-field">
        <span className="sc-lab">{t("secCenter.reasonRequired")}</span>
        <textarea className="sc-ta" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("secCenter.srcBan.reasonPh")} data-testid="sc-srcban-reason" />
      </label>
      <p className="sc-muted sc-small">{t("secCenter.srcBan.privacy")}</p>
      {error ? <p className="sc-err" role="alert">{error}</p> : null}
      <div className="sc-row">
        <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>
          {t("secCenter.cancel")}
        </button>
        <button type="button" className="sc-btn is-r" onClick={submit} disabled={busy || reason.trim().length < 3} data-testid="sc-srcban-go">
          <Ban size={15} aria-hidden="true" />
          {busy ? t("secCenter.srcBan.banning") : t(kind === "network" ? "secCenter.srcBan.goNet" : "secCenter.srcBan.goIp")}
        </button>
      </div>
    </Dialog>
  );
}

/* ---------------- reason popover (lift / switch off) ---------------- */

export function ReasonPopover({ open, anchorRef, onClose, t, title, text, confirmLabel, tone = "r", onConfirm, testId }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
    }
  }, [open]);
  const go = async () => {
    if (busy || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      const key = errorKey(err);
      setError(key ? t(key) : err?.message || t("secCenter.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose} width={380} label={title} busy={busy} testId={testId}>
      <h4>
        <AlertTriangle size={16} aria-hidden="true" />
        {title}
      </h4>
      <p>{text}</p>
      <label className="sc-field">
        <span className="sc-lab">{t("secCenter.reasonRequired")}</span>
        <textarea className="sc-ta" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus data-testid={testId ? `${testId}-reason` : undefined} />
      </label>
      {error ? <p className="sc-err" role="alert">{error}</p> : null}
      <div className="sc-row">
        <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>
          {t("secCenter.cancel")}
        </button>
        <button type="button" className={`sc-btn is-${tone}`} onClick={go} disabled={busy || reason.trim().length < 3} data-testid={testId ? `${testId}-go` : undefined}>
          {busy ? t("secCenter.saving") : confirmLabel}
        </button>
      </div>
    </Popover>
  );
}

/* ---------------- score popovers ---------------- */

export function FixPopover({ open, anchorRef, onClose, t, locale, check, score, allCount, onApply, onApplyAll }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) setError("");
  }, [open]);
  if (!check) return null;
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err?.message || t("secCenter.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose} width={360} label={t("secCenter.fix.title")} busy={busy} testId="sc-fix-pop">
      <h4>
        <Shield size={16} aria-hidden="true" />
        {t("secCenter.fix.title")}
      </h4>
      <p>{t(`secCenter.check.${check.id}.why`)}</p>
      <div className="sc-kv2">
        <div>
          <span>{t("secCenter.fix.sets")}</span>
          <b>{fixSummary(check, t, locale)}</b>
        </div>
        <div>
          <span>{t("secCenter.fix.score")}</span>
          <b className="tnum">
            {score} → <span className="sc-dn">{scoreAfter(score, check)}</span>
          </b>
        </div>
      </div>
      {error ? <p className="sc-err" role="alert">{error}</p> : null}
      <div className="sc-row">
        {allCount > 1 ? (
          <button type="button" className="sc-btn" onClick={() => run(onApplyAll)} disabled={busy} data-testid="sc-fix-all">
            {t("secCenter.fix.all", { n: allCount })}
          </button>
        ) : (
          <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>
            {t("secCenter.cancel")}
          </button>
        )}
        <button type="button" className="sc-btn is-p" onClick={() => run(onApply)} disabled={busy} data-autofocus data-testid="sc-fix-go">
          <Check size={15} aria-hidden="true" />
          {busy ? t("secCenter.saving") : t("secCenter.fix.apply")}
        </button>
      </div>
    </Popover>
  );
}

export function ExplainPopover({ open, anchorRef, onClose, t, score, check, onRemind, onLocks }) {
  if (!score) return null;
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose} width={400} label={t("secCenter.explain.title")} testId="sc-explain-pop">
      <h4>
        <Info size={16} aria-hidden="true" />
        {check ? t(`secCenter.check.${check.id}.name`) : t("secCenter.explain.title")}
      </h4>
      {check ? (
        <>
          <p>{t(`secCenter.check.${check.id}.why`)}</p>
          {check.id === "admin2fa" && check.people?.length ? (
            <ul className="sc-people">
              {check.people.map((p) => (
                <li key={p}>@{p}</li>
              ))}
            </ul>
          ) : null}
          <div className="sc-row">
            <button type="button" className="sc-btn" onClick={onClose}>
              {t("secCenter.close")}
            </button>
            {check.action === "remind" ? (
              <button type="button" className="sc-btn is-p" onClick={onRemind} data-testid="sc-remind-go">
                <Bell size={15} aria-hidden="true" />
                {t("secCenter.score.remindGo")}
              </button>
            ) : check.action === "locks" ? (
              <button type="button" className="sc-btn is-p" onClick={onLocks}>
                <Lock size={15} aria-hidden="true" />
                {t("secCenter.score.viewLocks")}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p>{t("secCenter.explain.body")}</p>
          <ul className="sc-weights">
            {score.weights.map((w) => {
              const c = score.checks.find((x) => x.id === w.id);
              return (
                <li key={w.id} className={c?.ok ? "is-ok" : "is-wa"}>
                  <span>{t(`secCenter.check.${w.id}.name`)}</span>
                  <b className="tnum">{t("secCenter.score.points", { n: w.points })}</b>
                </li>
              );
            })}
          </ul>
          <p className="sc-muted sc-small">{t("secCenter.explain.grades")}</p>
        </>
      )}
    </Popover>
  );
}

/* ---------------- lock detail ---------------- */

export function LockDetailPopover({ open, anchorRef, onClose, t, locale, now, mode, lock, onExtend, onLift }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) setError("");
  }, [open]);
  if (!lock) return null;
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      const key = errorKey(err);
      setError(key ? t(key) : err?.message || t("secCenter.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose} width={360} label={t(`secCenter.lockMode.${mode}.name`)} busy={busy} testId="sc-lock-detail">
      <h4>
        <Lock size={16} aria-hidden="true" />
        {t(`secCenter.lockMode.${mode}.name`)}
      </h4>
      <div className="sc-kv2">
        <div><span>{t("secCenter.lockInfo.reason")}</span><b className="sc-wrap">{lock.reason || "—"}</b></div>
        <div><span>{t("secCenter.lockInfo.by")}</span><b>{lock.by ? `@${lock.by}` : "—"}</b></div>
        <div><span>{t("secCenter.lockInfo.started")}</span><b>{fmtStamp(lock.startedAt, t, locale, now)}</b></div>
        <div><span>{t("secCenter.lockInfo.ends")}</span><b>{lock.until ? `${fmtStamp(lock.until, t, locale, now)} · ${remainingText(lock.until, t, now)}` : t("secCenter.locks.untilLifted")}</b></div>
        <div><span>{t("secCenter.lockInfo.band")}</span><b>{lock.banner ? t("secCenter.val.on") : t("secCenter.val.off")}</b></div>
      </div>
      <div className="sc-lab">{t("secCenter.lockInfo.extend")}</div>
      <div className="sc-pills">
        {[60, 360, 1440].map((m) => (
          <button key={m} type="button" disabled={busy} onClick={() => run(() => onExtend(mode, (lock.until ? Math.max(0, Math.ceil((Date.parse(lock.until) - Date.now()) / 60000)) : 0) + m))} data-testid={`sc-extend-${m}`}>
            {t("secCenter.lockInfo.plus", { time: t(m >= 60 ? "secCenter.time.hours" : "secCenter.time.minutes", { n: m >= 60 ? m / 60 : m }) })}
          </button>
        ))}
        <button type="button" disabled={busy || !lock.until} onClick={() => run(() => onExtend(mode, null))}>
          {t("secCenter.duration.manual")}
        </button>
      </div>
      {error ? <p className="sc-err" role="alert">{error}</p> : null}
      <div className="sc-row">
        <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>
          {t("secCenter.close")}
        </button>
        <button type="button" className="sc-btn is-r" onClick={() => onLift(mode)} disabled={busy} data-testid="sc-lock-lift">
          <Undo2 size={15} aria-hidden="true" />
          {t("secCenter.lockInfo.lift")}
        </button>
      </div>
    </Popover>
  );
}

/* ---------------- alerts menu ---------------- */

export function AlertsPopover({ open, anchorRef, onClose, t, locale, now, alerts, desktopOn, onDesktop, onPick }) {
  const kindIcon = { burst: AlertTriangle, failedSpike: AlertTriangle, lockedSpike: Lock, lock: Lock, lockOpen: Lock, admin2fa: Shield };
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose} width={380} label={t("secCenter.alerts.title")} className="sc-alerts" testId="sc-alerts">
      <h4>
        <Bell size={16} aria-hidden="true" />
        {t("secCenter.alerts.title")}
      </h4>
      {alerts.length ? (
        <ul className="sc-alert-list">
          {alerts.map((a) => {
            const Icon = kindIcon[a.kind] || Info;
            const vars = { ...a.vars };
            if (a.vars?.missing != null) vars.missing = numWithSuffix(a.vars.missing, locale);
            if (a.kind === "lock" || a.kind === "lockOpen") {
              vars.mode = t(`secCenter.lockMode.${a.vars.mode}.name`);
              vars.time = remainingText(a.vars.until, t, now);
            }
            return (
              <li key={a.id}>
                <button type="button" className={`sc-alert is-${a.tone}`} onClick={() => onPick(a)}>
                  <span className={`sc-ic is-${a.tone}`} aria-hidden="true"><Icon size={15} /></span>
                  <span className="sc-alert-t">
                    <b>{t(`secCenter.alerts.${a.kind}.title`, vars)}</b>
                    <small>{t(`secCenter.alerts.${a.kind}.body`, vars)}{a.at && a.kind === "burst" ? ` · ${fmtStamp(a.at, t, locale, now)}` : ""}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="sc-muted">{t("secCenter.alerts.none")}</p>
      )}
      <label className="sc-check is-line">
        <GlassCheckbox checked={desktopOn} onChange={(e) => onDesktop(e.target.checked)} data-testid="sc-alerts-desktop" />
        <span>
          {t("secCenter.alerts.desktop")}
          <small>{t("secCenter.alerts.desktopHint")}</small>
        </span>
      </label>
    </Popover>
  );
}
