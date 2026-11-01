import { normalizeLocale } from "../i18n/detect.js";
import { forcedLocaleForPath } from "./localePaths.js";
import { SITE_LOCALES } from "./siteLocales.js";

/**
 * Marketing chrome locale.
 * A localized URL wins over the stored choice: /tr (and the Turkish canonical paths)
 * is Turkish, /de/* is German, so a localized page never first-paints another menu.
 * Stored English still wins on English-canonical URLs (no surprise redirect to /tr).
 * A stored language the site does not serve yet (a site draft) gives null, so the
 * caller falls back to detection and then English.
 */
export function resolveMarketingLocale({ pathname, stored, locales = SITE_LOCALES } = {}) {
  if (pathname != null) {
    const forced = forcedLocaleForPath(pathname, { locales });
    if (forced) return forced;
  }
  const normalized = normalizeLocale(stored);
  if (normalized && locales.includes(normalized)) return normalized;
  return null;
}

/** Same rule plus detection: URL, stored choice, device language, English. */
export function initialMarketingLocale({ pathname, stored, detected, locales = SITE_LOCALES } = {}) {
  const fromRules = resolveMarketingLocale({ pathname, stored, locales });
  if (fromRules) return fromRules;
  const d = normalizeLocale(detected);
  if (d && locales.includes(d)) return d;
  return "en";
}
