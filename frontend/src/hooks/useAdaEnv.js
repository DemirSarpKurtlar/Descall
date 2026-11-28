import { useEffect, useState } from "react";
import { isAdaPhone } from "../lib/adaPill";

function capPlatform() {
  try {
    if (import.meta.env.DEV && typeof window !== "undefined" && window.__DESCALL_ADA_PLATFORM__) {
      return String(window.__DESCALL_ADA_PLATFORM__);
    }
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    if (cap?.isNativePlatform?.()) return cap.getPlatform?.() || "web";
  } catch {
    /* ignore */
  }
  return "web";
}

function readEnv() {
  if (typeof window === "undefined") return { phone: false, safeTop: 0, viewportW: 390, platform: "web" };
  const platform = capPlatform();
  const scr = window.screen || {};
  const short = Math.min(Number(scr.width) || window.innerWidth, Number(scr.height) || window.innerHeight);
  let coarse = false;
  try {
    coarse = window.matchMedia("(pointer: coarse)").matches;
  } catch {
    /* ignore */
  }
  let safeTop = 0;
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    safeTop = probe.getBoundingClientRect().height || 0;
    probe.remove();
  } catch {
    /* ignore */
  }
  return {
    phone: isAdaPhone({ screenShort: short, native: platform === "ios" || platform === "android", coarse }),
    safeTop,
    viewportW: window.innerWidth,
    platform,
  };
}

/**
 * Phone check and the inputs of the "Ada" pill geometry (lib/adaPill.js adaLayout):
 * top safe-area inset, viewport width, platform. Re-read on resize / rotation.
 * Shared by AdaCallHost (draws the pill) and CallOverlay (skips the tablet / desktop
 * mini card on phones).
 */
export function useAdaEnv() {
  const [env, setEnv] = useState(readEnv);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = readEnv();
        setEnv((prev) =>
          prev.phone === next.phone && prev.safeTop === next.safeTop && prev.viewportW === next.viewportW && prev.platform === next.platform ? prev : next
        );
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return env;
}

