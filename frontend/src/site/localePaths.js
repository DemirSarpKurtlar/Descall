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
  "/dimaai",
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
export const TR_CANONICAL_PATHS = ["/descall-sahibi", "/discord-alternative-turkey"];

/** True when the URL itself is Turkish — chrome must be TR regardless of stored language. */
export function isTurkishMarketingPath(pathname = "/") {
  if (isTrPath(pathname)) return true;
  const bare = stripLocalePrefix(pathname);
  return TR_CANONICAL_PATHS.includes(bare);
}

/**
 * Where to send the visitor when they select Turkish (or already have locale=tr
 * on an English-canonical URL that has a TR counterpart).
 */
export function trDestinationForPath(pathname = "/") {
  const bare = stripLocalePrefix(pathname);
  if (bare === "/who-owns-descall" || bare === "/descall-sahibi") return "/descall-sahibi";
  if (bare === "/discord-alternative" || bare === "/discord-alternative-turkey") {
    return "/discord-alternative-turkey";
  }
  if (TR_MIRROR_PATHS.includes(bare)) return withTrPrefix(bare);
  return null;
}

export function enPathForHreflang(pathname = "/") {
  const en = stripLocalePrefix(pathname);
  if (en === "/discord-alternative-turkey") return "/discord-alternative";
  if (en === "/descall-sahibi") return "/who-owns-descall";
  return en;
}

export function trPathForHreflang(pathname = "/") {
  const en = stripLocalePrefix(pathname);
  if (en === "/discord-alternative" || en === "/discord-alternative-turkey") {
    return "/discord-alternative-turkey";
  }
  if (en === "/who-owns-descall" || en === "/descall-sahibi") {
    return "/descall-sahibi";
  }
  if (TR_MIRROR_PATHS.includes(en) || en === "/") return withTrPrefix(en);
  // Niche pages: fall back to turkey landing for TR alternate
  if (en.includes("discord") || en.startsWith("/blog") || en === "/alternatives") {
    return "/discord-alternative-turkey";
  }
  return withTrPrefix("/");
}
