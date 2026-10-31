/**
 * Translate outside React (notifications, services, plain modules).
 *
 * This module does not import the catalogs: index.js binds translate() here when it
 * loads (the app always loads it at boot). Until then keys come back as written,
 * which is also what an unloaded catalog would return. Keeping index.js out of this
 * import graph keeps the marketing first paint small.
 */
import { resolveInitialLocale } from "./boot.js";
import { normalizeLocale } from "./registry.js";

let currentLocale = resolveInitialLocale();
let translator = null;

function fallback(key, vars) {
  const s = key == null ? "" : String(key);
  if (!vars) return s;
  return s.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, a, b) => {
    const k = a || b;
    return vars[k] != null ? String(vars[k]) : "";
  });
}

/** Called by index.js once; later calls replace the translator (tests). */
export function bindTranslator(fn) {
  translator = typeof fn === "function" ? fn : null;
}

if (typeof window !== "undefined") {
  window.addEventListener("descall:locale", (e) => {
    const next = normalizeLocale(e?.detail?.locale);
    if (next) currentLocale = next;
  });
}

export function t(key, vars) {
  return translator ? translator(currentLocale, key, vars) : fallback(key, vars);
}

export function getLocale() {
  return currentLocale;
}

export function setRuntimeLocale(locale) {
  const next = normalizeLocale(locale);
  if (next) currentLocale = next;
}
