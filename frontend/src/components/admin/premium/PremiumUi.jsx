/**
 * Shared pieces of the Premium Yönetimi pages. They reuse the admin growth
 * cards (agr-*, admin-growth.css) and the maintenance form controls (mt-*,
 * maintenance.css); premium-admin.css only adds what those do not have.
 */
import { useEffect } from "react";
import { AlertTriangle, Calendar, RefreshCw, X } from "../../ui/Icon.jsx";
import OverlayPortal from "../../ui/OverlayPortal.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { formatDate, formatNumber } from "../../../i18n/format.js";
import { DURATION_PRESETS, dateToLocalInput, localInputToDate } from "./premiumModel.js";

export function PageHead({ title, sub, children }) {
  return (
    <header className="agr-head pa-head">
      <div>
        <h2>{title}</h2>
        {sub ? <p className="muted">{sub}</p> : null}
      </div>
      {children ? <div className="agr-actions">{children}</div> : null}
    </header>
  );
}

export function RefreshButton({ onClick, busy, t }) {
  return (
    <button type="button" className="agr-icon" onClick={onClick} disabled={busy} aria-label={t("premiumAdmin.refresh")}>
      <RefreshCw size={16} className={busy ? "spin" : ""} />
    </button>
  );
}

/** A number, or the right empty word: null = "Veri yok", na = "Hesaplanamıyor". */
export function num(value, locale, t, { na = false, digits = 0 } = {}) {
  if (value == null || Number.isNaN(Number(value))) return na ? t("premiumAdmin.cannotCompute") : t("premiumAdmin.noData");
  return formatNumber(Number(value), locale, { maximumFractionDigits: digits });
}

