"use strict";

/**
 * Cloudflare edge in front of Render (scale plan S1, 2.11.5).
 *
 * EDGE_PUBLIC_BASE (Render env) = the proxied API host, e.g.
 * https://api.descall.com. Only hosts in EDGE_HOSTS are accepted, so a typo
 * can never point clients at a foreign origin. Unset = everything stays on
 * des-call.onrender.com exactly as before.
 *
 * Cacheable public responses carry `s-maxage` so Cloudflare Cache Rules (or
 * plain "eligible for cache") can serve them without a Worker.
 */
const EDGE_HOSTS = new Set(["api.descall.com", "api-staging.descall.com"]);

/**
 * Public, cacheable reads. Must match infra/cloudflare/edge-config.json.
 * They answer CORS with `*`: Cloudflare ignores `Vary: Origin`, so a cached
 * reflected origin would break every other origin.
 */
const EDGE_PUBLIC_PATHS = ["/api/features", "/api/announcements", "/api/app/latest-release", "/api/shop/catalog/public", "/api/jwks.json"];
const EDGE_PUBLIC_PREFIXES = ["/api/shop/assets/"];

function isEdgePublicPath(pathname) {
  const p = String(pathname || "");
  return EDGE_PUBLIC_PATHS.includes(p) || EDGE_PUBLIC_PREFIXES.some((x) => p.startsWith(x));
}

function normalizeBase(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !EDGE_HOSTS.has(u.hostname) || u.pathname !== "/" || u.search) return null;
    return `https://${u.hostname}`;
  } catch {
    return null;
  }
}

function edgePublicBase(env = process.env) {
  return normalizeBase(env.EDGE_PUBLIC_BASE);
}

/** Browser cache seconds + shared (CDN) cache seconds for a public JSON route. */
function publicCache(res, { maxAge, sMaxAge, swr = 0 }) {
  const parts = ["public", `max-age=${maxAge}`, `s-maxage=${sMaxAge}`];
  if (swr) parts.push(`stale-while-revalidate=${swr}`);
  res.set("Cache-Control", parts.join(", "));
}

module.exports = { EDGE_HOSTS, EDGE_PUBLIC_PATHS, EDGE_PUBLIC_PREFIXES, isEdgePublicPath, normalizeBase, edgePublicBase, publicCache };
