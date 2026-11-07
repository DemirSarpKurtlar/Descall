/**
 * Shared sitemap catalog, single source for Vercel static + Render API.
 * Splits indexable PUBLIC_ROUTES into crawlable child sitemap tables.
 */

import { PUBLIC_ROUTES, DEFAULT_ORIGIN } from "./seoConfig.js";
import { prefixedLocaleFromPath, stripPrefixedLocale } from "./siteLocales.js";
import { contentLastmod } from "./seo/contentDates.js";

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

function tableIdForPath(path) {
  // Prefixed site languages (/de/faq) sit in the same table as their English page.
  const prefixed = prefixedLocaleFromPath(path || "/");
  const p = prefixed ? stripPrefixedLocale(path, [prefixed]) : path || "/";
  if (p.startsWith("/blog") || p.startsWith("/tr/blog")) return "blog";
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
 */
export function allSitemapEntries(origin = SITE, now = new Date().toISOString(), lastmodFor = contentLastmod) {
  const lm = (p) => (lastmodFor && lastmodFor(p)) || now;
  const entries = indexableRoutes().map((r) => ({
    path: r.path,
    loc: absoluteLoc(r.path, origin),
    lastmod: lm(r.path),
    changefreq: r.changefreq || "weekly",
    priority: r.priority || "0.5",
    title: r.title,
    description: r.description || "",
    tableId: tableIdForPath(r.path),
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
  });

  return entries;
}

export function entriesForTable(tableId, origin = SITE, now = new Date().toISOString(), lastmodFor = contentLastmod) {
  return allSitemapEntries(origin, now, lastmodFor).filter((e) => e.tableId === tableId);
}
