/**
 * URLs of the public server directory (item 8). No copy here, so the router helpers,
 * the sitemap and the content dates can import it without the page text.
 *
 *   English  /communities            /communities/<slug>
 *   Turkish  /tr/topluluklar         /tr/topluluklar/<slug>
 *
 * /servers stays the app (worker SPA_PREFIXES); these are prerendered pages.
 * The English pages list servers in every language, the Turkish pages list servers whose
 * main language is Turkish, so the two are not translations of each other and carry no
 * hreflang pair (localePaths.js), only a visible link to the other language.
 */
import { DIRECTORY_CATEGORIES, DIRECTORY_MIN_MEMBERS } from "../../lib/serverDirectory.js";

export const DIRECTORY_SITE_LANGS = ["en", "tr"];

export const DIRECTORY_HOME = { en: "/communities", tr: "/tr/topluluklar" };

/** URL slug of each category per site language (ASCII, lower case). */
export const DIRECTORY_SLUGS = {
  "gaming-minecraft": { en: "minecraft", tr: "minecraft" },
  "gaming-fps": { en: "fps", tr: "fps" },
  "gaming-cs2": { en: "cs2", tr: "cs2" },
  "gaming-lol": { en: "league-of-legends", tr: "league-of-legends" },
  "gaming-other": { en: "gaming", tr: "oyun" },
  study: { en: "study", tr: "ders-calisma" },
  music: { en: "music", tr: "muzik" },
  art: { en: "art", tr: "sanat" },
  tech: { en: "tech", tr: "teknoloji" },
  anime: { en: "anime", tr: "anime" },
  sports: { en: "sports", tr: "spor" },
  "chat-friends": { en: "chat-and-friends", tr: "sohbet-arkadaslik" },
  other: { en: "other", tr: "diger" },
};

/** A category page is indexed once it lists this many servers. */
export const DIRECTORY_MIN_PAGE_SERVERS = 3;

/** Day the directory page copy last changed (sitemap lastmod, seo/contentDates.js). */
export const DIRECTORY_COPY_UPDATED = "2026-11-08";

function clean(pathname) {
  return String(pathname || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

/** "/communities", "/communities/minecraft", "/tr/topluluklar/muzik". */
export function directoryPath(lang = "en", category = null) {
  const l = lang === "tr" ? "tr" : "en";
  const home = DIRECTORY_HOME[l];
  if (!category) return home;
  const slug = DIRECTORY_SLUGS[category]?.[l];
  return slug ? `${home}/${slug}` : home;
}

/** { lang, category } of a directory URL (category null on the index), else null. */
export function parseDirectoryPath(pathname) {
  const p = clean(pathname);
  for (const lang of DIRECTORY_SITE_LANGS) {
    const home = DIRECTORY_HOME[lang];
    if (p === home) return { lang, category: null };
    if (!p.startsWith(`${home}/`)) continue;
    const slug = p.slice(home.length + 1);
    const category = DIRECTORY_CATEGORIES.find((id) => DIRECTORY_SLUGS[id]?.[lang] === slug);
    return category ? { lang, category } : null;
  }
  return null;
}

export function isDirectoryPath(pathname) {
  return parseDirectoryPath(pathname) !== null;
}

/** Every directory page: 2 index pages + one page per category per language. */
export function directoryPagePaths() {
  const out = [];
  for (const lang of DIRECTORY_SITE_LANGS) {
    out.push(directoryPath(lang));
    for (const id of DIRECTORY_CATEGORIES) out.push(directoryPath(lang, id));
  }
  return out;
}

/** Same page in the other site language (for the visible language link and the picker). */
export function directoryTwinPath(pathname, lang) {
  const hit = parseDirectoryPath(pathname);
  if (!hit || (lang !== "en" && lang !== "tr")) return null;
  return directoryPath(lang, hit.category);
}

/**
 * Main server language a page lists: the Turkish pages list Turkish servers, the English
 * pages every language (null).
 */
export function directoryServerLanguage(lang) {
  return lang === "tr" ? "tr" : null;
}

/** Visible servers of one page, from the public cards (snapshot or list). */
export function directoryPageServers(cards, lang, category) {
  const want = directoryServerLanguage(lang);
  return (Array.isArray(cards) ? cards : []).filter(
    (c) => (!category || c.category === category) && (!want || c.language === want)
  );
}

/** Number of servers a page lists, from a /api/directory/summary `categories` map. */
export function directoryPageCount(categories, lang, category) {
  const row = categories?.[category];
  if (!row) return 0;
  const want = directoryServerLanguage(lang);
  return want ? Number(row.byLanguage?.[want] || 0) : Number(row.total || 0);
}

/** { [category]: { total, byLanguage } } from public cards (same shape as the API summary). */
export function summarizeDirectoryCards(cards) {
  const out = {};
  for (const id of DIRECTORY_CATEGORIES) out[id] = { total: 0, byLanguage: {} };
  for (const c of Array.isArray(cards) ? cards : []) {
    const row = out[c?.category];
    if (!row) continue;
    row.total += 1;
    row.byLanguage[c.language] = (row.byLanguage[c.language] || 0) + 1;
  }
  return out;
}

/**
 * Category pages that list fewer than DIRECTORY_MIN_PAGE_SERVERS servers: noindex and left out
 * of the sitemap until they grow. Without data (API unreachable at build time) every
 * category page counts as thin; the two index pages are always indexable.
 */
export function thinDirectoryPaths(categories) {
  const out = [];
  for (const lang of DIRECTORY_SITE_LANGS) {
    for (const id of DIRECTORY_CATEGORIES) {
      if (!categories || directoryPageCount(categories, lang, id) < DIRECTORY_MIN_PAGE_SERVERS) out.push(directoryPath(lang, id));
    }
  }
  return out;
}


export { DIRECTORY_CATEGORIES, DIRECTORY_MIN_MEMBERS };
