/**
 * Small helpers shared by the gaming / productivity features:
 *  - pinvoke / pon: the Electron premium bridge (window.descallPremium), safe on web
 *  - app bridge: the host (PremiumGamingHost) publishes app data and actions here so the
 *    settings panels, which render elsewhere, can use them (useAppBridge)
 *  - local stores: per-feature JSON in localStorage with a hook (useLocalStore)
 *  - premium events: a capped local log of key events for the activity timeline
 */
import { useCallback, useSyncExternalStore } from "react";

export function premiumBridge() {
  return typeof window !== "undefined" && window.descallPremium ? window.descallPremium : null;
}

export function isDesktop() {
  return Boolean(premiumBridge());
}

/** Invoke a premium channel; resolves { ok:false } on web or when the feature is off. */
export async function pinvoke(channel, ...args) {
  const b = premiumBridge();
  if (!b) return { ok: false, error: "web" };
  try {
    const r = await b.invoke(channel, ...args);
    return r == null ? { ok: false } : r;
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Short code for a failed pinvoke / request, shown under the panel so a report says what
 * broke: "locked" = main has not started the feature (membership not verified on this
 * computer yet, or the feature is off), "forbidden", "network", "http-403", ...
 */
export function failCode(r) {
  const e = String(r?.error ?? "");
  if (/no handler registered|^locked$/i.test(e)) return "locked";
  if (/failed to fetch|networkerror|network|timeout/i.test(e)) return "network";
  const code = String(r?.code ?? "").replace(/[^\w-]/g, "").slice(0, 32);
  if (code) return code;
  const status = Number(r?.status) || 0;
  if (status) return `http-${status}`;
  return e.replace(/[^\w-]/g, "").slice(0, 32) || "unknown";
}

/** Send a failed Descall+ action to admin Error logs (lazy, deduplicated per session). */
export function reportFailure(feature, r) {
  const code = failCode(r);
  import("../../utils/errorHandler.js")
    .then((m) => m.reportHandled(`[premium] ${String(feature).slice(0, 40)} failed: ${code}`, { source: "premium" }))
    .catch(() => {});
}

/** Localized failure line with its code, e.g. "... Try again. (Code: locked)". */
export function failMessage(t, r) {
  const code = failCode(r);
  const text = code === "locked"
    ? t("premiumGaming.common.locked")
    : code === "network"
      ? t("premiumGaming.common.offline")
      : t("premiumGaming.common.failed");
  return `${text} (${t("premiumGaming.common.code", { code })})`;
}

export function pon(channel, cb) {
  const b = premiumBridge();
  if (!b) return () => {};
  try { return b.on(channel, cb) || (() => {}); } catch { return () => {}; }
}

// ---- app bridge ---------------------------------------------------------------------

let appState = { ready: false };
const appListeners = new Set();

export function setAppBridge(next) {
  appState = { ...appState, ...next, ready: true };
  for (const fn of [...appListeners]) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function getAppBridge() {
  return appState;
}

function subscribeApp(fn) {
  appListeners.add(fn);
  return () => appListeners.delete(fn);
}

export function useAppBridge() {
  return useSyncExternalStore(subscribeApp, getAppBridge, getAppBridge);
}

// ---- local stores -------------------------------------------------------------------

const PREFIX = "descall:pg:";
const storeCache = new Map();
const storeListeners = new Map();

export function readLocal(name, fallback) {
  if (storeCache.has(name)) return storeCache.get(name);
  let v = fallback;
  try {
    const raw = localStorage.getItem(PREFIX + name);
    if (raw) v = JSON.parse(raw);
  } catch { /* private mode */ }
  if (v == null) v = fallback;
  storeCache.set(name, v);
  return v;
}

export function writeLocal(name, value) {
  storeCache.set(name, value);
  try { localStorage.setItem(PREFIX + name, JSON.stringify(value)); } catch { /* quota */ }
  for (const fn of [...(storeListeners.get(name) || [])]) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function useLocalStore(name, fallback) {
  const sub = useCallback((fn) => {
    if (!storeListeners.has(name)) storeListeners.set(name, new Set());
    storeListeners.get(name).add(fn);
    return () => storeListeners.get(name)?.delete(fn);
  }, [name]);
  const get = useCallback(() => readLocal(name, fallback), [name, fallback]);
  const value = useSyncExternalStore(sub, get, get);
  const set = useCallback((next) => {
    const cur = readLocal(name, fallback);
    writeLocal(name, typeof next === "function" ? next(cur) : next);
  }, [name, fallback]);
  return [value, set];
}

// ---- event log (timeline) -----------------------------------------------------------

const EVENT_CAP = 400;
const EMPTY = [];

export function logPremiumEvent(kind, label) {
  const list = readLocal("events", EMPTY);
  writeLocal("events", [...list, { at: new Date().toISOString(), kind: String(kind).slice(0, 24), label: String(label || "").slice(0, 80) }].slice(-EVENT_CAP));
}

export function premiumEvents() {
  return readLocal("events", EMPTY);
}

/** Theme accent as "r, g, b" for the overlay windows. */
export function brandRgb() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--g-brand-rgb").trim();
    return /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(v) ? v : "";
  } catch {
    return "";
  }
}
