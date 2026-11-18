/**
 * Liquid Glass UI gate.
 *
 * Native: the Capacitor iOS and Android apps on a phone (short side < 600).
 * iPad / Android tablets use the wide layout (glassDesktop.js); Electron never
 * gets `html.glass-ui`.
 *
 * Mobile web: a phone-like browser under the desktop glass width (960px)
 * gets the same class, so iPhone Safari matches the iOS app. It follows the
 * desktop glass kill switches (remote `desktopGlass`, `descall:glass-desktop`,
 * `VITE_GLASS_DESKTOP`) plus the glass-ui kills (`descall:glass`,
 * `VITE_GLASS_UI`). Low-power / reduced-transparency uses `glass-lite` and
 * `a11y-solid`, the same idea as desktop `gd-lite`.
 *
 * Native switches (iPhone and Android phone apps share them; a rollout rule
 * on iosGlass can still target one platform):
 *   1. build flag  VITE_GLASS_UI=0
 *   2. remote flag publicFeatures.iosGlass
 *   3. local override localStorage "descall:glass" = "0" | "1"
 *
 * The Android app has no native display plugin: it takes the same
 * glass-lite / a11y-solid fallback as phone web, plus a frame-rate sample
 * (mid-range Android reports 8 cores, so cores alone never trips lite).
 *
 * Dependency-free of @capacitor/core (window.Capacitor, like lib/entryShell.js).
 */

import {
  GLASS_DESKTOP_LITE_KEY,
  GLASS_DESKTOP_OVERRIDE_KEY,
  GLASS_DESKTOP_REMOTE_KEY,
  GLASS_FRAME_GRACE_MS,
  GLASS_FRAME_SAMPLES,
  isGlassFrameRateLow,
  nativeShellPlatform,
  shouldCountGlassFrame,
  shouldUseGlassDesktopLite,
  webGlassMode,
} from "./glassDesktop.js";

export const GLASS_CLASS = "glass-ui";
export const GLASS_OVERRIDE_KEY = "descall:glass";
export const GLASS_REMOTE_KEY = "descall:glass-remote";
/** Bottom of the glass aurora (--g-base-2). Safari/Chrome paint this behind the toolbar. */
export const GLASS_THEME_COLOR = "#101118";
const STOCK_THEME_COLOR = "#0b0c10";
/** Phones only: the short screen side of every iPhone is < 600 pt, every iPad ≥ 744. */
export const PHONE_MAX_SHORT_SIDE = 600;

function currentWindow(win) {
  if (win !== undefined) return win;
  return typeof window !== "undefined" ? window : null;
}

export function isNativeIosShell(win) {
  const w = currentWindow(win);
  try {
    const cap = w && w.Capacitor;
    if (!cap || typeof cap.getPlatform !== "function") return false;
    if (cap.getPlatform() !== "ios") return false;
    return typeof cap.isNativePlatform !== "function" || Boolean(cap.isNativePlatform());
  } catch {
    return false;
  }
}

function readFlag(name) {
  try {
    const v = import.meta.env?.[name];
    if (v === undefined || v === null || v === "") return true;
    return !(String(v) === "0" || String(v).toLowerCase() === "false");
  } catch {
    return true;
  }
}

