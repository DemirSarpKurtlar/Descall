/**
 * Canlı popup UI primitives: opaque glass dialog (portal, focus trap, Esc,
 * focus returns to the opener), the right drawer, an anchored opaque menu
 * (outside click / Esc / arrows), switch, segmented control, chips.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useTrap(open, ref, onClose, busyRef, suspendedRef) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      // A dialog opened on top of this one owns the keyboard.
      if (suspendedRef?.current) return;
      if (e.key === "Escape") {
        // A menu or editor open inside handles its own Esc (busy), so let the event reach it.
        if (e.defaultPrevented || busyRef?.current) return;
        e.stopPropagation();
        closeRef.current?.();
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
        if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
      } catch {
        /* opener gone */
      }
    };
  }, [open, ref, busyRef, suspendedRef]);
}

/**
 * @param {{open: boolean, onClose: () => void, busy?: boolean, icon?: any, tone?: string, title: string, subtitle?: any, width?: number, children: any, testId?: string}} props
 */
export function Dialog({ open, onClose, busy = false, icon: Icon, tone = "blue", title, subtitle, width = 600, children, testId }) {
  const titleId = useId();
  const ref = useRef(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useTrap(open, ref, onClose, busyRef);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="lp-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div ref={ref} className="lp-dlg" style={{ "--lp-dlg-w": `${width}px` }} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
        <header className="lp-dh">
          {Icon ? (
            <span className={`lp-dh-ic is-${tone}`} aria-hidden="true">
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
    </div>,
    document.body
  );
}

/** Right-side drawer (Yeni popup). */
export function Drawer({ open, onClose, busy = false, suspended = false, labelledBy, children, testId }) {
  const ref = useRef(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  useTrap(open, ref, onClose, busyRef, suspendedRef);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="lp-scrim is-drawer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <aside ref={ref} className="lp-drawer" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} data-testid={testId}>
        {children}
      </aside>
    </div>,
    document.body
  );
}

/**
 * Anchored opaque menu.
 * items: {id, label, sub?, icon?, danger?, trail?, checked?, disabled?, onSelect} | "sep"
 */
export function Menu({ open, anchorRef, onClose, items, label, width = 290, align = "right", testId, keepOpen = false, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, visible: false });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const menu = ref.current;
      const r = anchorRef?.current?.getBoundingClientRect?.();
      if (!menu || !r) return;
      const pad = 8;
      const h = menu.offsetHeight;
      const w = menu.offsetWidth;
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - 6);
      const want = align === "left" ? r.left : r.right - w;
      const left = Math.max(pad, Math.min(want, window.innerWidth - w - pad));
      setPos({ top, left, visible: true });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, align, items?.length]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (ref.current?.contains(e.target) || anchorRef?.current?.contains?.(e.target)) return;
      closeRef.current?.();
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current?.();
        anchorRef?.current?.focus?.({ preventScroll: true });
        return;
      }
      if (e.key === "Tab" && ref.current?.contains(document.activeElement) && !ref.current.querySelector("input")) {
        closeRef.current?.();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list = [...(ref.current?.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"]') || [])];
      if (!list.length || !ref.current.contains(document.activeElement)) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement);
      let next = 0;
      if (e.key === "ArrowDown") next = (i + 1) % list.length;
      else if (e.key === "ArrowUp") next = i <= 0 ? list.length - 1 : i - 1;
      else if (e.key === "End") next = list.length - 1;
      list[next]?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    const raf = window.requestAnimationFrame?.(() => ref.current?.querySelector('[role="menuitem"],[role="menuitemcheckbox"],input')?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      if (raf) window.cancelAnimationFrame?.(raf);
    };
  }, [open, anchorRef]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="lp-menu" role="menu" aria-label={label} data-testid={testId} style={{ top: pos.top, left: pos.left, width, visibility: pos.visible ? "visible" : "hidden" }}>
      {children}
      {(items || []).map((it, i) =>
        it === "sep" ? (
          <div key={`sep-${i}`} className="lp-menu-sep" role="separator" />
        ) : (
          <button
            key={it.id}
            type="button"
            role={it.checked != null ? "menuitemcheckbox" : "menuitem"}
            aria-checked={it.checked != null ? Boolean(it.checked) : undefined}
            className={`lp-mi${it.danger ? " is-danger" : ""}${it.checked ? " is-checked" : ""}`}
            disabled={it.disabled}
            data-testid={testId ? `${testId}-${it.id}` : undefined}
            onClick={() => {
              if (!keepOpen && it.checked == null) closeRef.current?.();
              it.onSelect?.();
            }}
          >
            {it.icon ? <it.icon size={17} /> : null}
            <span className="lp-mi-txt">
              {it.label}
              {it.sub ? <small>{it.sub}</small> : null}
            </span>
            {it.checked != null ? <span className={`lp-mi-check${it.checked ? " is-on" : ""}`} aria-hidden="true" /> : null}
            {it.trail ? <span className="lp-mi-trail" aria-hidden="true">{it.trail}</span> : null}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

export function Toggle({ checked, onChange, label, hint, hintTone, disabled }) {
  const labelId = useId();
  return (
    <div className={`lp-tg${disabled ? " is-disabled" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-labelledby={labelId}
        disabled={disabled}
        className={`lp-sw${checked ? " is-on" : ""}`}
        onClick={() => onChange(!checked)}
      />
      <span id={labelId} className="lp-tg-l" onClick={() => !disabled && onChange(!checked)}>
        {label}
      </span>
      {hint ? <small className={hintTone ? `is-${hintTone}` : ""}>{hint}</small> : null}
    </div>
  );
}

export function Seg({ items, value, onChange, label, className = "" }) {
  return (
    <div className={`lp-seg ${className}`} role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="radio"
          aria-checked={value === it.id}
          className={`${value === it.id ? "is-on" : ""}${it.tone ? ` is-${it.tone}` : ""}`}
          onClick={() => onChange(it.id)}
        >
          {it.icon ? <it.icon size={14} /> : null}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ tone = "gray", children, upper = false }) {
  return <span className={`lp-chip is-${tone}${upper ? " is-upper" : ""}`}>{children}</span>;
}

export function NewBadge({ label }) {
  return <span className="lp-newb">{label}</span>;
}

export function FieldLabel({ htmlFor, children, extra }) {
  return (
    <div className="lp-fl">
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>}
      {extra != null ? <em>{extra}</em> : null}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", r = 8 }) {
  return <span className="lp-skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}
