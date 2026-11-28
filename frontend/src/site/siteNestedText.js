/**
 * Dotted keys ("passkey.login.button.passkey") on the marketing site.
 *
 * The site's slim locale provider (MarketingLocaleProvider) looks phrases up by their
 * English text only. Shared components rendered inside it (the passkey button, its state
 * card and its errors, on the sign-in modal and the adaptive card) ask for nested catalog
 * keys, which the app's provider resolves from `nested` and the site never did: the raw
 * key was shown. This module loads the nested namespaces those components use, per locale
 * and only when a key of the namespace is first asked for (or preloaded), so the marketing
 * first paint carries none of it.
 *
 * Lookup: the locale's namespace, then the English one, then undefined (the caller shows
 * the key). siteNestedText.selftest.mjs.
 */

/** Namespace -> locale -> loader. Same files the app catalogs import (src/i18n/locales). */
const NAMESPACES = {
  passkey: {
    en: () => import("../i18n/locales/passkey.en.js"),
    tr: () => import("../i18n/locales/passkey.tr.js"),
    de: () => import("../i18n/locales/passkey.de.js"),
    es: () => import("../i18n/locales/passkey.es.js"),
    fr: () => import("../i18n/locales/passkey.fr.js"),
    "pt-BR": () => import("../i18n/locales/passkey.pt-BR.js"),
    ru: () => import("../i18n/locales/passkey.ru.js"),
  },
};

const FALLBACK = "en";
const DOTTED_RE = /^[A-Za-z][\w-]*(\.[\w-]+)+$/;

/** "ns:locale" -> catalog object (loaded) */
const loaded = new Map();
/** "ns:locale" -> Promise */
const pending = new Map();
const listeners = new Set();

function namespaceOf(key) {
  const k = String(key || "");
  if (!DOTTED_RE.test(k)) return null;
  const ns = k.slice(0, k.indexOf("."));
  return NAMESPACES[ns] ? ns : null;
}

function getByPath(obj, parts) {
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return typeof cur === "string" && cur !== "" ? cur : undefined;
}

function pickCatalog(mod) {
  if (!mod || typeof mod !== "object") return {};
  for (const v of Object.values(mod)) {
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  }
  return {};
}

function loadOne(ns, locale) {
  const id = `${ns}:${locale}`;
  if (loaded.has(id)) return Promise.resolve(true);
  if (pending.has(id)) return pending.get(id);
  const loader = NAMESPACES[ns]?.[locale];
  if (!loader) return Promise.resolve(false);
  const job = loader()
    .then(
      (mod) => {
        loaded.set(id, pickCatalog(mod));
        return true;
      },
      () => {
        // A chunk that failed (offline) counts as empty: no retry loop on every render,
        // the lookup falls back to English or the key.
        loaded.set(id, {});
        return false;
      }
    )
    .finally(() => {
      pending.delete(id);
      for (const fn of listeners) {
        try {
          fn(locale, ns);
        } catch {
          /* a listener must not break the others */
        }
      }
    });
  pending.set(id, job);
  return job;
}

/** Load a namespace for a locale (and the English fallback). Never rejects. */
export function preloadNested(ns, locale) {
  if (!NAMESPACES[ns]) return Promise.resolve();
  const jobs = [loadOne(ns, FALLBACK)];
  if (locale && locale !== FALLBACK && NAMESPACES[ns][locale]) jobs.push(loadOne(ns, locale));
  return Promise.all(jobs).then(() => undefined);
}

/** True when `key` is a dotted key of a namespace this module serves. */
export function isNestedKey(key) {
  return namespaceOf(key) != null;
}

/**
 * Translation of a dotted key. "" while its namespace is still loading (the load starts
 * here; onNestedCatalog listeners hear when it arrives), so a raw key never flashes;
 * undefined when the key is not one of these namespaces or has no text even in English.
 */
export function nestedLookup(key, locale) {
  const ns = namespaceOf(key);
  if (!ns) return undefined;
  const parts = String(key).split(".").slice(1);
  const ownId = `${ns}:${locale}`;
  const enId = `${ns}:${FALLBACK}`;
  const own = loaded.get(ownId);
  const hit = own ? getByPath(own, parts) : undefined;
  if (hit) return hit;
  const hasOwn = Boolean(NAMESPACES[ns][locale]);
  const en = loaded.get(enId);
  if ((hasOwn && !own) || !en) {
    void preloadNested(ns, locale);
    // English only once the locale's own catalog is in, so a Turkish visitor does not see
    // an English flash before the Turkish label.
    if (pending.has(ownId) || pending.has(enId)) return "";
  }
  return en ? getByPath(en, parts) : undefined;
}

/** Called with (locale, namespace) after a namespace catalog arrived. Returns unsubscribe. */
export function onNestedCatalog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tests: forget what was loaded. */
export function resetNestedCatalogs() {
  loaded.clear();
  pending.clear();
}
