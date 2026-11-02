/**
 * Descall+ notification runtime: focus_mode, notification_profiles,
 * smart_game_notifications and notification_history, applied inside
 * lib/notificationService.js and lib/audioManager.js.
 *
 * Every hook returns "no change" unless the membership includes the key
 * (hasPremiumFeature), so free users see exactly today's behaviour.
 * Works on web and desktop; game detection (smart game notifications) exists
 * only in the desktop app (activity scan), so that part is desktop-only.
 */
import { getFeatureSettings, onFeatureSettings, setFeatureSettings } from "../featureSettings.js";
import { hasPremiumFeature } from "../premiumStore.js";
import { categoryOf, currentActivity, decide, focusActive, resolveProfile, summarizeDeferred } from "./notifyRules.js";
import { notificationHistory } from "./notificationHistory.js";

export const NOTIFY_KEYS = Object.freeze(["focus_mode", "notification_profiles", "smart_game_notifications", "notification_history"]);

export const NOTIFY_DEFAULTS = Object.freeze({
  focus_mode: Object.freeze({ until: 0, allowCalls: true, allowDms: false, lastMinutes: 60 }),
  notification_profiles: Object.freeze({ mode: "auto", profiles: {}, schedule: { workingDays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }, scheduleOn: false }),
  smart_game_notifications: Object.freeze({ enabled: true, summary: true }),
  notification_history: Object.freeze({ enabled: true, recordAll: false }),
});

const mirror = new Map();
const listeners = new Set();
let started = false;
let game = { active: false, name: "" };
const deferred = [];
let flusher = null;

export function notifySettings(key) {
  return { ...(NOTIFY_DEFAULTS[key] || {}), ...(mirror.get(key) || {}) };
}

function emit(key) {
  for (const fn of [...listeners]) {
    try { fn(key); } catch { /* ignore */ }
  }
}

export function onNotifySettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function updateNotifySettings(key, patch) {
  const next = await setFeatureSettings(key, patch);
  mirror.set(key, next || {});
  emit(key);
  return next;
}

function windowFocused() {
  try {
    return typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
  } catch {
    return false;
  }
}

/** Mirror settings and follow game activity (desktop activity scan). */
export function startPremiumNotifyRuntime() {
  if (started) return;
  started = true;
  onFeatureSettings((key, value) => {
    if (!NOTIFY_KEYS.includes(key)) return;
    mirror.set(key, value || {});
    emit(key);
  });
  for (const key of NOTIFY_KEYS) {
    getFeatureSettings(key).then((v) => { mirror.set(key, v || {}); emit(key); }).catch(() => {});
  }
  if (typeof window !== "undefined") {
    window.addEventListener("descall:activity", (event) => {
      const d = event?.detail || null;
      const active = Boolean(d && d.appType === "game");
      const was = game.active;
      game = { active, name: active ? String(d.displayName || d.appName || "") : "" };
      if (was && !active) flushDeferred();
    });
  }
}

function features() {
  return {
    focus_mode: hasPremiumFeature("focus_mode"),
    notification_profiles: hasPremiumFeature("notification_profiles"),
    smart_game_notifications: hasPremiumFeature("smart_game_notifications") && notifySettings("smart_game_notifications").enabled !== false,
  };
}

function historyOn() {
  return hasPremiumFeature("notification_history") && notifySettings("notification_history").enabled !== false;
}

/** Focus mode state for the UI and tray. */
export function focusState(nowMs = Date.now()) {
  const s = notifySettings("focus_mode");
  return { active: hasPremiumFeature("focus_mode") && focusActive(s, nowMs), until: Number(s.until) || 0 };
}

/** Start focus for `minutes` (0 ends it). Returns the end time. */
export async function setFocus(minutes) {
  const m = Math.max(0, Math.min(24 * 60, Math.round(Number(minutes) || 0)));
  const until = m ? Date.now() + m * 60000 : 0;
  await updateNotifySettings("focus_mode", { until, ...(m ? { lastMinutes: m } : {}) });
  mirrorFocusToMain(until);
  if (!m) flushDeferred();
  return until;
}

export function mirrorFocusToMain(until = notifySettings("focus_mode").until) {
  try {
    const b = typeof window !== "undefined" ? window.descallPremium : null;
    if (b && hasPremiumFeature("focus_mode")) b.invoke("premium:focus_mode:state", { until: Number(until) || 0 }).catch(() => {});
  } catch { /* ignore */ }
}

/**
 * Called by notificationService.show() right before a notification is shown
 * (after its own "window focused" check). Returns null when Descall+ has
 * nothing to say, else { show, silent, style }.
 */
export function premiumNotifyGate(n = {}) {
  const f = features();
  const anyRule = f.focus_mode || f.notification_profiles || f.smart_game_notifications;
  const record = historyOn();
  if (!anyRule && !record) return null;
  const nowMs = Date.now();
  const p = notifySettings("notification_profiles");
  const result = anyRule
    ? decide({
      data: n.data,
      requireInteraction: n.requireInteraction,
      nowMs,
      features: f,
      focus: notifySettings("focus_mode"),
      profiles: p.profiles,
      profileMode: p.mode,
      schedule: p.scheduleOn ? p.schedule : null,
      gameActive: game.active,
      appFocused: windowFocused(),
    })
    : { show: true, sound: true, style: "capsule", defer: false, reason: "default", category: categoryOf(n.data) };

  // Calls are tracked by the call UI (missed-call entries cover them).
  if (record && result.category !== "call") {
    try {
      notificationHistory().add({ title: n.title, body: n.body, data: n.data, tag: n.tag, category: result.category, reason: result.reason });
    } catch { /* ignore */ }
  }
  if (result.defer && notifySettings("smart_game_notifications").summary !== false) {
    deferred.push({ from: n.data?.from || n.title || "", at: nowMs });
    if (deferred.length > 100) deferred.shift();
  }
  return { show: result.show, silent: !result.sound, style: result.style, reason: result.reason };
}

/** audioManager hook: may block message / notification sounds (focus, profiles). */
const MESSAGE_SOUNDS = new Set(["message", "mention", "notification", "friendRequest", "messageRequest"]);
export function premiumSoundAllowed(type) {
  if (!MESSAGE_SOUNDS.has(type)) return true;
  if (focusState().active) return false;
  if (hasPremiumFeature("notification_profiles")) {
    const p = notifySettings("notification_profiles");
    const activity = currentActivity({ mode: p.mode, gameActive: game.active, schedule: p.scheduleOn ? p.schedule : null });
    const r = resolveProfile(activity, p.profiles).rules;
    if (!r.dm.sound && !r.group.sound && !r.server.sound && !r.mention.sound) return false;
  }
  if (features().smart_game_notifications && game.active && !windowFocused()) return false;
  return true;
}

/** notificationService registers how to show the after-game summary. */
export function setDeferredFlusher(fn) {
  flusher = typeof fn === "function" ? fn : null;
}

export function flushDeferred() {
  if (!deferred.length) return null;
  const summary = summarizeDeferred(deferred.splice(0));
  try { flusher?.(summary); } catch { /* ignore */ }
  return summary;
}

/** Test / UI hooks. */
export function __setGame(active, name = "") {
  const was = game.active;
  game = { active: Boolean(active), name };
  if (was && !game.active) flushDeferred();
}
export function gameState() {
  return { ...game };
}
export function deferredCount() {
  return deferred.length;
}
