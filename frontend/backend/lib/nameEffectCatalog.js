"use strict";

/**
 * Sigil name effects. CSS lives in styles/name-effects-sigil.css
 * and is keyed by effect_key (`effect-${effect_key}`).
 *
 * Inserts are idempotent (sku). Boot calls ensureNameEffectCatalog so a
 * deploy fills shop_items without a manual SQL session.
 */

const RESERVED_EFFECT_KEYS = [
  "fire",
  "rainbow",
  "neon",
  "gold-shimmer",
  "ice",
  "void",
  "plasma",
  "ember",
  "glitch",
  "mintglow",
  "sunset",
  "ocean",
  "chrome",
  "toxic",
  "royal",
  "candy",
  "magma",
  "arctic",
  "holo",
  "embercore",
  "noir",
  "laser",
  "matrix",
  "sand",
];

const RAW = [
  ["damascus", "Damascus Fold", "legendary", 560, false, "Folded steel cut into the letters: hairline waves, a cold silver ridge, and a darkened valley like a finished blade."],
  ["obsidian", "Obsidian Vein", "epic", 480, false, "Volcanic glass with one gold seam running through the glyphs and a warm edge so the stone still reads on a dark name."],
  ["sapphire", "Sapphire Pavilion", "legendary", 590, false, "A faceted sapphire built as a conic cut: bright table, deep pavilion, and a hard break between faces."],
  ["porcelain", "Porcelain Craze", "epic", 400, false, "Warm glaze with two gold hairline cracks. The letters stay a solid cup color, the crazing does not punch through."],
  ["filigree", "Crimson Filigree", "legendary", 540, false, "Wine ground, a gold mid band, and three fixed sparks set like engraved metalwork on the name."],
  ["lacquer", "Urushi Lip", "legendary", 550, false, "Black Japanese lacquer with a sharp white catchlight on the cap and a gold foot along the baseline."],
  ["moonstone", "Moonstone Split", "epic", 420, false, "Milky center, indigo body, then a split cyan and rose rim like a polished moonstone held to a lamp."],
  ["glacier", "Glacier Stack", "rare", 330, false, "Stacked ice faces with hard color breaks, not a soft blue fade. Each band is a separate cut."],
  ["rosewood", "Rosewood Heart", "rare", 300, false, "Tight rosewood grain: sap lines, a darker heart, and a rose ridge repeating across the letters."],
  ["verdigris", "Verdigris Band", "rare", 360, false, "Oxidized copper. Warm metal, green bloom, and two fixed corrosion specks sitting in the fill."],
  ["inkwash", "Sumi Bloom", "rare", 290, false, "One ink bloom heavier at the lower left, thinning to a paper highlight so the name stays readable."],
  ["marble", "Carrara Vein", "epic", 410, false, "Pale marble crossed by two grey veins at the same angle, the way a single slab is cut."],
  ["velvet", "Velvet Nap", "legendary", 520, false, "Piled cloth: a rose nap at the top, a crushed wine edge, and a low sheen that does not travel."],
  ["mirror", "Mirror Catch", "epic", 450, false, "Machined mirror: a white catchlight, a black groove, and silver shoulders. The highlight is a stripe, not a shimmer loop."],
  ["sandstone", "Sandstone Bed", "common", 280, false, "Uneven sedimentary bands of ochre, rust, and tan pressed into the letters like a cliff face."],
  ["nebula", "Nebula Plate", "epic", 470, false, "Two gas clouds and three fixed stars painted into the glyphs. The sky does not drift."],
  ["aurora", "Aurora Curtain", "legendary", 580, true, "A green, violet, and ice curtain that rises through the letters while the ground hue walks beside it."],
  ["mercury", "Mercury Channel", "epic", 450, true, "Molten silver forced through a dark channel. One highlight chases the length of the name and returns."],
  ["forge", "Forge Draft", "epic", 430, true, "Coal that inhales. An ember climbs the letters and the glow swells, then the draft falls back to the baseline."],
  ["circuit", "Circuit Crawl", "legendary", 560, true, "Cyan traces move across and rose traces move down, the way a live board looks under power."],
  ["prism", "Prism Bar", "epic", 440, true, "A jewel ground with a single white bar that crosses the name and leaves. The gem itself stays put."],
  ["tide", "Tide Lift", "rare", 340, true, "Deep water with a bright crest that lifts and drops behind the words, tide after tide."],
  ["core", "Wandering Core", "legendary", 590, true, "A hot core that walks the inside of the letters instead of sitting in the middle."],
  ["scan", "Scan Plate", "epic", 430, true, "A hologram plate: fine scan grain plus one bright band passing from cap to baseline."],
  ["oil", "Oil Film", "epic", 440, true, "A turning oil film. The hue walks the circle on a dark ground and the letters do not move."],
  ["pulse", "Double Pulse", "rare", 320, true, "A quiet double beat in the rim, like a status lamp under glass. The name color stays put."],
  ["chroma", "Chroma Step", "epic", 450, true, "A stepped chromatic split. Hue and the twin shadow jump on a clock instead of sliding."],
  ["comet", "Comet Head", "legendary", 560, true, "One bright head crosses a night field, pauses at the far edge, then the pass begins again."],
  ["solar", "Solar Swell", "legendary", 600, true, "A gold core that swells and contracts inside a dark corona. The corona does not rotate."],
  ["rift", "Rift Tear", "legendary", 610, true, "A thin violet tear travels the width of the name and seals behind itself."],
];

const NAME_EFFECT_CATALOG = RAW.map(([slug, name, rarity, price, animated, description], index) => ({
  sku: `name-effect-sigil-${slug}`,
  name,
  description,
  category: "name_effect",
  effect_key: `sigil-${slug}`,
  rarity,
  price_descoin: price,
  animated,
  sort_order: 6200 + index,
}));

function sqlEscape(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toSqlInsert(items = NAME_EFFECT_CATALOG) {
  const values = items
    .map((it) => {
      return `(${[
        sqlEscape(it.sku),
        sqlEscape(it.name),
        sqlEscape(it.description),
        sqlEscape("name_effect"),
        sqlEscape("data:,"),
        "NULL",
        0,
        it.price_descoin,
        "NULL",
        "NULL",
        "NULL",
        sqlEscape(it.effect_key),
        sqlEscape(it.rarity),
        it.sort_order,
        "TRUE",
      ].join(", ")})`;
    })
    .join(",\n");
  return (
    `INSERT INTO shop_items (sku, name, description, category, asset_url, preview_url, price_cents, price_descoin, theme_key, badge_icon, title_text, effect_key, rarity, sort_order, active)\n` +
    `VALUES\n${values}\n` +
    `ON CONFLICT (sku) DO NOTHING;\n`
  );
}

module.exports = {
  NAME_EFFECT_CATALOG,
  RESERVED_EFFECT_KEYS,
  toSqlInsert,
};
