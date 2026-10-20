import { Wrench, RefreshCw, Bell, BellRing, Megaphone, X, CheckCircle } from "../ui/Icon.jsx";
import {
  countdownParts,
  formatTrtTime,
  formatTrtLongDate,
  isSameTrtDay,
  progress,
} from "../../lib/maintenance";

const pad = (n) => String(n).padStart(2, "0");

export function appIconSrc() {
  const base = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
  return `${base}brand/descall-appicon-rounded.svg`;
}

/** Full-screen card shown while maintenance is active (mockup 3-kullanici-bakim-ekrani-*). */
export function MaintenanceScreen({ m, now, t, locale, onRetry, retrying, notifyArmed, onNotify, titlebar = false }) {
  const cd = countdownParts(m.endsAt, now);
  const hours = cd.days * 24 + cd.hours;
  const pct = Math.round(progress(m.startsAt, m.endsAt, now) * 100);
  const urgent = m.kind === "emergency";
  return (
    <div className={`mt-screen${titlebar ? " has-titlebar" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="mt-screen-title">
      <div className="mt-mc mt-glass">
        <img className="lg" src={appIconSrc()} alt="" width={76} height={76} />
        <div style={{ marginTop: 16 }}>
          <span className={`mt-pill${urgent ? " urg" : ""}`}>
            <Wrench size={13} strokeWidth={2} />
            {urgent ? t("maint.emergency") : t("maint.planned")}
          </span>
        </div>
        <h1 id="mt-screen-title">{t("maint.screenTitle")}</h1>
        <p>{m.message}</p>
        <div className="mt-cd" aria-live="off">
          <div><b>{pad(hours)}</b><small>{t("maint.hours")}</small></div>
          <div><b>{pad(cd.minutes)}</b><small>{t("maint.minutes")}</small></div>
          <div><b>{pad(cd.seconds)}</b><small>{t("maint.seconds")}</small></div>
        </div>
        <div className="mt-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-muted mt-endline">
          {t("maint.estimatedEndLabel")} <b>{formatTrtTime(m.endsAt)} TRT</b> · {formatTrtLongDate(m.endsAt, locale)}
        </div>
        <div className="mt-acts">
          <button type="button" className="mt-btn" onClick={onRetry} disabled={retrying}>
            <RefreshCw size={15} strokeWidth={2} className={retrying ? "mt-spin" : ""} /> {t("maint.retry")}
          </button>
          <button type="button" className="mt-btn primary" onClick={onNotify} aria-pressed={notifyArmed}>
            {notifyArmed ? <BellRing size={15} strokeWidth={2} /> : <Bell size={15} strokeWidth={2} />}
            {notifyArmed ? t("maint.notifyOn") : t("maint.notifyMe")}
          </button>
        </div>
      </div>
    </div>
  );
}

function bannerCountdown(target, now, t) {
  const cd = countdownParts(target, now);
  const h = cd.days * 24 + cd.hours;
  const v = h > 0 ? t("maint.bannerInHour", { h, m: cd.minutes }) : t("maint.bannerInMin", { m: cd.minutes, s: cd.seconds });
  return t("maint.bannerIn", { value: v });
}

/** Glass pre-announcement banner (mockup 3-on-duyuru-bandi-*). */
export function MaintenanceBanner({ m, now, t, locale, onDetails, onDismiss }) {
  const urgent = m.kind === "emergency";
  const from = formatTrtTime(m.startsAt);
  const to = formatTrtTime(m.endsAt);
  const sub = isSameTrtDay(m.startsAt, now)
    ? t("maint.bannerToday", { from, to })
    : t("maint.bannerDate", { date: formatTrtLongDate(m.startsAt, locale), from, to });
  return (
    <div className={`mt-banner mt-glass${urgent ? " is-emergency" : ""}`} role="status">
      <div className="mt-banner-ico"><Megaphone size={18} strokeWidth={2} /></div>
      <div className="mt-banner-copy">
        <div className="mt-banner-title">
          {urgent ? t("maint.bannerTitleEmergency") : t("maint.bannerTitle")} <span className="sep">· </span>
          <span className="cd">{bannerCountdown(m.startsAt, now, t)}</span>
        </div>
        <div className="mt-banner-sub">{sub}</div>
        <div className="mt-banner-acts">
          <button type="button" className="mt-btn" onClick={onDetails}>{t("maint.details")}</button>
          <button type="button" className="mt-btn ghost" onClick={onDismiss}>{t("maint.gotIt")}</button>
        </div>
      </div>
      <button type="button" className="mt-btn desk" onClick={onDetails}>{t("maint.details")}</button>
      <button type="button" className="mt-btn ghost x desk" onClick={onDismiss} aria-label={t("maint.close")}><X size={15} strokeWidth={2} /></button>
      <button type="button" className="x-m" onClick={onDismiss} aria-label={t("maint.close")}><X size={16} strokeWidth={2} /></button>
    </div>
  );
}

export function MaintenanceEndedToast({ t, onClose }) {
  return (
    <div className="mt-banner mt-glass" role="status" style={{ background: "linear-gradient(165deg,rgba(30,64,42,.95),rgba(22,32,26,.97))", borderColor: "rgba(48,209,88,.4)" }}>
      <div className="mt-banner-ico" style={{ background: "rgba(48,209,88,.2)", color: "#6fe28d", borderColor: "rgba(48,209,88,.4)" }}>
        <CheckCircle size={18} strokeWidth={2} />
      </div>
      <div className="mt-banner-copy"><div className="mt-banner-title">{t("maint.endedToast")}</div></div>
      <button type="button" className="mt-btn ghost x" style={{ display: "inline-flex" }} onClick={onClose} aria-label={t("maint.close")}><X size={15} strokeWidth={2} /></button>
    </div>
  );
}

/** Details sheet from the banner: same card as the full screen, countdown to the start. */
export function MaintenanceDetails({ m, now, t, locale, onClose }) {
  const cd = countdownParts(m.startsAt, now);
  return (
    <div className="mt-modal-scrim" onClick={onClose}>
      <div className="mt-mc mt-glass" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <img className="lg" src={appIconSrc()} alt="" width={76} height={76} />
        <div style={{ marginTop: 16 }}>
          <span className={`mt-pill${m.kind === "emergency" ? " urg" : ""}`}><Wrench size={13} />{m.kind === "emergency" ? t("maint.emergency") : t("maint.planned")}</span>
        </div>
        <h1>{m.title}</h1>
        <p>{m.message}</p>
        <div className="mt-cd">
          <div><b>{pad(cd.days * 24 + cd.hours)}</b><small>{t("maint.hours")}</small></div>
          <div><b>{pad(cd.minutes)}</b><small>{t("maint.minutes")}</small></div>
          <div><b>{pad(cd.seconds)}</b><small>{t("maint.seconds")}</small></div>
        </div>
        <div className="mt-muted mt-endline">
          {formatTrtLongDate(m.startsAt, locale)} · <b>{formatTrtTime(m.startsAt)}–{formatTrtTime(m.endsAt)} TRT</b>
        </div>
        <div className="mt-acts"><button type="button" className="mt-btn primary" onClick={onClose}>{t("maint.gotIt")}</button></div>
      </div>
    </div>
  );
}
