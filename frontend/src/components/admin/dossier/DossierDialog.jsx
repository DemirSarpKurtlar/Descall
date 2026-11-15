/**
 * Kullanıcı dosyası dialogs: one opaque glass shell (portal on body, above the
 * admin shell, below the step-up code prompt like BanDialog). Esc and a click
 * on the scrim close it (not while busy); Tab stays inside; focus returns to
 * the button that opened it.
 */
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import "../../../styles/admin-dossier.css";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {boolean} [props.busy]
 * @param {import("react").ComponentType<{size?: number}>} [props.icon]
 * @param {"amber"|"red"|"violet"|"blue"|"gray"|"green"} [props.tone]
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {import("react").ReactNode} [props.aside] right column (the "what the user sees" preview)
 * @param {string} [props.asideLabel]
 * @param {number} [props.width] px, default 620
 * @param {import("react").ReactNode} props.children
 */
export default function DossierDialog({ open, onClose, busy = false, icon: Icon, tone = "blue", title, subtitle, aside, asideLabel, width = 620, children, testId }) {
  const titleId = useId();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      if (e.key === "Escape") {
        // An open dropdown inside the dialog handles its own Esc first.
        if (e.defaultPrevented) return;
        e.stopPropagation();
        if (!busyRef.current) closeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
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
        /* the opener is gone */
      }
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="dsr-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={ref}
        className={`dsr-dlg${aside ? " has-aside" : ""}`}
        style={{ "--dsr-dlg-w": `${aside ? width + 320 : width}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <div className="dsr-dlg-main">
          <header className="dsr-dlg-head">
            {Icon ? (
              <span className={`dsr-dlg-ic is-${tone}`} aria-hidden="true">
                <Icon size={20} />
              </span>
            ) : null}
            <div>
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </header>
          {children}
        </div>
        {aside ? (
          <aside className="dsr-dlg-aside" aria-label={asideLabel}>
            {asideLabel ? <div className="dsr-lab">{asideLabel}</div> : null}
            {aside}
          </aside>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/** Label + control block used inside dialogs. */
export function Field({ label, id, children, hint }) {
  return (
    <div className="dsr-field">
      {label ? (
        <label className="dsr-lab" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <p className="dsr-hint">{hint}</p> : null}
    </div>
  );
}

/** Pill group (aria-pressed buttons). */
export function Pills({ items, value, onChange, tone = "amber", label, small = false }) {
  return (
    <div className={`dsr-pills is-${tone}${small ? " is-small" : ""}`} role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" className={value === it.id ? "is-on" : ""} aria-pressed={value === it.id} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Footer: cancel + primary. */
export function DialogActions({ onCancel, cancelLabel, busy, disabled, onSubmit, submitLabel, icon: Icon, tone = "primary" }) {
  return (
    <div className="dsr-dlg-acts">
      <button type="button" className="dsr-btn" onClick={onCancel} disabled={busy}>
        {cancelLabel}
      </button>
      <button type="button" className={`dsr-btn is-${tone}`} onClick={onSubmit} disabled={disabled || busy}>
        {Icon ? <Icon size={16} /> : null}
        {submitLabel}
      </button>
    </div>
  );
}

export function DialogError({ text }) {
  if (!text) return null;
  return (
    <p className="dsr-err" role="alert">
      {text}
    </p>
  );
}
