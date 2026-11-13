/**
 * Pages that are served and crawlable but kept out of the search index
 * ("noindex,follow", out of every sitemap and hreflang set). Their links still pass.
 *
 * Measured on the live site (13 Nov 2026, 225 sitemap URLs fetched as Googlebot):
 *
 * - /status: 126 to 160 words in every language, almost all of it header, footer and a
 *   fixed "beta / API health" note; 67 to 90 five-word sequences that no other page of
 *   the same language has. No search demand, and the page does not show live data.
 * - /copyright: 66 to 72 % of its own text is also in /terms of the same language (the
 *   terms carry the same notice-and-takedown section).
 *
 * The rest of the prefixed languages (de, es, fr, pt-BR, ru) was measured too: every page
 * shares at most 8 % of its five-word sequences with its English page (fully translated),
 * the body length is 0.9 to 1.3 times the English page, and no two pages of one language
 * share more than 25 % of their own text (copyright / terms aside). They stay indexed.
 *
 * Directory topic pages with fewer than 3 servers are the other noindex,follow pages; that
 * list is decided per build (dist/directory-manifest.json, directory/directoryPaths.js).
 *
 * To drop a page from the index: add its English path here. The prefixed copies
 * (/de/status, ...) follow. To bring one back: remove it; it returns to the sitemaps.
 */
import { prefixedLocaleFromPath, stripPrefixedLocale } from "../siteLocales.js";

export const NOINDEX_FOLLOW_PAGES = Object.freeze({
  "/status": "thin utility page, no live data",
  "/copyright": "duplicate of the notice-and-takedown section of /terms",
});

/** True for a page that is served with noindex,follow and kept out of the sitemaps. */
export function isNoindexFollowPath(pathname = "/") {
  const clean = String(pathname || "/").replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  const prefixed = prefixedLocaleFromPath(clean);
  const enPath = prefixed ? stripPrefixedLocale(clean, [prefixed]) : clean;
  return Object.prototype.hasOwnProperty.call(NOINDEX_FOLLOW_PAGES, enPath);
}

/** Robots meta of a crawlable marketing page. */
export const ROBOTS_INDEX = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
export const ROBOTS_NOINDEX_FOLLOW = "noindex,follow";

/**
 * Path the prerendered shell marked noindex,follow (`data-noindex-path`: a directory topic
 * page with fewer than 3 servers, decided at build time, or a page of seo/indexPolicy.js).
 * React keeps that noindex: before, it rewrote the tag to "index,follow" on hydration, so
 * the rendered page Google indexes contradicted the HTML.
 */
export function prerenderedNoindexPath(doc = typeof document !== "undefined" ? document : null) {
  const el = doc?.head?.querySelector?.('meta[name="robots"][data-noindex-path]');
  return el ? el.getAttribute("data-noindex-path") : null;
}

/** Robots meta for a page: app shells noindex,nofollow; thin pages noindex,follow. */
export function robotsContent({ forceNoindex = false, metaNoindex = false, noindexFollow = false } = {}) {
  if (forceNoindex || metaNoindex) return "noindex,nofollow";
  if (noindexFollow) return ROBOTS_NOINDEX_FOLLOW;
  return ROBOTS_INDEX;
}
