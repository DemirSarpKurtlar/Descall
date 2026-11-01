/**
 * Browser loader for the prefixed site languages. Both catalogs are separate lazy
 * chunks: the site catalog (src/site/i18n/<id>.js, small, awaited before the first
 * render) and the app catalog (src/i18n/locales/<id>.js `phrases`, large, fetched only
 * when a lookup misses the site catalog). English and Turkish visitors never
 * download them. The glob patterns pick up a new locale file without code changes.
 */
import { hasSiteCatalog, registerSiteCatalog, setSiteMissHandler } from "./siteText.js";
import { isPrefixedLocale } from "./siteLocales.js";

const SITE_CATALOGS = import.meta.glob("./i18n/*.js");
// Top-level locale catalogs only (de.js, pt-BR.js); namespace files have a second dot.
const APP_CATALOGS = import.meta.glob(["../i18n/locales/*.js", "!../i18n/locales/*.*.js"]);

const pending = new Map();

function load(map, file) {
  const loader = map[file];
  if (!loader) return Promise.resolve({});
  return loader().then(
    (mod) => mod,
    () => ({})
  );
}

const appLoads = new Map();
const appListeners = new Set();

/** Called after an app catalog arrives, so the provider can re-render. */
export function onSiteAppCatalog(fn) {
  appListeners.add(fn);
  return () => appListeners.delete(fn);
}

/** Load the app phrases of `id` once and merge them behind the site catalog. */
function loadAppCatalog(id) {
  if (appLoads.has(id)) return appLoads.get(id);
  const job = load(APP_CATALOGS, `../i18n/locales/${id}.js`).then((appMod) => {
    const app = appMod?.phrases || appMod?.default?.phrases || {};
    const site = siteCatalogs.get(id) || {};
    registerSiteCatalog(id, { site, app });
    for (const fn of appListeners) {
      try {
        fn(id);
      } catch {
        /* a listener must not break the others */
      }
    }
    return true;
  });
  appLoads.set(id, job);
  return job;
}

const siteCatalogs = new Map();
setSiteMissHandler((id) => {
  if (siteCatalogs.has(id) && !appLoads.has(id)) loadAppCatalog(id);
});

/**
 * Resolves once `id` is registered in siteText.js. Never rejects. Only the small site
 * catalog is awaited (it holds every string the localized pages use); the app catalog
 * loads later, and only if a lookup misses.
 */
export function loadSiteCatalog(id) {
  if (!isPrefixedLocale(id)) return Promise.resolve(false);
  if (hasSiteCatalog(id)) return Promise.resolve(true);
  if (pending.has(id)) return pending.get(id);
  const job = load(SITE_CATALOGS, `./i18n/${id}.js`)
    .then((siteMod) => {
      const site = siteMod?.default || {};
      siteCatalogs.set(id, site);
      registerSiteCatalog(id, { site, app: {} });
      return true;
    })
    .catch(() => false)
    .finally(() => pending.delete(id));
  pending.set(id, job);
  return job;
}

/** Same as loadSiteCatalog, but gives up waiting after `ms` (the load keeps going). */
export function loadSiteCatalogWithin(id, ms = 4000) {
  return Promise.race([loadSiteCatalog(id), new Promise((resolve) => setTimeout(() => resolve(false), ms))]);
}
