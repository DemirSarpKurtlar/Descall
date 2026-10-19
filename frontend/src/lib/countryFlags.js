// Country flag badges (2.13.0): one shop category `countries`, 245 flags, one
// equipped per user. Pure helpers shared by the shop, the inventory and every
// place a flag is drawn. No React here so the selftest can import it directly.

export const COUNTRY_CATEGORY = "countries";
export const COUNTRY_PRICE = 250;

export const COUNTRY_REGIONS = Object.freeze([
  { id: "europe", label: "Europe" },
  { id: "asia", label: "Asia" },
  { id: "africa", label: "Africa" },
  { id: "north_america", label: "North America" },
  { id: "south_america", label: "South America" },
  { id: "oceania", label: "Oceania" },
  { id: "antarctica", label: "Antarctica" },
]);

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

/** Turkish name as stored ("🇹🇷 Türkiye" → "Türkiye"). */
export function countryNameTr(item) {
  const name = String(item?.name || "").trim();
  const code = countryCode(item);
  const flag = code ? flagEmoji(code) : "";
  return (flag && name.startsWith(flag) ? name.slice(flag.length) : name).trim() || code || "";
}

const displayNamesCache = new Map();
function regionDisplayName(code, locale) {
  try {
    if (!displayNamesCache.has(locale)) displayNamesCache.set(locale, new Intl.DisplayNames([locale], { type: "region" }));
    const out = displayNamesCache.get(locale).of(code);
    return out && out !== code ? out : null;
  } catch {
    return null;
  }
}

/** Name in the UI language: Turkish from the catalog, English from Intl. */
export function countryName(item, locale = "tr") {
  if (locale === "tr") return countryNameTr(item);
  const code = countryCode(item);
  return (code && regionDisplayName(code, "en")) || countryNameTr(item);
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

/** Matches Turkish name, English name or ISO code. */
export function matchesCountry(item, query) {
  const q = searchKey(query);
  if (!q) return true;
  const code = countryCode(item) || "";
  if (q.length <= 2 && code.toLowerCase() === q) return true;
  const names = [countryNameTr(item), code ? regionDisplayName(code, "en") : null, code];
  return names.some((n) => n && searchKey(n).includes(q));
}

const collators = new Map();
function collator(locale) {
  const key = locale === "tr" ? "tr" : "en";
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

/** First letter for the A–Z headers and the letter rail (Turkish casing: i → İ). */
export function initialOf(item, locale = "tr") {
  const name = countryName(item, locale);
  const first = (Array.from(name)[0] || "#").toLocaleUpperCase(locale === "tr" ? "tr" : "en");
  // Keep the Turkish letters (Ç Ğ İ Ö Ş Ü) as their own groups; fold the rest (Å → A).
  if (locale === "tr" && "ÇĞİÖŞÜ".includes(first)) return first;
  const folded = first.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^[A-Z]$/.test(folded) ? folded : first;
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

/**
 * Windows (Segoe UI Emoji) draws regional-indicator pairs as two letters, so
 * flags need the bundled Twemoji flag font there. A colour pixel in a drawn
 * flag means the system font already has it.
 */
export function systemDrawsFlags() {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return true;
    ctx.textBaseline = "top";
    ctx.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillText(flagEmoji("CH"), 0, 0);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a > 0 && (Math.abs(r - g) > 40 || Math.abs(g - b) > 40)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Adds `html.flag-font` once when the system cannot draw flag emoji. */
export function installFlagFont() {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  if (root.dataset.flagFontChecked) return root.classList.contains("flag-font");
  root.dataset.flagFontChecked = "1";
  const needs = !systemDrawsFlags();
  root.classList.toggle("flag-font", needs);
  return needs;
}
