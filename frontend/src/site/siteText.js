/**
 * Translation store for the prefixed site languages (de, es, ...). English and Turkish
 * never go through here: English is the source, Turkish has its own hand-written copy.
 *
 * Lookup for a locale: the site catalog (src/site/i18n/<id>.js), then the app phrases
 * (src/i18n/locales/<id>.js `phrases`), then the English text itself.
 *
 * Nothing is imported here: the prerender registers catalogs it imported directly, the
 * browser registers them from loadSiteCatalog.js once the lazy chunks arrive. This keeps
 * the catalogs out of the marketing first paint.
 */

const catalogs = new Map();
let recorder = null;

/** Register (or replace) the catalogs of one locale. */
export function registerSiteCatalog(id, { site = {}, app = {} } = {}) {
  catalogs.set(id, { site: site || {}, app: app || {} });
}

export function hasSiteCatalog(id) {
  return catalogs.has(id);
}

/** Tests and tooling: forget everything that was registered. */
export function resetSiteCatalogs() {
  catalogs.clear();
}

/**
 * Called with (english, locale) for every lookup while set. The string export uses it
 * to list exactly the text the prefixed pages ask for. Pass null to stop.
 */
export function setSiteTextRecorder(fn) {
  recorder = typeof fn === "function" ? fn : null;
}

/** Translation or undefined. Empty strings count as missing. */
export function siteLookup(english, id) {
  const cat = catalogs.get(id);
  if (!cat) return undefined;
  const key = String(english);
  const site = cat.site[key];
  if (typeof site === "string" && site !== "") return site;
  const app = cat.app[key];
  if (typeof app === "string" && app !== "") return app;
  return undefined;
}

/** Where a translation comes from: "site", "app" or null. */
export function siteLookupSource(english, id) {
  const cat = catalogs.get(id);
  if (!cat) return null;
  const key = String(english);
  if (typeof cat.site[key] === "string" && cat.site[key] !== "") return "site";
  if (typeof cat.app[key] === "string" && cat.app[key] !== "") return "app";
  return null;
}

/** Translate English text for a prefixed locale; falls back to the English text. */
export function siteText(english, id) {
  if (english == null) return english;
  const key = String(english);
  if (recorder) recorder(key, id);
  return siteLookup(key, id) ?? key;
}
