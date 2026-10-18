import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import "./dsx.css";

/** Body portal for sheets and popovers. */
export function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/** Counts from the previous value to `value` in step with the bar spring. */
export function useCountUp(value, { duration = 750, enabled = true } = {}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(enabled && !reduce ? 0 : value);
  const fromRef = useRef(enabled && !reduce ? 0 : value);
  useEffect(() => {
    if (reduce || !enabled || value == null) {
      setShown(value);
      fromRef.current = value;
      return undefined;
    }
    const from = Number(fromRef.current) || 0;
    const to = Number(value) || 0;
    if (from === to) {
      setShown(to);
      return undefined;
    }
    const start = performance.now();
    let raf = 0;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(from + (to - from) * ease(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, enabled, reduce]);
  return shown;
}

/** "2 sa önce", "az önce", "3 gün önce". */
export function relativeTr(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "az önce";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} gün önce`;
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });
}

export function trDate(iso) {
  const d = new Date(iso);
  if (!iso || !Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });
}

export function trTime(iso) {
  const d = new Date(iso);
  if (!iso || !Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

/** Compact layout for phones and narrow chat columns. */
export function useCompact(breakpoint = 720) {
  const get = () => (typeof window === "undefined" ? false : window.innerWidth < breakpoint);
  const [compact, setCompact] = useState(get);
  useEffect(() => {
    const on = () => setCompact(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakpoint]);
  return compact;
}

/** Closes on Escape and on a press outside `ref`. */
export function useDismiss(ref, onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [ref, onClose, active]);
}

export function DescallMark({ size = 18, white = true }) {
  const base = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
  return <img src={`${base}brand/descall-symbol.svg`} alt="" width={size} height={size} style={{ display: "block", filter: white ? "brightness(0) invert(1)" : undefined }} />;
}

export const PRESENCE_LABEL = {
  online: "Çevrimiçi",
  idle: "Boşta",
  dnd: "Rahatsız etmeyin",
  offline: "Çevrimdışı",
  invisible: "Çevrimdışı",
};
