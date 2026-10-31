import { resolveInitialLocale, translate } from "./index.js";
import { normalizeLocale } from "./registry.js";

let currentLocale = resolveInitialLocale();

if (typeof window !== "undefined") {
  window.addEventListener("descall:locale", (e) => {
    const next = normalizeLocale(e?.detail?.locale);
    if (next) currentLocale = next;
  });
}

/** Translate outside React (notifications, services, plain modules). */
export function t(key, vars) {
  return translate(currentLocale, key, vars);
}

export function getLocale() {
  return currentLocale;
}

export function setRuntimeLocale(locale) {
  const next = normalizeLocale(locale);
  if (next) currentLocale = next;
}
