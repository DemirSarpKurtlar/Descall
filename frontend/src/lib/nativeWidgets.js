/**
 * Home / lock screen widgets and the live call (widgets draft B "Yuzler"), the web app's side.
 * One module for both shells; the Capacitor plugin is "DescallWidgets" on iOS
 * (ios/App/App/DescallWidgetsPlugin.swift: WidgetKit + ActivityKit) and on Android.
 *
 *   setFavorites  the 8 numbered favourite faces + widget preferences (settings page and the
 *                 widget's own configuration share them; the first face is the single-person
 *                 lock screen widget, every favourite gets a Siri shortcut)
 *   reload        a timeline reload for some widget kinds, after a socket event changed what
 *                 they show (scheduler below: coalesced and spaced out)
 *   callActivity  the Live Activity / Dynamic Island of the running call: title, faces, who is
 *                 speaking right now (pickSpeaker), mute state, timer start
 *   getState      what the shell supports and which widgets the user placed
 *
 * Pure helpers are exported for nativeWidgets.selftest.mjs; the React glue is
 * hooks/useNativeWidgets.js. Web, Electron, Tauri and older shells: every call is a no-op.
 */

import { nativePlatform, safeAvatarUrl } from "./nativeIntents.js";

export const WIDGET_KINDS = Object.freeze(["friends", "unread", "voice", "call"]);
export const MAX_FAVORITES = 8;
export const MAX_CALL_FACES = 6;
export const FAVORITES_KEY = "descall.widgets.favorites.v1";
export const DEFAULT_PREFS = Object.freeze({ showActivity: true, waveButton: true, showPreview: true });
export const PLUGIN_TIMEOUT_MS = 2500;
/** Waves a user may send per day (backend lib/friendWave.js WAVES_PER_FRIEND, shown in Settings). */
export const WAVES_PER_FRIEND = 5;

/**
 * Shortest gap between two reloads of one kind (ms). WidgetKit does not count reloads asked
 * by an app in the foreground against the daily budget, but each one still costs the
 * extension a network round trip: presence flickers and message bursts are coalesced.
 */
export const RELOAD_SPACING_MS = Object.freeze({ friends: 20000, unread: 8000, voice: 12000, call: 3000 });
/** Shortest gap between two Live Activity updates for a speaker change (ms). */
export const SPEAKER_SPACING_MS = 1200;

const ID_RE = /^[0-9A-Za-z-]{1,64}$/;

function str(v, max = 80) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Same rule as the native side (DescallText.initials) and the web letter avatar. */
export function initialsOf(name) {
  const parts = String(name || "")
    .trim()
    .replace(/^@+/, "")
    .split(/[\s._-]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (!parts.length) return "?";
  const out = parts[0][0] + (parts.length > 1 ? parts[1][0] : "");
  return out.toLocaleUpperCase("tr-TR");
}

function personOf(u) {
  if (!u?.id || !ID_RE.test(String(u.id))) return null;
  const name = str(u.displayName || u.display_name || u.name || u.username || "", 60) || "?";
  return {
    id: String(u.id),
    name,
    username: str(u.username || "", 64) || null,
    avatarUrl: safeAvatarUrl(u.avatarUrl || u.avatar_url || "") || null,
    initials: initialsOf(name),
  };
}

// ---- favourites and preferences -----------------------------------------------------------

/**
 * Valid, unique ids in the user's order, at most MAX_FAVORITES. With `friendIds` (a Set or
 * array) every id that is no longer a friend drops out (removed friend, blocked).
 */
export function normalizeFavorites(ids, friendIds = null) {
  const allow = friendIds ? new Set([...friendIds].map(String)) : null;
  const out = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw ?? "");
    if (!ID_RE.test(id) || out.includes(id)) continue;
    if (allow && !allow.has(id)) continue;
    out.push(id);
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

export function normalizePrefs(p) {
  const src = p && typeof p === "object" ? p : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_PREFS)) {
    out[key] = typeof src[key] === "boolean" ? src[key] : DEFAULT_PREFS[key];
  }
  return out;
}

