import { normalizeLocale } from "../i18n/detect.js";
import { isTurkishMarketingPath } from "./localePaths.js";

/**
 * Marketing chrome locale.
 * Turkish URLs win over stored English so /tr never first-paints an English menu.
 * Stored English still wins on English-canonical URLs (no surprise redirect to /tr).
 */
export function resolveMarketingLocale({ pathname, stored } = {}) {
  if (pathname != null && isTurkishMarketingPath(pathname)) return "tr";
  const normalized = normalizeLocale(stored);
  if (normalized) return normalized;
  return null;
}
