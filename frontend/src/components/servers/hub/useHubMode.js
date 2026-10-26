import { useEffect, useState } from "react";
import { useGlassShell } from "../../layout/glass/GlassShell";
import { useGlassDesktop } from "../../../hooks/useGlassDesktop";

/** Touch iPad (Capacitor iOS or a coarse, hover-less pointer). Same test as IncomingCallCard. */
export function isTouchTablet() {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.getPlatform?.() === "ios") return true;
    return Boolean(window.matchMedia?.("(hover: none) and (pointer: coarse)").matches) && (navigator.maxTouchPoints || 0) > 0;
  } catch {
    return false;
  }
}

/** Reduced-motion preference, live. */
export function useReducedMotionPref() {
  const q = "(prefers-reduced-motion: reduce)";
  const [v, setV] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(q).matches));
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setV(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return v;
}

/**
 * "phone" → iOS sheets (glass shell on a phone), "tablet" → iPad split forms
 * (glass desktop on a touch tablet), null → desktop keeps its existing modals.
 */
export function useHubMode(isMobile) {
  const glassShell = useGlassShell();
  const glassDesktop = useGlassDesktop();
  const [tablet, setTablet] = useState(() => isTouchTablet());
  useEffect(() => {
    const m = window.matchMedia?.("(hover: none) and (pointer: coarse)");
    if (!m) return undefined;
    const on = () => setTablet(isTouchTablet());
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  if (glassShell && isMobile) return "phone";
  if (glassDesktop && tablet && !isMobile) return "tablet";
  return null;
}