/** Tap on a face in the picker: add it at the end, or remove it (the rest close up). */
export function toggleFavorite(ids, id) {
  const list = normalizeFavorites(ids);
  const key = String(id ?? "");
  if (list.includes(key)) return list.filter((x) => x !== key);
  if (list.length >= MAX_FAVORITES || !ID_RE.test(key)) return list;
  return [...list, key];
}

/** Drag in the picker: move the face at `from` to `to`. */
export function moveFavorite(ids, from, to) {
  const list = normalizeFavorites(ids);
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/**
 * Faces the shell needs to draw the favourites (names, avatars) without a request.
 * The first friends online fill an empty list, so a new user still sees faces.
 */
export function favoritePeople(ids, friends = []) {
  const byId = new Map((Array.isArray(friends) ? friends : []).filter((f) => f?.id).map((f) => [String(f.id), f]));
  return normalizeFavorites(ids)
    .map((id) => personOf(byId.get(id)))
    .filter(Boolean);
}

/** Suggested order when the user has not picked anyone yet: online first, then by name. */
export function suggestedFavorites(friends = [], max = MAX_FAVORITES) {
  const rank = { online: 0, idle: 1, dnd: 2 };
  return (Array.isArray(friends) ? friends : [])
    .filter((f) => f?.id && ID_RE.test(String(f.id)))
    .map((f) => ({ id: String(f.id), r: rank[f.status] ?? 3, n: str(f.displayName || f.display_name || f.username || "", 60) }))
    .sort((a, b) => a.r - b.r || a.n.localeCompare(b.n, "tr"))
    .slice(0, max)
    .map((f) => f.id);
}

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** { favorites, prefs, picked } from localStorage (picked: the user chose the list). */
export function readWidgetSettings(store = storage()) {
  try {
    const raw = store?.getItem(FAVORITES_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return { favorites: normalizeFavorites(v?.favorites), prefs: normalizePrefs(v?.prefs), picked: v?.picked === true };
  } catch {
    return { favorites: [], prefs: normalizePrefs(null), picked: false };
  }
}

let settings = null;
const listeners = new Set();

export function getWidgetSettings() {
  if (!settings) settings = readWidgetSettings();
  return settings;
}

export function subscribeWidgetSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Save (and announce) a change; `patch` may carry favorites and / or prefs. */
export function updateWidgetSettings(patch = {}, store = storage()) {
  const cur = getWidgetSettings();
  const next = {
    favorites: patch.favorites !== undefined ? normalizeFavorites(patch.favorites) : cur.favorites,
    prefs: patch.prefs !== undefined ? normalizePrefs({ ...cur.prefs, ...patch.prefs }) : cur.prefs,
    picked: patch.favorites !== undefined ? true : cur.picked,
  };
  if (JSON.stringify(next) === JSON.stringify(cur)) return cur;
  settings = next;
  try {
    store?.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {
    /* private mode: kept for this session */
  }
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* a listener's own problem */
    }
  }
  return next;
}

/** Sign-out: another account must not inherit the faces. */
export function clearWidgetSettings(store = storage()) {
  settings = { favorites: [], prefs: normalizePrefs(null), picked: false };
  try {
    store?.removeItem(FAVORITES_KEY);
  } catch {
    /* ignore */
  }
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

// ---- live call (Live Activity, Dynamic Island, lock screen card, StandBy) ----------------

/**
 * Who the Live Activity shows. The face follows the speaker: the first one speaking who is
 * not me; during a pause the last speaker stays (no flicker between sentences) as long as
 * they are still in the call; when only I speak, me.
 *
 * @param {string|null} prev       speaker shown now
 * @param {string[]} active        ids speaking right now (loudest first)
 * @param {string} myId
 * @param {Set|string[]} present   ids in the call (prev must still be one of them)
 */
export function pickSpeaker(prev, active = [], myId = "", present = null) {
  const here = present ? new Set([...present].map(String)) : null;
  const ids = (Array.isArray(active) ? active : []).map(String).filter((id) => !here || here.has(id) || id === String(myId));
  const other = ids.find((id) => id !== String(myId));
  if (other) return other;
  if (prev && (!here || here.has(String(prev)) || String(prev) === String(myId))) return String(prev);
  if (ids.includes(String(myId))) return String(myId);
  return null;
}

/**
 * The payload for DescallWidgets.callActivity, or { active: false }.
 *
 * @param {object} a
 * @param {object} a.state        callStatePayload() (kind, title, muted, deafened)
 * @param {object[]} a.people     everyone in the call except me ({ id, username, displayName, avatarUrl, isScreenSharing })
 * @param {object} a.me
 * @param {string|null} a.speakerId
 * @param {number} a.startedAt    ms
 * @param {string} a.subtitle     server name, "Grup" or "" for a DM
 * @param {object} a.link         { serverId, channelId } | { groupId } | { username } (tap opens the call)
 */
export function callActivityPayload({ state, people = [], me = null, speakerId = null, startedAt = 0, subtitle = "", link = {} } = {}) {
  if (!state?.active) return { active: false };
  const meP = personOf(me);
  const others = (Array.isArray(people) ? people : []).map((p) => {
    const person = personOf(p);
    return person ? { ...person, screen: Boolean(p.isScreenSharing || p.screenSharing) } : null;
  }).filter(Boolean);
  const all = meP ? [{ ...meP, me: true, screen: false }, ...others] : others;
  const speaker = all.find((p) => p.id === String(speakerId || "")) || null;
  // Speaker first among the others, then the rest in call order; me always first in the strip.
  const strip = meP ? [all[0]] : [];
  const rest = others.slice().sort((a, b) => (a.id === speaker?.id ? -1 : b.id === speaker?.id ? 1 : 0));
  for (const p of rest) if (strip.length < MAX_CALL_FACES) strip.push(p);
  const kind = ["dm", "group", "server"].includes(state.kind) ? state.kind : "server";
  return {
    active: true,
    kind,
    title: str(state.title, 80),
    subtitle: str(subtitle, 60),
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? Math.floor(startedAt) : Date.now(),
    muted: Boolean(state.muted),
    deafened: Boolean(state.deafened),
    speaker: speaker ? { id: speaker.id, name: speaker.name, initials: speaker.initials, avatarUrl: speaker.avatarUrl, me: Boolean(speaker.me) } : null,
    participants: strip.map((p) => ({ id: p.id, name: p.name, initials: p.initials, avatarUrl: p.avatarUrl, me: Boolean(p.me), screen: p.screen, speaking: p.id === speaker?.id })),
    participantCount: all.length,
    link: {
      serverId: str(link.serverId || "", 64) || null,
      channelId: str(link.channelId || "", 64) || null,
      groupId: str(link.groupId || "", 64) || null,
      username: str(link.username || "", 64) || null,
    },
  };
}

/** What changed between two payloads: "none" | "speaker" (spaced out) | "state" (send now). */
export function callActivityChange(prev, next) {
  if (!prev && !next) return "none";
  if (!prev || !next || prev.active !== next.active) return "state";
  if (!next.active) return "none";
  // The strip of faces follows the speaker (speaker first, at most six), so faces and speaker
  // changes are spaced out together; anything else (mute, title, count, link) goes at once.
  const strip = (p) => JSON.stringify({ ...p, speaker: null, participants: null });
  if (strip(prev) !== strip(next)) return "state";
  const faces = (p) => JSON.stringify([p.speaker?.id || null, p.participants]);
  return faces(prev) !== faces(next) ? "speaker" : "none";
}

// ---- reloads -----------------------------------------------------------------------------

/**
 * Socket event / app change → the widget kinds whose content it changes. Unknown: none.
 */
export function kindsForEvent(name) {
  switch (String(name || "")) {
    case "presence:delta":
    case "friend:list":
    case "friend:accepted":
    case "friend:blocked":
    case "user:profile:updated":
    case "activity":
      return ["friends"];
    case "dm:message":
    case "dm:unread:sync":
    case "group:message":
    case "mention:received":
    case "unread":
      return ["unread"];
    case "server:voice:states":
    case "voice":
      return ["voice", "friends"];
    case "call":
      return ["call", "voice"];
    case "resume":
    case "signin":
      return WIDGET_KINDS.slice();
    default:
      return [];
  }
}

/**
 * Coalescing scheduler: request(kinds) sends at once when a kind has been quiet for its
 * spacing, otherwise once at the end of the spacing with everything asked meanwhile.
 */
export function createReloadScheduler({ send, spacing = RELOAD_SPACING_MS, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const last = new Map();
  const pending = new Set();
  let timer = null;
  let dueAt = 0;

  const flush = () => {
    timer = null;
    dueAt = 0;
    const t = now();
    const ready = [...pending].filter((k) => t - (last.get(k) || 0) >= (spacing[k] ?? 10000));
    for (const k of ready) {
      pending.delete(k);
      last.set(k, t);
    }
    if (ready.length) send(ready);
    if (pending.size) arm();
  };

  const arm = () => {
    const t = now();
    let soonest = Infinity;
    for (const k of pending) soonest = Math.min(soonest, (last.get(k) || 0) + (spacing[k] ?? 10000));
    const at = Math.max(t, soonest);
    if (timer && dueAt <= at) return;
    if (timer) clearTimer(timer);
    dueAt = at;
    timer = setTimer(flush, Math.max(0, at - t));
  };

  return {
    request(kinds) {
      for (const k of Array.isArray(kinds) ? kinds : []) if (WIDGET_KINDS.includes(k)) pending.add(k);
      if (!pending.size) return;
      const t = now();
      if ([...pending].some((k) => t - (last.get(k) || 0) >= (spacing[k] ?? 10000))) {
        if (timer) clearTimer(timer);
        timer = null;
        flush();
      } else {
        arm();
      }
    },
    cancel() {
      if (timer) clearTimer(timer);
      timer = null;
      pending.clear();
    },
    pendingKinds: () => [...pending],
  };
}

/** Error code from POST /api/native/wave → the settings / toast text key. */
export function waveErrorKey(code) {
  switch (code) {
    case "wave_cooldown":
      return "widgets.wave.cooldown";
    case "wave_limit":
      return "widgets.wave.limit";
    case "not_friend":
      return "widgets.wave.notFriend";
    default:
      return "widgets.wave.failed";
  }
}

// ---- plugin plumbing -----------------------------------------------------------------------

let importCore = () => import("@capacitor/core");
let boxPromise = null;

function pluginBox() {
  if (!boxPromise) {
    boxPromise = Promise.resolve()
      .then(() => importCore())
      .then(({ registerPlugin }) => ({ plugin: registerPlugin("DescallWidgets") }))
      .catch(() => {
        boxPromise = null;
        return { plugin: null };
      });
  }
  return boxPromise;
}

function withTimeout(promise, ms = PLUGIN_TIMEOUT_MS) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("plugin-timeout")), ms);
    }),
  ]);
}

