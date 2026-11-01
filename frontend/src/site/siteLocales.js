/**
 * Which languages the public marketing site serves, and how their URLs look.
 *
 * - English stays at unprefixed URLs.
 * - Turkish keeps its hand-written URLs (/tr/*, /iletisim, /gizlilik, ...), see localePaths.js.
 * - Every other live locale from src/i18n/locales.json gets a lowercase prefix derived
 *   from its id (de -> /de, pt-BR -> /pt-br) and mirrors SITE_MIRROR_PATHS.
 *
 * A locale in SITE_DRAFT_LOCALES (siteDraftLocales.js) is known (its prefix can be
 * parsed, its strings can be exported) but not served. Adding a language = an entry in
 * locales.json + src/site/i18n/<id>.js; no code changes.
 *
 * SITE_PAGE_GROUPS are English pages mirrored after launch (blog, niche landings). Each
 * group is served per locale: a locale listed for the group in SITE_DRAFT_PAGE_GROUPS
 * has no twin of those pages yet (isMirrorPath(path, locale) is false for them).
 */
import { ALL_LOCALES, getLocaleMeta } from "../i18n/registry.js";
import { SITE_DRAFT_LOCALES, SITE_DRAFT_PAGE_GROUPS } from "./siteDraftLocales.js";

/** English pages that get a twin under every prefixed locale (/de, /de/features, ...). */
export const SITE_MIRROR_PATHS = [
  "/",
  "/features",
  "/download",
  "/faq",
  "/compare/discord",
  "/about",
  "/contact",
  "/security",
  "/status",
  "/privacy",
  "/terms",
  "/copyright",
  "/who-owns-descall",
  "/discord-alternative",
  "/alternatives",
];

/**
 * English pages mirrored per group, staged with SITE_DRAFT_PAGE_GROUPS. English slugs stay
 * in the localized URLs (/de/blog/discord-vs-descall, /de/apps-like-discord). The blog
 * paths follow BLOG_POSTS in content/discordSeoContent.js (siteLocales.selftest.mjs).
 */
export const SITE_PAGE_GROUPS = Object.freeze({
  blog: [
    "/blog",
    "/blog/discord-vs-descall",
    "/blog/best-discord-alternatives-2026",
    "/blog/apps-like-discord",
    "/blog/discord-competitors",
    "/blog/leave-nitro-keep-voice-chat",
    "/blog/discord-alternative-for-communities-guide",
    "/blog/voice-chat-alternative-to-discord",
    "/blog/migrate-from-discord-to-descall",
  ],
  niche: [
    "/best-discord-alternative-for-gamers",
    "/discord-alternative-for-communities",
    "/discord-alternative-for-voice-chat",
    "/discord-alternative-for-friends",
    "/apps-like-discord",
    "/discord-replacement",
  ],
});

/** Every English page that has (or will have) prefixed twins: SITE_MIRROR_PATHS + the groups. */
export const ALL_MIRROR_PATHS = Object.freeze([...SITE_MIRROR_PATHS, ...Object.values(SITE_PAGE_GROUPS).flat()]);

/** Locales with their own URLs and wording that is not the site catalog. */
const NAMED_LOCALES = new Set(["en", "tr"]);

const LIVE_IDS = ALL_LOCALES.filter((l) => l.status === "live").map((l) => l.id);

/** Live app locales that use a /<prefix> on the site, drafts included. */
export const PREFIXABLE_LOCALES = Object.freeze(LIVE_IDS.filter((id) => !NAMED_LOCALES.has(id)));

/** Site languages, ordered like locales.json. `includeDrafts` is for tooling and tests. */
export function siteLocaleIds({ includeDrafts = false, drafts = SITE_DRAFT_LOCALES } = {}) {
  return LIVE_IDS.filter((id) => includeDrafts || NAMED_LOCALES.has(id) || !drafts.includes(id));
}

/** Languages the site serves today (en, tr, plus every prefixed locale out of draft). */
export const SITE_LOCALES = Object.freeze(siteLocaleIds());

/** Served prefixed locales (de, es, ... once they leave the draft list). */
export const PREFIXED_SITE_LOCALES = Object.freeze(SITE_LOCALES.filter((id) => !NAMED_LOCALES.has(id)));

