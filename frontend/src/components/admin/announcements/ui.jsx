/**
 * Duyurular admin UI primitives: opaque glass dialog (portal, focus trap, Esc,
 * focus returns to the opener), right drawer, anchored opaque menu and popover
 * (outside click / Esc / arrow keys), switch, segmented control, chip, icon.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnnGlyph } from "../../announcements/AnnGlyph.jsx";

export const Ic = AnnGlyph;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useTrap(open, ref, onClose, busyRef) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      if (!ref.current) return;
      // Only the top-most layer handles keys.
      const layers = [...document.querySelectorAll("[data-an-layer]")];
      if (layers.length && layers[layers.length - 1] !== ref.current) return;
      if (e.key === "Escape") {
        // An open menu closes first (its own handler).
        if (e.defaultPrevented || busyRef?.current || document.querySelector(".an-menu")) return;
        e.stopPropagation();
        closeRef.current?.();
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
        if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
      } catch {
        /* opener gone */
      }
    };
  }, [open, ref, busyRef]);
}

/** Centered dialog. `bare` renders children without the standard header (composer, gallery). */
export function Dialog({ open, onClose, busy = false, icon, tone = "blue", title, subtitle, width = 520, children, testId, bare = false, className = "", labelledBy }) {
  const titleId = useId();
  const ref = useRef(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useTrap(open, ref, onClose, busyRef);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="an-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={ref}
        data-an-layer=""
        className={`an-dlg ${className}`.trim()}
        style={{ "--an-dlg-w": `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={bare ? labelledBy : titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        {bare ? (
          children
        ) : (
          <>
            <header className="an-dh">
              {icon ? (
                <span className={`an-dh-ic is-${tone}`} aria-hidden="true">
                  <Ic name={icon} size={20} />
                </span>
              ) : null}
              <div className="an-dh-txt">
                <h2 id={titleId}>{title}</h2>
                {subtitle ? <p>{subtitle}</p> : null}
              </div>
            </header>
            {children}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Right side panel (inspector on the board, history). */
export function Drawer({ open, onClose, labelledBy, children, testId, width = 420 }) {
  const ref = useRef(null);
  useTrap(open, ref, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="an-scrim is-drawer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <aside ref={ref} data-an-layer="" className="an-drawer" style={{ "--an-drawer-w": `${width}px` }} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} data-testid={testId}>
        {children}
      </aside>
    </div>,
    document.body
  );
}

function usePlace(open, ref, anchorRef, align, deps = []) {
  const [pos, setPos] = useState({ top: 0, left: 0, visible: false, above: false });
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const el = ref.current;
      const r = anchorRef?.current?.getBoundingClientRect?.();
      if (!el || !r) return;
      const pad = 8;
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      let top = r.bottom + 6;
      let above = false;
      if (top + h > window.innerHeight - pad) {
        top = Math.max(pad, r.top - h - 6);
        above = true;
      }
      const want = align === "left" ? r.left : align === "center" ? r.left + r.width / 2 - w / 2 : r.right - w;
      const left = Math.max(pad, Math.min(want, window.innerWidth - w - pad));
      setPos({ top, left, visible: true, above });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorRef, align, ...deps]);
  return pos;
}

/**
 * Anchored opaque menu. items: {id, label, sub?, icon?, danger?, disabled?, onSelect} | "sep"
 */
export function Menu({ open, anchorRef, onClose, items, label, width = 290, align = "right", testId }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pos = usePlace(open, ref, anchorRef, align, [items?.length]);

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
      if (e.key === "Tab" && ref.current?.contains(document.activeElement)) {
        closeRef.current?.();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list = [...(ref.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
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
    const raf = window.requestAnimationFrame?.(() => ref.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      if (raf) window.cancelAnimationFrame?.(raf);
    };
  }, [open, anchorRef]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="an-menu" role="menu" aria-label={label} data-testid={testId} style={{ top: pos.top, left: pos.left, width, visibility: pos.visible ? "visible" : "hidden" }}>
      {(items || []).map((it, i) =>
        it === "sep" ? (
          <div key={`sep-${i}`} className="an-menu-sep" role="separator" />
        ) : (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            className={`an-mi${it.danger ? " is-danger" : ""}${it.active ? " is-active" : ""}`}
            disabled={it.disabled}
            data-testid={testId ? `${testId}-${it.id}` : undefined}
            onClick={() => {
              closeRef.current?.();
              it.onSelect?.();
            }}
          >
            {it.icon ? <Ic name={it.icon} size={18} /> : null}
            <span className="an-mi-txt">
              {it.label}
              {it.sub ? <small>{it.sub}</small> : null}
            </span>
            {it.trail ? <span className="an-mi-trail">{it.trail}</span> : null}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

/** Anchored opaque popover with a focus trap (board drop confirmations, schedule, extend). */
export function Popover({ open, anchorRef, onClose, children, width = 360, align = "right", testId, labelledBy, busy = false }) {
  const ref = useRef(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pos = usePlace(open, ref, anchorRef, align);
  useTrap(open, ref, onClose, busyRef);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (ref.current?.contains(e.target) || busyRef.current) return;
      if (e.target.closest?.(".an-menu, .an-scrim")) return;
      closeRef.current?.();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      data-an-layer=""
      className={`an-pop${pos.above ? " is-above" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      data-testid={testId}
      style={{ top: pos.top, left: pos.left, width, visibility: pos.visible ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body
  );
}

export function Switch({ checked, onChange, label, disabled, hint, testId }) {
  const id = useId();
  return (
    <div className={`an-tg${disabled ? " is-disabled" : ""}`}>
      <button type="button" role="switch" aria-checked={Boolean(checked)} aria-labelledby={id} disabled={disabled} className={`an-sw${checked ? " is-on" : ""}`} onClick={() => onChange(!checked)} data-testid={testId} />
      <span id={id} className="an-tg-l" onClick={() => !disabled && onChange(!checked)}>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
    </div>
  );
}

export function Seg({ items, value, onChange, label, className = "", testId }) {
  return (
    <div className={`an-seg ${className}`.trim()} role="radiogroup" aria-label={label} data-testid={testId}>
      {items.map((it) => (
        <button key={it.id} type="button" role="radio" aria-checked={value === it.id} className={value === it.id ? "is-on" : ""} onClick={() => onChange(it.id)}>
          {it.icon ? <Ic name={it.icon} size={15} /> : null}
          {it.label}
          {it.count != null ? <em>{it.count}</em> : null}
        </button>
      ))}
    </div>
  );
}

export function Chip({ tone = "gray", children, title }) {
  return (
    <span className={`an-chip is-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Label({ htmlFor, children, extra }) {
  return (
    <div className="an-lab">
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>}
      {extra != null ? <em>{extra}</em> : null}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", r = 8 }) {
  return <span className="an-skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

/** Reason pills (end, delete): single choice. */
export function Pills({ items, value, onChange, label }) {
  return (
    <div className="an-pills" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" role="radio" aria-checked={value === it.id} className={value === it.id ? "is-on" : ""} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
