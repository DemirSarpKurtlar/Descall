/**
 * Joins that started on a public server page (descall.com/s/<slug>, public/server-page-client.js).
 * The page stores { slug, src, at } under VISIT_KEY before it sends the visitor to the web app;
 * the vanity join (api/servers.js joinServerByVanity) reads it once and tells the backend
 * { via: "page", src } so the owner's results count the join and its traffic source.
 * Pure helpers, storage injectable. Tests: publicPageAttribution.selftest.mjs.
 */

export const VISIT_KEY = "descall:publicPageVisit";
/** A visit older than this no longer counts (abandoned sign-up). */
export const VISIT_TTL_MS = 2 * 60 * 60 * 1000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;
const SRC_RE = /^[a-z]{1,16}$/;

function stores(storage) {
  if (storage) return [storage];
  const out = [];
  try {
    if (typeof localStorage !== "undefined") out.push(localStorage);
  } catch {
    /* ignore */
  }
  try {
    if (typeof sessionStorage !== "undefined") out.push(sessionStorage);
  } catch {
    /* ignore */
  }
  return out;
}

/** The visit for this slug ({ src }) and removes it, or null. */
export function takePageVisit(slug, { now = Date.now(), storage } = {}) {
  const want = String(slug || "").toLowerCase();
  let found = null;
  for (const s of stores(storage)) {
    let raw = null;
    try {
      raw = s.getItem(VISIT_KEY);
    } catch {
      raw = null;
    }
    if (!raw) continue;
    try {
      const v = JSON.parse(raw);
      const fresh = Number.isFinite(v?.at) && now - v.at <= VISIT_TTL_MS && v.at <= now + 60_000;
      if (!found && fresh && SLUG_RE.test(String(v?.slug || "")) && v.slug === want) {
        found = { src: SRC_RE.test(String(v.src || "")) ? v.src : "direct" };
      }
    } catch {
      /* malformed: drop it */
    }
    try {
      if (found || raw) s.removeItem(VISIT_KEY);
    } catch {
      /* ignore */
    }
  }
  return found;
}
