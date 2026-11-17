// Market 2.0 building blocks: DesCoin amount, live clock, rolling countdown, sparkline,
// toggle, segmented control, drawer / bottom sheet / full-screen window, hold-to-confirm.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import { countdownParts, idempotencyKey, SHOP2_HOLD_MS, sparkPath, stepPath, whenOf } from "../../lib/shop2Logic.js";
import { CHIP_SLOP_PX, overflowEdges, pageOffset, revealOffset, wheelScrollDelta } from "../../lib/shopChipScroll.js";
import { ChevronLeft, ChevronRight, Hand, Plus, X } from "./shop2Icons.jsx";
import { useS2 } from "./Shop2Context.js";

/** Re-renders every `interval` ms while active. */
/**
 * Formatter for a future time ("today at 22:00", "Friday at 22:00"): when(target) is the long
 * label, when(target, { short: true }) the compact one for tiles ("22:00", "Fri 22:00").
 */
export function useWhen() {
  const { t, locale } = useLocale();
  return useCallback((target, { short = false, now = Date.now() } = {}) => {
    const w = whenOf(target, now);
    if (!w) return "";
    const d = new Date(w.at);
    const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    if (short) return w.kind === "today" ? time : `${d.toLocaleDateString(locale, { weekday: "short" })} ${time}`;
    if (w.kind === "today") return t("shop2.night.whenToday", { time });
    if (w.kind === "tomorrow") return t("shop2.night.whenTomorrow", { time });
    const day = d.toLocaleDateString(locale, w.kind === "day" ? { weekday: "long" } : { weekday: "long", day: "numeric", month: "long" });
    return t("shop2.night.whenDay", { day, time });
  }, [t, locale]);
}

export function useNow(active = true, interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}

/** System "reduce motion" or Settings › Görünüm › Hareketi azalt (html.reduce-motion). */
export function prefersLessMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion");
  } catch {
    return false;
  }
}

/** True when the user asked for less motion (or the "others' eyes" preview is on). */
export function useReducedMotion() {
  const [reduce, setReduce] = useState(prefersLessMotion);
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return undefined;
    }
    const on = () => setReduce(prefersLessMotion());
    mq.addEventListener?.("change", on);
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(on) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mq.removeEventListener?.("change", on);
      mo?.disconnect();
    };
  }, []);
  return reduce;
}

export function Coin({ size = "md" }) {
  return <span className={`s2-coin is-${size}`} aria-hidden="true" />;
}

/** "D 2.940" with locale grouping; `old` draws a struck-through list price after it. */
export function Price({ value, old = null, size = "md", className = "", sign = "" }) {
  const { locale } = useLocale();
  return (
    <span className={`s2-price is-${size} ${className}`.trim()}>
      <Coin size={size} />
      <b className="s2-num">{sign}{formatNumber(Math.round(Number(value) || 0), locale)}</b>
      {old != null && Number(value) < Number(old) ? <s className="s2-num s2-old">{formatNumber(Math.round(Number(old)), locale)}</s> : null}
    </span>
  );
}

export function Num({ value, sign = "" }) {
  const { locale } = useLocale();
  return <span className="s2-num">{sign}{formatNumber(Math.round(Number(value) || 0), locale)}</span>;
}

/** HH:MM:SS where each digit rolls in when it changes. */
export function RollingClock({ target, urgentMs, className = "", short = false }) {
  const { t } = useLocale();
  const now = useNow(Boolean(target));
  const parts = countdownParts(target, now, urgentMs);
  const text = short ? parts.short : parts.days >= 1 ? t("shop2.clock.dh", { d: parts.days, h: parts.hoursLeft }) : parts.text;
  return (
    <span className={`s2-clock s2-num${parts.urgent ? " is-urgent" : ""} ${className}`.trim()} role="timer" aria-live="off">
      {Array.from(text).map((ch, i) => (
        <span key={`${i}-${ch}`} className={ch === ":" ? "s2-clock-sep" : "s2-clock-d"}>{ch}</span>
      ))}
    </span>
  );
}

