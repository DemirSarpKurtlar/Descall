/**
 * Sistem page building blocks: dialog and drawer shells (focus trap, Esc, focus return,
 * opaque surfaces), popover menu (outside click + Esc), switch, sparkline, skeleton.
 */
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../../context/LocaleContext";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { X } from "../../ui/Icon.jsx";
import { sparkPaths } from "./systemModel.js";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus trap + Esc + focus return for a dialog or drawer element. */
export function useModal(open, ref, onClose, busy) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!open) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      if (!ref.current) return;
      // Only the top-most modal reacts (a confirm dialog over the drawer).
      const all = document.querySelectorAll("[data-asx-modal]");
      if (all.length && all[all.length - 1] !== ref.current) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.stopPropagation();
        if (!busyRef.current) closeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const raf = window.requestAnimationFrame?.(() => {
      const auto = ref.current?.querySelector("[data-autofocus]");
      (auto || ref.current)?.focus?.({ preventScroll: true });
    });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (raf) window.cancelAnimationFrame?.(raf);
      try {
        opener?.focus?.({ preventScroll: true });
      } catch {
        /* gone */
      }
    };
  }, [open, ref]);
}

export function Dialog({ open, onClose, busy = false, icon: Icon, tone = "blue", title, subtitle, aside, asideLabel, width = 600, asideWidth = 340, children, testId, className = "" }) {
  const { t } = useLocale();
  const titleId = useId();
  const ref = useRef(null);
  useModal(open, ref, onClose, busy);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="asx-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div
        ref={ref}
        data-asx-modal=""
        className={`asx-dlg${aside ? " has-aside" : ""} ${className}`}
        style={{ "--asx-dlg-w": `${width}px`, "--asx-aside-w": `${asideWidth}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <div className="asx-dlg-main">
          <header className="asx-dh">
            {Icon ? (
              <span className={`asx-dh-ic is-${tone}`} aria-hidden="true">
                <Icon size={20} />
              </span>
            ) : null}
            <div className="asx-dh-t">
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {!aside ? (
              <button type="button" className="asx-xbtn" onClick={onClose} disabled={busy} aria-label={t("sysx.close")}>
                <X size={16} />
              </button>
            ) : null}
          </header>
          {children}
        </div>
        {aside ? (
          <aside className="asx-dlg-aside" aria-label={asideLabel}>
            {aside}
          </aside>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open, onClose, labelledBy, children, testId, width = 500, busy = false }) {
  const ref = useRef(null);
  useModal(open, ref, onClose, busy);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="asx-scrim is-drawer" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div ref={ref} data-asx-modal="" className="asx-drawer" style={{ "--asx-drawer-w": `${width}px` }} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} data-testid={testId}>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** Small anchored menu / popover: closes on outside click and Esc, returns focus. */
export function Popover({ open, onClose, anchorRef, children, label, align = "end", width = 280, testId }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchorRef?.current?.contains(e.target)) return;
      closeRef.current?.();
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current?.();
      anchorRef?.current?.focus?.();
    };
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    const raf = window.requestAnimationFrame?.(() => {
      const first = ref.current?.querySelector("[data-autofocus]") || ref.current?.querySelector(FOCUSABLE);
      first?.focus?.({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      if (raf) window.cancelAnimationFrame?.(raf);
    };
  }, [open, anchorRef]);
  if (!open) return null;
  return (
    <div ref={ref} className={`asx-pop is-${align}`} style={{ width }} role="dialog" aria-label={label} data-testid={testId}>
      {children}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, tone = "blue", size = "md", testId }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      className={`asx-sw is-${tone}${size === "sm" ? " is-sm" : ""}${checked ? " is-on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <span />
    </button>
  );
}

export function Spark({ values, color, w = 160, h = 30, fill = true }) {
  const { line, area } = sparkPaths(values, w, h);
  if (!line) return <svg className="asx-sp" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" />;
  return (
    <svg className="asx-sp" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {fill ? <path d={area} fill={color} fillOpacity="0.14" /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Skel({ w = "100%", h = 12, r = 6 }) {
  return <span className="asx-skel" style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

export function Check({ checked, onChange, children, disabled, testId }) {
  return (
    <label className={`asx-chk${disabled ? " is-disabled" : ""}`} data-testid={testId}>
      <GlassCheckbox checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Avatar({ name, color, size = 20 }) {
  const letter = String(name || "?").replace(/^@/, "").charAt(0).toLocaleUpperCase("tr-TR") || "?";
  return (
    <i className="asx-av" style={{ background: color, width: size, height: size }} aria-hidden="true">
      {letter}
    </i>
  );
}
