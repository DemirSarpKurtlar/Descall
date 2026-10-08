/**
 * First-paint shell decision (marketing landing vs. app + AuthView).
 *
 * Kept dependency-free so main.jsx can use it without pulling @capacitor/core
 * into the marketing entry chunk (same global-bridge check as index.html's
 * gtag skip and lib/sentry.js).
 */
import { isPublicMarketingPath } from "../site/marketingPaths.js";

function currentWindow(win) {
  if (win !== undefined) return win;
  return typeof window !== "undefined" ? window : null;
}

/** Electron desktop (preload exposes electronAPI.isElectron). */
export function isElectronShell(win) {
  const w = currentWindow(win);
  return Boolean(w && w.electronAPI && w.electronAPI.isElectron);
}

/**
 * Native Capacitor shell (iOS / Android app), detected through the bridge
 * global the native runtime injects before any page script runs.
 * iOS Safari / PWA / desktop browsers have no native bridge → false.
 */
export function isCapacitorNativeShell(win) {
  const w = currentWindow(win);
  try {
    const cap = w && w.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === "function") return Boolean(cap.isNativePlatform());
    if (typeof cap.getPlatform === "function") {
      const p = cap.getPlatform();
      return p === "ios" || p === "android";
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Should this boot hydrate the public marketing site (landing, /download, …)?
 * Only logged-out *web* visitors on a public marketing path get it. Electron and
 * the native apps always boot straight into their own login / sign-up screen.
 */
export function shouldBootMarketingShell({ pathname = "/", hasSession = false, isElectron = false, isNativeApp = false } = {}) {
  if (isElectron || isNativeApp) return false;
  if (hasSession) return false;
  return isPublicMarketingPath(pathname);
}

/** Initial AuthView tab for the dedicated app auth screen. */
export function initialAuthMode(pathname = "/", search = "") {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/register" || path === "/tr/register") return "register";
  if (/[?&]auth=(register|signup)\b/.test(String(search || ""))) return "register";
  return "login";
}
