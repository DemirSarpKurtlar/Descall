/**
 * İşlem kaydı building blocks: the dialog shell (portal, focus trap, Esc,
 * focus back to the opener), the menu (anchored to a button or to the pointer
 * for the right-click menu; arrows, Esc, outside click), avatar squares and
 * the action label chip.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot } from "../../ui/Icon.jsx";
import { actionInfo, avatarStyle } from "./auditModel.js";
import { iconFor } from "./auditIcons.js";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep Tab inside `ref`, Esc closes, focus returns to the opener. */
export function useFocusTrap(open, ref, onClose, { busyRef = null, initial = "[data-autofocus]" } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.stopPropagation();
        if (!busyRef?.current) closeRef.current?.();
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
      } else if (!e.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const raf = window.requestAnimationFrame?.(() => {
      const auto = ref.current?.querySelector(initial);
      (auto || ref.current)?.focus?.({ preventScroll: true });
    });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (raf) window.cancelAnimationFrame?.(raf);
      try {
        opener?.focus?.({ preventScroll: true });
      } catch {
        /* opener gone */
      }
    };
  }, [open, ref, busyRef, initial]);
}

/**
 * Opaque glass dialog with an optional right column (draft B2 / B3 layout).
 * @param {{open: boolean, onClose: () => void, busy?: boolean, icon?: any, tone?: string, title: string,
 *   subtitle?: string, side?: import("react").ReactNode, sideWidth?: number, width?: number, children: any, testId?: string}} props
 */
export function AuditDialog({ open, onClose, busy = false, icon: Icon, tone = "red", title, subtitle, side, sideWidth = 380, width = 620, headExtra, children, testId }) {
  const titleId = useId();
  const ref = useRef(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useFocusTrap(open, ref, onClose, { busyRef });
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="alg-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={ref}
        className={`alg-dlg${side ? " has-side" : ""}`}
        style={{ "--alg-dlg-w": `${side ? width + sideWidth : width}px`, "--alg-side-w": `${sideWidth}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <div className="alg-dlg-main">
          <header className="alg-dlg-head">
            {Icon ? (
              <span className={`alg-dlg-ic is-${tone}`} aria-hidden="true">
                <Icon size={22} />
              </span>
            ) : null}
            <div className="alg-dlg-titles">
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {headExtra}
          </header>
          {children}
        </div>
        {side ? <aside className="alg-dlg-side">{side}</aside> : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * Opaque menu. `point` = {x, y} (right-click) or `anchorRef` (button).
 * Items: {id, label, sub?, icon?, kbd?, danger?, onSelect} or "sep".
 */
export function AuditMenu({ open, onClose, point = null, anchorRef = null, items, label, width = 290, align = "right", testId }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, visible: false });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const menu = ref.current;
      if (!menu) return;
      const pad = 8;
      const h = menu.offsetHeight;
      const w = menu.offsetWidth;
      let top;
      let left;
      if (point) {
        top = point.y;
        left = point.x;
        if (top + h > window.innerHeight - pad) top = Math.max(pad, point.y - h);
        if (left + w > window.innerWidth - pad) left = Math.max(pad, point.x - w);
      } else {
        const r = anchorRef?.current?.getBoundingClientRect?.();
        if (!r) return;
        top = r.bottom + 6;
        if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - 6);
        left = align === "left" ? r.left : r.right - w;
        left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
      }
      setPos({ top, left, visible: true });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, point, anchorRef, align]);

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
      if (e.key === "Tab") {
        closeRef.current?.();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list = [...(ref.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!list.length) return;
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
    const raf = window.requestAnimationFrame?.(() => ref.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      if (raf) window.cancelAnimationFrame?.(raf);
    };
  }, [open, anchorRef]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      className="alg-menu"
      role="menu"
      aria-label={label}
      data-testid={testId}
      style={{ top: pos.top, left: pos.left, width, visibility: pos.visible ? "visible" : "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={`sep-${i}`} className="alg-menu-sep" role="separator" />
        ) : (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            className={`alg-mi${it.danger ? " is-danger" : ""}${it.active ? " is-active" : ""}`}
            data-testid={testId ? `${testId}-${it.id}` : undefined}
            disabled={it.disabled}
            onClick={() => {
              closeRef.current?.();
              it.onSelect?.();
            }}
          >
            {it.icon ? <it.icon size={18} /> : null}
            <span className="alg-mi-text">
              {it.label}
              {it.sub ? <small>{it.sub}</small> : null}
            </span>
            {it.kbd ? <span className="alg-mi-kbd">{it.kbd}</span> : null}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

/** Square avatar: photo when there is one, else the initial on a stable gradient. */
export function Av({ user, name, agent = false, size = "s" }) {
  if (agent) {
    return (
      <span className={`alg-av is-${size} is-agent`} aria-hidden="true">
        <Bot size={size === "l" ? 22 : 15} />
      </span>
    );
  }
  const label = user?.username || name || "?";
  const url = user?.avatarUrl || null;
  return (
    <span className={`alg-av is-${size}`} style={url ? undefined : avatarStyle(label)} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : String(label).replace(/^@/, "").charAt(0).toUpperCase()}
    </span>
  );
}

/** Coloured action label chip ("Yasakladı"). */
export function ActionChip({ action, category, t, compact = false }) {
  const info = actionInfo(action, category);
  const Icon = iconFor(info.icon);
  const text = t(info.labelKey);
  return (
    <span className={`alg-lbl is-${info.tone}${compact ? " is-compact" : ""}`} title={info.known ? undefined : String(action)}>
      <Icon size={16} />
      <span className="alg-lbl-t">{text}</span>
    </span>
  );
}

/** Round-icon tile in the action family colour (drawer / dialogs). */
export function ActionIcon({ action, category, size = 20 }) {
  const info = actionInfo(action, category);
  const Icon = iconFor(info.icon);
  return (
    <span className={`alg-aic is-${info.tone}`} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}
