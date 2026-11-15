/**
 * Oyunlar / Kredi building blocks: avatar, playing cards, result chip, signed
 * credit delta, segmented control, switch, the dialog / drawer shell (portal,
 * focus trap, Esc, focus returns to the opener) and icon lookup.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { resolveAvatarUrl } from "../../../lib/userProfile";
import {
  AlertTriangle,
  Coins,
  Gift,
  RefreshCw,
  Send,
  Spade,
  TrendingUp,
  Undo2,
  Users,
  X,
  Zap,
} from "../../ui/Icon.jsx";
import { gradientFor, initialOf, isRedSuit, resultChip } from "./gamesModel.js";

export const ICONS = {
  cards: Spade,
  coin: Coins,
  flip: RefreshCw,
  gift: Gift,
  send: Send,
  undo: Undo2,
  zap: Zap,
  trend: TrendingUp,
  users: Users,
  alert: AlertTriangle,
};

export function GAvatar({ user, size = 34, radius }) {
  const [broken, setBroken] = useState(false);
  const url = !broken ? resolveAvatarUrl(user) : null;
  const [a, b] = gradientFor(user?.id || user?.username);
  const r = radius ?? Math.round(size * 0.32);
  const style = { width: size, height: size, borderRadius: r, fontSize: Math.round(size * 0.42) };
  if (url) {
    return (
      <span className="agm-av" style={style} aria-hidden="true">
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className="agm-av" style={{ ...style, background: `linear-gradient(145deg, ${a}, ${b})` }} aria-hidden="true">
      {initialOf(user)}
    </span>
  );
}

/** One playing card ({ rank, suit } or hidden). */
export function PlayingCard({ card, delay = 0, animate = false }) {
  if (!card || card.hidden || card.rank === "?") {
    return <span className="agm-pc is-hidden" aria-hidden="true" style={animate ? { animationDelay: `${delay}ms` } : undefined} />;
  }
  return (
    <span className={`agm-pc${isRedSuit(card.suit) ? " is-red" : ""}${animate ? " is-deal" : ""}`} style={animate ? { animationDelay: `${delay}ms` } : undefined}>
      <b>{card.rank}</b>
      <i>{card.suit}</i>
    </span>
  );
}

export function CardHand({ cards, label, animate = false }) {
  const list = Array.isArray(cards) ? cards : [];
  const text = list.map((c) => (c?.hidden ? "?" : `${c.rank}${c.suit}`)).join(" ");
  return (
    <span className="agm-hand" role="img" aria-label={label ? `${label}: ${text}` : text}>
      {list.map((c, i) => (
        <PlayingCard key={c?.id || i} card={c} animate={animate} delay={i * 90} />
      ))}
    </span>
  );
}

export function ResultChip({ result }) {
  const { t } = useLocale();
  const c = resultChip(result);
  return <span className={`agm-rs is-${c.tone}`}>{t(c.key)}</span>;
}

/** +2.000 / −1.000 / 0 with the draft's colours. */
export function Delta({ value, className = "" }) {
  const { locale } = useLocale();
  const n = Number(value) || 0;
  if (n > 0) return <span className={`agm-pos tnum ${className}`}>+{formatNumber(n, locale)}</span>;
  if (n < 0) return <span className={`agm-neg tnum ${className}`}>−{formatNumber(-n, locale)}</span>;
  return <span className={`agm-muted tnum ${className}`}>0</span>;
}

/** Segmented control (radio group semantics). */
export function Seg({ items, value, onChange, label, className = "" }) {
  const refs = useRef([]);
  const onKey = (e, i) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    onChange(items[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className={`agm-seg ${className}`} role="radiogroup" aria-label={label}>
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={value === it.id}
          tabIndex={value === it.id ? 0 : -1}
          className={value === it.id ? "is-on" : ""}
          onClick={() => onChange(it.id)}
          onKeyDown={(e) => onKey(e, i)}
          data-testid={it.testId}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Filter pills (Tümü 1.284 · Riskli 4 …). */
export function Pills({ items, value, onChange, label }) {
  return (
    <div className="agm-fps" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" className={`agm-fp${value === it.id ? " is-on" : ""}`} aria-pressed={value === it.id} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`agm-tg${checked ? " is-on" : ""}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus trap + Esc + focus return for a dialog or drawer element. */
function useModal(open, ref, onClose, busy) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!open) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      if (e.key === "Escape") {
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
  }, [open, ref]);
}

/**
 * Dialog shell: icon + title + subtitle + close button; optional right column
 * (`aside`, with its label). Opaque, portal on body above the admin shell.
 */
export function GDialog({ open, onClose, busy = false, icon: Icon, tone = "blue", title, subtitle, aside, asideLabel, width = 620, children, testId }) {
  const { t } = useLocale();
  const titleId = useId();
  const ref = useRef(null);
  useModal(open, ref, onClose, busy);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="agm-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div
        ref={ref}
        className={`agm-dlg${aside ? " has-aside" : ""}`}
        style={{ "--agm-dlg-w": `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <div className="agm-dlg-main">
          <header className="agm-dh">
            {Icon ? (
              <span className={`agm-dh-ic is-${tone}`} aria-hidden="true">
                <Icon size={20} />
              </span>
            ) : null}
            <div className="agm-dh-t">
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <button type="button" className="agm-xbtn" onClick={onClose} disabled={busy} aria-label={t("gamesAdmin.close")}>
              <X size={16} />
            </button>
          </header>
          {children}
        </div>
        {aside ? (
          <aside className="agm-dlg-aside" aria-label={asideLabel}>
            {aside}
          </aside>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/** Right-side drawer shell (hand history). */
export function GDrawer({ open, onClose, labelledBy, children, testId, width = 720 }) {
  const ref = useRef(null);
  useModal(open, ref, onClose, false);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="agm-scrim is-drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className="agm-drawer" style={{ "--agm-drawer-w": `${width}px` }} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} data-testid={testId}>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** Downloads a CSV string as a file. */
export function downloadCsv(filename, csv) {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Skel({ w = "100%", h = 14, r = 6, style }) {
  return <span className="agm-skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}
