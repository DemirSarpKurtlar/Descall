/**
 * Per-conversation notification options, client side (messaging phase 4).
 * Server: GET/PUT /api/notify-prefs (backend/lib/notifyPrefs.js), which also
 * filters pushes. Here: the same rules for desktop / in-app notifications and
 * message sounds, the list's bell-off mark, and the options sheet.
 *
 * Pref: { convType: "dm"|"group", convId, level: "all"|"mentions"|"none", mutedUntil: ISO|null }.
 */

export const LEVELS = Object.freeze(["all", "mentions", "none"]);
export const MUTE_CHOICES = Object.freeze([
  { id: "1h", ms: 60 * 60 * 1000, label: "msg4.notify.mute1h" },
  { id: "8h", ms: 8 * 60 * 60 * 1000, label: "msg4.notify.mute8h" },
  { id: "24h", ms: 24 * 60 * 60 * 1000, label: "msg4.notify.mute24h" },
  { id: "7d", ms: 7 * 24 * 60 * 60 * 1000, label: "msg4.notify.mute7d" },
]);
export const OPEN_NOTIFY_OPTIONS_EVENT = "descall:notify-options";
const STORE_KEY = "descall:notify-prefs:v1";

let prefs = load(); // { "dm:<id>": pref }
const listeners = new Set();

function load() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
function emit() {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

export const prefKey = (convType, convId) => `${convType}:${convId}`;

/** 'all' | 'mentions' | 'none' right now. */
export function effectiveLevel(pref, now = Date.now()) {
  if (!pref) return "all";
  const until = pref.mutedUntil ? Date.parse(pref.mutedUntil) : NaN;
  if (Number.isFinite(until) && until > now) return "none";
  return LEVELS.includes(pref.level) ? pref.level : "all";
}

export function allows(level, { mention = false } = {}) {
  if (level === "none") return false;
  if (level === "mentions") return Boolean(mention);
  return true;
}

export function getPref(convType, convId) {
  return convId ? prefs[prefKey(convType, convId)] || null : null;
}

/** May a message in this chat notify (desktop card, sound)? */
export function allowNotify(convType, convId, { mention = false, now = Date.now() } = {}) {
  return allows(effectiveLevel(getPref(convType, convId), now), { mention });
}

/** Store one pref (from the server, another device, or an optimistic change). */
export function putPref(pref) {
  if (!pref?.convType || !pref?.convId) return;
  const k = prefKey(pref.convType, pref.convId);
  const isDefault = (pref.level || "all") === "all" && !pref.mutedUntil;
  const next = { ...prefs };
  if (isDefault) delete next[k];
  else next[k] = { convType: pref.convType, convId: pref.convId, level: pref.level || "all", mutedUntil: pref.mutedUntil || null };
  prefs = next;
  save();
  emit();
}

export function replaceAllPrefs(list) {
  const next = {};
  for (const p of Array.isArray(list) ? list : []) {
    if (p?.convType && p?.convId) next[prefKey(p.convType, p.convId)] = { convType: p.convType, convId: p.convId, level: p.level || "all", mutedUntil: p.mutedUntil || null };
  }
  prefs = next;
  save();
  emit();
}

export function subscribePrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getPrefsSnapshot() {
  return prefs;
}

/** ISO time a mute choice ends. */
export function muteUntil(choiceId, now = Date.now()) {
  const c = MUTE_CHOICES.find((x) => x.id === choiceId);
  return c ? new Date(now + c.ms).toISOString() : null;
}

/** Ask the app shell to open the options sheet for a chat. */
export function openNotifyOptions({ convType, convId, name }) {
  if (typeof window === "undefined" || !convType || !convId) return;
  window.dispatchEvent(new CustomEvent(OPEN_NOTIFY_OPTIONS_EVENT, { detail: { convType, convId, name: name || "" } }));
}

export function __resetNotifyPrefsForTest() {
  prefs = {};
  listeners.clear();
}
