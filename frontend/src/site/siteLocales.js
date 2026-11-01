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
 */
import { ALL_LOCALES, getLocaleMeta } from "../i18n/registry.js";
import { SITE_DRAFT_LOCALES } from "./siteDraftLocales.js";

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

export function isMirrorPath(enPath) {
  return SITE_MIRROR_PATHS.includes(cleanPath(enPath));
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
