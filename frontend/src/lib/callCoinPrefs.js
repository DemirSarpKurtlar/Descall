/* End-of-call DesCoin summary (owner pick: draft C with B's receipt rows, Nov 2026).
   Pure client rules, no React:
     - the user's setting (on / off + minimum DesCoin earned to show it), kept in the
       shared settings blob (descall_user_settings, like Settings › Görünüm) and synced
       to the account by lib/appearanceSync.js (PUT /api/me/appearance)
     - whether one `descoin:call-summary` payload is shown on this device: setting,
       threshold, once per session id, and only on a device that was in the call
     - small view helpers (ring fractions, durations, countdown)
   Test: src/lib/callCoinPrefs.selftest.mjs */
import { SETTINGS_KEY, LEGACY_SETTINGS_KEY, readStoredSettings } from "./appearancePrefs.js";

export const CALL_COIN_THRESHOLDS = Object.freeze([1, 5, 10, 25, 50]);
export const DEFAULT_CALL_COIN_THRESHOLD = 5;
export const CALL_COIN_PREFS_EVENT = "descall:call-coin-prefs";
export const CALL_COIN_SYNC_KEYS = Object.freeze(["callCoinSummary", "callCoinThreshold"]);
const SEEN_KEY = "descall:call-coin-seen";
const SEEN_MAX = 40;
/** A server-driven summary is shown only where this device took part in the call recently. */
const DEVICE_WINDOW_MS = 15 * 60_000;

export function normalizeCallCoinPrefs(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const threshold = CALL_COIN_THRESHOLDS.includes(src.callCoinThreshold) ? src.callCoinThreshold : DEFAULT_CALL_COIN_THRESHOLD;
  return { enabled: src.callCoinSummary !== false, threshold };
}

/** Only well-formed keys survive (same rule as backend/lib/appearanceSettings.js). */
export function sanitizeCallCoinPatch(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  if (typeof src.callCoinSummary === "boolean") out.callCoinSummary = src.callCoinSummary;
  if (Number.isInteger(src.callCoinThreshold) && CALL_COIN_THRESHOLDS.includes(src.callCoinThreshold)) {
    out.callCoinThreshold = src.callCoinThreshold;
  }
  return out;
}