async function call(method, args = {}, { platform = nativePlatform() } = {}) {
  if (platform !== "ios" && platform !== "android") return null;
  const { plugin } = await pluginBox();
  if (!plugin || typeof plugin[method] !== "function") return null;
  try {
    return await withTimeout(plugin[method](args));
  } catch {
    return null; // older native build without the method, or the shell is busy
  }
}

export function widgetsAvailable(platform = nativePlatform()) {
  return platform === "ios" || platform === "android";
}

export async function pushFavorites({ favorites, people, prefs }) {
  return call("setFavorites", { ids: normalizeFavorites(favorites), people: Array.isArray(people) ? people.slice(0, MAX_FAVORITES) : [], prefs: normalizePrefs(prefs) });
}

export async function reloadWidgets(kinds) {
  const list = (Array.isArray(kinds) ? kinds : []).filter((k) => WIDGET_KINDS.includes(k));
  if (!list.length) return null;
  return call("reload", { kinds: list });
}

export async function sendCallActivity(payload) {
  return call("callActivity", payload && payload.active ? payload : { active: false });
}

/** { supported, liveActivities, interactive, favorites, prefs, installed[] } or null. */
export async function getWidgetState() {
  return call("getState");
}

/** Sign-out: favourites, cached faces and the Live Activity go away on the device too. */
export async function clearNativeWidgets() {
  return call("clear");
}

/** Selftests only. */
export const __nativeWidgetsForTests = {
  setCoreImporter(fn) {
    importCore = fn;
    boxPromise = null;
  },
  reset() {
    importCore = () => import("@capacitor/core");
    boxPromise = null;
    settings = null;
    listeners.clear();
  },
};
