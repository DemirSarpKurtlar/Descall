/**
 * Admin Token building blocks: opaque dialog and right drawer (bottom sheets on a phone),
 * the 6-digit code field, sparkline, token icon, status pill, switch, skeleton, toast.
 * Focus trap, inert page behind and focus return come from hooks/useModalFocus; Esc closes
 * only the top-most sheet and never while it is busy or locked (the one-time reveal).
 */
import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../../context/LocaleContext";
import { displayName, formatDate, formatNumber } from "../../../i18n/format.js";
import { Check, Undo2, X } from "../../ui/Icon.jsx";
import useModalFocus from "../../../hooks/useModalFocus.js";
import { OTP_LENGTH, cleanOtp, colorOf, initials, sparkPaths, statusKey } from "./tokenModel.js";

/** useModalFocus (Tab trap, inert background, focus back to the opener) + Esc for the top sheet. */
function useSheet(open, ref, onClose, blocked) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  useModalFocus(open, ref, { initialFocus: () => ref.current?.querySelector("[data-autofocus]") || null });
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || !ref.current) return;
      const all = document.querySelectorAll("[data-atk-modal]");
      if (all[all.length - 1] !== ref.current) return;
      // Another layer on top (the 2FA prompt) owns the key.
      if (document.activeElement && document.activeElement !== document.body && !ref.current.contains(document.activeElement)) return;
      e.stopPropagation();
      if (!blockedRef.current) closeRef.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, ref]);
}

