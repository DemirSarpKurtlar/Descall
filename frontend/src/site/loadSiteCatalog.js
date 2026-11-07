/**
 * Browser loader for the prefixed site languages. The site catalog of a locale is split
 * by page (src/site/siteCatalogParts.js): a page loads the "core" part (chrome and strings
 * several pages share) plus its own part, each a small lazy chunk awaited before the page
 * renders. The app catalog (src/i18n/locales/<id>.js `phrases`, large) is fetched only
 * when a lookup on a page whose parts are loaded still misses. English and Turkish
 * visitors never download any of them. The glob patterns pick up a new locale or page
 * without code changes; "_" files (strings only the prerender uses) are never bundled.
 * The map of part loaders is its own chunk (siteCatalogLoaders.js), so English pages do
 * not carry it; prefixed shells modulepreload it with their parts (prerender-seo.mjs).
 */
import { registerSiteCatalog, setSiteMissHandler } from "./siteText.js";
import { isPrefixedLocale } from "./siteLocales.js";
import { sitePartsForPath } from "./siteCatalogParts.js";

// Top-level locale catalogs only (de.js, pt-BR.js); namespace files have a second dot.
const APP_CATALOGS = import.meta.glob(["../i18n/locales/*.js", "!../i18n/locales/*.*.js"]);

function load(map, file) {
  const loader = map[file];
  if (!loader) return Promise.resolve({});
  return loader().then(
    (mod) => mod,
    () => ({})
  );
}

/** Per locale: merged site strings, the parts that arrived (or failed), app phrases. */
const state = new Map();
function stateOf(id) {
  if (!state.has(id)) state.set(id, { site: {}, done: new Set(), pending: new Map(), app: null });
  return state.get(id);
}

const listeners = new Set();

/**
 * Called with (locale) after a catalog part or the app catalog arrived, so the provider
 * re-renders (SeoHead and other components outside the suspended page pick up the text).
 */
export function onSiteCatalogChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
/** Older name of onSiteCatalogChange. */
export const onSiteAppCatalog = onSiteCatalogChange;

function publish(id) {
  const s = stateOf(id);
  registerSiteCatalog(id, { site: s.site, app: s.app || {} });
  for (const fn of listeners) {
    try {
      fn(id);
    } catch {
      /* a listener must not break the others */
    }
  }
}

const currentPath = () => (typeof window !== "undefined" ? window.location.pathname : "/");

/** True when every catalog part the page at `pathname` needs has been loaded (or tried). */
export function siteCatalogReady(id, pathname = currentPath()) {
  if (!isPrefixedLocale(id)) return true;
  const s = stateOf(id);
  return sitePartsForPath(pathname).every((part) => s.done.has(part));
}

let loaders = null;
function partLoaders() {
  loaders ||= import("./siteCatalogLoaders.js").then(
    (m) => m.SITE_PARTS,
    () => {
      loaders = null;
      return {};
    }
  );
  return loaders;
}

function loadPart(id, part) {
  const s = stateOf(id);
  if (s.done.has(part)) return Promise.resolve(true);
  if (s.pending.has(part)) return s.pending.get(part);
  const job = partLoaders().then((map) => load(map, `./i18n/${id}/${part}.js`)).then((mod) => {
    Object.assign(s.site, mod?.default || {});
    s.done.add(part);
    s.pending.delete(part);
    return true;
  });
  s.pending.set(part, job);
  return job;
}

/** Load the app phrases of `id` once and merge them behind the site catalog. */
function loadAppCatalog(id) {
  const s = stateOf(id);
  if (s.appJob) return s.appJob;
  s.appJob = load(APP_CATALOGS, `../i18n/locales/${id}.js`).then((appMod) => {
    s.app = appMod?.phrases || appMod?.default?.phrases || {};
    publish(id);
    return true;
  });
  return s.appJob;
}

// A miss on a page whose parts are all here is a string the site catalog lacks: fall back
// to the app catalog. A miss while a page's parts are still on their way (a route change
// renders SeoHead before the page suspends) is not.
setSiteMissHandler((id) => {
  if (!state.has(id) || stateOf(id).appJob) return;
  if (siteCatalogReady(id)) loadAppCatalog(id);
});

/**
 * Resolves once the parts of `id` that the page at `pathname` needs are registered in
 * siteText.js. Never rejects (a part that fails to load counts as loaded: the page then
 * falls back to the app catalog and English).
 */
export function loadSiteCatalog(id, pathname = currentPath()) {
  if (!isPrefixedLocale(id)) return Promise.resolve(false);
  if (siteCatalogReady(id, pathname)) return Promise.resolve(true);
  return Promise.all(sitePartsForPath(pathname).map((part) => loadPart(id, part))).then(() => {
    publish(id);
    return true;
  });
}

/** Same as loadSiteCatalog, but gives up waiting after `ms` (the load keeps going). */
export function loadSiteCatalogWithin(id, ms = 4000, pathname = currentPath()) {
  return Promise.race([loadSiteCatalog(id, pathname), new Promise((resolve) => setTimeout(() => resolve(false), ms))]);
}