export function Sparkline({ values, width = 260, height = 44, tone = "green", step = false, marker = true, label }) {
  const d = step ? stepPath(values, width, height) : sparkPath(values, width, height);
  if (!d) return null;
  const last = d.split(/[MLHV ]/).filter(Boolean);
  const v = values || [];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const lx = width - 2;
  const ly = height - 2 - ((v[v.length - 1] - min) / span) * (height - 4);
  return (
    <svg className={`s2-spark is-${tone}`} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {!step ? <path className="s2-spark-fill" d={`${d} L${width - 2} ${height} L2 ${height} Z`} /> : null}
      <path className="s2-spark-line" d={d} vectorEffect="non-scaling-stroke" />
      {marker && last.length ? <circle className="s2-spark-dot" cx={lx} cy={ly} r="3.5" /> : null}
    </svg>
  );
}

export function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      className={`s2-toggle${checked ? " is-on" : ""}`}
      onClick={() => onChange?.(!checked)}
    >
      <i />
    </button>
  );
}

/** Segmented control; options: [{ id, label, icon, count, title }]. */
export function Seg({ options, value, onChange, className = "", size = "md", label }) {
  return (
    <div className={`s2-seg is-${size} ${className}`.trim()} role="tablist" aria-label={label}>
      {options.map((o) => {
        const Icon = o.icon;
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            title={o.title}
            aria-label={o.label ? undefined : o.title}
            className={on ? "is-on" : ""}
            onClick={() => onChange?.(o.id)}
          >
            {Icon ? <Icon size={size === "sm" ? 14 : 15} weight={on ? "fill" : "regular"} /> : null}
            {o.label ? <span>{o.label}</span> : null}
            {o.count != null ? <span className="s2-seg-count">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Scrolls a strip to `left` with our own ease-out (snap off meanwhile). Native smooth
 * scrolling is cancelled by scroll snap whenever the strip's layout changes mid-way (a tile
 * re-rendering as data arrives), which left the arrows doing nothing. A wheel / drag /
 * touch on the strip stops it.
 */
function glideTo(el, left) {
  el.__s2Glide?.();
  if (prefersLessMotion()) {
    el.scrollLeft = left;
    return;
  }
  const from = el.scrollLeft;
  const dist = left - from;
  if (Math.abs(dist) < 1) return;
  const ms = Math.min(420, 220 + Math.abs(dist) * 0.15);
  let raf = 0;
  let t0 = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    el.classList.remove("is-gliding");
    el.removeEventListener("wheel", stop);
    el.removeEventListener("pointerdown", stop);
    el.removeEventListener("touchstart", stop);
    el.__s2Glide = null;
  };
  const step = (now) => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / ms);
    el.scrollLeft = from + dist * (1 - (1 - p) ** 3);
    if (p < 1) raf = requestAnimationFrame(step);
    else stop();
  };
  el.classList.add("is-gliding");
  el.addEventListener("wheel", stop, { passive: true });
  el.addEventListener("pointerdown", stop);
  el.addEventListener("touchstart", stop, { passive: true });
  el.__s2Glide = stop;
  raf = requestAnimationFrame(step);
}

/**
 * Horizontal strip that scrolls (set switcher, tab rows, phone chips): native scroll with
 * snap, edge fades, the mouse wheel moving it sideways, drag to scroll with a mouse, and
 * prev / next arrows on desktop (hidden on touch screens by CSS). The selected child
 * (`[aria-selected="true"]`, `.is-on` or `[aria-current]`) is kept in view without
 * scrolling the page. `className` styles the scrolling row itself.
 */
export function HScroller({ as: Tag = "div", className = "", wrapClassName = "", children, activeKey, arrows = true, ...rest }) {
  const { t } = useLocale();
  const vp = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = vp.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const next = overflowEdges(el.scrollLeft, max);
    setEdges((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);
  useLayoutEffect(() => {
    const el = vp.current;
    if (!el) return undefined;
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    for (const c of el.children) ro?.observe(c);
    el.addEventListener("scroll", measure, { passive: true });
    let wheelEnd = 0;
    // Wheel: vertical turns sideways while the strip can still move that way, then the
    // page takes over (no trap at either end).
    const onWheel = (e) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1 || e.ctrlKey) return;
      const d = wheelScrollDelta({ deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, shiftKey: e.shiftKey, viewportWidth: el.clientWidth, viewportHeight: el.clientHeight });
      if (!d || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // trackpads already scroll sideways
      const next = Math.max(0, Math.min(max, el.scrollLeft + d));
      if (Math.abs(next - el.scrollLeft) < 0.5) return;
      e.preventDefault();
      // Snap off while the wheel turns (every assignment would snap and jump), back on
      // shortly after it stops so the strip settles on a tile.
      el.classList.add("is-wheeling");
      clearTimeout(wheelEnd);
      wheelEnd = setTimeout(() => el.classList.remove("is-wheeling"), 180);
      el.scrollLeft = next;
    };
    // Mouse drag (touch and pen scroll natively).
    let drag = null;
    let suppress = false;
    const onDown = (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || el.scrollWidth - el.clientWidth <= 1) return;
      drag = { x: e.clientX, left: el.scrollLeft, id: e.pointerId, moved: false };
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < CHIP_SLOP_PX) return;
        drag.moved = true;
        suppress = true;
        el.classList.add("is-dragging");
        try {
          el.setPointerCapture?.(e.pointerId);
        } catch {
          /* released */
        }
      }
      el.scrollLeft = drag.left - dx;
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) return;
      // The click that ends a drag is swallowed; when the browser fires none (pointer
      // captured), the flag must not eat the next real tap.
      setTimeout(() => {
        suppress = false;
      }, 0);
      el.classList.remove("is-dragging");
      // Let snapping settle on the nearest item after the drag.
      const left = el.scrollLeft;
      el.scrollLeft = left + 1;
      el.scrollLeft = left;
    };
    const onClick = (e) => {
      if (!suppress) return;
      suppress = false;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      clearTimeout(wheelEnd);
      el.__s2Glide?.();
      ro?.disconnect();
      el.removeEventListener("scroll", measure);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [measure]);
  // Keep the selected child in view (only this strip moves, never the page).
  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const on = el.querySelector(":scope > [aria-selected='true'], :scope > .is-on, :scope > [aria-current]");
    if (!on) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const start = on.getBoundingClientRect().left - el.getBoundingClientRect().left - el.clientLeft + el.scrollLeft;
    const next = revealOffset(el.scrollLeft, max, start, start + on.offsetWidth, el.clientWidth, 40);
    if (Math.abs(next - el.scrollLeft) > 1) glideTo(el, next);
  }, [activeKey]);
  const page = (dir) => {
    const el = vp.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    glideTo(el, pageOffset(el.scrollLeft, max, el.clientWidth, dir));
  };
  return (
    <div className={`s2-hs${edges.left ? " is-fade-l" : ""}${edges.right ? " is-fade-r" : ""} ${wrapClassName}`.trim()}>
      <Tag ref={vp} className={`s2-hs-vp ${className}`.trim()} {...rest}>
        {children}
      </Tag>
      {arrows ? (
        <>
          <button type="button" className="s2-hs-arrow is-prev" tabIndex={-1} aria-label={t("Previous")} hidden={!edges.left} onClick={() => page(-1)}>
            <ChevronLeft size={16} weight="bold" />
          </button>
          <button type="button" className="s2-hs-arrow is-next" tabIndex={-1} aria-label={t("Next")} hidden={!edges.right} onClick={() => page(1)}>
            <ChevronRight size={16} weight="bold" />
          </button>
        </>
      ) : null}
    </div>
  );
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
/** Open layers, oldest first. Only the top one answers Escape and keeps Tab inside. */
const layerStack = [];

