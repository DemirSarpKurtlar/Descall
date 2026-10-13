/**
 * Desktop + web Liquid Glass gate (Stage 1).
 *
 * Separate from the iPhone UI (`html.glass-ui` / publicFeatures.iosGlass).
 * Native iOS and Android never get `html.glass-desktop`.
 *
 * Electron, and web at >= 960px, default on when the remote flag is missing.
 * These still turn it off:
 *   1. local override  localStorage "descall:glass-desktop" = "0"
 *      (also set by ?glass-desktop=0 or ?gd=0, then the param is removed)
 *   2. remote flag     publicFeatures.desktopGlass === false
 *      (cached as descall:glass-desktop-remote for the next boot)
 *   3. build flag      VITE_GLASS_DESKTOP=0
 * A local "1" (?glass-desktop=1 or ?gd=1) forces it on, still subject to the
 * native, marketing, and web width gates. An explicit remote false is cached
 * as "0". A failed /api/features request re-reads that cache and does not
 * write it, so a cached off stays off.
 *
 * Low-performance mode (`html.gd-lite`) drops backdrop-filter. It turns on for
 * reduced transparency, forced colors, 4 or fewer CPU cores, a slow frame
 * sample, or Settings › Görünüm. A manual "off" beats the automatic triggers
 * except the accessibility ones.
 */

import { isPublicMarketingPath } from "../site/marketingPaths.js";

export const GLASS_DESKTOP_CLASS = "glass-desktop";
export const GLASS_DESKTOP_LITE_CLASS = "gd-lite";
export const GLASS_DESKTOP_CONTRAST_CLASS = "gd-contrast";
export const GLASS_DESKTOP_OVERRIDE_KEY = "descall:glass-desktop";
export const GLASS_DESKTOP_REMOTE_KEY = "descall:glass-desktop-remote";
export const GLASS_DESKTOP_LITE_KEY = "descall:glass-desktop-lite";
export const GLASS_DESKTOP_MIN_WIDTH = 960;

const AUTH_PREVIEW_PATHS = new Set(["/login", "/register", "/tr/login", "/tr/register"]);

function normalizePath(pathname) {
  return String(pathname || "/").replace(/\/+$/, "") || "/";
}

/**
 * Marketing pages never get the class. /login and /register are the preview
 * exception so the app auth screen can be reviewed in a browser.
 */
export function isGlassDesktopSurface(pathname) {
  const path = normalizePath(pathname);
  if (AUTH_PREVIEW_PATHS.has(path)) return true;
  return !isPublicMarketingPath(path);
}

/** Logged-out web: show AuthView instead of the marketing auth modal. */
export function shouldPreviewDesktopAuth({ pathname, search = "", override = null } = {}) {
  if (!AUTH_PREVIEW_PATHS.has(normalizePath(pathname))) return false;
  if (readGlassDesktopQuery(search) === "1") return true;
  return override === "1";
}

function currentWindow(win) {
  if (win !== undefined) return win;
  return typeof window !== "undefined" ? window : null;
}

