// Market 2.0 catalog C3 (motion) selftest.
// Run: node backend/catalog/shop2/c3/c3.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const { items, LOCALES, BANDS, SET_BANDS } = require("../c3-motion.js");
const { SET_KEYS } = require("./sets.js");
const { themePalette, contrast } = await import("./build-css.mjs");
const { THEME } = require("./theme.js");
const cssPath = join(here, "..", "..", "..", "..", "src", "styles", "shop2-c3.css");
const css = readFileSync(cssPath, "utf8");

// The generated CSS matches the specs.
execFileSync(process.execPath, [join(here, "build-css.mjs"), "--check"], { stdio: "pipe" });

// Counts per category (SHOP2-PLAN.md, group C3).
const count = (c, pred = () => true) => items.filter((i) => i.category === c && pred(i)).length;
assert.equal(count("profile_aura"), 30);
assert.equal(count("avatar_effect", (i) => !i.set_key), 24);
assert.equal(count("avatar_effect", (i) => i.set_key), 16);
assert.equal(count("presence_flare"), 30);
assert.equal(count("reaction_burst"), 16);
assert.equal(count("call_overlay"), 16);
assert.equal(count("theme"), 38);
assert.equal(items.length, 170);

// One profile effect per set, every set covered.
const setPieces = items.filter((i) => i.set_key);
assert.deepEqual([...new Set(setPieces.map((i) => i.set_key))].sort(), [...SET_KEYS].sort());
assert.ok(setPieces.every((i) => i.category === "avatar_effect" && i.tags.includes(`set:${i.set_key}`)));

// Keys: unique, s2- prefixed, sku shape.
const uniq = (arr, what) => assert.equal(new Set(arr).size, arr.length, `duplicate ${what}`);
uniq(items.map((i) => i.sku), "sku");
uniq(items.map((i) => i.effect_key || i.theme_key), "effect/theme key");
for (const i of items) {
  assert.ok(i.sku.startsWith(`s2-${i.category}-`), i.sku);
  const key = i.effect_key || i.theme_key;
  assert.ok(/^s2-[a-z0-9-]+$/.test(key), key);
  assert.equal(i.category === "theme", Boolean(i.theme_key));
  assert.equal(i.asset_url, null);
  assert.equal(i.badge_icon, null);
}

// Names / descriptions: 7 locales, no emoji, no banned words, unique names.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
for (const i of items) {
  for (const field of ["name", "description"]) {
    assert.deepEqual(Object.keys(i[field]), LOCALES, `${i.sku} ${field} locales`);
    for (const [l, v] of Object.entries(i[field])) {
      assert.ok(v && v.length >= 2, `${i.sku} ${field}.${l} empty`);
      assert.ok(!EMOJI.test(v), `${i.sku} ${field}.${l} has an emoji`);
      assert.ok(!/valorant|takım bul|takim bul/i.test(v), `${i.sku} ${field}.${l} banned word`);
    }
  }
}
for (const c of new Set(items.map((i) => i.category))) {
  uniq(items.filter((i) => i.category === c).map((i) => i.name.en), `${c} English name`);
  uniq(items.filter((i) => i.category === c).map((i) => i.name.tr), `${c} Turkish name`);
}

// Rarity + price bands; mythic only inside sets.
for (const i of items) {
  if (i.set_key) {
    const b = SET_BANDS[i.rarity];
    assert.ok(b, `${i.sku}: set piece rarity ${i.rarity}`);
    assert.ok(i.price_descoin >= b[0] && i.price_descoin <= b[1], `${i.sku} price`);
  } else {
    const b = BANDS[i.rarity];
    assert.ok(b, `${i.sku}: rarity ${i.rarity} (mythic only in sets)`);
    assert.ok(i.price_descoin >= b[0] && i.price_descoin <= b[1], `${i.sku} price ${i.price_descoin}`);
  }
}

