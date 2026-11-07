/**
 * Pages merged into a stronger page (SEO audit, Nov 2026). Each pair targeted the same
 * search intent, so the two URLs competed with each other. The weaker URL now answers
 * with a 301 to the page that was kept, in every site language, and is gone from the
 * routes, sitemaps and hreflang sets. The useful sections of each merged blog post live
 * on as long-form copy of the kept page (seo/mergedGuides.js).
 *
 * Keep the hosting rules in sync (selftest: src/site/pagesWorkerRoutes.selftest.mjs):
 * public/_redirects, public/_worker.js (PERMANENT_REDIRECTS), vercel.json, backend/server.js.
 */
import { PREFIXED_SITE_LOCALES, localePrefix } from "../siteLocales.js";

/** English URL that was removed -> English URL that was kept. */
export const MERGED_PAGES = Object.freeze({
  "/blog/discord-vs-descall": "/compare/discord",
  "/blog/apps-like-discord": "/apps-like-discord",
  "/blog/voice-chat-alternative-to-discord": "/discord-alternative-for-voice-chat",
  "/blog/discord-alternative-for-communities-guide": "/discord-alternative-for-communities",
  "/blog/migrate-from-discord-to-descall": "/discord-replacement",
});

/**
 * Turkish adaptations of the merged posts -> the Turkish page with the same intent.
 * The kept English niche pages have no Turkish twin, so each post goes to the Turkish
 * hub that answers the same question.
 */
export const TR_MERGED_PAGES = Object.freeze({
  "/tr/blog/discord-vs-descall": "/tr/compare/discord",
  "/tr/blog/apps-like-discord": "/tr/discord-yerine-ne-kullanilir",
  "/tr/blog/voice-chat-alternative-to-discord": "/tr/sesli-sohbet-uygulamasi",
  "/tr/blog/discord-alternative-for-communities-guide": "/tr/discord-alternatifi",
  "/tr/blog/migrate-from-discord-to-descall": "/tr/discord-alternatifi",
});

/** URL prefixes of the other site languages (/de, /es, /fr, /pt-br, /ru). */
export const MERGED_PAGE_PREFIXES = Object.freeze(PREFIXED_SITE_LOCALES.map(localePrefix));

/** Blog slug of a merged English post ("discord-vs-descall"), for its old body / FAQ. */
export function mergedSlug(enPath) {
  return String(enPath).replace(/^\/blog\//, "");
}

/** Every [from, to] 301 pair: English, Turkish, then each prefixed language. */
export function mergedPageRedirects(prefixes = MERGED_PAGE_PREFIXES) {
  const out = [...Object.entries(MERGED_PAGES), ...Object.entries(TR_MERGED_PAGES)];
  for (const pre of prefixes) {
    for (const [from, to] of Object.entries(MERGED_PAGES)) out.push([`${pre}${from}`, `${pre}${to}`]);
  }
  return out;
}

/** Target of a removed URL (any language), or null. */
export function mergedTarget(pathname) {
  const p = String(pathname || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  for (const [from, to] of mergedPageRedirects()) if (from === p) return to;
  return null;
}
