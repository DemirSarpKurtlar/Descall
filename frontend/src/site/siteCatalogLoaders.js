/**
 * Lazy loaders of every site catalog part (src/site/i18n/<id>/<part>.js), in their own
 * chunk: only a prefixed-language visitor downloads this map (loadSiteCatalog.js imports
 * it on demand), English and Turkish pages never do. "_" files (strings only the
 * prerender uses) are not bundled.
 */
export const SITE_PARTS = import.meta.glob(["./i18n/*/*.js", "!./i18n/*/_*.js"]);
