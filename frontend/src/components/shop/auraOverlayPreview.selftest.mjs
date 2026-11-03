// Run: node src/components/shop/auraOverlayPreview.selftest.mjs
// Shop Aura + Arama Kaplamaları cards show LIVE previews of the real effect
// (no Sparkles / Phone placeholder icons), in ShopPanel, ShopProfilePreview and
// AdminShop; previews tick only while visible (shared loop) and hold a still
// frame with reduced motion; every catalogue effect_key has its CSS rule.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const read = (p) => readFileSync(new URL(p, here), "utf8");
const panel = read("../settings/ShopPanel.jsx");
const profile = read("../settings/ShopProfilePreview.jsx");
const admin = read("../admin/AdminShop.jsx");
const aura = read("./ProfileAuraPreview.jsx");
const call = read("./CallOverlayPreview.jsx");
const tick = read("./useLivePreviewTick.js");
const mega = read("../../styles/cosmetics-mega.css");
const premium = read("../../styles/cosmetics-premium.css");
const seed = read("../../../backend/scripts/seedPremiumCategories.js");
const mega_seed = read("../../../backend/scripts/seedCatalogMega.js");

const block = (src, cat) => {
  const i = src.indexOf(`category === "${cat}"`);
  assert.ok(i >= 0, `${cat} branch missing`);
  return src.slice(i, src.indexOf(")", src.indexOf("Preview", i)) + 1);
};
for (const [label, src] of [["ShopPanel", panel], ["AdminShop", admin]]) {
  assert.ok(!/<Sparkles|<Phone/.test(block(src, "profile_aura")), `${label} aura still a placeholder`);
  assert.ok(!/<Sparkles|<Phone/.test(block(src, "call_overlay")), `${label} call overlay still a placeholder`);
  assert.match(src, /<ProfileAuraPreview effectKey=\{item\.effect_key\}/);
  assert.match(src, /<CallOverlayPreview effectKey=\{item\.effect_key\}/);
}
assert.ok(!/<Sparkles size=\{16\} \/><\/div>/.test(admin), "AdminShop reaction burst still a Sparkles placeholder");
assert.match(admin, /<ReactionBurstPreview effectKey=\{item\.effect_key\} compact/);
assert.ok(!/<Phone/.test(profile), "ShopProfilePreview still shows Phone");
assert.match(profile, /<CallOverlayPreview effectKey=\{callOverlay\.effect_key\}[^>]*compact/);

// Real cosmetic classes, shared visible-only loop, reduced-motion still frame.
assert.match(aura, /cosmetic-profile-aura aura-\$\{effectKey\}/);
assert.match(call, /cosmetic-call-overlay overlay-\$\{effectKey\}/);
assert.match(tick, /sharedBurstPreviewLoop\(\)\.observe/);
assert.match(tick, /prefersReducedMotion\(\)/);
assert.match(tick, /if \(still \|\| !ref\.current\) return/);
assert.match(premium, /\.spa-live\.is-still[^{]*\{ animation: none !important; \}/);
assert.match(premium, /@media \(prefers-reduced-motion: reduce\) \{\s*\.spa-live \.spa-card, \.spa-live \.spa-glow, \.sco-live \.sco-ring \{ animation: none !important; \}/);
// Compositor-only motion in the new keyframes.
for (const name of ["spa-lift", "spa-breathe", "sco-speak"]) {
  const m = premium.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}`));
  assert.ok(m, `keyframes ${name}`);
  assert.ok(!/(width|height|top|left|box-shadow|filter)\s*:/.test(m[1]), `${name} animates layout/paint props`);
}

// Every catalogue key has a rule.
const keys = (cat) => [...seed.matchAll(new RegExp(`category: "${cat}",[\\s\\S]*?effect_key: "([a-z0-9-]+)"`, "g"))].map((m) => m[1]);
const auraBlock = mega_seed.slice(mega_seed.indexOf("const auras = ["), mega_seed.indexOf("];", mega_seed.indexOf("const auras = [")));
const auraKeys = [...auraBlock.matchAll(/"([a-z0-9-]+)"\]/g)].map((m) => m[1]), ovKeys = keys("call_overlay");
assert.ok(auraKeys.length > 0 && ovKeys.length > 0, "seed keys found");
for (const k of auraKeys) assert.ok(mega.includes(`.aura-${k} `) || mega.includes(`.aura-${k}{`), `no CSS for aura-${k}`);
for (const k of ovKeys) assert.ok(premium.includes(`.overlay-${k} {`), `no CSS for overlay-${k}`);
console.log(`auraOverlayPreview selftest ok (${auraKeys.length} auras, ${ovKeys.length} overlays)`);