function readStorage(w, key) {
  try {
    return w?.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function readTriState(stored) {
  if (stored === "0") return false;
  if (stored === "1") return true;
  return null;
}

/**
 * Pure decision (unit-tested in glassUi.selftest.mjs).
 * Web fields are ignored on the native iPhone path.
 */
export function shouldEnableGlass({
  isNativeIos = false,
  isElectron = false,
  isNativeAndroid = false,
  shortSide = 0,
  viewportWidth = 0,
  viewportShortSide = 0,
  buildFlag = true,
  remoteFlag = true,
  override = null,
  webBuildFlag = true,
  webRemoteFlag = null,
  webOverride = null,
} = {}) {
  if (isElectron) return false;

  if (isNativeIos || isNativeAndroid) {
    if (!(shortSide > 0 && shortSide < PHONE_MAX_SHORT_SIDE)) return false;
    if (override === "0") return false;
    if (override === "1") return true;
    if (buildFlag === false) return false;
    if (remoteFlag === false) return false;
    return true;
  }

  // Phone-like browser under the desktop glass breakpoint. A wide desktop
  // window stays on html.glass-desktop (or the classic UI if that is off).
  // Same split as glassDesktop's webGlassMode, so every web width gets one layer.
  const width = Number(viewportWidth) || 0;
  const short = Number(viewportShortSide) || 0;
  if (webGlassMode({ width, height: short > 0 && short < width ? short : width }) !== "ui") return false;
  if (webOverride === "0" || override === "0") return false;
  if (webBuildFlag === false || buildFlag === false) return false;
  if (webOverride === "1" || override === "1") return true;
  if (webRemoteFlag === false) return false;
  return true;
}

function snapshotInputs(w, remoteOverride) {
  const scr = w?.screen || {};
  const shortSide = Math.min(Number(scr.width) || w?.innerWidth || 0, Number(scr.height) || w?.innerHeight || 0);
  const viewportWidth = Number(w?.innerWidth) || 0;
  const viewportHeight = Number(w?.innerHeight) || 0;
  const cachedRemote = readStorage(w, GLASS_REMOTE_KEY);
  const platform = nativeShellPlatform(w);
  return {
    isNativeIos: platform === "ios" || isNativeIosShell(w),
    isNativeAndroid: platform === "android",
    isElectron: Boolean(w?.electronAPI?.isElectron),
    shortSide,
    viewportWidth,
    viewportShortSide: viewportWidth > 0 && viewportHeight > 0 ? Math.min(viewportWidth, viewportHeight) : 0,
    buildFlag: readFlag("VITE_GLASS_UI"),
    remoteFlag: remoteOverride !== undefined ? remoteOverride : cachedRemote !== "0",
    override: readStorage(w, GLASS_OVERRIDE_KEY),
    webBuildFlag: readFlag("VITE_GLASS_DESKTOP"),
    webRemoteFlag: readTriState(readStorage(w, GLASS_DESKTOP_REMOTE_KEY)),
    webOverride: readStorage(w, GLASS_DESKTOP_OVERRIDE_KEY),
  };
}

let enabled = false;
let inputs = null;
const listeners = new Set();
let watching = false;

export function isGlassUiEnabled() {
  return enabled;
}

export function subscribeGlassUi(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function matchMedia(w, query) {
  try {
    return Boolean(w?.matchMedia?.(query)?.matches);
  } catch {
    return false;
  }
}

function isNativeShell(w) {
  const platform = nativeShellPlatform(w);
  return platform === "ios" || platform === "android" || isNativeIosShell(w);
}

/** Native iOS has DescallDisplayPlugin (glassDisplay.js); everyone else uses the fallback below. */
function hasNativeDisplay(w) {
  return nativeShellPlatform(w) === "ios" || isNativeIosShell(w);
}

/** Chrome rounds navigator.deviceMemory down (0.25 … 8 GB). 2 GB or less is a low-end phone. */
export const GLASS_LOW_MEMORY_GB = 2;

export function isLowMemoryDevice(deviceMemory) {
  const gb = Number(deviceMemory);
  return Number.isFinite(gb) && gb > 0 && gb <= GLASS_LOW_MEMORY_GB;
}

let phoneFpsLow = false;
let sampling = false;

/** Cheap material on phone browsers and the Android app. Native iOS uses the display plugin. */
function applyWebGlassFallback(w) {
  const doc = w?.document?.documentElement;
  if (!doc?.classList || hasNativeDisplay(w)) return;
  const reducedTransparency = matchMedia(w, "(prefers-reduced-transparency: reduce)");
  const forcedColors = matchMedia(w, "(forced-colors: active)");
  const contrastMore = matchMedia(w, "(prefers-contrast: more)");
  const lite = shouldUseGlassDesktopLite({
    reducedTransparency,
    forcedColors,
    contrastMore,
    cores: Number(w?.navigator?.hardwareConcurrency) || 8,
    manual: readStorage(w, GLASS_DESKTOP_LITE_KEY),
    fpsLow: phoneFpsLow || isLowMemoryDevice(w?.navigator?.deviceMemory),
  });
  doc.classList.toggle("glass-lite", lite);
  doc.classList.toggle("a11y-solid", reducedTransparency || forcedColors || readStorage(w, "descall:reduce-transparency") === "1");
  doc.classList.toggle("a11y-contrast", contrastMore);
}

function clearWebGlassFallback(w) {
  const doc = w?.document?.documentElement;
  if (!doc?.classList?.remove || hasNativeDisplay(w)) return;
  doc.classList.remove("glass-lite", "a11y-solid", "a11y-contrast");
}

function pageHidden(w) {
  const doc = w?.document;
  if (!doc) return false;
  if (doc.hidden) return true;
  return typeof doc.visibilityState === "string" && doc.visibilityState !== "visible";
}

/**
 * One visible-frame sample per launch (same median rule as desktop glass).
 * A slow phone drops to glass-lite for the rest of the session.
 */
function sampleFrameRate(w) {
  if (sampling || phoneFpsLow || hasNativeDisplay(w)) return;
  const raf = w?.requestAnimationFrame;
  if (typeof raf !== "function") return;
  sampling = true;
  const deltas = [];
  let last = 0;
  let visibleSince = 0;
  const step = (now) => {
    if (!enabled) {
      sampling = false;
      return;
    }
    if (pageHidden(w)) {
      last = 0;
      visibleSince = 0;
      raf.call(w, step);
      return;
    }
    if (!visibleSince) visibleSince = now;
    if (now - visibleSince < GLASS_FRAME_GRACE_MS) {
      last = now;
      raf.call(w, step);
      return;
    }
    const deltaMs = last ? now - last : 0;
    last = now;
    if (shouldCountGlassFrame({ hidden: false, deltaMs })) deltas.push(deltaMs);
    if (deltas.length < GLASS_FRAME_SAMPLES) {
      raf.call(w, step);
      return;
    }
    sampling = false;
    if (isGlassFrameRateLow(deltas)) {
      phoneFpsLow = true;
      applyWebGlassFallback(w);
    }
  };
  raf.call(w, step);
}

/** Status bar / theme-color follows the aurora on phone web. Native launch color stays. */
export function syncGlassThemeColor(w, enabled) {
  const meta = w?.document?.querySelector?.('meta[name="theme-color"]');
  if (!meta || typeof meta.setAttribute !== "function") return;
  if (isNativeShell(w)) return;
  meta.setAttribute("content", enabled ? GLASS_THEME_COLOR : STOCK_THEME_COLOR);
}

function setEnabled(next, w) {
  const doc = w?.document?.documentElement;
  if (doc) doc.classList.toggle(GLASS_CLASS, next);
  if (next && !isNativeIosShell(w)) {
    applyWebGlassFallback(w);
    sampleFrameRate(w);
  }
  if (!next) clearWebGlassFallback(w);
  syncGlassThemeColor(w, Boolean(next));
  if (next === enabled) return;
  enabled = next;
  listeners.forEach((l) => {
    try {
      l(enabled);
    } catch {
      /* ignore */
    }
  });
  if (next && isNativeIosShell(w)) {
    // Accessibility / power / device-tier classes come from the native bridge.
    import("./glassDisplay.js").then((m) => m.startGlassDisplay?.()).catch(() => {});
  } else if (!next && isNativeIosShell(w)) {
    import("./glassDisplay.js").then((m) => m.stopGlassDisplay?.()).catch(() => {});
  }
  if (next) {
    // Long-press must not start WebKit text selection on chrome or bubbles.
    import("./glassTextSelection.js").then((m) => m.installGlassTextSelection?.(w)).catch(() => {});
  }
}

function startWatchers(w) {
  if (watching || !w || isNativeIosShell(w)) return;
  watching = true;
  const onEnv = () => {
    inputs = snapshotInputs(w);
    setEnabled(shouldEnableGlass(inputs), w);
  };
  try {
    w.addEventListener?.("resize", onEnv);
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
}

/** Call once before first paint (main.jsx bootApp). Returns the decision. */
export function initGlassUi(win) {
  const w = currentWindow(win);
  if (!w) return false;
  inputs = snapshotInputs(w);
  setEnabled(shouldEnableGlass(inputs), w);
  startWatchers(w);
  return enabled;
}

/** Re-read storage and the viewport (resize, or after the desktop glass flag lands). */
export function syncGlassUi(win) {
  const w = currentWindow(win);
  if (!w) return enabled;
  inputs = snapshotInputs(w);
  setEnabled(shouldEnableGlass(inputs), w);
  return enabled;
}

/**
 * Remote kill switch (publicFeatures.iosGlass). The value is cached so the next
 * cold start already respects it before the network answers. Mobile web follows
 * desktopGlass instead; this flag affects the native iPhone and Android apps.
 */
export function applyRemoteGlassFlag(value, win) {
  const w = currentWindow(win);
  if (!w || typeof value !== "boolean") return enabled;
  try {
    w.localStorage?.setItem(GLASS_REMOTE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  inputs = snapshotInputs(w, value);
  setEnabled(shouldEnableGlass(inputs), w);
  return enabled;
}
