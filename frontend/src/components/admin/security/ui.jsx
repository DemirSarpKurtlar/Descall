/**
 * Güvenlik Merkezi UI primitives: opaque dialog and right drawer (portal, focus trap,
 * Esc, focus returns to the opener), an anchored opaque popover (outside click / Esc),
 * the switch, and the icon map used by the model's icon names.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Ban,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  MessageCircle,
  ShieldWarning,
  UserPlus,
  Users,
  Zap,
} from "../../ui/Icon.jsx";

export const ICONS = {
  alert: AlertTriangle,
  login: LogIn,
  lock: Lock,
  shieldWarn: ShieldWarning,
  ban: Ban,
  zap: Zap,
  mail: Mail,
  key: KeyRound,
  userPlus: UserPlus,
  message: MessageCircle,
  eyeOff: EyeOff,
  eye: Eye,
  users: Users,
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus trap + Esc + focus back to the opener. `suspended` = a layer above owns the keyboard. */
export function useTrap(open, ref, onClose, { busy = false, suspended = false } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const flags = useRef({ busy, suspended });
  flags.current = { busy, suspended };
  useEffect(() => {
    if (!open) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      if (flags.current.suspended) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented || flags.current.busy) return;
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
  }, [open, ref]);
}

export function Dialog({ open, onClose, busy = false, suspended = false, labelledBy, className = "", children, testId }) {
  const ref = useRef(null);
  useTrap(open, ref, onClose, { busy, suspended });
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="sc-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div ref={ref} className={`sc-dlg ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} data-testid={testId}>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open, onClose, busy = false, suspended = false, labelledBy, className = "", children, testId }) {
  const ref = useRef(null);
  useTrap(open, ref, onClose, { busy, suspended });
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="sc-scrim is-drawer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy && !suspended) onClose?.();
      }}
    >
      <aside ref={ref} className={`sc-drawer ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} data-testid={testId}>
        {children}
      </aside>
    </div>,
    document.body
  );
}

/**
 * Popover anchored under (or above) a button; opaque, closes on outside click / Esc,
 * keeps Tab inside while open, focus returns to the anchor.
 */
export function Popover({ open, anchorRef, onClose, width = 380, align = "right", label, className = "", children, testId, busy = false }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, visible: false });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const el = ref.current;
      const r = anchorRef?.current?.getBoundingClientRect?.();
      if (!el || !r) return;
      const pad = 10;
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      let top = r.bottom + 8;
      if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - 8);
      const want = align === "left" ? r.left : r.right - w;
      const left = Math.max(pad, Math.min(want, window.innerWidth - w - pad));
      setPos({ top, left, visible: true });
    };
    place();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return undefined;
    const anchor = anchorRef?.current;
    const outside = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains?.(e.target)) return;
      if (busyRef.current) return;
      closeRef.current?.();
    };
    const key = (e) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current?.();
        anchor?.focus?.({ preventScroll: true });
        return;
      }
      if (e.key === "Tab" && ref.current?.contains(document.activeElement)) {
        const items = [...ref.current.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    const raf = window.requestAnimationFrame?.(() => {
      const auto = ref.current?.querySelector("[data-autofocus]") || ref.current?.querySelector(FOCUSABLE);
      auto?.focus?.({ preventScroll: true });
    });
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
      className={`sc-pop ${className}`}
      role="dialog"
      aria-label={label}
      data-testid={testId}
      style={{ top: pos.top, left: pos.left, width, visibility: pos.visible ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body
  );
}

export function Switch({ checked, onChange, tone = "blue", label, disabled = false, testId }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      className={`sc-sw${checked ? ` is-on is-${tone}` : ""}`}
      onClick={() => onChange?.(!checked)}
    />
  );
}

export function Toast({ toast }) {
  if (!toast || typeof document === "undefined") return null;
  return createPortal(
    <div className={`sc-toast is-${toast.tone || "ok"}`} role="status" aria-live="polite">
      {toast.text}
    </div>,
    document.body
  );
}
