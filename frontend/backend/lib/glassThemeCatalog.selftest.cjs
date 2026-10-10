"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { GLASS_THEME_CATALOG, themeEquipAllowed, THEME_ENGINE } = require("./glassThemeCatalog");

assert.equal(GLASS_THEME_CATALOG.length, 8);
assert.equal(themeEquipAllowed("midnight", undefined), true);
assert.equal(themeEquipAllowed("lagoon", undefined), false);
assert.equal(themeEquipAllowed("lagoon", "scenes-0"), false);
assert.equal(themeEquipAllowed("iriscape", THEME_ENGINE), true);
assert.equal(themeEquipAllowed(null, undefined), true);

const prices = Object.fromEntries(GLASS_THEME_CATALOG.map((item) => [item.key, item.price_descoin]));
for (const key of ["lagoon", "grove", "hanami"]) {
  assert.ok(prices[key] >= 320 && prices[key] <= 380, key);
}
for (const key of ["emberfall", "borealis", "starwell"]) {
  assert.ok(prices[key] > 450 && prices[key] <= 650, key);
}
for (const key of ["chromeveil", "iriscape"]) {
  assert.ok(prices[key] > 650, key);
}
assert.ok(prices.iriscape > prices.chromeveil);

const root = path.join(__dirname, "..", "..");
const tokens = fs.readFileSync(path.join(root, "src/styles/design-tokens.css"), "utf8");
const scenes = fs.readFileSync(path.join(root, "src/lib/glassThemeScenes.js"), "utf8");
const glassCss = fs.readFileSync(path.join(root, "src/styles/glass/theme-scenes.css"), "utf8");
const desktopCss = fs.readFileSync(path.join(root, "src/styles/theme-scenes.css"), "utf8");
const route = fs.readFileSync(path.join(__dirname, "../routes/shop.js"), "utf8");
const shop = fs.readFileSync(path.join(__dirname, "shop.js"), "utf8");

function lin(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function lum(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const hi = Math.max(lum(a), lum(b));
  const lo = Math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
}

for (const item of GLASS_THEME_CATALOG) {
  const re = new RegExp(`\\[data-theme="${item.key}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`);
  const body = re.exec(tokens);
  assert.ok(body, `missing token block ${item.key}`);
  assert.equal(tokens.split(`[data-theme="${item.key}"]`).length - 1, 1);
  const get = (name) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(body[1])[1];
  const surface = get("surface-0");
  const text = get("text-1");
  const muted = get("text-muted");
  const primary = get("primary");
  assert.ok(contrast(text, surface) >= 4.5, `${item.key} text`);
  assert.ok(contrast(muted, surface) >= 4.5, `${item.key} muted`);
  assert.ok(contrast("#FFFFFF", primary) >= 4.5, `${item.key} button`);
  assert.ok(scenes.includes(item.sku) && scenes.includes(item.key));
  assert.ok(glassCss.includes(`data-theme="${item.key}"`));
  assert.ok(desktopCss.includes(`.theme-${item.key}`));
}

assert.equal(route.split('code: "theme_client"').length - 1, 2);
assert.match(shop, /ensureGlassThemeCatalog/);
const ensureFn = shop.slice(
  shop.indexOf("async function ensureGlassThemeCatalog"),
  shop.indexOf("async function retireSoundPacks")
);
assert.match(ensureFn, /\.insert\(/);
assert.doesNotMatch(ensureFn, /\.update\(|\.delete\(/);
assert.match(glassCss, /g-theme-stage/);
assert.match(glassCss, /prefers-reduced-motion: reduce/);
assert.match(glassCss, /g-theme-paused/);
assert.match(glassCss, /a11y-solid/);
assert.match(glassCss, /a11y-contrast/);
assert.match(glassCss, /glass-lite/);
assert.match(desktopCss, /shop-item-new/);
assert.match(desktopCss, /prefers-reduced-motion: reduce/);

console.log("glassThemeCatalog.selftest ok");
