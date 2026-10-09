/**
 * Native display state for the Liquid Glass UI (iOS app only; loaded lazily by
 * lib/glassUi.js once glass is on).
 *
 * WKWebView does not expose Reduce Transparency (no prefers-reduced-transparency
 * in WebKit) or Low Power Mode to CSS, so DescallDisplayPlugin.swift reports:
 *   reduceTransparency → html.a11y-solid    (opaque surfaces, no blur)
 *   darkerColors       → html.a11y-contrast (near-opaque + defined border; CSS
 *                                            prefers-contrast: more does the same)
 *   lowPower / thermal serious|critical / old device / measured jank
 *                      → html.glass-lite    (lighter blur, no saturation boost)
 * Reduce Motion is read by CSS/JS directly (prefers-reduced-motion works in WebKit).
 */
import { registerPlugin } from "@capacitor/core";

export const DISPLAY_CLASSES = Object.freeze({
  solid: "a11y-solid",
  contrast: "a11y-contrast",
  lite: "glass-lite",
  tierLow: "glass-tier-low",
  tierMid: "glass-tier-mid",
});

/**
 * Device tier from the hardware identifier (utsname.machine, e.g. "iPhone14,2").
 *   low  = A11 and older (iPhone10,x and below: X, 8, 7, 6s, SE 1)
 *   mid  = A12–A14 (iPhone11,x … iPhone13,x: XS/XR, 11, 12)
 *   high = A15+ (iPhone14,x and newer)
 * Simulator / unknown → high.
 */
export function deviceTier(machine) {
  const m = /^iPhone(\d+),\d+$/.exec(String(machine || ""));
  if (!m) return "high";
  const major = Number(m[1]);
  if (major <= 10) return "low";
  if (major <= 13) return "mid";
  return "high";
}

/** Why the lighter material is used (empty = full material). */
export function liteReasons({ lowPower = false, thermal = "nominal", tier = "high", jank = false } = {}) {
  const out = [];
  if (lowPower) out.push("lowPower");
  if (thermal === "serious" || thermal === "critical") out.push("thermal");
  if (tier === "low") out.push("device");
  if (jank) out.push("jank");
  return out;
}

/**
 * Frame sentinel: share of frames slower than 32 ms (two missed 60 Hz vsyncs).
 * jank when ≥ 120 samples and > 10 % slow (uygulama-plani.md §2.6).
 */
export function isJanky(intervals, { minSamples = 120, slowMs = 32, maxRatio = 0.1 } = {}) {
  const list = Array.isArray(intervals) ? intervals.filter((n) => Number.isFinite(n) && n > 0 && n < 1000) : [];
  if (list.length < minSamples) return false;
  const slow = list.filter((n) => n > slowMs).length;
  return slow / list.length > maxRatio;
}

let plugin = null;
let listenerHandle = null;
let state = { reduceTransparency: false, darkerColors: false, lowPower: false, thermal: "nominal", machine: "" };
let jank = false;
let sentinelStop = null;
let themeObserver = null;
let lastStatusStyle = null;

/** Status-bar content for a glass scheme: light themes need black content. */
export function statusBarStyleFor(scheme) {
  return String(scheme || "").trim() === "light" ? "dark" : "light";
}

function syncStatusBar(force = false) {
  if (!plugin || typeof document === "undefined" || typeof getComputedStyle !== "function") return;
  let scheme = "dark";
  try {
    scheme = getComputedStyle(document.documentElement).getPropertyValue("--g-scheme") || "dark";
  } catch {
    /* ignore */
  }
  const style = statusBarStyleFor(scheme);
  if (!force && style === lastStatusStyle) return;
  lastStatusStyle = style;
  plugin.setStatusBarStyle?.({ style })?.catch?.(() => {});
}

function watchTheme() {
  if (themeObserver || typeof MutationObserver !== "function" || typeof document === "undefined") return;
  themeObserver = new MutationObserver(() => syncStatusBar());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
}

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const tier = deviceTier(state.machine);
  const reasons = liteReasons({ lowPower: state.lowPower, thermal: state.thermal, tier, jank });
  root.classList.toggle(DISPLAY_CLASSES.solid, Boolean(state.reduceTransparency));
  root.classList.toggle(DISPLAY_CLASSES.contrast, Boolean(state.darkerColors));
  root.classList.toggle(DISPLAY_CLASSES.lite, reasons.length > 0);
  root.classList.toggle(DISPLAY_CLASSES.tierLow, tier === "low");
  root.classList.toggle(DISPLAY_CLASSES.tierMid, tier === "mid");
  if (reasons.length) root.setAttribute("data-glass-lite", reasons.join(" "));
  else root.removeAttribute("data-glass-lite");
}

function merge(next) {
  if (!next || typeof next !== "object") return;
  state = {
    reduceTransparency: next.reduceTransparency === true,
    darkerColors: next.darkerColors === true,
    lowPower: next.lowPower === true,
    thermal: typeof next.thermal === "string" ? next.thermal : "nominal",
    machine: typeof next.machine === "string" ? next.machine : state.machine,
  };
  apply();
}

function startSentinel() {
  if (typeof requestAnimationFrame !== "function" || sentinelStop) return;
  const intervals = [];
  let last = 0;
  let raf = 0;
  let stopped = false;
  const startAt = Date.now() + 2000; // skip the boot frames
  const endAt = startAt + 8000;
  const loop = (t) => {
    if (stopped) return;
    const now = Date.now();
    if (now >= startAt && typeof document !== "undefined" && document.visibilityState === "visible") {
      if (last) intervals.push(t - last);
      last = t;
    } else {
      last = 0;
    }
    if (now >= endAt) {
      stopped = true;
      if (isJanky(intervals)) {
        jank = true;
        apply();
      }
      return;
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  sentinelStop = () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
  };
}

export async function startGlassDisplay() {
  apply();
  startSentinel();
  try {
    if (!plugin) plugin = registerPlugin("DescallDisplay");
    merge(await plugin.getState());
    if (!listenerHandle) {
      listenerHandle = await plugin.addListener("change", (next) => merge(next));
    }
    syncStatusBar(true);
    watchTheme();
  } catch {
    /* older shell without the plugin: full material, CSS media queries still apply */
  }
}

export function stopGlassDisplay() {
  try {
    listenerHandle?.remove?.();
  } catch {
    /* ignore */
  }
  listenerHandle = null;
  themeObserver?.disconnect();
  themeObserver = null;
  // Back to the pre-glass default (white status-bar content).
  if (plugin && lastStatusStyle === "dark") plugin.setStatusBarStyle?.({ style: "light" })?.catch?.(() => {});
  lastStatusStyle = null;
  sentinelStop?.();
  sentinelStop = null;
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  Object.values(DISPLAY_CLASSES).forEach((c) => root.classList.remove(c));
  root.removeAttribute("data-glass-lite");
}
