// Market 2.0 (C4) voice tiles: every design renders, art is distinct, the speaking ring
// stays readable, the catalog and the renderer agree, motion is compositor-only.
// Run: node src/lib/voiceTiles.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { VOICE_TILE_DESIGNS, VOICE_TILE_KEYS, voiceTileSvg, voiceTileFxSvg, voiceTileSkin, voiceTileKeyOf, luminance, svgDataUri } from "./voiceTiles.js";

const require = createRequire(import.meta.url);
const { items } = require("../../backend/catalog/shop2/c4-voice.js");

assert.equal(VOICE_TILE_KEYS.length, 40, "16 set + 24 single designs");
const seen = new Set();
for (const key of VOICE_TILE_KEYS) {
  const d = VOICE_TILE_DESIGNS[key];
  const svg = voiceTileSvg(key);
  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${key}: svg document`);
  assert.ok(!/NaN|undefined|Infinity/.test(svg), `${key}: no NaN / undefined in the markup`);
  for (const tag of ["g", "defs", "linearGradient", "radialGradient", "filter", "pattern"]) {
    const open = (svg.match(new RegExp(`<${tag}[ >]`, "g")) || []).length;
    const close = (svg.match(new RegExp(`</${tag}>`, "g")) || []).length;
    assert.equal(open, close, `${key}: <${tag}> balanced`);
  }
  const uri = svgDataUri(svg);
  assert.ok(uri.length < 60_000, `${key}: data URI small enough (${uri.length})`);
  assert.ok(!seen.has(svg), `${key}: art is not a copy of another design`);
  seen.add(svg);
  // Speaking ring must read on a dark tile: bright enough, and not the stock green.
  assert.ok(luminance(d.ring) > 0.18, `${key}: ring ${d.ring} too dark to read`);
  assert.notEqual(d.ring.toLowerCase(), "#30d158");
  if (d.fx) assert.ok(voiceTileFxSvg(key).includes("<svg"), `${key}: fx layer`);
  const skin = voiceTileSkin(key);
  assert.ok(skin.className.includes(`vt2-a-${d.anim}`));
  assert.ok(skin.style["--vt-bg"].startsWith('url("data:image/svg+xml'));
  assert.equal(voiceTileSkin(key), skin, "skin cached per key");
}
// Scenes: every design uses its own scene, so the 40 tiles are 40 different pictures.
const scenes = VOICE_TILE_KEYS.map((k) => VOICE_TILE_DESIGNS[k].scene);
assert.equal(new Set(scenes).size, scenes.length, "one scene per design");

// Catalog <-> renderer.
const tiles = items.filter((i) => i.category === "voice_tile");
assert.equal(tiles.length, 40);
assert.equal(tiles.filter((i) => i.set_key).length, 16);
for (const it of tiles) assert.ok(VOICE_TILE_DESIGNS[it.effect_key], `${it.sku}: design exists`);
assert.deepEqual(new Set(tiles.map((i) => i.effect_key)), new Set(VOICE_TILE_KEYS));

// Lookup from member data.
assert.equal(voiceTileKeyOf({ equippedVoiceTile: { effect_key: "vt-prizma" } }), "vt-prizma");
assert.equal(voiceTileKeyOf({ equippedVoiceTile: { effect_key: "vt-unknown" } }), null);
assert.equal(voiceTileKeyOf(null), null);
assert.equal(voiceTileSkin("nope"), null);

// CSS: motion is transform / opacity only; reduced motion, idle app, big rooms, phones.
const css = readFileSync(new URL("../styles/shop2-c4.css", import.meta.url), "utf8");
for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
  const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
  for (const p of props) assert.ok(["transform", "opacity"].includes(p), `@keyframes ${m[1]} animates ${p}`);
}
assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.vt2-skin > \.vt2-fx/);
assert.match(css, /\.server-voice-grid\.is-many \.server-voice-tile:not\(\.is-speaking\) > \.vt2-skin > \.vt2-fx/);
assert.match(css, /pointer: coarse/);
assert.match(css, /html\.app-backgrounded \.vt2-skin > \.vt2-fx/);
assert.match(css, /\.is-speaking > \.vt2-skin::after/);

console.log(`voiceTiles.selftest: ok (${VOICE_TILE_KEYS.length} designs)`);