export function isSiteDraftLocale(id) {
  return SITE_DRAFT_LOCALES.includes(id);
}

/** True for a locale that uses a /<prefix> mirror (served or draft). */
export function isPrefixedLocale(id) {
  return PREFIXABLE_LOCALES.includes(id);
}

/** True when the site serves this language (picker, routes, hreflang). */
export function isSiteLocale(id) {
  return SITE_LOCALES.includes(id);
}

/** "/de", "/pt-br". */
export function localePrefix(id) {
  return `/${String(id).toLowerCase()}`;
}

function cleanPath(pathname = "/") {
  return String(pathname || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

/** Prefixed locale named by the first path segment, or null. */
export function prefixedLocaleFromPath(pathname = "/", locales = PREFIXED_SITE_LOCALES) {
  const p = cleanPath(pathname).toLowerCase();
  for (const id of locales) {
    const pre = localePrefix(id);
    if (p === pre || p.startsWith(`${pre}/`)) return id;
  }
  return null;
}

/** "/de/features" -> "/features", "/de" -> "/". Other paths come back cleaned. */
export function stripPrefixedLocale(pathname = "/", locales = PREFIXED_SITE_LOCALES) {
  const p = cleanPath(pathname);
  const id = prefixedLocaleFromPath(p, locales);
  if (!id) return p;
  return p.slice(localePrefix(id).length) || "/";
}

/** English mirror path -> its twin for a prefixed locale ("/" -> "/de"). */
export function withLocalePrefix(enPath, id) {
  const p = cleanPath(enPath);
  return p === "/" ? localePrefix(id) : `${localePrefix(id)}${p}`;
}

/** Group of a staged mirror page ("blog", "niche"), or null. */
export function pageGroupOf(enPath) {
  const p = cleanPath(enPath);
  for (const [group, paths] of Object.entries(SITE_PAGE_GROUPS)) if (paths.includes(p)) return group;
  return null;
}

let previewPageGroups = false;

/**
 * Tooling only (scripts/site-i18n.mjs): treat every page group as live while the string
 * export renders the staged pages, so they render exactly as they will once served.
 */
export function setPageGroupPreview(on) {
  previewPageGroups = Boolean(on);
}

/** True when `locale` serves the pages of `group` (not listed in SITE_DRAFT_PAGE_GROUPS). */
export function isPageGroupLive(group, locale, pageDrafts = SITE_DRAFT_PAGE_GROUPS) {
  if (previewPageGroups) return true;
  return !(pageDrafts?.[group] || []).includes(locale);
}

/** English pages a prefixed locale mirrors: SITE_MIRROR_PATHS plus its live page groups. */
export function mirrorPathsFor(locale, { pageDrafts = SITE_DRAFT_PAGE_GROUPS } = {}) {
  const groups = Object.keys(SITE_PAGE_GROUPS).filter((g) => isPageGroupLive(g, locale, pageDrafts));
  return [...SITE_MIRROR_PATHS, ...groups.flatMap((g) => SITE_PAGE_GROUPS[g])];
}

/**
 * True when the English page has a /<prefix> twin. Without a locale only SITE_MIRROR_PATHS
 * count; with one, the page groups that locale serves count too.
 */
export function isMirrorPath(enPath, locale, { pageDrafts = SITE_DRAFT_PAGE_GROUPS } = {}) {
  const p = cleanPath(enPath);
  if (SITE_MIRROR_PATHS.includes(p)) return true;
  if (!locale) return false;
  const group = pageGroupOf(p);
  return Boolean(group) && isPageGroupLive(group, locale, pageDrafts);
}

/** Native language name from locales.json ("Deutsch"). */
export function localeNativeName(id) {
  return getLocaleMeta(id)?.name || id;
}

/** "de_DE" for og:locale. English and Turkish keep en_US / tr_TR. */
export function ogLocaleTag(id) {
  if (id === "en") return "en_US";
  if (id === "tr") return "tr_TR";
  return String(getLocaleMeta(id)?.intl || id).replace("-", "_");
}