/**
 * Escape closes the TOP layer only, and never the Settings window behind it (its Escape
 * listener sits on window in the bubble phase; this one runs in the capture phase and stops
 * the event). Tab / Shift+Tab cycle inside the top layer.
 */
function useLayerKeys(ref, onClose, active = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const token = {};
    layerStack.push(token);
    const on = (e) => {
      if (layerStack[layerStack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const list = [...ref.current.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const inside = ref.current.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", on, true);
    return () => {
      window.removeEventListener("keydown", on, true);
      const i = layerStack.indexOf(token);
      if (i >= 0) layerStack.splice(i, 1);
    };
  }, [active, ref]);
}

/**
 * Overlay window. kind: "drawer" (desktop, slides from the right), "sheet" (phone, bottom
 * sheet, drag down to close), "full" (phone full screen), "dialog" (centred, opaque).
 */
export function Layer({ kind = "dialog", open = true, onClose, label, className = "", children, width }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [dy, setDy] = useState(0);
  useLayerKeys(ref, onClose, open);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const first = ref.current?.querySelector(FOCUSABLE);
    first?.focus?.({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  const onPointerDown = (e) => {
    if (kind !== "sheet") return;
    drag.current = { y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setDy(Math.max(0, e.clientY - drag.current.y));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dy > 110) onClose?.();
    setDy(0);
  };
  const node = (
    <div className={`s2-layer is-${kind}`} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div
        ref={ref}
        className={`s2-layer-panel ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ ...(width ? { width } : null), ...(dy ? { transform: `translateY(${dy}px)`, transition: "none" } : null) }}
      >
        {kind === "sheet" ? (
          <div className="s2-grab" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <i />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

export function CloseX({ onClick, label }) {
  return (
    <button type="button" className="s2-x" onClick={onClick} aria-label={label}>
      <X size={16} weight="bold" />
    </button>
  );
}

/**
 * Hold-to-confirm (wrong taps never buy). Fills left to right in SHOP2_HOLD_MS; release early
 * and it drains. Works with pointer and with a held Enter / Space. Calls onConfirm(holdToken).
 */
export function HoldButton({ onConfirm, children, hint, disabled = false, busy = false, className = "", ms = SHOP2_HOLD_MS }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const done = useRef(false);
  const id = useId();
  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (!done.current) setP(0);
  }, []);
  const begin = useCallback(() => {
    if (disabled || busy || raf.current) return;
    done.current = false;
    start.current = performance.now();
    const tick = (t) => {
      const v = Math.min(1, (t - start.current) / ms);
      setP(v);
      if (v >= 1) {
        done.current = true;
        raf.current = 0;
        try {
          navigator.vibrate?.(12);
        } catch {
          /* no haptics */
        }
        onConfirm?.(idempotencyKey("hold"));
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [disabled, busy, ms, onConfirm]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    if (!busy) {
      done.current = false;
      setP(0);
    }
  }, [busy]);
  return (
    <div className={`s2-hold-wrap ${className}`.trim()}>
      <button
        type="button"
        className={`s2-hold${p > 0 ? " is-holding" : ""}${busy ? " is-busy" : ""}`}
        style={{ "--hold": p }}
        disabled={disabled}
        aria-describedby={hint ? id : undefined}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          begin();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
            e.preventDefault();
            begin();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") stop();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="s2-hold-fill" aria-hidden="true" />
        <span className="s2-hold-label">
          {busy ? <span className="s2-spin" aria-hidden="true" /> : <Hand size={17} />}
          {children}
        </span>
      </button>
      {hint ? <p id={id} className="s2-hold-hint">{hint}</p> : null}
    </div>
  );
}

/** Small status chip. tone: blue | green | gold | violet | red | muted */
export function Chip({ tone = "muted", children, icon: Icon, className = "" }) {
  return (
    <span className={`s2-chip is-${tone} ${className}`.trim()}>
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  );
}

/** Ring that drains over a window (recall / refund). */
export function Ring({ fraction = 0, size = 18 }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="s2-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="s2-ring-bg" />
      <circle cx={size / 2} cy={size / 2} r={r} className="s2-ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))} />
    </svg>
  );
}

/** Not enough DesCoin: say how much is missing and offer the ways to earn it. */
export function ShortBy({ n, compact = false }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  return (
    <div className={`s2-short${compact ? " is-compact" : ""}`} role="status">
      <span className="s2-short-t">
        <b className="s2-num">{t("shop2.kasa.shortBy", { n: formatNumber(n, locale) })}</b>
        {!compact ? <small>{t("shop2.kasa.shortHint")}</small> : null}
      </span>
      <button type="button" className="s2-earn" onClick={() => s2.onEarn?.()}>
        <Plus size={14} weight="bold" />
        {t("shop2.wallet.earn")}
      </button>
    </div>
  );
}

