import { FALLBACK_LOCALE, normalizeLocale as normalizeRegistered } from "./registry.js";

function deviceLanguages() {
  if (typeof navigator === "undefined") return [];
  return [navigator.language, ...(navigator.languages || [])]
    .filter(Boolean)
    .map((l) => String(l));
}

/**
 * Turkish default for a device in Turkey: TR language, Europe/Istanbul timezone or a
 * "-TR" region (some browsers report en-TR).
 */
export function isTurkeyDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  try {
    const langs = deviceLanguages().map((l) => l.toLowerCase());
    if (langs.some((l) => l === "tr" || l.startsWith("tr-"))) return true;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz === "Europe/Istanbul") return true;

    if (langs.some((l) => l.endsWith("-tr"))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Default UI language when nothing is stored: Turkey first (existing behaviour), then
 * the first device language that matches a selectable locale, else English.
 */
export function detectDefaultLocale() {
  if (isTurkeyDevice()) return normalizeRegistered("tr") || FALLBACK_LOCALE;
  try {
    for (const lang of deviceLanguages()) {
      const hit = normalizeRegistered(lang);
      if (hit) return hit;
    }
  } catch {
    /* ignore */
  }
  return FALLBACK_LOCALE;
}

export function normalizeLocale(value) {
  return normalizeRegistered(value);
}
