/**
 * Node side of the site translation store: import the catalogs of the prefixed site
 * languages straight from disk and register them in src/site/siteText.js (the same
 * module instance the prerender bodies use).
 *
 *   site: src/site/i18n/<id>.js        (default export, English -> translation)
 *   app:  src/i18n/locales/<id>.js     (`phrases`, English -> translation)
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => path.join(root, "src", rel);
const load = (rel) => import(pathToFileURL(src(rel)).href);

const { registerSiteCatalog } = await load("site/siteText.js");
const siteLocales = await load("site/siteLocales.js");

export const SITE_CATALOG_DIR = src("site/i18n");

export function siteCatalogFile(id) {
  return path.join(SITE_CATALOG_DIR, `${id}.js`);
}

/** Site catalog object of a locale ({} when the file does not exist yet). */
export async function readSiteCatalog(id) {
  const file = siteCatalogFile(id);
  if (!existsSync(file)) return {};
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  return mod.default || {};
}

/** App phrases of a locale ({} when the locale has no app catalog). */
export async function readAppPhrases(id) {
  const file = src(`i18n/locales/${id}.js`);
  if (!existsSync(file)) return {};
  const mod = await import(pathToFileURL(file).href);
  return mod.phrases || mod.default?.phrases || {};
}

/**
 * Register site + app catalogs for every prefixed locale (drafts included: a draft
 * is never routed, so registering it is harmless and lets tooling render it).
 * `overrides` replaces the site catalog of a locale (tests, dry runs).
 */
export async function registerSiteCatalogs({ locales = siteLocales.PREFIXABLE_LOCALES, overrides = {} } = {}) {
  const out = {};
  for (const id of locales) {
    const site = overrides[id] || (await readSiteCatalog(id));
    const app = await readAppPhrases(id);
    registerSiteCatalog(id, { site, app });
    out[id] = { site, app };
  }
  return out;
}
