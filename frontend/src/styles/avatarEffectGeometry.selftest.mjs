// Avatar effect rings must all share one geometry (lib/avatarEffectGeometry.js):
// the ring is painted inside the outer --fx-w band of a box that extends
// --fx-gap + --fx-w past the avatar. Owner report (Nov 2026): rings floated
// 6-13px off the avatar, each effect at its own radius, and orbit/petal
// particles were hidden behind the avatar (translateX % of a 6px dot).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avatarEffectGeometry, avatarEffectStyle } from "../lib/avatarEffectGeometry.js";

const here = new URL(".", import.meta.url);
const read = (p) => readFileSync(new URL(p, here), "utf8");
const css = (read("./cosmetics.css") + "\n" + read("./cosmetics-mega.css")).replace(/\/\*[\s\S]*?\*\//g, "");

const EFFECTS = ["pulse", "orbit", "spark", "aurora", "flame", "frost", "halo", "ripple", "comet", "static", "petal", "hex",
  "solar", "toxic", "prism", "ember", "frostbite", "neon", "void", "bubble", "scan", "royal", "holoring", "pulse2"];

// Every catalog effect key (seed scripts) has a rule.
const seeds = read("../../backend/scripts/seedCosmeticsCatalog.js") + read("../../backend/scripts/seedCatalogMega.js");
for (const m of seeds.matchAll(/category:\s*"avatar_effect"[^}]*effect_key:\s*"([\w-]+)"/g)) {
  assert.ok(EFFECTS.includes(m[1]), `seeded avatar effect ${m[1]} is covered by this test`);
}

const blocks = [...css.matchAll(/([^{}]*\.cosmetic-avatar-effect[^{}]*)\{([^}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
for (const e of EFFECTS) {
  assert.ok(blocks.some((b) => b.sel.includes(`.effect-${e}`)), `effect-${e} has a rule`);
}
for (const { sel, body } of blocks) {
  const decl = body.replace(/\/\*[\s\S]*?\*\//g, "");
  // No outer spread ring: a ring drawn with `0 0 0 Npx` sits outside the band.
  for (const sh of decl.matchAll(/box-shadow:\s*([^;]+)/g)) {
    for (const part of sh[1].split(/,(?![^(]*\))/)) {
      assert.ok(!/^\s*0 0 0 \d/.test(part), `${sel}: outer spread ring "${part.trim()}"; use inset 0 0 0 var(--fx-w)`);
    }
  }
  const border = decl.match(/(?:^|;|\s)border:\s*([^;]+)/);
  if (border) assert.ok(border[1].includes("var(--fx-w)"), `${sel}: border must be var(--fx-w) wide`);
  if (/(^|\s)mask:/.test(decl)) assert.ok(decl.includes("var(--fx-w)"), `${sel}: mask band must use var(--fx-w)`);
  assert.ok(!/translateX\(\s*\d+%/.test(decl), `${sel}: % translate orbits are relative to the particle, not the avatar`);
  const inset = decl.match(/(?:^|[;\s])inset:\s*([^;]+)/);
  if (inset && sel !== ".cosmetic-avatar-effect") assert.equal(inset[1].trim(), "0", `${sel}: own inset breaks the shared radius`);
}
assert.ok(!/@keyframes cosmetic-pulse-ring[^}]*\b0 0 0 10px/.test(css), "pulse keyframes stay in the band");

// Geometry: concentric, grows with the avatar, never collapses.
let prev = 0;
for (const size of [16, 20, 24, 32, 40, 56, 80, 104, 128]) {
  const g = avatarEffectGeometry(size);
  assert.ok(g.gap >= 1 && g.width >= 2, `min ring at ${size}`);
  assert.equal(g.outset, g.gap + g.width);
  assert.ok(g.outset >= prev, "monotonic");
  assert.ok(g.outset <= Math.max(4, size * 0.14), `ring hugs the avatar at ${size}`);
  prev = g.outset;
  const s = avatarEffectStyle(size);
  assert.equal(s.inset, -g.outset);
  assert.equal(s["--fx-w"], `${g.width}px`);
}

// Every place that renders an effect uses the shared geometry.
for (const f of ["../components/ui/Avatar.jsx", "../components/settings/ShopPanel.jsx", "../components/admin/AdminShop.jsx",
  "../components/shop/purchase/StorePurchasePreviews.jsx"]) {
  const src = read(f);
  assert.ok(src.includes("avatarEffectStyle("), `${f} uses avatarEffectStyle`);
  assert.ok(!/cosmetic-avatar-effect[^\n]*inset:\s*-?\d/.test(src), `${f}: no ad-hoc inset`);
}
assert.ok(!/\.shop-avatar-effect-preview \.cosmetic-avatar-effect\s*\{\s*inset:\s*0/.test(read("./shop.css")), "shop preview ring wraps the sample disc");
console.log("avatarEffectGeometry selftest ok");
