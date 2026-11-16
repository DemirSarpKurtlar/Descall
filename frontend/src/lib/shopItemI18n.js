// Localized names and descriptions for shop catalog rows.
// The text lives in the i18n catalogs (namespace `shopItems`, keyed by sku: name, desc,
// and `stem` for chat bubbles); see i18n/locales/shopItems.en.js. The database rows stay
// English and are the fallback for a sku the catalogs do not know yet. Rows whose
// description follows a seed pattern use the catalog template of that pattern with the
// localized name. Country items have no entries: their names come from Intl
// (countryFlags.js countryName).
//
// Market 2.0 (`s2-` skus) carries its own text: the catalog payload has
// `i18n: { name: { tr, en, ... }, description: { ... } }` (shop2 API / shop_items.i18n),
// or `name` / `description` as such objects (catalog data files), or `name_i18n` /
// `description_i18n`. Those win over the namespace catalogs; the row strings stay the
// fallback.
import { translate } from "../i18n/index.js";

/** Pick `locale` from a { locale: text } map: exact, base language, en, tr, any. */
export function pickLocalized(map, locale) {
  if (!map || typeof map !== "object") return null;
  const ok = (v) => (typeof v === "string" && v.trim() ? v : null);
  const want = String(locale || "");
  if (ok(map[want])) return map[want];
  const base = want.split("-")[0];
  if (base && ok(map[base])) return map[base];
  // "pt" asks for "pt-BR" (and any other region variant of the same language).
  const variant = base ? Object.keys(map).find((k) => k.split("-")[0] === base && ok(map[k])) : null;
  if (variant) return map[variant];
  return ok(map.en) || ok(map.tr) || Object.values(map).find(ok) || null;
}

/** { name, description } maps an item carries itself (Market 2.0), or null. */
function ownText(item) {
  const i18n = item?.i18n && typeof item.i18n === "object" ? item.i18n : null;
  const name = i18n?.name || item?.name_i18n || (item?.name && typeof item.name === "object" ? item.name : null);
  const description =
    i18n?.description || item?.description_i18n || (item?.description && typeof item.description === "object" ? item.description : null);
  return name || description ? { name, description } : null;
}

/** English row text when the field is a map (keeps old callers on strings). */
function rowString(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return pickLocalized(value, "en") || "";
  return "";
}

// Seed-pattern descriptions (English, as stored) -> template id in shopItems._templates.
const TEMPLATES = [
  [/^Premium profile banner — .+\. Crafted gradient with cinematic depth\.$/, "banner"],
  [/^Immersive profile background — .+\. Full-bleed atmosphere for your card\.$/, "background"],
  [/^Animated name effect — .+\. Gradient\/glow styling on your display name\.$/, "nameEffect"],
  [/^Avatar aura effect — .+\. Animated ring\/overlay around your avatar\.$/, "avatarEffect"],
  [/^Chat bubble skin — .+\. Styles your outgoing message bubbles\.$/, "chatBubble"],
  [/^Presence flare — .+\. Advanced glow around your online status indicator\.$/, "presenceFlare"],
  [/^Profile aura — .+\. Atmospheric glow around your profile card\.$/, "profileAura"],
];

/** Catalog text for `key`, or null when no catalog has it (translate echoes unknown keys). */
function lookup(locale, key, vars) {
  const v = translate(locale, key, vars);
  return v && v !== key ? v : null;
}

function catalogSku(item, locale) {
  for (const id of [item?.sku, item?.id]) {
    if (id && lookup(locale, `shopItems.${id}.name`)) return String(id);
  }
  return null;
}

/** Localized `{ name, description }` for a catalog row. The database row is the fallback. */
export function localizeShopItem(item, locale) {
  const name = rowString(item?.name);
  const description = rowString(item?.description);
  if (!item) return { name, description };
  const own = ownText(item);
  if (own) {
    return {
      name: pickLocalized(own.name, locale) || name,
      description: pickLocalized(own.description, locale) || description,
    };
  }
  const sku = catalogSku(item, locale);
  if (!sku) return { name, description };
  const base = `shopItems.${sku}`;
  const locName = lookup(locale, `${base}.name`) || name;
  let locDesc = lookup(locale, `${base}.desc`);
  if (!locDesc && description) {
    const tpl = TEMPLATES.find(([re]) => re.test(description));
    const stem = lookup(locale, `${base}.stem`);
    locDesc = tpl ? lookup(locale, `shopItems._templates.${tpl[1]}`, { name: stem || locName }) : null;
  }
  return { name: locName, description: locDesc || description };
}

/** Localized name only (inventory rows, toggles). */
export function localizedShopItemName(item, locale) {
  return localizeShopItem(item, locale).name;
}

/**
 * True for an item of the old catalog that left the shop with Market 2.0 (owners keep it,
 * it renders and can be worn; inventory lists it under "Eski koleksiyon"). Country flags
 * and `s2-` items are never "old". Works with or without the retired_at column.
 */
export function isRetiredShopItem(item) {
  if (!item) return false;
  if (item.category === "countries") return false;
  const sku = String(item.sku || "");
  if (sku.startsWith("s2-")) return Boolean(item.retired_at || item.retired === true);
  if (item.retired === true || item.retired_at) return true;
  return item.active === false;
}
