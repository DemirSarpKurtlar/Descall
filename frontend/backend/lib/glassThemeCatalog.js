"use strict";

/**
 * Liquid Glass scene themes (2.9.183). Same shop_items row shape as the
 * existing theme catalog. Boot inserts missing SKUs only — never updates
 * or deletes a row that is already there.
 *
 * theme_key must match [data-theme] in design-tokens.css. Old clients that
 * do not send themeEngine "scenes-1" can still load these rows; equip is
 * refused so an unknown data-theme cannot strip their palette.
 */

const GLASS_THEME_CATALOG = [
  {
    sku: "theme-lagoon",
    key: "lagoon",
    name: "Lagoon",
    rarity: "rare",
    price_descoin: 340,
    motion: "static",
    sort_order: 20,
    description: "Deep-water glass. Still caustics, a cool rim, no motion.",
  },
  {
    sku: "theme-grove",
    key: "grove",
    name: "Grove",
    rarity: "rare",
    price_descoin: 350,
    motion: "static",
    sort_order: 21,
    description: "Forest glass. Still shafts of light under a dark canopy.",
  },
  {
    sku: "theme-hanami",
    key: "hanami",
    name: "Hanami",
    rarity: "rare",
    price_descoin: 370,
    motion: "static",
    sort_order: 22,
    description: "Night blossom glass. Petals rest in the palette; nothing falls.",
  },
  {
    sku: "theme-emberfall",
    key: "emberfall",
    name: "Emberfall",
    rarity: "epic",
    price_descoin: 520,
    motion: "animated",
    sort_order: 23,
    description: "Ember glass. The wash drifts and a few sparks breathe.",
  },
  {
    sku: "theme-borealis",
    key: "borealis",
    name: "Borealis",
    rarity: "legendary",
    price_descoin: 580,
    motion: "animated",
    sort_order: 24,
    description: "Teal and violet curtains travel slowly behind the glass.",
  },
  {
    sku: "theme-starwell",
    key: "starwell",
    name: "Starwell",
    rarity: "legendary",
    price_descoin: 640,
    motion: "animated",
    sort_order: 25,
    description: "A nebula with a slow drift and a quiet field of stars.",
  },
  {
    sku: "theme-chromeveil",
    key: "chromeveil",
    name: "Chrome Veil",
    rarity: "mythic",
    price_descoin: 760,
    motion: "premium",
    sort_order: 26,
    description: "Midnight metal. Two layers move apart and a highlight walks the glass edge.",
  },
  {
    sku: "theme-iriscape",
    key: "iriscape",
    name: "Iriscape",
    rarity: "mythic",
    price_descoin: 880,
    motion: "premium",
    sort_order: 27,
    description: "Iridescent glass. Several hues turn behind the UI and the rim shifts color.",
  },
];

const GLASS_THEME_KEYS = new Set(GLASS_THEME_CATALOG.map((item) => item.key));
const THEME_ENGINE = "scenes-1";

/** Unknown scene themes stay unequipped on clients that cannot paint them. */
function themeEquipAllowed(themeKey, engine) {
  if (!themeKey || !GLASS_THEME_KEYS.has(themeKey)) return true;
  return engine === THEME_ENGINE;
}

module.exports = {
  GLASS_THEME_CATALOG,
  GLASS_THEME_KEYS,
  THEME_ENGINE,
  themeEquipAllowed,
};
