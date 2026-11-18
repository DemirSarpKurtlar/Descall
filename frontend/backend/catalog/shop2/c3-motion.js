"use strict";

/**
 * Market 2.0 catalog group C3 (motion): profile_aura (30 single + 16 set
 * auras), avatar_effect (24 single + 16 set "profile effects"),
 * presence_flare (30), reaction_burst (16), call_overlay (16), theme (38)
 * = 186 items.
 *
 * Render specs live in ./c3/*.js; ./c3/build-css.mjs turns them into
 * src/styles/shop2-c3.css (new "s2-" effect / theme keys only, the old
 * renderers are untouched). Every item renders through the existing class
 * hooks: effect-<key>, aura-<key>, flare-<key>, burst-<key> /
 * burst-chip-<key>, overlay-<key>, [data-theme="<key>"] and theme-<key>
 * swatches.
 *
 * Data contract (SHOP2-PLAN.md): sku, category, rarity, price_descoin,
 * set_key, effect_key, asset_url, preview_url, theme_key, badge_icon,
 * sort_order, tags, name {7 locales}, description {7 locales}.
 */

const { AVATAR } = require("./c3/avatar");
const { AURA } = require("./c3/aura");
const { SET_AURA } = require("./c3/aura-set");
const { FLARE } = require("./c3/flare");
const { BURST } = require("./c3/burst");
const { OVERLAY } = require("./c3/overlay");
const { THEME } = require("./c3/theme");

const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

/** "tr|en|de|es|fr|pt-BR|ru" → { tr, en, ... }. */
function i18n(text) {
  const parts = String(text).split("|");
  if (parts.length !== LOCALES.length) throw new Error(`expected ${LOCALES.length} locales: ${text}`);
  return Object.fromEntries(LOCALES.map((l, i) => [l, parts[i].trim()]));
}

/** Single-item price bands (DesCoin) and set-piece bands. */
const BANDS = {
  common: [150, 300],
  rare: [300, 550],
  epic: [550, 900],
  legendary: [900, 1500],
};
const SET_BANDS = { epic: [600, 740], legendary: [760, 880], mythic: [880, 960] };
/** Where a category sits inside a band (0 = bottom, 1 = top). */
const CATEGORY_BIAS = {
  presence_flare: 0.22,
  reaction_burst: 0.3,
  profile_aura: 0.4,
  avatar_effect: 0.46,
  call_overlay: 0.52,
  theme: 0.58,
};

function priceFor(category, rarity, index, isSet, fixed = null) {
  if (fixed != null) return fixed;
  const band = isSet ? SET_BANDS[rarity] : BANDS[rarity];
  if (!band) throw new Error(`no price band for ${rarity}${isSet ? " set piece" : ""}`);
  const jitter = (((index * 7919) % 13) / 12 - 0.5) * 0.36;
  const t = Math.min(1, Math.max(0, (isSet ? 0.5 : CATEGORY_BIAS[category]) + jitter));
  return Math.round((band[0] + (band[1] - band[0]) * t) / 10) * 10;
}

const GROUPS = [
  { category: "profile_aura", list: [...AURA, ...SET_AURA], base: 100, tags: ["aura", "animated"] },
  { category: "avatar_effect", list: AVATAR, base: 200, tags: ["avatar", "animated"] },
  { category: "presence_flare", list: FLARE, base: 300, tags: ["presence", "animated"] },
  { category: "reaction_burst", list: BURST, base: 400, tags: ["reaction", "one-shot"] },
  { category: "call_overlay", list: OVERLAY, base: 500, tags: ["call", "scene"] },
  { category: "theme", list: THEME, base: 600, tags: ["theme", "glass", "still"] },
];

const items = [];
for (const g of GROUPS) {
  g.list.forEach((spec, i) => {
    const key = `s2-${spec.slug}`;
    const isTheme = g.category === "theme";
    const tags = [...g.tags, `rarity:${spec.rarity}`];
    if (spec.set) tags.push(`set:${spec.set}`, g.category === "profile_aura" ? "set-aura" : "profile-effect");
    items.push({
      sku: `s2-${g.category}-${spec.slug}`,
      category: g.category,
      rarity: spec.rarity,
      // Set auras carry their own price (set piece rule in c3/aura-set.js).
      price_descoin: priceFor(g.category, spec.rarity, i, Boolean(spec.set), spec.price ?? null),
      set_key: spec.set || null,
      effect_key: isTheme ? null : key,
      asset_url: null,
      preview_url: null,
      theme_key: isTheme ? key : null,
      badge_icon: null,
      sort_order: g.base + i,
      tags,
      name: i18n(spec.name),
      description: i18n(spec.desc),
    });
  });
}

module.exports = { items, LOCALES, BANDS, SET_BANDS };
