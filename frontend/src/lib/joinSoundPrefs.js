// Market 2.0 (C4): the listener's join sound settings (Settings > Voice & video).
//   enabled  "Katılma seslerini çal" (default on). Off = the standard join tone plays.
//   volume   cap 0..1 (default 0.6). Join sounds never play louder than this, nor louder
//            than the overall sound volume.
// Per device (localStorage), like the other sound settings.

const KEY = "descall.joinSounds.v1";
export const DEFAULT_JOIN_SOUND_PREFS = Object.freeze({ enabled: true, volume: 0.6 });
const listeners = new Set();

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function normalizeJoinSoundPrefs(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const vol = Number(p.volume);
  return {
    enabled: p.enabled !== false,
    volume: Number.isFinite(vol) ? Math.max(0, Math.min(1, Math.round(vol * 100) / 100)) : DEFAULT_JOIN_SOUND_PREFS.volume,
  };
}

export function readJoinSoundPrefs(store = storage()) {
  try {
    const raw = store?.getItem(KEY);
    return normalizeJoinSoundPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_JOIN_SOUND_PREFS };
  }
}

export function writeJoinSoundPrefs(patch, store = storage()) {
  const next = normalizeJoinSoundPrefs({ ...readJoinSoundPrefs(store), ...(patch || {}) });
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: keep the in-memory value for this session */
  }
  for (const fn of listeners) fn(next);
  return next;
}

export function subscribeJoinSoundPrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
