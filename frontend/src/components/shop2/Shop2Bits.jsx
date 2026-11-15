// Market 2.0 building blocks: DesCoin amount, live clock, rolling countdown, sparkline,
// toggle, segmented control, drawer / bottom sheet / full-screen window, hold-to-confirm.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import { countdownParts, idempotencyKey, SHOP2_HOLD_MS, sparkPath, stepPath } from "../../lib/shop2Logic.js";
import { Hand, X } from "./shop2Icons.jsx";

/** Re-renders every `interval` ms while active. */
export function useNow(active = true, interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}

/** True when the user asked for less motion (or the "others' eyes" preview is on). */
export function useReducedMotion() {
  const [reduce, setReduce] = useState(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return undefined;
    }
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
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
      {old != null && Number(old) > Number(value) ? <s className="s2-num s2-old">{formatNumber(Math.round(Number(old)), locale)}</s> : null}
    </span>
  );
}

export function Num({ value, sign = "" }) {
  const { locale } = useLocale();
  return <span className="s2-num">{sign}{formatNumber(Math.round(Number(value) || 0), locale)}</span>;
}

/** HH:MM:SS where each digit rolls in when it changes. */
export function RollingClock({ target, urgentMs, className = "", short = false }) {
  const now = useNow(Boolean(target));
  const parts = countdownParts(target, now, urgentMs);
  const text = short ? parts.short : parts.text;
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

function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const on = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose, active]);
}

/**
 * Overlay window. kind: "drawer" (desktop, slides from the right), "sheet" (phone, bottom
 * sheet, drag down to close), "full" (phone full screen), "dialog" (centred, opaque).
 */
export function Layer({ kind = "dialog", open = true, onClose, label, className = "", children, width }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [dy, setDy] = useState(0);
  useEscape(onClose, open);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const first = ref.current?.querySelector("button, [href], input, textarea, [tabindex]:not([tabindex='-1'])");
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
