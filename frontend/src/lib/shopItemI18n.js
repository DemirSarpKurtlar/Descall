// Localized names and descriptions for shop catalog rows.
// The text lives in the i18n catalogs (namespace `shopItems`, keyed by sku: name, desc,
// and `stem` for chat bubbles); see i18n/locales/shopItems.en.js. The database rows stay
// English and are the fallback for a sku the catalogs do not know yet. Rows whose
// description follows a seed pattern use the catalog template of that pattern with the
// localized name. Country items have no entries: their names come from Intl
// (countryFlags.js countryName).
import { translate } from "../i18n/index.js";

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
  const name = item?.name || "";
  const description = item?.description || "";
  if (!item) return { name, description };
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
