/**
 * Starting UI locale, without the catalogs or the formatter (safe for the marketing
 * first paint). Stored choice -> account language -> device detection.
 */
import { detectDefaultLocale, normalizeLocale } from "./detect.js";
import { readStoredLanguage } from "./storage.js";

export function resolveInitialLocale({ meLanguage } = {}) {
  const stored = normalizeLocale(readStoredLanguage());
  if (stored) return stored;
  const fromMe = normalizeLocale(meLanguage);
  if (fromMe) return fromMe;
  return detectDefaultLocale();
}
