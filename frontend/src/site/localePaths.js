/**
 * Locale path helpers for marketing URLs.
 * EN remains at unprefixed paths; TR mirrors key pages under /tr (plus a few
 * Turkish canonical paths); every other site language mirrors SITE_MIRROR_PATHS
 * under its own prefix (/de, /pt-br, see siteLocales.js).
 */
import {
  PREFIXED_SITE_LOCALES,
  SITE_LOCALES,
  isMirrorPath,
  isPrefixedLocale,
  localePrefix,
  prefixedLocaleFromPath,
  stripPrefixedLocale,
  withLocalePrefix,
} from "./siteLocales.js";

export const TR_LOCALE_PREFIX = "/tr";

/** Paths that have a dedicated /tr/* mirror (besides turkey landing). */
export const TR_MIRROR_PATHS = [
  "/",
  "/features",
  "/download",
  "/faq",
  "/compare/discord",
  "/about",
  "/contact",
  "/security",
];

export function stripLocalePrefix(pathname = "/") {
  const p = String(pathname || "/").split("?")[0] || "/";
  if (p === "/tr" || p === "/tr/") return "/";
  if (p.startsWith("/tr/")) {
    const rest = p.slice(3) || "/";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  if (prefixedLocaleFromPath(p)) return stripPrefixedLocale(p);
  return p.replace(/\/+$/, "") || "/";
}

export function withTrPrefix(pathname = "/") {
  const base = stripLocalePrefix(pathname);
  if (base === "/") return "/tr";
  return `/tr${base}`;
}

export function isTrPath(pathname = "/") {
  const p = String(pathname || "/").split("?")[0] || "/";
  return p === "/tr" || p.startsWith("/tr/");
}

/** Standalone Turkish URLs that are not /tr/* mirrors. */
export const TR_CANONICAL_PATHS = ["/descall-sahibi", "/iletisim", "/gizlilik", "/kosullar"];

/**
 * True 1:1 EN ⇄ TR translations. Only these get hreflang (reciprocal, with
 * x-default → EN). Turkish-only landings (e.g. /tr/discord-acildi-mi) and
 * English-only niches have no alternate on purpose.
 */
const HREFLANG_PAIRS = [
  { en: "/", tr: "/tr" },
  ...TR_MIRROR_PATHS.filter((p) => p !== "/" && p !== "/contact").map((p) => ({ en: p, tr: `/tr${p}` })),
  { en: "/contact", tr: "/iletisim" },
  { en: "/privacy", tr: "/gizlilik" },
  { en: "/terms", tr: "/kosullar" },
  { en: "/who-owns-descall", tr: "/descall-sahibi" },
  { en: "/discord-alternative", tr: "/tr/discord-alternatifi" },
  { en: "/alternatives", tr: "/tr/discord-alternatifleri" },
  { en: "/blog", tr: "/tr/blog" },
];

function cleanPath(pathname = "/") {
  return String(pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
}

/** { en, tr } when the page has a real translation, else null. */
export function hreflangPair(pathname = "/") {
  const raw = cleanPath(pathname);
  const pair = HREFLANG_PAIRS.find((item) => item.en === raw || item.tr === raw);
  if (pair) return pair;
  let m = raw.match(/^\/blog\/([a-z0-9-]+)$/);
  if (m) return { en: raw, tr: `/tr/blog/${m[1]}` };
  m = raw.match(/^\/tr\/blog\/([a-z0-9-]+)$/);
  if (m) return { en: `/blog/${m[1]}`, tr: raw };
  return null;
}

/** True when the URL itself is Turkish, chrome must be TR regardless of stored language. */
export function isTurkishMarketingPath(pathname = "/") {
  if (isTrPath(pathname)) return true;
  return TR_CANONICAL_PATHS.includes(cleanPath(pathname));
}

/** Where to send the visitor when they select Turkish. */
export function trDestinationForPath(pathname = "/") {
  const pair = hreflangPair(pathname);
  if (pair) return pair.tr;
  return null;
}

/** English counterpart (or EN home for Turkish-only pages). */
export function enPathForHreflang(pathname = "/") {
  const pair = hreflangPair(pathname);
  if (pair) return pair.en;
  return isTurkishMarketingPath(pathname) ? "/" : cleanPath(pathname);
}

/** Turkish counterpart (or TR home when there is none). */
export function trPathForHreflang(pathname = "/") {
  const pair = hreflangPair(pathname);
  if (pair) return pair.tr;
  return isTurkishMarketingPath(pathname) ? cleanPath(pathname) : "/tr";
}

// ---------------------------------------------------------------------------
// Every site language (en, tr and the prefixed ones). `locales` defaults to the
// languages the site serves today; tests and tooling pass their own list.

function prefixedOf(locales) {
  return locales.filter((id) => isPrefixedLocale(id));
}

/** Locale the URL itself forces ("tr" for Turkish URLs, "de" for /de/*), else null. */
export function forcedLocaleForPath(pathname = "/", { locales = SITE_LOCALES } = {}) {
  if (isTurkishMarketingPath(pathname)) return "tr";
  return prefixedLocaleFromPath(pathname, prefixedOf(locales));
}

/**
 * English page behind any localized URL: "/de/faq" -> "/faq", "/gizlilik" -> "/privacy".
 * Turkish-only pages (no English twin) give null; English URLs come back cleaned.
 */
export function englishPathFor(pathname = "/", { locales = SITE_LOCALES } = {}) {
  const raw = cleanPath(pathname);
  const prefixed = prefixedLocaleFromPath(raw, prefixedOf(locales));
  if (prefixed) return stripPrefixedLocale(raw, [prefixed]);
  const pair = hreflangPair(raw);
  if (pair) return pair.en;
  if (isTurkishMarketingPath(raw)) return null;
  return raw;
}

/** Home page of a site language: "/", "/tr", "/de". */
export function localeHomePath(locale) {
  if (locale === "tr") return "/tr";
  if (isPrefixedLocale(locale)) return localePrefix(locale);
  return "/";
}

/**
 * Counterpart of this page in `locale`, or null when that language has no twin.
 * `pageDrafts` (default SITE_DRAFT_PAGE_GROUPS) says which page groups a locale serves.
 */
export function localizedPathFor(pathname = "/", locale = "en", { locales = SITE_LOCALES, pageDrafts } = {}) {
  const base = englishPathFor(pathname, { locales });
  if (locale === "tr") {
    if (!base) return cleanPath(pathname);
    return hreflangPair(base)?.tr || null;
  }
  if (!base) return null;
  if (isPrefixedLocale(locale)) {
    if (!locales.includes(locale) || !isMirrorPath(base, locale, pageDrafts ? { pageDrafts } : undefined)) return null;
    return withLocalePrefix(base, locale);
  }
  return base;
}

/**
 * Where the language picker goes. English: the English twin (EN home for Turkish-only
 * pages). Turkish: the Turkish twin, else the English page with Turkish chrome (the
 * long-standing behaviour). Prefixed locales: their twin, else their home page.
 */
export function destinationForLocale(pathname = "/", locale = "en", { locales = SITE_LOCALES, pageDrafts } = {}) {
  if (locale === "tr") {
    return localizedPathFor(pathname, "tr", { locales }) || englishPathFor(pathname, { locales }) || "/tr";
  }
  if (isPrefixedLocale(locale)) {
    return localizedPathFor(pathname, locale, { locales, pageDrafts }) || localeHomePath(locale);
  }
  return englishPathFor(pathname, { locales }) || "/";
}

/**
 * hreflang set of a page: [{ hreflang, path }] for every language that has a real
 * translation, plus x-default (English). Empty when the page exists in one language.
 * Turkish pairs keep their Turkish URLs.
 */
export function hreflangAlternates(pathname = "/", { locales = SITE_LOCALES, pageDrafts } = {}) {
  const base = englishPathFor(pathname, { locales });
  if (!base) return [];
  const out = [{ hreflang: "en", path: base }];
  for (const id of locales) {
    if (id === "en") continue;
    const path = localizedPathFor(base, id, { locales, pageDrafts });
    if (path) out.push({ hreflang: id, path });
  }
  if (out.length < 2) return [];
  const self = cleanPath(pathname);
  if (!out.some((alt) => alt.path === self)) return [];
  out.push({ hreflang: "x-default", path: base });
  return out;
}

export { PREFIXED_SITE_LOCALES, SITE_LOCALES };
