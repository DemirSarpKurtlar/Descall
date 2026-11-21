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

/**
 * Pure: the inputs the theme scheme depends on. The observer below fires on every
 * class / style change of <html>, and some of those happen on every scroll frame
 * (inline custom properties, scroll state classes); reading --g-scheme with
 * getComputedStyle there forced a full style recalc per frame (Android DM list
 * scroll: 474 ms of style, 43 dropped frames vs 13 on iPhone). Only a change of
 * these inputs can change the scheme.
 */
export function schemeInputsKey(el) {
  if (!el) return "";
  const inlineScheme = el.style?.getPropertyValue?.("--g-scheme") || "";
  return `${el.getAttribute?.("data-theme") || ""}|${el.className || ""}|${inlineScheme}`;
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
  const root = document.documentElement;
  let lastKey = schemeInputsKey(root);
  let pending = 0;
  const idle = typeof window.requestIdleCallback === "function"
    ? (fn) => window.requestIdleCallback(fn, { timeout: 600 })
    : (fn) => window.setTimeout(fn, 120);
  observer = new MutationObserver(() => {
    const key = schemeInputsKey(root);
    if (key === lastKey || pending) return;
    // Read the computed scheme when the page is idle (after the scroll / animation
    // that toggled the class), not inside the frame.
    pending = idle(() => {
      pending = 0;
      lastKey = schemeInputsKey(root);
      syncAndroidSystemBars();
    });
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  // Coming back from the background (theme may have followed the system).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      lastKey = schemeInputsKey(root);
      syncAndroidSystemBars(true);
    }
  });
}
