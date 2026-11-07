/**
 * When the visible content of each public page last changed: the sitemap <lastmod>.
 *
 * Search engines only trust lastmod when it moves with the text. It used to come from
 * the git date of the page's source files, so every refactor, CSS fix or release bumped
 * it (128 of 208 URLs said "today" on 6 Nov 2026). Now it is editorial:
 *
 * - Blog posts use their own date / updated fields (content/discordSeoContent.js,
 *   seo/trMeta.js). Dated Turkish landings use their `updated` field.
 * - Every other page uses PAGE_UPDATED below. Change a page's date only when its copy
 *   (title, description, headings, body text, FAQ) changes, not for code or style work.
 * - Prefixed languages (/de, /pt-br, ...) follow their English page, but never before
 *   the day the language went live, plus TRANSLATION_UPDATED when a translation pass
 *   changes copy that the English page did not.
 */
import { BLOG_POSTS } from "../content/discordSeoContent.js";
import { TR_BLOG_META } from "./trMeta.js";
import { TR_LANDINGS, TR_LANDING_UPDATED } from "./trLandings.js";
import { prefixedLocaleFromPath, stripPrefixedLocale } from "../siteLocales.js";
import { SITE_OPERATOR } from "../siteIdentity.js";

/** English and Turkish pages (path -> YYYY-MM-DD of the last copy change). */
export const PAGE_UPDATED = {
  "/": "2026-11-07",
  "/features": "2026-11-07",
  "/download": "2026-11-07",
  "/faq": "2026-10-19",
  "/security": "2026-10-14",
  "/status": SITE_OPERATOR.statusReviewedIso,
  "/privacy": "2026-10-26",
  "/terms": "2026-10-10",
  "/copyright": "2026-10-10",
  "/about": "2026-10-19",
  "/contact": "2026-10-14",
  "/who-owns-descall": "2026-10-31",
  // 2026-11-07: Discord-in-Türkiye wording made dated and sourced, guide links added.
  "/discord-alternative": "2026-11-07",
  "/alternatives": "2026-11-07",
  "/compare/discord": "2026-11-07",
  "/best-discord-alternative-for-gamers": "2026-11-07",
  "/discord-alternative-for-communities": "2026-11-07",
  "/discord-alternative-for-voice-chat": "2026-11-07",
  "/discord-alternative-for-friends": "2026-11-07",
  "/apps-like-discord": "2026-11-07",
  "/discord-replacement": "2026-11-07",
  "/blog": "2026-11-07",
  "/sitemap": "2026-11-07",
  // Turkish-only URLs (the /tr mirrors of English pages follow the English date).
  "/descall-sahibi": "2026-11-06",
  "/iletisim": "2026-10-14",
  "/gizlilik": "2026-10-26",
  "/kosullar": "2026-10-10",
  "/tr": "2026-11-07",
  "/tr/compare/discord": "2026-11-06",
  "/tr/blog": "2026-11-07",
  // Turkish landings whose title or copy changed after TR_LANDING_UPDATED.
  // 2026-11-07: guide links added to their related lists (second content round).
  "/tr/discord-alternatifi": "2026-11-07",
  "/tr/turk-discord": "2026-11-07",
  "/tr/discord-yerine-ne-kullanilir": "2026-11-07",
  "/tr/oyuncu-sohbet-uygulamasi": "2026-11-07",
  "/tr/discord-alternatifleri": "2026-11-07",
  "/tr/sesli-sohbet-uygulamasi": "2026-11-07",
};

/** First day each prefixed language was served (3.7.23 / 3.7.24). */
export const LOCALE_LIVE_SINCE = "2026-11-01";

/**
 * Translation passes that changed copy in a prefixed language beyond its English page.
 * 2026-11-06: titles and descriptions shortened to 60 / 160 characters in every language.
 */
export const TRANSLATION_UPDATED = {
  de: "2026-11-06",
  es: "2026-11-06",
  fr: "2026-11-06",
  "pt-BR": "2026-11-06",
  ru: "2026-11-06",
};

function laterOf(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}

/** YYYY-MM-DD of an English or Turkish page, or null when unknown. */
function baseDate(path) {
  const en = BLOG_POSTS.find((p) => p.path === path);
  if (en) return en.updated || en.date;
  const tr = TR_BLOG_META.find((p) => p.path === path);
  if (tr) return tr.updated || tr.date;
  if (PAGE_UPDATED[path]) return PAGE_UPDATED[path];
  const landing = TR_LANDINGS[path];
  if (landing) return landing.updated || TR_LANDING_UPDATED;
  // /tr/features, /tr/faq, ... follow their English page.
  if (path.startsWith("/tr/")) return PAGE_UPDATED[path.slice(3)] || null;
  return null;
}

/** Content date (YYYY-MM-DD) of any public path, prefixed languages included. */
export function contentUpdated(path) {
  const loc = prefixedLocaleFromPath(path);
  if (!loc) return baseDate(path);
  const en = baseDate(stripPrefixedLocale(path, [loc]));
  return laterOf(laterOf(en, LOCALE_LIVE_SINCE), TRANSLATION_UPDATED[loc]);
}

/** Sitemap lastmod (ISO 8601) of a path, or null so the caller can fall back. */
export function contentLastmod(path) {
  const day = contentUpdated(path);
  return day ? `${day}T00:00:00.000Z` : null;
}
