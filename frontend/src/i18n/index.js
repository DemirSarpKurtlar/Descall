import { detectDefaultLocale, normalizeLocale } from "./detect.js";
import { applyDocumentLang, readStoredLanguage, writeStoredLanguage } from "./storage.js";
import {
  FALLBACK_LOCALE,
  PSEUDO_LOCALE,
  ALL_LOCALES,
  selectableLocales,
  intlTag,
} from "./registry.js";
import { formatMessage } from "./message.js";
import { pseudoize } from "./pseudo.js";

/**
 * Every registered locale needs a loader here (the coverage selftest checks it).
 * Catalog shape: { nested: { a: { b: "..." } }, phrases: { "English source": "..." } }.
 */
const LOADERS = {
  en: () => import("./locales/en.js"),
  tr: () => import("./locales/tr.js"),
  de: () => import("./locales/de.js"),
  es: () => import("./locales/es.js"),
  fr: () => import("./locales/fr.js"),
  "pt-BR": () => import("./locales/pt-BR.js"),
  ru: () => import("./locales/ru.js"),
};

export const LOCALE_LOADER_IDS = Object.freeze(Object.keys(LOADERS));

/** Picker entries: live locales (plus drafts and pseudo while i18n preview is on). */
export const SUPPORTED_LOCALES = selectableLocales().map((l) => ({
  id: l.id,
  nativeLabel: l.name,
  englishName: l.englishName,
  status: l.status,
}));

const EMPTY = Object.freeze({ phrases: {}, nested: {} });
const catalogs = {};
for (const l of ALL_LOCALES) catalogs[l.id] = EMPTY;

const loading = new Map();
const loaded = new Set();

function loadOne(id) {
  if (loaded.has(id)) return Promise.resolve();
  if (loading.has(id)) return loading.get(id);
  const loader = LOADERS[id];
  if (!loader) return Promise.resolve();
  const p = loader()
    .then((mod) => {
      const cat = mod.default || mod;
      catalogs[id] = { nested: cat.nested || {}, phrases: cat.phrases || {} };
      loaded.add(id);
    })
    .catch((err) => {
      console.warn(`[i18n] catalog ${id} failed to load`, err);
    })
    .finally(() => loading.delete(id));
  loading.set(id, p);
  return p;
}

/** Load the catalogs a locale needs (itself plus the English fallback). */
export function ensureLocaleLoaded(locale) {
  const id = locale === PSEUDO_LOCALE ? FALLBACK_LOCALE : locale;
  return Promise.all([loadOne(FALLBACK_LOCALE), id ? loadOne(id) : null]).then(() => undefined);
}

/**
 * App boot: English, Turkish (kept for existing callers) and the starting locale.
 * Marketing entry must NOT call this, use slim phrases instead.
 */
export function loadI18nCatalogs(locale = resolveInitialLocale()) {
  return Promise.all([loadOne(FALLBACK_LOCALE), loadOne("tr"), ensureLocaleLoaded(locale)]).then(
    () => undefined
  );
}

export function i18nCatalogsReady(locale) {
  if (!loaded.has(FALLBACK_LOCALE)) return false;
  return locale ? loaded.has(locale === PSEUDO_LOCALE ? FALLBACK_LOCALE : locale) : true;
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Keys a non-English locale had to answer from English (preview / e2e diagnostics). */
const misses = new Map();
function noteMiss(locale, key) {
  if (locale === FALLBACK_LOCALE || !loaded.has(locale)) return;
  let set = misses.get(locale);
  if (!set) {
    set = new Set();
    misses.set(locale, set);
  }
  if (set.size < 5000) set.add(key);
}
export function missingTranslations(locale) {
  return [...(misses.get(locale) || [])];
}
if (typeof window !== "undefined") {
  try {
    window.__descallI18nMisses = (locale) => missingTranslations(locale);
  } catch {
    /* ignore */
  }
}

/**
 * Raw (unformatted) message for a key or English source string.
 * Lookup: locale nested path -> locale phrase -> locale phrase of the English nested
 * value -> English. Returns { text, found } where found=false means English fallback.
 */
function resolveRaw(locale, k) {
  const cat = catalogs[locale] || catalogs[FALLBACK_LOCALE];
  const nestedHit = getByPath(cat.nested, k);
  if (nestedHit != null) return { text: nestedHit, found: true };

  const phraseHit = cat.phrases?.[k];
  if (phraseHit != null) return { text: phraseHit, found: true };

  const en = catalogs[FALLBACK_LOCALE];
  const enNested = getByPath(en.nested, k);
  if (enNested != null) {
    const fromPhrase = cat.phrases?.[enNested];
    if (fromPhrase != null) return { text: fromPhrase, found: true };
    return { text: enNested, found: locale === FALLBACK_LOCALE };
  }
  if (locale !== FALLBACK_LOCALE) {
    const enPhrase = en.phrases?.[k];
    if (enPhrase != null) return { text: enPhrase, found: false };
  }
  return { text: k, found: locale === FALLBACK_LOCALE };
}

/**
 * Translate a key or English source string.
 * Lookup order: nested path -> phrases[exact] -> English (fallback). Messages may use
 * {name}, {{name}}, and ICU plural / select (see message.js).
 */
export function translate(locale, key, vars) {
  if (key == null) return "";
  const k = String(key);
  if (locale === PSEUDO_LOCALE) {
    const { text } = resolveRaw(FALLBACK_LOCALE, k);
    return formatMessage(pseudoize(text), vars, intlTag(FALLBACK_LOCALE));
  }
  const id = catalogs[locale] ? locale : FALLBACK_LOCALE;
  const { text, found } = resolveRaw(id, k);
  if (!found) noteMiss(id, k);
  return formatMessage(text, vars, intlTag(id));
}

export function resolveInitialLocale({ meLanguage } = {}) {
  const stored = normalizeLocale(readStoredLanguage());
  if (stored) return stored;
  const fromMe = normalizeLocale(meLanguage);
  if (fromMe) return fromMe;
  return detectDefaultLocale();
}

export function persistLocale(locale) {
  const normalized = normalizeLocale(locale) || FALLBACK_LOCALE;
  writeStoredLanguage(normalized);
  applyDocumentLang(normalized);
  return normalized;
}

try {
  applyDocumentLang(resolveInitialLocale());
} catch {
  /* ignore */
}

export { detectDefaultLocale, normalizeLocale, applyDocumentLang, readStoredLanguage };
export default translate;
