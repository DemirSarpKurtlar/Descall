// Market 2.0 (C4): playing join sounds for everyone in the room.
//
// playJoinCue(user) replaces the plain `audioManager.play("userJoin")` when someone joins
// a server voice channel or a group call. If the joiner wears a join sound, the listener
// has "Katılma seslerini çal" on and the throttle allows it, the joiner's sound plays once
// (rendered from its recipe, cached per effect key); otherwise the standard join tone.
//
// Throttle (listener side): the same person at most once per 45 s, any custom sound at
// most every 0.9 s and 4 per 10 s, so a raid of joins or a reconnect loop never turns
// into a concert. A throttled join still gets the standard tone (which has its own
// overlap rules in audioManager).

import audioManager, { soundGate } from "./audioManager.js";
import { routeToSink } from "./callAudioDevices.js";
import { encodeWav, peaksOf, renderRecipe, validateRecipe } from "./joinSoundEngine.js";
import { readJoinSoundPrefs } from "./joinSoundPrefs.js";

export const PER_USER_MS = 45_000;
export const GLOBAL_GAP_MS = 900;
export const WINDOW_MS = 10_000;
export const WINDOW_MAX = 4;
export const JOIN_SOUND_EVENT = "descall:join-sound";

let bundled = null;
function bundledRecipes() {
  if (!bundled) {
    bundled = import("../../backend/catalog/shop2/c4-join-sounds.json")
      .then((m) => m.default || m)
      .catch(() => ({}));
  }
  return bundled;
}

/** The recipe of a join sound item: its own (meta.recipe / recipe), else the bundle. */
export async function recipeForItem(item) {
  if (!item) return null;
  const own = item.meta?.recipe || item.recipe || null;
  if (own && validateRecipe(own).ok) return own;
  const key = item.effect_key || item.effectKey;
  if (!key) return null;
  const all = await bundledRecipes();
  const r = all[key];
  return r && validateRecipe(r).ok ? r : null;
}

// ---------- rendering cache ----------
const prepared = new Map(); // effect key -> Promise<{ url, peaks, duration } | null>
const MAX_PREPARED = 24;

function cacheKeyOf(item) {
  return String(item?.effect_key || item?.effectKey || item?.sku || "");
}

/** Render (once) and return { url, peaks, duration } for a join sound item. */
export function prepareJoinSound(item) {
  const key = cacheKeyOf(item);
  if (!key) return Promise.resolve(null);
  if (prepared.has(key)) return prepared.get(key);
  const job = (async () => {
    const recipe = await recipeForItem(item);
    if (!recipe) return null;
    const buf = await renderRecipe(recipe, { sampleRate: 32000 });
    if (!buf) return null;
    const channels = [];
    for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
    const wav = encodeWav(channels, buf.sampleRate);
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    return { url, peaks: peaksOf(channels[0], 36), duration: buf.duration };
  })().catch(() => null);
  prepared.set(key, job);
  if (prepared.size > MAX_PREPARED) {
    const oldest = prepared.keys().next().value;
    const old = prepared.get(oldest);
    prepared.delete(oldest);
    old?.then((p) => p?.url && URL.revokeObjectURL(p.url));
  }
  return job;
}

/**
 * Play a join sound item. `volume` 0..1 (already capped by the caller). Returns
 * { stop, duration, peaks } or null when it could not play.
 */
export async function playJoinSoundItem(item, { volume = 0.6, sinkId = "" } = {}) {
  const p = await prepareJoinSound(item);
  if (!p || typeof Audio === "undefined") return null;
  const audio = new Audio(p.url);
  audio.volume = Math.max(0, Math.min(1, volume));
  const start = () => {
    const r = audio.play();
    if (r && typeof r.catch === "function") r.catch(() => {});
  };
  const routing = sinkId ? routeToSink(audio, sinkId) : null;
  if (routing) routing.then(start);
  else start();
  return {
    duration: p.duration,
    peaks: p.peaks,
    stop() {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    },
  };
}

// ---------- throttle ----------
const lastByUser = new Map();
let lastAny = 0;
let recent = [];

/** Pure throttle decision (exported for selftests). Mutates `state` when allowed. */
export function throttleAllows(state, userId, now) {
  const id = String(userId || "");
  state.recent = state.recent.filter((t) => now - t < WINDOW_MS);
  if (now - state.lastAny < GLOBAL_GAP_MS) return false;
  if (state.recent.length >= WINDOW_MAX) return false;
  const last = state.lastByUser.get(id);
  if (last !== undefined && now - last < PER_USER_MS) return false;
  state.lastAny = now;
  state.recent.push(now);
  state.lastByUser.set(id, now);
  if (state.lastByUser.size > 200) {
    for (const [k, t] of state.lastByUser) if (now - t > PER_USER_MS) state.lastByUser.delete(k);
  }
  return true;
}

const liveState = {
  get lastAny() {
    return lastAny;
  },
  set lastAny(v) {
    lastAny = v;
  },
  get recent() {
    return recent;
  },
  set recent(v) {
    recent = v;
  },
  lastByUser,
};

/** The join sound item a user wears, if any. */
export function joinSoundOf(user) {
  const item = user?.equippedJoinSound;
  return item && (item.effect_key || item.effectKey) ? item : null;
}

/**
 * Join cue for `user` joining the room you are in. Plays their join sound or the standard
 * tone. Returns "custom" | "default" | "none".
 */
export function playJoinCue(user) {
  const item = joinSoundOf(user);
  const prefs = readJoinSoundPrefs();
  const gate = soundGate("userJoin");
  if (!gate.ok) return "none";
  if (!item || !prefs.enabled || prefs.volume <= 0 || !throttleAllows(liveState, user?.id, Date.now())) {
    audioManager.play("userJoin");
    return "default";
  }
  const volume = Math.min(prefs.volume, gate.volume);
  playJoinSoundItem(item, { volume, sinkId: gate.sinkId })
    .then((res) => {
      if (!res) {
        audioManager.play("userJoin");
        return;
      }
      try {
        window.dispatchEvent(
          new CustomEvent(JOIN_SOUND_EVENT, {
            detail: { userId: String(user?.id || ""), effectKey: item.effect_key || item.effectKey, duration: res.duration },
          })
        );
      } catch {
        /* no window (tests) */
      }
    })
    .catch(() => audioManager.play("userJoin"));
  return "custom";
}

/** Shop / settings preview: always plays (explicit tap), capped by the listener's level. */
export function previewJoinSound(item) {
  const prefs = readJoinSoundPrefs();
  const gate = soundGate("userJoin");
  const base = gate.ok ? Math.max(gate.volume, 0.35) : 0.45;
  const volume = Math.max(0.15, Math.min(prefs.volume || 0.6, base));
  return playJoinSoundItem(item, { volume, sinkId: "" });
}
