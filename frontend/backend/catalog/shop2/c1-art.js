"use strict";
// Market 2.0 catalog group C1 (SVG art): avatar_frame, banner, profile_badge.
// Exports `items` in the shared catalog data contract (see the Market 2.0 plan):
//   { sku, category, rarity, price_descoin, set_key, effect_key, asset_url, preview_url,
//     theme_key, badge_icon, sort_order, tags, name: {7 locales}, description: {7 locales} }
// Art lives in c1-frames.js, c1-banners.js, c1-badges.js (singles) and c1-sets.js (the 16 set
// themes); geometry and helpers in c1-lib.js. asset_url is an inline SVG data URI; the shop
// asset route (`/api/shop/assets/:id`) decodes and serves it, so catalog payloads stay small.
const { dataUri, minifyBanner } = require("./c1-lib");
const { FRAMES } = require("./c1-frames");
const BANNERS = (() => { try { return require("./c1-banners").BANNERS; } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; return []; } })();
const BADGES = (() => { try { return require("./c1-badges").BADGES; } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; return []; } })();
const SETS = (() => { try { return require("./c1-sets").SET_PIECES; } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; return []; } })();

const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
const CATEGORY_BASE = { avatar_frame: 20000, banner: 21000, profile_badge: 22000 };

function toItem(category, def, index, setKey = null) {
  const raw = def.art();
  const svg = category === "banner" ? minifyBanner(raw) : raw;
  const tags = ["shop2", "c1", ...(def.tags || [])];
  if (def.anim && !tags.includes("animated")) tags.push("animated");
  if (setKey) tags.push("set", `set:${setKey}`);
  return {
    sku: `s2-${category}-${def.slug}`,
    category,
    rarity: def.rarity,
    price_descoin: def.price,
    set_key: setKey,
    effect_key: null,
    asset_url: dataUri(svg),
    preview_url: null,
    theme_key: null,
    badge_icon: null,
    sort_order: CATEGORY_BASE[category] + (setKey ? 0 : 500) + index,
    tags,
    name: def.name,
    description: def.desc,
  };
}

function build() {
  const out = [];
  SETS.forEach((p, i) => out.push(toItem(p.category, p, i, p.set_key)));
  FRAMES.forEach((d, i) => out.push(toItem("avatar_frame", d, i)));
  BANNERS.forEach((d, i) => out.push(toItem("banner", d, i)));
  BADGES.forEach((d, i) => out.push(toItem("profile_badge", d, i)));
  for (const it of out) {
    for (const loc of LOCALES) {
      if (!it.name?.[loc]) throw new Error(`${it.sku}: missing name.${loc}`);
      if (!it.description?.[loc]) throw new Error(`${it.sku}: missing description.${loc}`);
    }
  }
  return out;
}

const items = build();

module.exports = { items, LOCALES };
