/**
 * Shared sitemap catalog, single source for Vercel static + Render API.
 * Splits indexable PUBLIC_ROUTES into crawlable child sitemap tables.
 */

import { PUBLIC_ROUTES, DEFAULT_ORIGIN } from "./seoConfig.js";
import { SITE_LOCALES, localeNativeName, prefixedLocaleFromPath, stripPrefixedLocale } from "./siteLocales.js";
import { contentLastmod } from "./seo/contentDates.js";
import { isDirectoryPath } from "./directory/directoryPaths.js";

export const SITE = DEFAULT_ORIGIN;

/** @typedef {'core'|'niches'|'blog'|'company'} SitemapTableId */

/**
 * Child sitemap tables linked from /sitemap.xml.
 * Order = crawl priority for discovery.
 */
export const SITEMAP_TABLES = [
  {
    id: "core",
    file: "sitemap-core.xml",
    title: "Product & conversion",
    description: "Home, download, features, FAQ, primary conversion surfaces.",
  },
  {
    id: "niches",
    file: "sitemap-niches.xml",
    title: "Discord alternatives & niches",
    description: "High-intent Discord alternative, compare, voice, Turkey hubs.",
  },
  {
    id: "blog",
    file: "sitemap-blog.xml",
    title: "Guides & blog",
    description: "Blog index and long-form Discord alternative guides.",
  },
  {
    id: "company",
    file: "sitemap-company.xml",
    title: "Company & legal",
    description: "About, contact, security, privacy, terms, human sitemap.",
  },
];

/**
 * SEO round 2 (Nov 2026): /sitemap.xml lists one child sitemap per site language
 * (sitemap-en.xml, sitemap-tr.xml, sitemap-de.xml, ...), each URL in exactly one, so
 * Search Console reports coverage per language. The topic tables above stay served
 * (old bookmarks, the human sitemap) but are no longer in the index.
 */
export const SITEMAP_LANG_TABLES = SITE_LOCALES.map((lang) => ({
  id: `lang-${lang.toLowerCase()}`,
  lang,
  file: `sitemap-${lang.toLowerCase()}.xml`,
  title: localeNativeName(lang),
  description: `Every public page in ${lang}.`,
}));

const TR_ONLY = new Set(["/descall-sahibi", "/iletisim", "/gizlilik", "/kosullar"]);

/** Site language of a URL path: "tr" for /tr and the Turkish-only pages, the prefix, else "en". */
export function sitemapLangForPath(path) {
  const p = path || "/";
  if (p === "/tr" || p.startsWith("/tr/") || TR_ONLY.has(p)) return "tr";
  return prefixedLocaleFromPath(p) || "en";
}

function tableIdForPath(path) {
  // Prefixed site languages (/de/faq) sit in the same table as their English page.
  const prefixed = prefixedLocaleFromPath(path || "/");
  const p = prefixed ? stripPrefixedLocale(path, [prefixed]) : path || "/";
  if (p.startsWith("/blog") || p.startsWith("/tr/blog")) return "blog";
  // Public server directory (item 8): discovery pages, next to the hubs.
  if (isDirectoryPath(p)) return "niches";
  if (p === "/tr" || p.startsWith("/tr/")) return "niches";
  if (p === "/status") return "company";
  if (
    p.includes("discord") ||
    p.includes("alternative") ||
    p.startsWith("/compare") ||
    p === "/apps-like-discord" ||
    p === "/alternatives"
  ) {
    return "niches";
  }
  if (["/", "/download", "/features", "/faq"].includes(p)) return "core";
  return "company";
}

export function indexableRoutes() {
  return PUBLIC_ROUTES.filter((r) => !r.noindex);
}

export function absoluteLoc(path, origin = SITE) {
  const base = String(origin || SITE).replace(/\/$/, "");
  if (!path || path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function routesForTable(tableId) {
  return indexableRoutes().filter((r) => tableIdForPath(r.path) === tableId);
}

/**
 * @param {string} origin
 * @param {string} now fallback lastmod (ISO), only for a path without a content date
 * @param {(path: string) => string | null} [lastmodFor] per-page lastmod; defaults to the
 *   editorial content date (seo/contentDates.js) so the static and the Render sitemaps agree
 * @param {{ exclude?: Iterable<string> }} [options] exclude: paths left out for this build,
 *   the server directory category pages that list fewer than 3 servers (noindex until they
 *   grow, see directory/directoryPaths.js thinDirectoryPaths)
 */
export function allSitemapEntries(origin = SITE, now = new Date().toISOString(), lastmodFor = contentLastmod, { exclude } = {}) {
  const lm = (p) => (lastmodFor && lastmodFor(p)) || now;
  const skip = new Set(exclude || []);
  const entries = indexableRoutes().filter((r) => !skip.has(r.path)).map((r) => ({
    path: r.path,
    loc: absoluteLoc(r.path, origin),
    lastmod: lm(r.path),
    changefreq: r.changefreq || "weekly",
    priority: r.priority || "0.5",
    title: r.title,
    description: r.description || "",
    tableId: tableIdForPath(r.path),
    lang: sitemapLangForPath(r.path),
  }));

  // Human sitemap page
  entries.push({
    path: "/sitemap",
    loc: absoluteLoc("/sitemap", origin),
    lastmod: lm("/sitemap"),
    changefreq: "weekly",
    priority: "0.3",
    title: "Sitemap",
    description: "Human-readable sitemap of public Descall pages.",
    tableId: "company",
    lang: "en",
  });

  return entries;
}

export function entriesForTable(tableId, origin = SITE, now = new Date().toISOString(), lastmodFor = contentLastmod, options = {}) {
  return allSitemapEntries(origin, now, lastmodFor, options).filter((e) => e.tableId === tableId);
}

export function entriesForLanguage(lang, origin = SITE, now = new Date().toISOString(), lastmodFor = contentLastmod, options = {}) {
  return allSitemapEntries(origin, now, lastmodFor, options).filter((e) => e.lang === lang);
}
