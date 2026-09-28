"use strict";

/**
 * Atelier chat-bubble skins. CSS lives in styles/chat-bubbles-atelier.css
 * and is keyed by effect_key (`bubble-${effect_key}`).
 *
 * Inserts are idempotent (sku). Boot calls ensureChatBubbleCatalog so a
 * deploy fills shop_items without a manual SQL session.
 */

const RESERVED_EFFECT_KEYS = [
  "glass",
  "neon-outline",
  "sunset",
  "carbon",
  "holo",
  "royal-purple",
  "midnight",
  "ember",
  "mint",
  "violet",
  "gold",
  "ice",
  "toxic",
  "rose",
  "cyber",
  "sand",
  "ocean",
  "lava",
  "pearl",
  "matrix",
  "arcade",
  "noir",
  "prism",
  "teal",
];

const RAW = [
  ["obsidian", "Obsidian Inlay", "rare", 320, false, "Black stone with a thin gold vein and a lacquered inner rim. Your messages sit in a cut gem, not a flat tint."],
  ["marble", "Carrara Veil", "epic", 410, false, "Pale marble crossed by grey veins and a warm hairline crack. Light surface, dark lettering, gallery frame."],
  ["damascus", "Damascus Fold", "legendary", 560, false, "Folded steel: hairline waves, a cold highlight, and a darkened edge like a finished blade."],
  ["abyss", "Abyss Pearl", "epic", 390, false, "A deep-water well with a pearl highlight floating under the surface and a teal rim."],
  ["filigree", "Crimson Filigree", "legendary", 540, false, "Wine-dark ground, a gold inner frame, and corner sparks like engraved metalwork."],
  ["canopy", "Canopy Dapple", "rare", 300, false, "Layered forest shade with three shafts of light, as if the message is under leaves."],
  ["moonstone", "Moonstone Rim", "epic", 420, false, "Milky center, indigo edge, and a split cyan-and-rose rim like a polished moonstone."],
  ["patina", "Verdigris Patina", "rare", 310, false, "Oxidized copper: warm metal bands bleeding into green, with specks of bare copper."],
  ["inkwash", "Sumi Ink Wash", "rare", 290, false, "A single ink bloom on dark paper, heavier at one corner and thin at the other."],
  ["porcelain", "Porcelain Crack", "epic", 400, false, "Warm glaze, hairline crazing, and a gold lip. Lettering stays dark so it reads like a cup mark."],
  ["stormglass", "Storm Glass", "epic", 430, false, "Slate glass cut by three hard lightning streaks, not a soft grey fade."],
  ["velvet", "Velvet Noir", "legendary", 520, false, "Piled fabric: a rose nap highlight, a crushed edge, and a low sheen that stays put."],
  ["glacier", "Glacier Facet", "rare", 330, false, "Stacked ice faces with hard color breaks and a bright top edge, like a cut block."],
  ["coal", "Ember Coal", "epic", 380, false, "Near-black coal with fixed ember specks. The glow does not move; the heat is in the stone."],
  ["sapphire", "Sapphire Cut", "legendary", 570, false, "A faceted sapphire built from a conic cut, with a bright table and a deep pavilion."],
  ["sandstone", "Sandstone Strata", "common", 240, false, "Uneven sedimentary bands of ochre, tan, and rust, pressed into a relief."],
  ["lacquer", "Urushi Lacquer", "legendary", 550, false, "Black Japanese lacquer with a sharp top highlight and a gold foot."],
  ["nebula", "Nebula Dust", "epic", 440, false, "Two gas clouds and a field of fixed stars. The sky is painted, not a single purple wash."],
  ["rosewood", "Rosewood Grain", "rare", 300, false, "Tight wood grain in rosewood and sap, with a darker heart line."],
  ["chrome", "Chrome Mirror", "epic", 410, false, "A machined mirror band: hard silver, a white catchlight, and dark lettering."],
  ["aurora", "Aurora Veil", "legendary", 580, true, "A curtain of green, violet, and ice that travels across the bubble."],
  ["mercury", "Liquid Mercury", "epic", 450, true, "Molten silver sliding through a dark channel, highlight chasing the flow."],
  ["breath", "Ember Breath", "epic", 420, true, "Coal that inhales. The rim brightens and falls like a forge draft."],
  ["circuit", "Neon Circuit", "legendary", 560, true, "A cyan and rose trace grid that crawls, the way a board looks under power."],
  ["sheen", "Prism Sweep", "epic", 440, true, "A jewel ground with a single light bar that crosses and leaves."],
  ["tide", "Tide Glass", "rare", 340, true, "Deep water lifting and dropping behind the words, tide after tide."],
  ["plasma", "Plasma Core", "legendary", 590, true, "A hot core that wanders inside the bubble instead of sitting in the middle."],
  ["scanline", "Holo Scan", "epic", 430, true, "A hologram plate with a scan band passing top to bottom."],
  ["firefly", "Firefly Drift", "rare", 350, true, "Two slow lights moving through a night garden, never on the same path."],
  ["magma", "Magma Pulse", "legendary", 570, true, "Crust and melt trading places, orange pushing through black."],
  ["starfall", "Starfall", "epic", 460, true, "A fixed night sky with a sheet of stars falling through it."],
  ["oilslick", "Oil Slick", "epic", 440, true, "A turning oil film. The hue walks the circle; the type stays put."],
  ["heartbeat", "Heartbeat", "rare", 320, true, "A quiet double pulse in the rim, like a status light under glass."],
  ["glitch", "Signal Glitch", "epic", 450, true, "Chromatic rim errors on a stepped clock. The bubble itself does not jump."],
  ["comet", "Comet Trace", "legendary", 560, true, "One bright head crossing a dark field and leaving the words readable."],
  ["ribbon", "Ribbon Lights", "legendary", 580, true, "A northern ribbon that rotates its angle instead of sliding a flat gradient."],
  ["arc", "Arc Weld", "epic", 430, true, "The border strikes between white, cyan, and blue, with the glow following the arc."],
  ["biolume", "Biolume", "rare", 360, true, "Two living blooms drifting in deep water, out of phase with each other."],
  ["solar", "Solar Flare", "legendary", 600, true, "A gold core that swells and contracts inside a dark corona."],
  ["rift", "Void Rift", "legendary", 610, true, "A thin violet tear that travels the width of the message and seals behind itself."],
];

const CHAT_BUBBLE_CATALOG = RAW.map(([slug, name, rarity, price, animated, description], index) => ({
  sku: `chat-bubble-atelier-${slug}`,
  name,
  description,
  category: "chat_bubble",
  effect_key: `atelier-${slug}`,
  rarity,
  price_descoin: price,
  animated,
  sort_order: 5100 + index,
}));

function sqlEscape(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toSqlInsert(items = CHAT_BUBBLE_CATALOG) {
  const values = items
    .map((it) => {
      return `(${[
        sqlEscape(it.sku),
        sqlEscape(it.name),
        sqlEscape(it.description),
        sqlEscape("chat_bubble"),
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
  CHAT_BUBBLE_CATALOG,
  RESERVED_EFFECT_KEYS,
  toSqlInsert,
};
