// Market 2.0 SVG art (avatar frames, banners) animates with SMIL (<animate>, <animateTransform>).
// SMIL inside an image cannot be paused by CSS and ignores prefers-reduced-motion, so with
// reduced motion (system or Settings) or the lite material the app draws the still art: the
// same SVG without its animation elements. Catalog animations never use fill="freeze", so the
// base attribute values are the resting pose the art shows once its finite animation ends.
// Inline data: SVGs are rewritten here; /api/shop(2)/assets/:id URLs ask the server for the
// still variant (`still=1`, backend lib/svgStill.js).

const SMIL_RE = /<(animate|animateTransform|animateMotion|set)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/gi;
const ASSET_RE = /\/api\/shop2?\/assets\//;
const MAX_CACHE = 64;
const cache = new Map();

/** The SVG text without SMIL animation elements. */
export function stripSmil(svg) {
  return String(svg ?? "").replace(SMIL_RE, "");
}

/** True when moving art should stay still (reduced motion, Settings, lite material). */
export function wantsStillArt(doc = typeof document !== "undefined" ? document : null, win = typeof window !== "undefined" ? window : null) {
  const cls = doc?.documentElement?.classList;
  if (cls && (cls.contains("reduce-motion") || cls.contains("gd-lite"))) return true;
  try {
    return Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

function decodeSvgDataUrl(url) {
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const meta = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) {
      const bin = atob(payload);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

/** Still version of an art URL (data: SVG or shop asset URL); other URLs pass through. */
export function stillArtUrl(url) {
  if (typeof url !== "string" || !url) return url;
  if (/^data:image\/svg\+xml/i.test(url)) {
    if (cache.has(url)) return cache.get(url);
    const svg = decodeSvgDataUrl(url);
    let out = url;
    if (svg && /<(animate|set)/i.test(svg)) out = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stripSmil(svg))}`;
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(url, out);
    return out;
  }
  if (ASSET_RE.test(url) && !/[?&]still=1\b/.test(url)) return `${url}${url.includes("?") ? "&" : "?"}still=1`;
  return url;
}

/** `url`, or its still version when moving art should stay still. */
export function artUrl(url) {
  return wantsStillArt() ? stillArtUrl(url) : url;
}
