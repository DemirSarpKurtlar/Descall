// Country flag badges (2.13.0): one shop category `countries`, 245 flags, one
// equipped per user. Pure helpers shared by the shop, the inventory and every
// place a flag is drawn. No React here so the selftest can import it directly.
// Country names come from Intl (i18n/format.js displayName) in the UI language.
import { displayName, upper } from "../i18n/format.js";
import { intlTag } from "../i18n/registry.js";

export const COUNTRY_CATEGORY = "countries";
export const COUNTRY_PRICE = 250;

/** Continent filters; `labelKey` is the catalog key of the chip label. */
export const COUNTRY_REGIONS = Object.freeze(
  ["europe", "asia", "africa", "north_america", "south_america", "oceania", "antarctica"].map((id) =>
    Object.freeze({ id, labelKey: `shop.regions.${id}` })
  )
);

/** Countries that sit on two continents show up under both filters. */
const TRANSCONTINENTAL = Object.freeze({
  TR: ["europe", "asia"],
  RU: ["europe", "asia"],
  AZ: ["asia", "europe"],
  GE: ["asia", "europe"],
  KZ: ["asia", "europe"],
  CY: ["europe", "asia"],
  AM: ["asia", "europe"],
});

/** Seed for "Popular" until real equip counts exist: Descall's signup countries first. */
export const POPULAR_CODES = Object.freeze(["TR", "AZ", "DE", "US", "BR", "GB", "NL", "FR", "JP", "KR", "IT", "ES"]);

const REGIONAL_A = 0x1f1e6;

/** "TR" → "🇹🇷". Returns "" for anything that is not two A–Z letters. */
export function flagEmoji(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(REGIONAL_A + c.charCodeAt(0) - 65, REGIONAL_A + c.charCodeAt(1) - 65);
}

/** "🇹🇷" → "TR" (null when the string does not start with a flag). */
export function codeFromFlag(text) {
  const cps = Array.from(String(text || "")).slice(0, 2).map((ch) => ch.codePointAt(0));
  if (cps.length < 2 || cps.some((cp) => cp < REGIONAL_A || cp > REGIONAL_A + 25)) return null;
  return String.fromCharCode(65 + cps[0] - REGIONAL_A, 65 + cps[1] - REGIONAL_A);
}

export function countryCode(item) {
  if (!item) return null;
  const code = String(item.country_code || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  return codeFromFlag(item.badge_icon) || codeFromFlag(item.name) || null;
}

export function isCountryItem(item) {
  return item?.category === COUNTRY_CATEGORY && Boolean(countryCode(item));
}

/** Name as stored in the shop row, without the flag ("🇹🇷 Türkiye" → "Türkiye"). */
export function countryNameTr(item) {
  const name = String(item?.name || "").trim();
  const code = countryCode(item);
  const flag = code ? flagEmoji(code) : "";
  return (flag && name.startsWith(flag) ? name.slice(flag.length) : name).trim() || code || "";
}

/**
 * Curated names that differ from Intl, per UI locale: Turkish keeps the names the shop
 * launched with, English keeps the "St." / "U.S." style. Other locales use Intl as is.
 */
const CURATED_NAMES = Object.freeze({
  tr: Object.freeze({
    CD: "Kongo Demokratik Cumhuriyeti",
    CG: "Kongo Cumhuriyeti",
    CI: "Fildişi Sahili",
    HK: "Hong Kong",
    MO: "Makao",
    PS: "Filistin",
  }),
  en: Object.freeze({
    BL: "St. Barthélemy",
    KN: "St. Kitts & Nevis",
    LC: "St. Lucia",
    PM: "St. Pierre & Miquelon",
    SH: "St. Helena",
    VC: "St. Vincent & Grenadines",
    VI: "U.S. Virgin Islands",
  }),
});

function regionDisplayName(code, locale) {
  const out = displayName(code, locale, "region");
  return out && out !== code ? out : null;
}

/** Name in the UI language (Intl, with the curated names above). */
export function countryName(item, locale = "tr") {
  const code = countryCode(item);
  if (!code) return countryNameTr(item);
  return CURATED_NAMES[locale]?.[code] || regionDisplayName(code, locale) || countryNameTr(item);
}

export function countryRegions(item) {
  const code = countryCode(item);
  if (code && TRANSCONTINENTAL[code]) return TRANSCONTINENTAL[code];
  return item?.country_region ? [item.country_region] : [];
}

export function primaryRegion(item) {
  return countryRegions(item)[0] || null;
}

export function isTerritory(item) {
  return item?.country_kind === "territory";
}

/** Case, accent and dotless-i insensitive key for search ("Türkiye" ≈ "TURKIYE" ≈ "turkiye"). */
export function searchKey(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Matches the name in the UI language, the English name, the stored name or the ISO code. */
export function matchesCountry(item, query, locale = "tr") {
  const q = searchKey(query);
  if (!q) return true;
  const code = countryCode(item) || "";
  if (q.length <= 2 && code.toLowerCase() === q) return true;
  const names = [countryName(item, locale), countryName(item, "en"), countryNameTr(item), code];
  return names.some((n) => n && searchKey(n).includes(q));
}

const collators = new Map();
function collator(locale) {
  const key = intlTag(locale);
  if (!collators.has(key)) collators.set(key, new Intl.Collator(key, { sensitivity: "base" }));
  return collators.get(key);
}

export function sortCountries(items, mode = "popular", locale = "tr") {
  const list = [...(items || [])];
  const byName = (a, b) => collator(locale).compare(countryName(a, locale), countryName(b, locale));
  if (mode !== "popular") return list.sort(byName);
  const rank = (item) => {
    const i = POPULAR_CODES.indexOf(countryCode(item));
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return list.sort((a, b) => rank(a) - rank(b) || byName(a, b));
}

/** First letter for the A–Z headers and the letter rail, cased for the locale (tr: i → İ). */
export function initialOf(item, locale = "tr") {
  const name = countryName(item, locale);
  const first = upper(Array.from(name)[0] || "#", locale);
  // Letters the language sorts as their own (Turkish Ç Ğ İ Ö Ş Ü, Spanish Ñ) keep their
  // group; accents the language ignores fold into the base letter (Å → A).
  const folded = first.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/^[A-Z]$/.test(folded)) return first;
  return collator(locale).compare(first, folded) === 0 ? folded : first;
}

/** `[{ letter, items }]` in order, for an already name-sorted list. */
export function groupByLetter(items, locale = "tr") {
  const groups = [];
  for (const item of items || []) {
    const letter = initialOf(item, locale);
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.items.push(item);
    else groups.push({ letter, items: [item] });
  }
  return groups;
}

// Flag-font detection lives in ./flagFont.js so the first-paint entry chunk
// (main.jsx) does not pull in this whole module and its country tables.
export { systemDrawsFlags, installFlagFont } from "./flagFont.js";
