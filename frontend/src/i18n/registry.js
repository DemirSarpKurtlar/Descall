/**
 * UI language registry. The data lives in locales.json (shared with the backend,
 * the coverage check and the native build scripts); this module adds the lookups.
 *
 * To add a language: add an entry to locales.json with status "draft", add
 * src/i18n/locales/<id>.js, register its loader in src/i18n/index.js, translate until
 * node scripts/i18n-check.mjs reports 100 %, then set status to "live".
 *
 * status:
 *   live   - selectable, auto-detected, must be 100 % translated (CI enforces it)
 *   draft  - being translated; hidden unless i18n preview is on (see isPreviewEnabled)
 *
 * The pseudo locale "qps" is generated from English at runtime and is preview only. It
 * wraps every translated string in markers so a screenshot shows untranslated text at
 * a glance.
 */
import data from "./locales.json" with { type: "json" };

export const FALLBACK_LOCALE = data.fallback;
export const PSEUDO_LOCALE = "qps";

const PSEUDO_META = Object.freeze({ id: PSEUDO_LOCALE, name: "Pseudo", intl: "en-GB", dir: "ltr", status: "pseudo" });

export const ALL_LOCALES = Object.freeze(data.locales.map((l) => Object.freeze({ ...l })));
const BY_ID = new Map(ALL_LOCALES.map((l) => [l.id, l]));
BY_ID.set(PSEUDO_LOCALE, PSEUDO_META);

const PREVIEW_KEY = "descall_i18n_preview";

/** Draft and pseudo locales are visible only with localStorage descall_i18n_preview=1. */
export function isPreviewEnabled() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

export function isSelectable(meta, { preview = isPreviewEnabled() } = {}) {
  if (!meta) return false;
  if (meta.status === "live") return true;
  return !!preview;
}

/** Locales shown in the language picker (live, plus drafts and pseudo in preview). */
export function selectableLocales({ preview = isPreviewEnabled() } = {}) {
  const list = ALL_LOCALES.filter((l) => isSelectable(l, { preview }));
  if (preview) list.push(PSEUDO_META);
  return list;
}

export function liveLocales() {
  return ALL_LOCALES.filter((l) => l.status === "live");
}

export function getLocaleMeta(id) {
  return BY_ID.get(id) || null;
}

/**
 * Map any language value ("tr", "TR-tr", "pt", "pt_PT", "es-MX", "de-AT") to a
 * registered locale id, or null. Exact id first, then same base language. Only
 * selectable locales are returned, so a draft never leaks to normal users.
 */
export function normalizeLocale(value, { preview = isPreviewEnabled() } = {}) {
  const raw = String(value || "").trim().replace(/_/g, "-");
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const pick = (meta) => (isSelectable(meta, { preview }) ? meta.id : null);

  for (const meta of BY_ID.values()) {
    if (meta.id.toLowerCase() === lower) return pick(meta);
  }
  const base = lower.split("-")[0];
  if (!/^[a-z]{2,3}$/.test(base) || base === PSEUDO_LOCALE) return null;
  for (const meta of ALL_LOCALES) {
    if (meta.id.toLowerCase().split("-")[0] === base) {
      const hit = pick(meta);
      if (hit) return hit;
    }
  }
  return null;
}

/** BCP 47 tag for Intl (dates, numbers, plurals). */
export function intlTag(id) {
  return (BY_ID.get(id) || BY_ID.get(FALLBACK_LOCALE)).intl;
}

export function textDirection(id) {
  return (BY_ID.get(id) || BY_ID.get(FALLBACK_LOCALE)).dir === "rtl" ? "rtl" : "ltr";
}

/** Value for <html lang>. */
export function htmlLang(id) {
  const meta = BY_ID.get(id);
  if (!meta || meta.id === PSEUDO_LOCALE) return FALLBACK_LOCALE;
  return meta.id;
}

