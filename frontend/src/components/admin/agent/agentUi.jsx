/* Small shared pieces of the agent page (Taslak B): icons by draft name, the letter
 * avatar, action chips, the switch, a dialog shell with focus handling and toasts. */
import { useEffect, useId, useRef } from "react";
import OverlayPortal from "../../ui/OverlayPortal.jsx";
import useModalFocus from "../../../hooks/useModalFocus.js";
import {
  AlertTriangle, Award, Ban, Bookmark, Bot, Calendar, Check, CheckCircle, ChevronDown, ChevronRight, Clock, Coins, Copy,
  Eye, FlaskConical, Gift, History, KeyRound, Loader2, LogOut, Mail, Megaphone, Pause, Play, Plus, PlusMinus,
  RectangleHorizontal, Search, Send, Shield, ShoppingBag, Square, Timer, Trash2, Undo2, Unlock, X, Zap,
} from "../../ui/Icon.jsx";
import { ACTION_META, actionLabelParts, joinLabel } from "./agentOpsModel.js";

const ICONS = {
  ban: Ban, timer: Timer, logout: LogOut, unlock: Unlock, coin: Coins, badge: CheckCircle, award: Award, gift: Gift,
  mega: Megaphone, win: RectangleHorizontal, eye: Eye, bag: ShoppingBag, mail: Mail, key: KeyRound, clock: Clock,
  flask: FlaskConical, zap: Zap, bot: Bot, check: Check, x: X, search: Search, send: Send, cd: ChevronDown,
  cr: ChevronRight, copy: Copy, cal: Calendar, shield: Shield, pause: Pause, play: Play, stop: Square, undo: Undo2,
  diff: PlusMinus, bm: Bookmark, hist: History, plus: Plus, trash: Trash2, spin: Loader2, alert: AlertTriangle,
};

export function Ic({ name, size = 16, className, ...rest }) {
  const C = ICONS[name] || Bot;
  return <C size={size} aria-hidden="true" className={className} {...rest} />;
}

const GRADIENTS = [
  "linear-gradient(145deg,#ff9a5c,#c75a26)",
  "linear-gradient(145deg,#6d8cff,#4a5fd6)",
  "linear-gradient(145deg,#4ad98d,#1f9a5a)",
  "linear-gradient(145deg,#c084fc,#7c3aed)",
  "linear-gradient(145deg,#f472b6,#be185d)",
  "linear-gradient(145deg,#38bdf8,#0369a1)",
  "linear-gradient(145deg,#facc15,#b45309)",
];

function hash(s) {
  let h = 0;
  for (const ch of String(s || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/** Rounded-square avatar: the photo when there is one, else the initial on a gradient. */
export function AgoAvatar({ name, url, size = "sm", seed }) {
  const letter = String(name || "?").replace(/^@/, "").charAt(0).toLocaleUpperCase("tr-TR") || "?";
  const style = url ? undefined : { background: GRADIENTS[hash(seed || name) % GRADIENTS.length] };
  return (
    <span className={`ago-ava is-${size}`} style={style} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : letter}
    </span>
  );
}

export function AgentMark({ small = false }) {
  return (
    <span className={`ago-agentav${small ? " is-sm" : ""}`} aria-hidden="true">
      <Bot size={small ? 15 : 18} />
    </span>
  );
}

/** "Yasakla · Spam · 30 gün" chip. */
export function ActionChip({ action, params, t, catText, dropdown = false }) {
  const meta = ACTION_META[action] || ACTION_META.ban;
  return (
    <span className={`ago-act is-${meta.tone}`}>
      <Ic name={meta.icon} size={14} />
      <span className="ago-act-label">{joinLabel(actionLabelParts(action, params, catText), t)}</span>
      {dropdown ? <Ic name="cd" size={12} className="ago-act-dd" /> : null}
    </span>
  );
}

export function Switch({ on, onChange, disabled = false, label, tone }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(on)}
      aria-label={label}
      className={`ago-sw${on ? " is-on" : ""}${tone ? ` is-${tone}` : ""}`}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
    />
  );
}

export function Check3({ state, onClick, label, disabled = false }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "mix" ? "mixed" : state === "on"}
      aria-label={label}
      className={`ago-cb is-${state}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {state === "on" ? <Check size={11} weight="bold" aria-hidden="true" /> : null}
    </button>
  );
}

/** Opaque dialog: portal, scrim click and Esc close, focus trapped and returned. */
export function Dialog({ open, onClose, title, subtitle, icon, iconTone = "blue", wide = false, children, footer, busy = false, className = "", closeLabel }) {
  const ref = useRef(null);
  const titleId = useId();
  useModalFocus(open, ref);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
  if (!open) return null;
  return (
    <OverlayPortal>
      <div className="ago-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
        <div ref={ref} className={`ago-dlg${wide ? " is-wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <header className="ago-dlg-head">
            {icon ? <span className={`ago-dlg-ic is-${iconTone}`}><Ic name={icon} size={20} /></span> : null}
            <div className="ago-dlg-title">
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <button type="button" className="ago-iconbtn" onClick={() => onClose?.()} disabled={busy} aria-label={closeLabel}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="ago-dlg-body">{children}</div>
          {footer ? <footer className="ago-dlg-foot">{footer}</footer> : null}
        </div>
      </div>
    </OverlayPortal>
  );
}

export function Toasts({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <OverlayPortal>
      <div className="ago-toasts" role="status" aria-live="polite">
        {items.map((it) => (
          <div key={it.id} className={`ago-toast${it.tone ? ` is-${it.tone}` : ""}`}>
            <span className="ago-toast-ic"><Ic name={it.tone === "bad" ? "alert" : it.icon || "check"} size={14} /></span>
            <span className="ago-toast-text">{it.text}</span>
            {it.action ? (
              <button type="button" className="ago-btn is-s" onClick={() => { it.action.run(); onDismiss(it.id); }}>{it.action.label}</button>
            ) : null}
            <button type="button" className="ago-iconbtn is-s" onClick={() => onDismiss(it.id)} aria-label={it.closeLabel}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </OverlayPortal>
  );
}
