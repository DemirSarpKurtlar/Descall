/**
 * Browser loader for the prefixed site languages. Both catalogs are separate lazy
 * chunks: the site catalog (src/site/i18n/<id>.js) and the app catalog
 * (src/i18n/locales/<id>.js, its `phrases`). English and Turkish visitors never
 * download them. The glob patterns pick up a new locale file without code changes.
 */
import { hasSiteCatalog, registerSiteCatalog } from "./siteText.js";
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

/** Resolves once `id` is registered in siteText.js. Never rejects. */
export function loadSiteCatalog(id) {
  if (!isPrefixedLocale(id)) return Promise.resolve(false);
  if (hasSiteCatalog(id)) return Promise.resolve(true);
  if (pending.has(id)) return pending.get(id);
  const job = Promise.all([load(SITE_CATALOGS, `./i18n/${id}.js`), load(APP_CATALOGS, `../i18n/locales/${id}.js`)])
    .then(([siteMod, appMod]) => {
      const site = siteMod?.default || {};
      const app = appMod?.phrases || appMod?.default?.phrases || {};
      registerSiteCatalog(id, { site, app });
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
