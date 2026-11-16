"use strict";
// node backend/catalog/shop2/catalogQuality.selftest.cjs
// Market 2.0 catalog product checks (bughunt Nov 2026), on top of seed.selftest.cjs:
//  - no two pieces of one set and no two items of one category share a name (any language);
//  - single items follow the plan price bands, mythic only inside sets;
//  - every set has the 8 piece categories;
//  - every effect_key / theme_key has its renderer (CSS rule, palette, voice tile design) and
//    every join sound recipe is valid;
//  - SVG art is encoded so a browser reads all of it (no raw "#", valid percent escapes).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { collectItems, LOCALES } = require("./seed.js");

const FE = path.join(__dirname, "..", "..", "..");
const items = collectItems().items;

// 1. Names.
for (const loc of LOCALES) {
  const seen = new Map();
  for (const it of items) {
    const name = it.name[loc].trim().toLocaleLowerCase(loc);
    for (const scope of [it.category, it.set_key ? `set:${it.set_key}` : null]) {
      if (!scope) continue;
      const key = `${scope}|${name}`;
      assert.ok(!seen.has(key), `${loc}: "${it.name[loc]}" used by ${it.sku} and ${seen.get(key)} (${scope})`);
      seen.set(key, it.sku);
    }
  }
}

// 2. Price bands (plan: common 150-300, rare 300-550, epic 550-900, legendary 900-1500).
const BAND = { common: [150, 300], rare: [300, 550], epic: [550, 900], legendary: [900, 1500] };
for (const it of items) {
  if (it.set_key) continue;
  const band = BAND[it.rarity];
  assert.ok(band, `${it.sku}: ${it.rarity} is only for set pieces`);
  assert.ok(it.price_descoin >= band[0] && it.price_descoin <= band[1], `${it.sku}: ${it.price_descoin} outside ${it.rarity} band`);
}

// 3. Sets.
const PIECES = ["avatar_frame", "banner", "profile_color", "profile_badge", "avatar_effect", "chat_bubble", "voice_tile", "join_sound"].sort();
const sets = new Map();
for (const it of items) if (it.set_key) sets.set(it.set_key, [...(sets.get(it.set_key) || []), it.category]);
assert.equal(sets.size, 16);
for (const [key, cats] of sets) assert.deepEqual([...cats].sort(), PIECES, `set ${key}`);

// 5. SVG encoding.
for (const it of items) {
  if (!it.asset_url) continue;
  const payload = it.asset_url.slice(it.asset_url.indexOf(",") + 1);
  assert.ok(!payload.includes("#"), `${it.sku}: raw # in the data URI cuts the SVG`);
  assert.doesNotThrow(() => decodeURIComponent(payload), `${it.sku}: bad percent escape`);
}

(async () => {
  // 4. Renderers.
  let css = "";
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".css")) css += fs.readFileSync(p, "utf8");
    }
  };
  walk(path.join(FE, "src", "styles"));
  const has = (sel) => new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])").test(css);
  const { VOICE_TILE_DESIGNS } = await import(path.join(FE, "src", "lib", "voiceTiles.js"));
  const { validateRecipe } = await import(path.join(FE, "src", "lib", "joinSoundEngine.js"));
  const { SHOP2_PROFILE_COLORS } = await import(path.join(FE, "src", "lib", "shop2ProfileColors.js"));
  const PREFIX = { chat_bubble: "bubble-", name_effect: "effect-", avatar_effect: "effect-", presence_flare: "flare-", profile_aura: "aura-", typing_flare: "typing-", reaction_burst: "burst-", call_overlay: "overlay-" };
  for (const it of items) {
    const c = it.category;
    if (PREFIX[c]) assert.ok(has(`.${PREFIX[c]}${it.effect_key}`), `${it.sku}: no CSS for .${PREFIX[c]}${it.effect_key}`);
    else if (c === "profile_color") assert.ok(SHOP2_PROFILE_COLORS[it.effect_key] && has(`.pc-${it.effect_key}`), `${it.sku}: card colour not rendered`);
    else if (c === "theme") assert.ok(has(`[data-theme="${it.theme_key}"]`) && has(`.us-theme-swatch.theme-${it.theme_key}`), `${it.sku}: theme tokens missing`);
    else if (c === "voice_tile") assert.ok(VOICE_TILE_DESIGNS[it.effect_key], `${it.sku}: no voice tile design`);
    else if (c === "join_sound") assert.ok(validateRecipe(it.recipe).ok, `${it.sku}: invalid recipe ${JSON.stringify(validateRecipe(it.recipe).errors)}`);
    else assert.ok(/^data:image\/svg\+xml/.test(it.asset_url || ""), `${it.sku}: no SVG art`);
  }
  console.log(`[catalogQuality] ok (${items.length} items, ${sets.size} sets)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
