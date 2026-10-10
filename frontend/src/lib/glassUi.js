/**
 * Liquid Glass UI gate (2.9.151, Stage 1 of /workspace/glass-redesign/uygulama-plani.md).
 *
 * Glass is iPhone-only for now: the native Capacitor iOS app on a phone-sized
 * screen. Web, Electron, Android and iPad never get `html.glass-ui`, and every
 * glass rule is scoped under that class, so they stay pixel-identical.
 *
 * Three switches, any one can turn it off:
 *   1. build flag  VITE_GLASS_UI=0           (emergency build without glass)
 *   2. remote flag publicFeatures.iosGlass   (admin kill switch, no new build;
 *                                             last value cached for the next boot)
 *   3. local override localStorage "descall:glass" = "0" | "1" (QA only)
 *
 * Dependency-free (window.Capacitor global, like lib/entryShell.js) so main.jsx
 * can call it before first paint without pulling @capacitor/core in.
 */

export const GLASS_CLASS = "glass-ui";
export const GLASS_OVERRIDE_KEY = "descall:glass";
export const GLASS_REMOTE_KEY = "descall:glass-remote";
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

function readBuildFlag() {
  try {
    const v = import.meta.env?.VITE_GLASS_UI;
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

/** Pure decision (unit-tested in glassUi.selftest.mjs). */
export function shouldEnableGlass({
  isNativeIos = false,
  isElectron = false,
  shortSide = 0,
  buildFlag = true,
  remoteFlag = true,
  override = null,
} = {}) {
  if (isElectron || !isNativeIos) return false;
  if (!(shortSide > 0 && shortSide < PHONE_MAX_SHORT_SIDE)) return false;
  if (override === "0") return false;
  if (override === "1") return true;
  if (buildFlag === false) return false;
  if (remoteFlag === false) return false;
  return true;
}

function snapshotInputs(w, remoteOverride) {
  const scr = w?.screen || {};
  const shortSide = Math.min(Number(scr.width) || w?.innerWidth || 0, Number(scr.height) || w?.innerHeight || 0);
  const cachedRemote = readStorage(w, GLASS_REMOTE_KEY);
  return {
    isNativeIos: isNativeIosShell(w),
    isElectron: Boolean(w?.electronAPI?.isElectron),
    shortSide,
    buildFlag: readBuildFlag(),
    remoteFlag: remoteOverride !== undefined ? remoteOverride : cachedRemote !== "0",
    override: readStorage(w, GLASS_OVERRIDE_KEY),
  };
}

let enabled = false;
let inputs = null;
const listeners = new Set();

export function isGlassUiEnabled() {
  return enabled;
}

export function subscribeGlassUi(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setEnabled(next, w) {
  const doc = w?.document?.documentElement;
  if (doc) doc.classList.toggle(GLASS_CLASS, next);
  if (next === enabled) return;
  enabled = next;
  listeners.forEach((l) => {
    try {
      l(enabled);
    } catch {
      /* ignore */
    }
  });
  if (next) {
    // Accessibility / power / device-tier classes come from the native bridge.
    import("./glassDisplay.js").then((m) => m.startGlassDisplay?.()).catch(() => {});
    // Long-press must not start WebKit text selection on chrome or bubbles.
    import("./glassTextSelection.js").then((m) => m.installGlassTextSelection?.(w)).catch(() => {});
  } else {
    import("./glassDisplay.js").then((m) => m.stopGlassDisplay?.()).catch(() => {});
  }
}

/** Call once before first paint (main.jsx bootApp). Returns the decision. */
export function initGlassUi(win) {
  const w = currentWindow(win);
  if (!w) return false;
  inputs = snapshotInputs(w);
  setEnabled(shouldEnableGlass(inputs), w);
  return enabled;
}

/**
 * Remote kill switch (publicFeatures.iosGlass). The value is cached so the next
 * cold start already respects it before the network answers.
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
