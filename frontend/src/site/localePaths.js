/**
 * Locale path helpers for /tr/* marketing URLs.
 * EN remains at unprefixed paths; TR mirrors key pages under /tr.
 */

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
