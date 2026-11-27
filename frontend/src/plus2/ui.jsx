/**
 * Descall+ 2.0 building blocks: avatar, window shell (portal, focus trap, Esc, opaque), level bar,
 * price text, plan pill, switch.
 */
import { useEffect, useRef, useState } from "react";
import OverlayPortal from "../components/ui/OverlayPortal.jsx";
import useModalFocus from "../hooks/useModalFocus";
import { useLocale, useT } from "../context/LocaleContext";
import { resolveAvatarUrl } from "../lib/userProfile";
import { X } from "../components/ui/Icon.jsx";
import { formatPrice, levelBar } from "./model.js";
import "./plus2.css";

const GRADS = [["#5865f2", "#8c5cf6"], ["#2ad4b8", "#1f8fd6"], ["#f59e0b", "#ef6b3a"], ["#ec4899", "#8b5cf6"], ["#22c55e", "#0ea5a4"], ["#f43f5e", "#f97316"]];

export function initials(u) {
  const s = String(u?.displayName || u?.display_name || u?.username || "?").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : s.slice(0, 2)).toUpperCase();
}

function gradFor(id) {
  let h = 0;
  for (const c of String(id || "x")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADS[h % GRADS.length];
}

export function PAvatar({ user, size = 34, square = false, online = false, src = null }) {
  const [broken, setBroken] = useState(false);
  const url = src || (!broken ? resolveAvatarUrl(user) : null);
  const [a, b] = gradFor(user?.id || user?.username || user?.name);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36), background: url ? "var(--surface-3)" : `linear-gradient(145deg, ${a}, ${b})` };
  return (
    <span className={`p2-av${square ? " is-sq" : ""}`} style={style} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials(user)}
      {online ? <span className="p2-dot" /> : null}
    </span>
  );
}

export function ServerTile({ server, size = 38 }) {
  const [broken, setBroken] = useState(false);
  const [a, b] = gradFor(server?.id || server?.name);
  const name = String(server?.name || "?");
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="p2-av is-sq" style={{ width: size, height: size, fontSize: Math.round(size * 0.34), background: server?.iconUrl && !broken ? "var(--surface-3)" : `linear-gradient(145deg, ${a}, ${b})` }} aria-hidden="true">
      {server?.iconUrl && !broken ? <img src={server.iconUrl} alt="" onError={() => setBroken(true)} /> : ini}
    </span>
  );
}

export function Price({ minor, currency = "TRY", per = null }) {
  const { locale } = useLocale() || {};
  const t = useT();
  if (minor == null) return null;
  return (
    <span className="p2-price tnum">
      {formatPrice(minor, currency, locale)}
      {per ? <small>{t(per === "year" ? "plus2.per.year" : "plus2.per.month")}</small> : null}
    </span>
  );
}

export function PlanPill({ plan }) {
  const t = useT();
  if (plan === "ultra") return <span className="p2-pill is-ultra">{t("plus2.plan.ultra")}</span>;
  if (plan === "plus") return <span className="p2-pill is-plus">{t("plus2.plan.plus")}</span>;
  return <span className="p2-pill">{t("plus2.plan.free")}</span>;
}

export function LevelBar({ count, levels, thin = false, showTicks = true, warm = false }) {
  const t = useT();
  const bar = levelBar(count, levels || undefined);
  return (
    <div>
      <div className={`p2-bar${thin ? " is-thin" : ""}${warm ? " is-warm" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={bar.max} aria-valuenow={bar.count}>
        <i style={{ width: `${Math.round(bar.fill * 100)}%` }} />
      </div>
      {showTicks ? (
        <div className="p2-ticks tnum">
          {bar.ticks.map((tk) => (
            tk.level === (bar.next?.level || 0)
              ? <b key={tk.level}>{t("plus2.level.tickNext", { level: tk.level, boosts: tk.boosts, missing: bar.next.missing })}</b>
              : <span key={tk.level}>{t("plus2.level.tick", { level: tk.level, boosts: tk.boosts })}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button type="button" role="switch" aria-checked={Boolean(checked)} aria-label={label} className="p2-switch" disabled={disabled} onClick={() => onChange?.(!checked)} />
  );
}

/** Opaque centred window (desktop) / bottom sheet (phone). */
export function PlusWindow({ title, onClose, children, size = "wide", head = null, busy = false, labelledBy = null }) {
  const t = useT();
  const ref = useRef(null);
  useModalFocus(true, ref);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, busy]);
  return (
    <OverlayPortal>
      <div className="p2 p2-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
        <div ref={ref} className={`p2-window${size === "narrow" ? " is-narrow" : size === "mid" ? " is-mid" : ""}`} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title} aria-labelledby={labelledBy || undefined}>
          <div className="p2-window-head">
            {head || <h2>{title}</h2>}
            <button type="button" className="p2-x" onClick={() => !busy && onClose?.()} aria-label={t("plus2.close")}><X size={18} /></button>
          </div>
          <div className="p2-window-body">{children}</div>
        </div>
      </div>
    </OverlayPortal>
  );
}

export function ErrorLine({ code }) {
  const t = useT();
  if (!code) return null;
  const known = typeof code === "string" && code.startsWith("plus2.") ? code : null;
  return <div className="p2-err" role="alert">{t(known || "plus2.err.generic")}</div>;
}
