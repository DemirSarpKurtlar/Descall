/**
 * Layout of the prefixed-language site catalogs (de, es, fr, pt-BR, ru, ...): one folder
 * per locale, src/site/i18n/<id>/, with
 *
 *   core.js         strings of the site chrome (header, footer, dialogs, cookie banner)
 *                   and every string more than one page uses; every page loads it
 *   <page>.js       strings only that page uses ("features", "compare-discord",
 *                   "blog-discord-competitors"); loaded with the page
 *   _prerender.js   strings only the prerendered HTML uses (build time, never downloaded)
 *
 * so /de/features downloads core + features instead of every mirrored page's text.
 * scripts/site-i18n.mjs writes the files (import, bake, prune, layout) and its check
 * fails when a string sits in a part its page does not load.
 */
import { PREFIXABLE_LOCALES, stripPrefixedLocale } from "./siteLocales.js";

export const CORE_PART = "core";
/** File of the strings only the prerender uses; the browser loader skips "_" files. */
export const PRERENDER_PART = "_prerender";

/** Catalog part of an English page path: "/" -> "home", "/compare/discord" -> "compare-discord". */
export function sitePagePart(enPath) {
  const p = String(enPath || "/").split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase() || "/";
  if (p === "/") return "home";
  return p.slice(1).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Parts a page of a prefixed locale loads, by URL ("/de/features" -> ["core", "features"]). */
export function sitePartsForPath(pathname) {
  return [CORE_PART, sitePagePart(stripPrefixedLocale(pathname, PREFIXABLE_LOCALES))];
}
