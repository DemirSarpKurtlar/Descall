/**
 * Public site languages that are still being translated.
 *
 * A locale listed here keeps working in the app, but the marketing site does not
 * ship it yet: no /<prefix>/* routes, no prerendered shells, no sitemap or hreflang
 * entries and no entry in the site language picker. The site i18n gate
 * (node scripts/site-i18n.mjs check, src/site/siteI18n.selftest.mjs) tolerates
 * missing strings only for these locales.
 *
 * To ship a locale on the site: translate it until `node scripts/site-i18n.mjs check`
 * reports 100 % for it, then remove it from this list. Nothing else changes.
 */
export const SITE_DRAFT_LOCALES = ["de", "es", "fr", "pt-BR", "ru"];
