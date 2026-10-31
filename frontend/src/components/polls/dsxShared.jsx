import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { formatDate, formatNumber, formatRelativeTime, formatTime } from "../../i18n/format";
import { APP_TIMEZONE } from "../../lib/datetime";
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

/** "just now", then "2 hr. ago" / "2 sa. önce", "3 days ago"; a date after 30 days. */
export function relativeShort(iso, locale, t, now = Date.now()) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  if (now - ms < 60000) return t("polls.justNow");
  if (now - ms < 30 * 86400000) return formatRelativeTime(ms, locale, { now, style: "short" });
  return appDate(iso, locale);
}

/** "18 Eki 2026" / "18 Oct 2026" (Europe/Istanbul, like the rest of the app cards). */
export function appDate(iso, locale) {
  const d = new Date(iso);
  if (!iso || !Number.isFinite(d.getTime())) return "";
  return formatDate(d, locale, { day: "numeric", month: "short", year: "numeric", timeZone: APP_TIMEZONE });
}

export function appClock(iso, locale) {
  const d = new Date(iso);
  if (!iso || !Number.isFinite(d.getTime())) return "";
  return formatTime(d, locale, { hour: "2-digit", minute: "2-digit", timeZone: APP_TIMEZONE });
}

/** "%42" / "42 %" / "42%" in the UI language. */
export function percent(value, locale) {
  return formatNumber((Number(value) || 0) / 100, locale, { style: "percent", maximumFractionDigits: 0 });
}

/**
 * Translate `key` and put React nodes where its {placeholders} are, so the word
 * order stays the translator's: tNodes(t, "polls.app.tip", { slash: <b>/</b> }).
 */
export function tNodes(t, key, nodes, vars = {}) {
  const names = Object.keys(nodes);
  const marks = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0001`]));
  const text = String(t(key, { ...vars, ...marks }));
  return text.split(/\u0001(\d+)\u0001/).map((part, i) => (i % 2 ? <Fragment key={i}>{nodes[names[Number(part)]]}</Fragment> : part));
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

const PRESENCE_KEYS = { online: "online", idle: "idle", dnd: "dnd", offline: "offline", invisible: "offline" };

/** "Online" / "Çevrimiçi" ...; unknown states read as offline. */
export function presenceLabel(t, status) {
  return t(`polls.presence.${PRESENCE_KEYS[status] || "offline"}`);
}
