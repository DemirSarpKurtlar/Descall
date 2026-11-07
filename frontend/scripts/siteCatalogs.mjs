/**
 * Node side of the site translation store: import the catalogs of the prefixed site
 * languages straight from disk and register them in src/site/siteText.js (the same
 * module instance the prerender bodies use).
 *
 *   site: src/site/i18n/<id>/*.js      (one file per catalog part, see
 *                                       src/site/siteCatalogParts.js; merged here)
 *   app:  src/i18n/locales/<id>.js     (`phrases`, English -> translation)
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => path.join(root, "src", rel);
const load = (rel) => import(pathToFileURL(src(rel)).href);

const { registerSiteCatalog } = await load("site/siteText.js");
const siteLocales = await load("site/siteLocales.js");

export const SITE_CATALOG_DIR = src("site/i18n");

/** Folder of a locale's catalog parts. */
export function siteCatalogDir(id) {
  return path.join(SITE_CATALOG_DIR, id);
}

const LEGACY_PART = "(single file)";
function legacyCatalogFile(id) {
  return path.join(SITE_CATALOG_DIR, `${id}.js`);
}

/** Every part of a locale: { core: {...}, features: {...}, ... } ({} when none exist yet). */
export async function readSiteCatalogParts(id) {
  const dir = siteCatalogDir(id);
  const out = {};
  const stamp = Date.now();
  // A single-file catalog of the old layout (src/site/i18n/<id>.js) still reads; the
  // next write (node scripts/site-i18n.mjs layout) splits it and removes the file.
  const legacy = legacyCatalogFile(id);
  if (existsSync(legacy)) out[LEGACY_PART] = (await import(`${pathToFileURL(legacy).href}?t=${stamp}`)).default || {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) {
    const mod = await import(`${pathToFileURL(path.join(dir, f)).href}?t=${stamp}`);
    out[f.slice(0, -3)] = mod.default || {};
  }
  return out;
}

/** Site catalog object of a locale, all parts merged ({} when it has none yet). */
export async function readSiteCatalog(id) {
  return Object.assign({}, ...Object.values(await readSiteCatalogParts(id)));
}

/**
 * Replace a locale's catalog files with `parts` ({ part: { english: translation } }).
 * `format(id, entries, part)` returns the file text. Empty parts get no file.
 */
export function writeSiteCatalogParts(id, parts, format) {
  const dir = siteCatalogDir(id);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith(".js")) rmSync(path.join(dir, f));
  rmSync(legacyCatalogFile(id), { force: true });
  for (const [part, entries] of Object.entries(parts)) {
    if (!Object.keys(entries).length) continue;
    writeFileSync(path.join(dir, `${part}.js`), format(id, entries, part), "utf8");
  }
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
