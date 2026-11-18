/**
 * Android app status / navigation bar icons.
 *
 * targetSdk 36 runs the WebView edge to edge, so the app paints under the
 * system bars. Capacitor's SystemBars default follows the phone's theme: a
 * phone in light mode got dark icons on the app's dark top edge (invisible
 * clock and battery). capacitor.config.ts starts the bars at DARK (light
 * icons); this keeps them in step with the in-app theme (--g-scheme, the same
 * signal the iPhone status bar uses in glassDisplay.js).
 */
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

/** Pure: a light app theme needs dark icons (LIGHT), everything else light icons (DARK). */
export function systemBarsStyleFor(scheme) {
  return String(scheme || "").trim() === "light" ? "LIGHT" : "DARK";
}

let last = null;
let observer = null;

function currentScheme() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue("--g-scheme") || "dark";
  } catch {
    return "dark";
  }
}

export function syncAndroidSystemBars(force = false) {
  const style = systemBarsStyleFor(currentScheme());
  if (!force && style === last) return style;
  last = style;
  try {
    SystemBars.setStyle({ style: style === "LIGHT" ? SystemBarsStyle.Light : SystemBarsStyle.Dark })?.catch?.(() => {});
  } catch {
    /* shell without the core plugin */
  }
  return style;
}

export function installAndroidSystemBars() {
  if (typeof document === "undefined" || observer) return;
  try {
    if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android")) return;
  } catch {
    return;
  }
  syncAndroidSystemBars(true);
  if (typeof MutationObserver !== "function") return;
  let raf = 0;
  observer = new MutationObserver(() => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      syncAndroidSystemBars();
    });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  // Coming back from the background (theme may have followed the system).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncAndroidSystemBars(true);
  });
}