export function Kpi({ label, value, hint, tone = "", note = null }) {
  return (
    <div className={`agr-kpi pa-kpi${tone ? ` is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong className="tnum">{value}</strong>
      {hint ? <em>{hint}</em> : null}
      {note ? <small className="pa-kpi-note">{note}</small> : null}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="pa-empty">{children}</div>;
}

export function ErrorLine({ error, t, onRetry }) {
  if (!error) return null;
  return (
    <p className="admin-inline-error pa-err" role="alert">
      <AlertTriangle size={14} aria-hidden="true" /> <span>{errorText(error, t)}</span>
      {onRetry ? <button type="button" className="mt-btn sm ghost" onClick={onRetry}>{t("premiumAdmin.retry")}</button> : null}
    </p>
  );
}

function errKey(code, t) {
  if (!code || !/^[a-zA-Z_]+$/.test(String(code))) return null;
  const key = `premiumAdmin.err.${code}`;
  const s = t(key);
  return s !== key ? s : null;
}

/**
 * Model error keys and server error codes (premiumAdmin.err.<code>: already_active, not_active,
 * invalid_plan, ... as lib/premium/service.js answers them), else a status-based message.
 */
export function errorText(error, t) {
  if (!error) return "";
  if (typeof error === "string") return errKey(error, t) || t("premiumAdmin.err.generic");
  if (error.code === "STEP_UP_REQUIRED") return t("premiumAdmin.err.stepUp");
  const known = errKey(error.code, t);
  if (known) return known;
  if (error.code === "ADMIN_PERMISSION_DENIED" || error.status === 403) return t("premiumAdmin.err.forbidden");
  if (error.status === 429) return t("premiumAdmin.err.rateLimited");
  if (error.status === 404) return t("premiumAdmin.err.notReady");
  if (error.code === "transient" && error.message) return error.message;
  return t("premiumAdmin.err.generic");
}

export function PlanChip({ plan, t }) {
  if (!plan) return <span className="pa-chip is-none">{t("premiumAdmin.plan.none")}</span>;
  return <span className={`pa-chip is-${plan}`}>{t(`premiumAdmin.plan.${plan}`)}</span>;
}

export function StateChip({ state, t }) {
  return <span className={`pa-state is-${state || "none"}`}>{t(`premiumAdmin.state.${state || "none"}`)}</span>;
}

/** UTC timestamp shown in the viewer's local time. */
export function When({ value, locale, time = true, empty = "–" }) {
  if (!value) return <span className="mt-muted">{empty}</span>;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <span className="mt-muted">{empty}</span>;
  return (
    <time className="tnum" dateTime={d.toISOString()} title={d.toISOString()}>
      {formatDate(d, locale, time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" })}
    </time>
  );
}

export function EndCell({ sub, locale, t }) {
  if (!sub || !sub.plan_id) return <span className="mt-muted">–</span>;
  if (sub.unlimited) return <span className="pa-unl">{t("premiumAdmin.unlimited")}</span>;
  return <When value={sub.ends_at} locale={locale} />;
}

export function Seg({ label, value, options, onChange, className = "" }) {
  return (
    <div className={`mt-seg pa-seg ${className}`} role="radiogroup" aria-label={label}>
      {options.map(([id, text, disabled]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? "on" : ""} disabled={disabled} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled = false }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`mt-tg${on ? " on" : ""}`} onClick={() => onChange(!on)} />;
}

export function ToggleRow({ icon: Icon, label, hint, on, onChange, disabled }) {
  return (
    <div className="mt-row pa-row">
      {Icon ? <Icon size={16} className="mt-i" /> : null}
      <div className="mt-row-copy"><b>{label}</b>{hint ? <div className="mt-muted">{hint}</div> : null}</div>
      <Toggle on={on} label={label} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Field({ label, children, hint, className = "" }) {
  return (
    <label className={`mt-f pa-f ${className}`}>
      <span>{label}</span>
      {children}
      {hint ? <span className="pc-hint">{hint}</span> : null}
    </label>
  );
}

function openPicker(e) {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    /* not allowed here */
  }
}

/**
 * Local date (+ time) field: the text is formatted in the UI language, the
 * native picker sits on top of it (same pattern as the promo / maintenance
 * forms). Empty = `empty` text; the clear button empties it again.
 */
export function DateInput({ value, onChange, label, time = false, timeValue, onTime, empty }) {
  const { t, locale } = useLocale();
  const d = value ? localInputToDate(value, "12:00") : null;
  const text = d ? formatDate(d, locale, { dateStyle: "medium" }) : empty || t("premiumAdmin.pickDate");
  return (
    <div className={`mt-in pa-date${value ? "" : " is-empty"}`}>
      <Calendar size={14} className="mt-i" />
      <span className="seg-part is-date">
        <span className="seg-text">{text}</span>
        <input type="date" aria-label={label} value={value || ""} onChange={(e) => onChange(e.target.value)} onClick={openPicker} />
      </span>
      {time && value ? (
        <>
          <span className="mt-muted" aria-hidden="true">·</span>
          <span className="seg-part is-time">
            <span className="seg-text tnum">{timeValue || "00:00"}</span>
            <input type="time" aria-label={`${label} ${t("premiumAdmin.time")}`} value={timeValue || ""} onChange={(e) => onTime(e.target.value)} onClick={openPicker} />
          </span>
        </>
      ) : null}
      {value ? (
        <button type="button" className="pa-clear" aria-label={t("premiumAdmin.clearDate")} onClick={() => onChange("")}><X size={13} /></button>
      ) : null}
    </div>
  );
}

/**
 * Duration control: presets (1, 7, 30, 90, 180, 365 days), custom days, an
 * exact end date, or Sınırsız. value = { mode, days, endDate, endTime }.
 */
export function DurationField({ value, onChange, t, allowUnlimited = true, allowDate = true }) {
  const v = value || { mode: "preset", days: 30 };
  const set = (patch) => onChange({ ...v, ...patch });
  const modes = [["preset", t("premiumAdmin.dur.preset")], ["custom", t("premiumAdmin.dur.custom")]];
  if (allowDate) modes.push(["date", t("premiumAdmin.dur.date")]);
  if (allowUnlimited) modes.push(["unlimited", t("premiumAdmin.unlimited")]);
  return (
    <div className="mt-f pa-f pa-dur">
      <span>{t("premiumAdmin.dur.label")}</span>
      <Seg label={t("premiumAdmin.dur.label")} value={v.mode} options={modes} onChange={(mode) => {
        if (mode === "date" && !v.endDate) {
          const d = dateToLocalInput(Date.now() + 30 * 864e5);
          set({ mode, endDate: d.date, endTime: "23:59" });
        } else set({ mode });
      }} />
      {v.mode === "preset" ? (
        <div className="pa-presets" role="group" aria-label={t("premiumAdmin.dur.preset")}>
          {DURATION_PRESETS.map((n) => (
            <button key={n} type="button" aria-pressed={Number(v.days) === n} className={Number(v.days) === n ? "on" : ""} onClick={() => set({ days: n })}>
              {t("premiumAdmin.dur.days", { n })}
            </button>
          ))}
        </div>
      ) : null}
      {v.mode === "custom" ? (
        <div className="mt-in pa-days">
          <input className="tnum" type="number" inputMode="numeric" min={1} max={3650} value={v.days ?? ""} aria-label={t("premiumAdmin.dur.customLabel")}
            onChange={(e) => set({ days: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          <span className="mt-muted">{t("premiumAdmin.dur.daysUnit")}</span>
        </div>
      ) : null}
      {v.mode === "date" ? (
        <DateInput label={t("premiumAdmin.dur.date")} value={v.endDate} onChange={(endDate) => set({ endDate })} time timeValue={v.endTime || "23:59"} onTime={(endTime) => set({ endTime })} />
      ) : null}
      {v.mode === "unlimited" ? <span className="pc-hint">{t("premiumAdmin.dur.unlimitedHint")}</span> : null}
    </div>
  );
}

export function Modal({ onClose, children, wide = false, label }) {
  useEffect(() => {
    const on = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [onClose]);
  return (
    <OverlayPortal>
      <div className="mt-modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className={`mt-modal mt-glass pa-modal${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" className="pa-modal-x" onClick={onClose} aria-label={label}><X size={16} /></button>
          {children}
        </div>
      </div>
    </OverlayPortal>
  );
}

function stateLine(s, locale, t) {
  if (!s.plan || s.state === "none") return t("premiumAdmin.plan.none");
  const end = s.unlimited ? t("premiumAdmin.unlimited") : s.endsAt ? formatDate(new Date(s.endsAt), locale, { dateStyle: "medium", timeStyle: "short" }) : "–";
  return { plan: t(`premiumAdmin.plan.${s.plan}`), state: t(`premiumAdmin.state.${s.state}`), end, free: s.isFree == null ? "–" : s.isFree ? t("premiumAdmin.yes") : t("premiumAdmin.no") };
}

/** Before / after table for the confirmation dialog. */
export function ChangeSummary({ before, after, locale, t }) {
  const b = stateLine(before, locale, t);
  const a = stateLine(after, locale, t);
  const row = (k, label) => {
    const bv = typeof b === "string" ? (k === "plan" ? b : "–") : b[k];
    const av = typeof a === "string" ? (k === "plan" ? a : "–") : a[k];
    return (
      <tr key={k} className={bv !== av ? "is-changed" : ""}>
        <th scope="row">{label}</th>
        <td>{bv}</td>
        <td>{av}</td>
      </tr>
    );
  };
  return (
    <table className="pa-diff">
      <thead><tr><th /><th>{t("premiumAdmin.before")}</th><th>{t("premiumAdmin.after")}</th></tr></thead>
      <tbody>
        {row("plan", t("premiumAdmin.f.plan"))}
        {row("state", t("premiumAdmin.f.status"))}
        {row("end", t("premiumAdmin.f.end"))}
        {row("free", t("premiumAdmin.f.free"))}
      </tbody>
    </table>
  );
}

/** Small "load more" footer for cursor-paged lists. */
export function MoreButton({ cursor, busy, onMore, t }) {
  if (!cursor) return null;
  return (
    <div className="pa-more">
      <button type="button" className="mt-btn sm" disabled={busy} onClick={onMore}>{busy ? t("premiumAdmin.loading") : t("premiumAdmin.loadMore")}</button>
    </div>
  );
}
