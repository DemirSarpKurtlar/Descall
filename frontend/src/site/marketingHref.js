import { isTrPath, hreflangPair } from "./localePaths.js";
import {
  PREFIXED_SITE_LOCALES,
  isMirrorPath,
  prefixedLocaleFromPath,
  withLocalePrefix,
} from "./siteLocales.js";

/**
 * Point a marketing link at the visitor's language. Turkish: the /tr (or Turkish
 * canonical) twin. Prefixed site languages: /<prefix> + path for mirrored pages.
 * Pages without a twin keep their English URL.
 */
export function marketingHref(to, { locale, pathname, locales = PREFIXED_SITE_LOCALES, pageDrafts } = {}) {
  if (!to || typeof to !== "string" || to.startsWith("http") || to.startsWith("mailto:")) return to;
  const urlLocale = isTrPath(pathname) ? "tr" : prefixedLocaleFromPath(pathname, locales);
  const active = urlLocale || locale;
  if (active === "tr") {
    if (to === "/tr" || to.startsWith("/tr/")) return to;
    const pair = hreflangPair(to);
    return pair ? pair.tr : to;
  }
  if (!locales.includes(active)) return to;
  const cut = to.search(/[?#]/);
  const path = cut >= 0 ? to.slice(0, cut) : to;
  const rest = cut >= 0 ? to.slice(cut) : "";
  if (prefixedLocaleFromPath(path, locales)) return to;
  return isMirrorPath(path, active, pageDrafts ? { pageDrafts } : undefined) ? `${withLocalePrefix(path, active)}${rest}` : to;
}