// Every key has its renderer rule.
const has = (s) => assert.ok(css.includes(s), `missing rule ${s}`);
for (const i of items) {
  if (i.category === "avatar_effect") has(`.cosmetic-avatar-effect.effect-${i.effect_key}`);
  if (i.category === "profile_aura") has(`.cosmetic-profile-aura.aura-${i.effect_key}`);
  if (i.category === "presence_flare") has(`.cosmetic-presence-flare.flare-${i.effect_key}`);
  if (i.category === "reaction_burst") { has(`.reaction-chip.burst-chip-${i.effect_key}`); has(`.burst-${i.effect_key} .reaction-burst-pop-emoji`); }
  if (i.category === "call_overlay") has(`.cosmetic-call-overlay.overlay-${i.effect_key}`);
  if (i.category === "theme") { has(`[data-theme="${i.theme_key}"] {`); has(`.shop-theme-swatch.theme-${i.theme_key}`); has(`html.glass-desktop[data-theme="${i.theme_key}"]`); has(`:is(html.glass-desktop, html.glass-ui)[data-theme="${i.theme_key}"]`); }
}

// Avatar effect geometry (avatarEffectGeometry.js rules): band layers only.
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\("data:[^"]*"\)/g, "url(svg)");
for (const [, sel, body] of noComments.matchAll(/([^{}]*\.cosmetic-avatar-effect[^{}]*)\{([^}]*)\}/g)) {
  for (const sh of body.matchAll(/box-shadow:\s*([^;]+)/g)) {
    for (const part of sh[1].split(/,(?![^(]*\))/)) assert.ok(!/^\s*0 0 0 \d/.test(part), `${sel}: outer spread ring`);
  }
  const mask = body.match(/(?:^|\s)mask:\s*([^;]+)/);
  if (mask) assert.ok(/var\(--s2m-\w+\)|var\(--fx-w\)/.test(mask[1]), `${sel}: mask must be a --fx-w band`);
  if (/effect-s2-/.test(sel) && /background-image/.test(body)) assert.match(body, /url\(svg\)/, `${sel}: SVG art layer`);
  const inset = body.match(/(?:^|[;\s])inset:\s*([^;]+)/);
  if (inset) assert.equal(inset[1].trim(), "0", `${sel}: own inset breaks the shared radius`);
  assert.ok(!/translate/.test(body), `${sel}: no translate orbits`);
}
// Art stays outside the avatar: SVG layers are drawn in the effect box (avatar edge r = 40.3 of 50).
const { R_AV } = require("./svg.js");
assert.ok(R_AV >= 40 && R_AV <= 40.5, "avatar edge in effect-box units");
assert.match(css, /background-size: 100% 100%/);

// Performance: motion is transform / opacity only, no layout or filter keyframes.
for (const [, name, body] of css.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?)\}\s*\}/g)) {
  const props = [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
  for (const p of props) assert.ok(["transform", "opacity"].includes(p), `@keyframes ${name} animates ${p}`);
}
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /html\.gd-lite \.cosmetic-avatar-effect\[class\*="effect-s2-"\]::before/);
// Call overlays and themes never loop forever (a call or theme is on screen for hours).
for (const [, body] of css.matchAll(/overlay-s2-[\w-]+::(?:before|after) \{([^}]*)\}/g)) {
  assert.ok(!/infinite/.test(body), "call overlay motion must stop");
}
assert.ok(!/data-theme="s2-[^"]+"[^{]*\{[^}]*animation/.test(css), "themes stay still");

// Themes stay readable.
for (const t of THEME) {
  const p = themePalette(t);
  assert.ok(contrast(p.primary, "#FFFFFF") >= 4.5, `${t.slug}: white on accent`);
  assert.ok(contrast(p.text1, p.s1) >= 12, `${t.slug}: text on surface`);
  assert.ok(contrast(p.text3, p.s3) >= 4.5, `${t.slug}: muted text`);
  assert.ok(contrast(p.link, p.s2) >= 4.5, `${t.slug}: link`);
}

console.log(`c3 selftest ok (${items.length} items)`);
