import { isDescallInviteUrl } from "./inviteLinks.js";

// Loaded on first use (keeps this module importable by the node selftest).
const authedRequest = (path) => import("../api/authedHttp.js").then((m) => m.authedRequest(path));

/**
 * Link previews, client side (messaging phase 4). The server fetches the page
 * (GET /api/link-preview, backend/lib/linkPreview.js): the app never contacts
 * the linked site, and the preview image arrives as a data: URI.
 *
 * One card per message, for the first http(s) link outside code. Descall
 * invite links keep their own embed; GIF hosts are media, not previews.
 */

const LINK_RE = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/i;
const SKIP_HOSTS = /(^|\.)(giphy\.com|tenor\.com|descall\.com|des-call\.onrender\.com|descall\.vercel\.app)$/i;
const CACHE_MAX = 300;

const cache = new Map(); // url → preview | null
const inflight = new Map();

/** Text without ```code blocks``` and `inline code` (links there are not previewed). */
function withoutCode(text) {
  return String(text || "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}

/** The link a message previews, or null. */
export function previewUrlOf(text) {
  const m = LINK_RE.exec(withoutCode(text));
  if (!m) return null;
  let u;
  try {
    u = new URL(m[0]);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (SKIP_HOSTS.test(u.hostname) || isDescallInviteUrl(m[0])) return null;
  if (/\.(gif|png|jpe?g|webp|mp4|webm|mp3|zip|pdf)(\?|$)/i.test(u.pathname)) return null;
  u.hash = "";
  return u.toString();
}

export function cachedPreview(url) {
  return cache.has(url) ? cache.get(url) : undefined;
}

function remember(url, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(url, value);
}

/** The preview for `url` (null when it has none). Shared per URL, cached for the session. */
export function fetchLinkPreview(url, request = authedRequest) {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  if (inflight.has(url)) return inflight.get(url);
  const p = request(`/api/link-preview?url=${encodeURIComponent(url)}`)
    .then((res) => {
      const value = res?.ok && res.preview && (res.preview.title || res.preview.description) ? sanitizePreview(res.preview, url) : null;
      remember(url, value);
      return value;
    })
    .catch(() => null) // offline / limited: try again next time
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Only what the card renders; the image must be an inline raster data: URI. */
export function sanitizePreview(p, url) {
  const image = typeof p.image === "string" && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(p.image) ? p.image : null;
  let href = url;
  try {
    const u = new URL(p.url || url);
    if (u.protocol === "http:" || u.protocol === "https:") href = u.toString();
  } catch { /* keep the posted link */ }
  return {
    url: href,
    siteName: String(p.siteName || "").slice(0, 80),
    title: String(p.title || "").slice(0, 200),
    description: String(p.description || "").slice(0, 400),
    image,
  };
}

export function __resetLinkPreviewCache() {
  cache.clear();
  inflight.clear();
}
