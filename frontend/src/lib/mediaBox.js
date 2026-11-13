/**
 * Box size for chat media (photos, GIFs, videos, bot embed images) before the
 * bitmap arrives, so a message never jumps when its picture decodes.
 *
 * Order of truth: width/height carried by the message or embed, then the size
 * this device measured the last time it showed the same file (kept across
 * reloads), then a default shape per kind. The CSS (`.chat-media` in
 * styles/messages.css) turns the ratio into
 *   width: 100% (the media bubble already has a definite width);
 *   aspect-ratio: ratio; max-height: the existing cap (480px / 60vh, phones 240px)
 * which is exactly the box the decoded picture used to end up in.
 */

/** Shape (w / h) when nothing is known yet. */
export const MEDIA_DEFAULTS = Object.freeze({
  image: 4 / 3,
  gif: 4 / 3,
  video: 16 / 9,
  embed: 16 / 9,
});

/** Very tall or very wide files are letterboxed (object-fit: contain) inside a clamped box. */
export const MIN_RATIO = 0.45;
export const MAX_RATIO = 2.5;

const STORAGE_KEY = "descall:mediaDims:v1";
const CACHE_MAX = 400;

function num(v) {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** { width, height } with both > 0, or null. */
export function normalizeDims(width, height) {
  const w = num(width);
  const h = num(height);
  if (!w || !h) return null;
  return { width: Math.round(w), height: Math.round(h) };
}

/**
 * Width/height from a message, attachment or embed object, whatever the
 * field spelling (`width`/`height`, `mediaWidth`, `media_width`, `w`/`h`,
 * nested `dimensions` / `mediaMeta` / `meta`).
 */
export function readMediaDims(meta) {
  if (!meta || typeof meta !== "object") return null;
  const pairs = [
    [meta.mediaWidth, meta.mediaHeight],
    [meta.media_width, meta.media_height],
    [meta.width, meta.height],
    [meta.w, meta.h],
  ];
  for (const [w, h] of pairs) {
    const d = normalizeDims(w, h);
    if (d) return d;
  }
  for (const nested of [meta.dimensions, meta.mediaMeta, meta.media_meta, meta.meta]) {
    if (nested && typeof nested === "object" && nested !== meta) {
      const d = readMediaDims(nested);
      if (d) return d;
    }
  }
  return null;
}

/**
 * The box to reserve.
 * @param {{ dims?: {width:number,height:number}|null, kind?: keyof MEDIA_DEFAULTS }} a
 * @returns {{ ratio: number, known: boolean }}
 */
export function computeMediaBox({ dims = null, kind = "image" } = {}) {
  const d = dims ? normalizeDims(dims.width, dims.height) : null;
  if (!d) return { ratio: MEDIA_DEFAULTS[kind] || MEDIA_DEFAULTS.image, known: false };
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, d.width / d.height));
  return { ratio: Math.round(ratio * 10000) / 10000, known: true };
}

/** Inline custom property read by `.chat-media`. */
export function mediaBoxStyle(box) {
  if (!box) return undefined;
  return { "--media-ar": String(box.ratio) };
}

/**
 * Cache key for a media URL: signed URLs change their query on every refresh,
 * the path stays. Inline data: / blob: URLs are not remembered.
 */
export function mediaDimsKey(url) {
  const s = String(url || "").trim();
  if (!s || /^(data|blob):/i.test(s)) return "";
  const cut = s.search(/[?#]/);
  const key = cut === -1 ? s : s.slice(0, cut);
  return key.length > 512 ? "" : key;
}

/**
 * Small LRU of measured sizes, persisted to `storage` (localStorage in the app).
 * Writes are batched with `schedule` so many images decoding at once cost one write.
 */
export function createMediaDimsCache({
  storage = null,
  key = STORAGE_KEY,
  max = CACHE_MAX,
  schedule = (fn) => setTimeout(fn, 400),
} = {}) {
  let map = null;
  let dirty = false;

  const load = () => {
    if (map) return map;
    map = new Map();
    try {
      const raw = storage?.getItem?.(key);
      const obj = raw ? JSON.parse(raw) : null;
      if (obj && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) {
          const d = Array.isArray(v) ? normalizeDims(v[0], v[1]) : null;
          if (d) map.set(k, d);
        }
      }
    } catch {
      /* unreadable cache: start empty */
    }
    return map;
  };

  const flush = () => {
    dirty = false;
    if (!storage?.setItem) return;
    const obj = {};
    for (const [k, d] of load()) obj[k] = [d.width, d.height];
    try {
      storage.setItem(key, JSON.stringify(obj));
    } catch {
      /* quota / private mode: memory only */
    }
  };

  return {
    get(url) {
      const k = mediaDimsKey(url);
      if (!k) return null;
      return load().get(k) || null;
    },
    set(url, width, height) {
      const k = mediaDimsKey(url);
      const d = normalizeDims(width, height);
      if (!k || !d) return false;
      const m = load();
      const prev = m.get(k);
      if (prev && prev.width === d.width && prev.height === d.height) return false;
      m.delete(k);
      m.set(k, d);
      while (m.size > max) m.delete(m.keys().next().value);
      if (!dirty) {
        dirty = true;
        schedule(flush);
      }
      return true;
    },
    size() {
      return load().size;
    },
    flush,
  };
}

function defaultStorage() {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

let shared = null;
function sharedCache() {
  if (!shared) shared = createMediaDimsCache({ storage: defaultStorage() });
  return shared;
}

/** Size this device measured for the file before, or null. */
export function rememberedMediaDims(url) {
  return sharedCache().get(url);
}

/** Record a decoded size (natural pixels) for next time. */
export function rememberMediaDims(url, width, height) {
  return sharedCache().set(url, width, height);
}