function defaultStorage() {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

export function readCallCoinPrefs(storage = defaultStorage()) {
  return normalizeCallCoinPrefs(readStoredSettings(storage));
}

/** Synced shape for the account copy. */
export function callCoinSyncFields(prefs) {
  const p = normalizeCallCoinPrefs(prefs && "enabled" in prefs ? { callCoinSummary: prefs.enabled, callCoinThreshold: prefs.threshold } : prefs);
  return { callCoinSummary: p.enabled, callCoinThreshold: p.threshold };
}

/** Merges into the shared settings blob; `updatedAt` moves the appearance clock so the account sync picks the newest copy. */
export function writeCallCoinPrefs(patch, { storage = defaultStorage(), updatedAt } = {}) {
  if (!storage) return readCallCoinPrefs(null);
  const cur = readStoredSettings(storage);
  const clean = sanitizeCallCoinPatch(patch);
  const blob = { ...cur, ...clean };
  if (updatedAt) blob.appearanceUpdatedAt = updatedAt;
  const json = JSON.stringify(blob);
  try {
    storage.setItem(SETTINGS_KEY, json);
    storage.setItem(LEGACY_SETTINGS_KEY, json);
  } catch {
    /* quota / private mode */
  }
  return normalizeCallCoinPrefs(blob);
}

/** Setting on and the call earned at least the threshold. */
export function passesThreshold(summary, prefs) {
  const p = prefs && "enabled" in prefs ? prefs : normalizeCallCoinPrefs(prefs);
  if (!p.enabled) return false;
  const earned = Math.floor(Number(summary?.earnedTotal) || 0);
  return earned > 0 && earned >= p.threshold;
}

/** "dm:<peer>" | "group:<id>" | "server:<channel>" from a heartbeat context or a summary. */
export function callContextKey(ctx = {}) {
  const c = ctx.context;
  if (c === "dm") return ctx.peerId ? `dm:${ctx.peerId}` : ctx.display?.id ? `dm:${ctx.display.id}` : null;
  if (c === "group") return ctx.groupId ? `group:${ctx.groupId}` : ctx.display?.id ? `group:${ctx.display.id}` : null;
  if (c === "server") {
    const id = ctx.channelId || ctx.display?.id;
    return id ? `server:${String(id).toLowerCase()}` : null;
  }
  return null;
}

/* Calls this device took part in (heartbeat running), in memory. */
const deviceCalls = new Map(); // key -> last seen ms

export function markCallContextSeen(ctx, now = Date.now()) {
  const key = typeof ctx === "string" ? ctx : callContextKey(ctx);
  if (!key) return;
  deviceCalls.set(key, now);
  if (deviceCalls.size > 50) deviceCalls.delete(deviceCalls.keys().next().value);
}

export function wasInCallOnThisDevice(summary, now = Date.now()) {
  const key = callContextKey(summary);
  const at = key ? deviceCalls.get(key) : null;
  return Boolean(at && now - at <= DEVICE_WINDOW_MS);
}

export function _resetDeviceCalls() {
  deviceCalls.clear();
}

function readSeen(storage) {
  try {
    const list = JSON.parse(storage?.getItem(SEEN_KEY) || "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Once per session id, across tabs of this browser. Returns true the first time. */
export function claimSummary(sessionId, storage = defaultStorage()) {
  if (!sessionId) return false;
  const seen = readSeen(storage);
  if (seen.includes(sessionId)) return false;
  try {
    storage?.setItem(SEEN_KEY, JSON.stringify([...seen, sessionId].slice(-SEEN_MAX)));
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Show this payload here? Valid payload, setting + threshold, the device that left
 * (origin "self") or a device that was in the call, and not shown before.
 * Returns { show, reason }.
 */
export function decideCallCoinSummary(summary, { prefs, storage = defaultStorage(), now = Date.now() } = {}) {
  if (!summary || typeof summary !== "object" || !summary.sessionId) return { show: false, reason: "invalid" };
  if (!["dm", "group", "server"].includes(summary.context)) return { show: false, reason: "invalid" };
  const p = prefs || readCallCoinPrefs(storage);
  if (!p.enabled) return { show: false, reason: "off" };
  if (!passesThreshold(summary, p)) return { show: false, reason: "threshold" };
  if (summary.origin !== "self" && !wasInCallOnThisDevice(summary, now)) return { show: false, reason: "other-device" };
  if (!claimSummary(summary.sessionId, storage)) return { show: false, reason: "duplicate" };
  return { show: true, reason: "ok" };
}

/* ---------------------------------------------------------------- view helpers */

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

/** Ring arcs: earlier today (0..1), this call (0..1, after it), rest. */
export function ringFractions({ todayBefore = 0, earnedTotal = 0, todayCap = 400 } = {}) {
  const cap = Math.max(1, Number(todayCap) || 400);
  const before = clamp01(todayBefore / cap);
  const call = Math.min(1 - before, clamp01(earnedTotal / cap));
  return { before, call, rest: Math.max(0, 1 - before - call) };
}

/** Seconds -> { h, m, s }. */
export function splitDuration(sec) {
  const total = Math.max(0, Math.floor(Number(sec) || 0));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/** Whole minutes for "26 dakika aktif konuştun" (at least 1 when any activity). */
export function activeMinutes(sec) {
  const n = Math.max(0, Number(sec) || 0);
  return n <= 0 ? 0 : Math.max(1, Math.round(n / 60));
}

/** Countdown parts until `endsAt` ("05:12:44"); null when over or missing. */
export function countdownParts(endsAt, now = Date.now()) {
  const t = Date.parse(endsAt || "");
  if (!Number.isFinite(t)) return null;
  const left = Math.floor((t - now) / 1000);
  if (left <= 0) return null;
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return { d, h, m, s, clock: `${pad(h)}:${pad(m)}:${pad(s)}` };
}

/** Image URLs from the server may be relative to the API host (native apps load from a custom scheme). */
export function absoluteAssetUrl(url, apiBase = "") {
  const u = String(url || "");
  if (!u) return null;
  if (/^(https?:|data:image\/)/i.test(u)) return u;
  if (u.startsWith("/")) return `${String(apiBase || "").replace(/\/+$/, "")}${u}`;
  return null;
}
