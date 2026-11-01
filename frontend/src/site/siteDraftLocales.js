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
export const SITE_DRAFT_LOCALES = [];

/**
 * Page groups added to a locale that is already live, while their text is still being
 * translated. Key: a group of SITE_PAGE_GROUPS (siteLocales.js). Value: the prefixed
 * locales whose twins of those pages are not served yet.
 *
 * For a locale listed under a group, the group's pages get no /<prefix>/* routes, no
 * prerendered shells, no sitemap, hreflang or language picker entry, and links from
 * the localized pages keep pointing at the English page. Every other page of the locale
 * is served as usual. The site i18n gate tolerates missing strings that only these pages
 * use; strings shared with a live page stay strict.
 *
 * To turn a group on for a locale: translate until `node scripts/site-i18n.mjs check`
 * reports the group at 100 % for it, then remove the id here (an empty list or a
 * missing group means the group is live for every served locale).
 */
export const SITE_DRAFT_PAGE_GROUPS = {
  blog: [],
  niche: [],
};