function readStorage(w, key) {
  try {
    return w?.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function readBuildFlag() {
  try {
    const v = import.meta.env?.VITE_GLASS_DESKTOP;
    if (v === undefined || v === null || v === "") return true;
    return !(String(v) === "0" || String(v).toLowerCase() === "false");
  } catch {
    return true;
  }
}

export function nativeShellPlatform(win) {
  const w = currentWindow(win);
  try {
    const cap = w && w.Capacitor;
    if (!cap || typeof cap.getPlatform !== "function") return null;
    if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return null;
    const platform = cap.getPlatform();
    return platform === "ios" || platform === "android" ? platform : null;
  } catch {
    return null;
  }
}

/** "1" | "0" | null from ?glass-desktop= or ?gd= */
export function readGlassDesktopQuery(search) {
  const raw = String(search || "");
  const q = raw.startsWith("?") ? raw.slice(1) : raw;
  const params = new URLSearchParams(q);
  const value = params.get("glass-desktop") ?? params.get("gd");
  if (value === "1" || value === "0") return value;
  return null;
}

/**
 * Pure on/off decision. Electron and web at the desktop width default on.
 * Remote false, local "0", and VITE_GLASS_DESKTOP=0 still turn it off.
 * viewportOk is false on a narrow web window so a phone browser never gets the class.
 * Web marketing routes stay off. Electron is the app, including the signed-out
 * sheet at "/", so logout must not drop the class and fall back to the old panel.
 */
export function shouldEnableGlassDesktop({
  isNativeIos = false,
  isNativeAndroid = false,
  isElectron = false,
  viewportOk = true,
  surfaceOk = true,
  buildFlag = true,
  remoteFlag = null,
  override = null,
} = {}) {
  if (isNativeIos || isNativeAndroid) return false;
  if (!isElectron && surfaceOk === false) return false;
  if (override === "0" || buildFlag === false) return false;
  if (!isElectron && !viewportOk) return false;
  if (override === "1") return true;
  return remoteFlag !== false;
}

/**
 * Electron's `prefers-reduced-transparency` media query does not track the OS
 * transparency switch (Chromium bug the nativeTheme API was added for). A stuck
 * `reduce` turns on gd-lite and paints the rail, list, and header as flat
 * solids while Chrome on the same machine stays frosted. Trust the native
 * value when Electron provides one.
 */
export function resolveReducedTransparency({ isElectron = false, media = false, native = null } = {}) {
  if (isElectron && typeof native === "boolean") return native;
  return Boolean(media);
}

/** Pure low-performance decision. */
export function shouldUseGlassDesktopLite({
  reducedTransparency = false,
  forcedColors = false,
  contrastMore = false,
  cores = 8,
  manual = null,
  fpsLow = false,
} = {}) {
  if (reducedTransparency || forcedColors) return true;
  if (manual === "1") return true;
  if (manual === "0") return false;
  if (fpsLow) return true;
  const n = Number(cores);
  if (n > 0 && n <= 4) return true;
  void contrastMore;
  return false;
}

function snapshotInputs(w, remoteOverride) {
  const platform = nativeShellPlatform(w);
  const isElectron = Boolean(w?.electronAPI?.isElectron);
  const width = Number(w?.innerWidth) || 0;
  const cachedRemote = readStorage(w, GLASS_DESKTOP_REMOTE_KEY);
  let remoteFlag = null;
  if (remoteOverride === true || remoteOverride === false) remoteFlag = remoteOverride;
  else if (cachedRemote === "0") remoteFlag = false;
  else if (cachedRemote === "1") remoteFlag = true;
  return {
    isNativeIos: platform === "ios",
    isNativeAndroid: platform === "android",
    isElectron,
    viewportOk: isElectron || width >= GLASS_DESKTOP_MIN_WIDTH,
    surfaceOk: isGlassDesktopSurface(w?.location?.pathname),
    buildFlag: readBuildFlag(),
    remoteFlag,
    override: readStorage(w, GLASS_DESKTOP_OVERRIDE_KEY),
  };
}

function consumeQueryOverride(w) {
  let search = "";
  try {
    search = w?.location?.search || "";
  } catch {
    search = "";
  }
  const hit = readGlassDesktopQuery(search);
  if (hit !== "1" && hit !== "0") return;
  try {
    w.localStorage?.setItem(GLASS_DESKTOP_OVERRIDE_KEY, hit);
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(w.location.href);
    url.searchParams.delete("glass-desktop");
    url.searchParams.delete("gd");
    const next = `${url.pathname}${url.search}${url.hash}`;
    w.history?.replaceState?.(w.history.state, "", next);
  } catch {
    /* ignore */
  }
}

let enabled = false;
let lite = false;
let contrast = false;
let fpsLow = false;
let inputs = null;
const listeners = new Set();
let watching = false;

export function isGlassDesktopEnabled() {
  return enabled;
}

export function isGlassDesktopLite() {
  return lite;
}

export function subscribeGlassDesktop(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

function applyClasses(w) {
  const doc = w?.document?.documentElement;
  if (!doc?.classList) return;
  doc.classList.toggle(GLASS_DESKTOP_CLASS, enabled);
  doc.classList.toggle(GLASS_DESKTOP_LITE_CLASS, enabled && lite);
  doc.classList.toggle(GLASS_DESKTOP_CONTRAST_CLASS, enabled && contrast);
}

function readNativeReducedTransparency(w) {
  try {
    const read = w?.electronAPI?.getPrefersReducedTransparency;
    if (typeof read !== "function") return null;
    const value = read();
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

function readLiteInputs(w) {
  const match = (query) => {
    try {
      return Boolean(w?.matchMedia?.(query)?.matches);
    } catch {
      return false;
    }
  };
  const isElectron = Boolean(w?.electronAPI?.isElectron);
  return {
    reducedTransparency: resolveReducedTransparency({
      isElectron,
      media: match("(prefers-reduced-transparency: reduce)"),
      native: readNativeReducedTransparency(w),
    }),
    forcedColors: match("(forced-colors: active)"),
    contrastMore: match("(prefers-contrast: more)"),
    cores: Number(w?.navigator?.hardwareConcurrency) || 8,
    manual: readStorage(w, GLASS_DESKTOP_LITE_KEY),
    fpsLow,
  };
}

function refreshPresentation(w) {
  const env = readLiteInputs(w);
  contrast = env.contrastMore;
  const nextLite = enabled && shouldUseGlassDesktopLite(env);
  const changed = nextLite !== lite;
  lite = nextLite;
  applyClasses(w);
  if (changed) notify();
}

function setEnabled(next, w) {
  const changed = next !== enabled;
  enabled = next;
  if (!enabled) {
    lite = false;
    contrast = false;
    applyClasses(w);
  } else {
    refreshPresentation(w);
  }
  if (changed) notify();
}

function startWatchers(w) {
  if (watching || !w) return;
  watching = true;
  const onEnv = () => {
    inputs = snapshotInputs(w);
    setEnabled(shouldEnableGlassDesktop(inputs), w);
    if (enabled) refreshPresentation(w);
  };
  try {
    w.addEventListener?.("resize", onEnv);
  } catch {
    /* ignore */
  }
  try {
    w.electronAPI?.onReducedTransparencyChange?.(() => onEnv());
  } catch {
    /* ignore */
  }
  for (const query of [
    "(prefers-reduced-transparency: reduce)",
    "(forced-colors: active)",
    "(prefers-contrast: more)",
  ]) {
    try {
      w.matchMedia?.(query)?.addEventListener?.("change", onEnv);
    } catch {
      /* ignore */
    }
  }
  sampleFrameRate(w);
}

function sampleFrameRate(w) {
  const raf = w?.requestAnimationFrame;
  if (typeof raf !== "function") return;
  let frames = 0;
  let last = 0;
  let acc = 0;
  const step = (now) => {
    if (!enabled) return;
    if (last) {
      acc += now - last;
      frames += 1;
    }
    last = now;
    if (frames < 45) {
      raf.call(w, step);
      return;
    }
    const avg = acc / frames;
    if (avg > 40) {
      fpsLow = true;
      refreshPresentation(w);
    }
  };
  raf.call(w, step);
}

/** Re-read the URL after a client navigation. Marketing routes drop the class. */
export function syncGlassDesktop(win) {
  const w = currentWindow(win);
  if (!w) return enabled;
  inputs = snapshotInputs(w);
  setEnabled(shouldEnableGlassDesktop(inputs), w);
  return enabled;
}

/** Call once before first paint (main.jsx bootApp). */
export function initGlassDesktop(win) {
  const w = currentWindow(win);
  if (!w) return false;
  consumeQueryOverride(w);
  inputs = snapshotInputs(w);
  setEnabled(shouldEnableGlassDesktop(inputs), w);
  startWatchers(w);
  return enabled;
}

/**
 * Remote kill switch (publicFeatures.desktopGlass). A boolean is cached for
 * the next boot. Anything else (failed request, omitted key) re-reads the
 * cache and does not write it, so a cached "0" is not replaced by the default.
 */
export function applyRemoteGlassDesktopFlag(value, win) {
  const w = currentWindow(win);
  if (!w) return enabled;
  if (typeof value !== "boolean") return syncGlassDesktop(w);
  try {
    w.localStorage?.setItem(GLASS_DESKTOP_REMOTE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  inputs = snapshotInputs(w, value);
  setEnabled(shouldEnableGlassDesktop(inputs), w);
  // Phone browsers share this kill switch but paint html.glass-ui, not glass-desktop.
  import("./glassUi.js")
    .then((m) => m.syncGlassUi?.(w))
    .catch(() => {});
  return enabled;
}

/** Settings › Görünüm. true = force lite, false = force full (a11y still wins). */
export function setGlassDesktopLiteManual(on, win) {
  const w = currentWindow(win);
  if (!w) return lite;
  try {
    w.localStorage?.setItem(GLASS_DESKTOP_LITE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (enabled) refreshPresentation(w);
  else notify();
  return lite;
}