/** Locale formatters shared by the page: numbers, percents, dates, times, countries, labels. */
export function useFmt() {
  const { t, locale } = useLocale();
  const label = useCallback((l) => (l ? t(l.key, l.vars) : ""), [t]);
  return useMemo(
    () => ({
      t,
      locale,
      label,
      n: (v) => formatNumber(v, locale),
      pct: (v) => t("atok.pct", { n: formatNumber(v, locale, { maximumFractionDigits: 1 }) }),
      day: (iso) => formatDate(iso, locale, { day: "numeric", month: "short", year: "numeric" }),
      time: (iso) => formatDate(iso, locale, { hour: "2-digit", minute: "2-digit" }),
      clock: (iso) => formatDate(iso, locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      dt: (iso) => formatDate(iso, locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      country: (code) => (code ? displayName(String(code).toUpperCase(), locale) : ""),
    }),
    [t, locale, label]
  );
}

/** Centered dialog; `locked` keeps it open on Esc / scrim (the one-time reveal). */
export function Dialog({ open, onClose, busy = false, locked = false, icon: Icon, tone = "blue", title, subtitle, width = 560, footer, children, testId }) {
  const { t } = useLocale();
  const titleId = useId();
  const ref = useRef(null);
  const blocked = busy || locked;
  useSheet(open, ref, onClose, blocked);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="atk-scrim" onMouseDown={(e) => e.target === e.currentTarget && !blocked && onClose?.()}>
      <div ref={ref} data-atk-modal="" className="atk-dlg" style={{ "--atk-dlg-w": `${width}px` }} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
        <span className="atk-handle" aria-hidden="true" />
        <header className="atk-mh">
          {Icon ? (
            <span className={`atk-mi is-${tone}`} aria-hidden="true">
              <Icon size={17} />
            </span>
          ) : null}
          <div className="atk-mh-t">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {!locked ? (
            <button type="button" className="atk-x" onClick={onClose} disabled={busy} aria-label={t("atok.close")}>
              <X size={16} />
            </button>
          ) : null}
        </header>
        <div className="atk-mb">{children}</div>
        {footer ? <footer className="atk-mf">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}

/** Right drawer (600 px), a bottom sheet under 760 px. */
export function Drawer({ open, onClose, busy = false, locked = false, icon: Icon, title, subtitle, children, testId }) {
  const { t } = useLocale();
  const titleId = useId();
  const ref = useRef(null);
  const blocked = busy || locked;
  useSheet(open, ref, onClose, blocked);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="atk-scrim is-drawer" onMouseDown={(e) => e.target === e.currentTarget && !blocked && onClose?.()}>
      <div ref={ref} data-atk-modal="" className="atk-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
        <span className="atk-handle" aria-hidden="true" />
        <header className="atk-dw-h">
          {Icon ? (
            <span className="atk-tki is-lg is-brand" aria-hidden="true">
              <Icon size={20} />
            </span>
          ) : null}
          <div className="atk-dw-t">
            <b id={titleId}>{title}</b>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          {!locked ? (
            <button type="button" className="atk-x" onClick={onClose} disabled={busy} aria-label={t("atok.close")}>
              <X size={16} />
            </button>
          ) : null}
        </header>
        <div className="atk-dw-b">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** Six boxes (3 + 3), paste fills all, Backspace walks back. */
export function Otp({ value, onChange, invalid = false, autoFocus = false, testId = "atk-otp" }) {
  const { t } = useLocale();
  const refs = useRef([]);
  const v = cleanOtp(value);
  const focusAt = (i) => refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))]?.focus();
  return (
    <div className={`atk-otp${invalid ? " is-bad" : ""}`} role="group" aria-label={t("atok.otp.label")} data-testid={testId}>
      {Array.from({ length: OTP_LENGTH }, (_, i) => (
        <span key={i} className="atk-otp-cell">
          {i === 3 ? <span className="atk-otp-gap" aria-hidden="true" /> : null}
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={v[i] || ""}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={OTP_LENGTH}
            aria-label={t("atok.otp.digit", { n: i + 1 })}
            data-autofocus={autoFocus && i === 0 ? "" : undefined}
            className={v[i] ? "is-filled" : ""}
            onChange={(e) => {
              const raw = cleanOtp(e.target.value);
              if (raw.length > 1) {
                const next = cleanOtp(v.slice(0, i) + raw);
                onChange(next);
                focusAt(next.length);
                return;
              }
              const arr = v.split("");
              arr[i] = raw;
              const next = cleanOtp(arr.join(""));
              onChange(next);
              if (raw) focusAt(i + 1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !v[i] && i > 0) {
                e.preventDefault();
                onChange(v.slice(0, i - 1));
                focusAt(i - 1);
              } else if (e.key === "ArrowLeft") focusAt(i - 1);
              else if (e.key === "ArrowRight") focusAt(i + 1);
            }}
          />
        </span>
      ))}
    </div>
  );
}

export function Spark({ values, color, w = 100, h = 30, fill = true, className = "atk-spark" }) {
  const gid = useId().replace(/:/g, "");
  const { line, area } = sparkPaths(values, w, h);
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {line && fill ? (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.35" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      ) : null}
      {line ? <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /> : null}
    </svg>
  );
}

export function TokenIcon({ token, size = "md" }) {
  const color = colorOf(token);
  return (
    <span className={`atk-tki is-${size}`} style={{ "--c": color }} aria-hidden="true">
      {initials(token?.name)}
    </span>
  );
}

export function Pill({ status, small = false }) {
  const { t } = useLocale();
  return <span className={`atk-pill st-${status}${small ? " is-sm" : ""}`}>{t(statusKey(status))}</span>;
}

export function Toggle({ checked, onChange, label, disabled = false, testId }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      className={`atk-tgl${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Skel({ w = "100%", h = 12, r = 6, style }) {
  return <span className="atk-skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function LiveBadge({ children, muted = false }) {
  return <span className={`atk-live${muted ? " is-muted" : ""}`}>{children}</span>;
}

export function Toast({ toast, onUndo, onClose }) {
  const { t } = useLocale();
  if (!toast || typeof document === "undefined") return null;
  return createPortal(
    <div className={`atk-toast${toast.tone === "err" ? " is-err" : ""}`} role="status" aria-live="polite" data-testid="atk-toast">
      {toast.tone === "err" ? null : <Check size={15} className="atk-toast-ic" aria-hidden="true" />}
      <span>{toast.text}</span>
      {toast.undo ? (
        <button
          type="button"
          className="atk-btn is-sm"
          onClick={() => {
            onClose();
            onUndo(toast.undo);
          }}
        >
          <Undo2 size={13} />
          {t("atok.undo")}
        </button>
      ) : null}
    </div>,
    document.body
  );
}
