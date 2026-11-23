// node src/styles/settingsShopColors.selftest.mjs
// Colour rules for Settings, the Shop, Descall+ and the wallet (color sweep, Nov 2026):
//   - no iOS system blue (#0a84ff / #007aff) or Discord blurple in these screens;
//   - the market's filled primary never goes back to the light #6d8cff stop under white text;
//   - the profile card's edit button keeps a white label even inside `.s3` (which sets
//     `button { color: inherit }`);
//   - the call summary card's item name has its own ink (the card is always dark);
//   - the Wallet tab's light-theme chip and link rules skip the dark live preview.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const here = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const files = {
  "settings.css": here("./settings.css"),
  "settings-v3.css": here("./settings-v3.css"),
  "glass/settings.css": here("./glass/settings.css"),
  "settings-profile-card.css": here("./settings-profile-card.css"),
  "shop.css": here("./shop.css"),
  "shop2-ui.css": here("./shop2-ui.css"),
  "call-coin-summary.css": here("./call-coin-summary.css"),
  "user-hover-card.css": here("./user-hover-card.css"),
  "premium.css": here("../premium/premium.css"),
};
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

for (const [name, css] of Object.entries(files)) {
  const code = strip(css);
  assert.ok(!/#(0a84ff|007aff|5865f2|5b6cff)\b/i.test(code), `${name}: off-palette system blue / blurple`);
}

const shop2 = strip(files["shop2-ui.css"]);
const primary = shop2.match(/\.s2-btn\.is-primary\s*\{([^}]*)\}/);
assert.ok(primary && /--s2-fill/.test(primary[1]), "shop2: .s2-btn.is-primary uses the deep --s2-fill");
assert.ok(!/linear-gradient\(180deg,\s*var\(--s2-brand2\),\s*var\(--s2-brand\)\)/.test(shop2), "shop2: no white label on the #6d8cff -> #587af5 gradient");
assert.ok(/\.s2-root \.s2-btn\.is-primary,\s*\.s2-layer \.s2-btn\.is-primary\s*\{\s*color:\s*#fff/.test(shop2), "shop2: primary label stays white inside dimmed blocks");
assert.ok(/\.s2-empty p\s*\{[^}]*color:\s*inherit/.test(shop2), "shop2: empty-state text does not take the app's global p ink");

assert.ok(/\.spc \.spc-edit\s*\{\s*color:\s*#fff/.test(strip(files["settings-profile-card.css"])), "profile card: edit label stays white");

const ccs = strip(files["call-coin-summary.css"]);
assert.ok(/\.ccs-feat h3\s*\{[^}]*color:\s*var\(--ccs-ink/.test(ccs), "call summary: item name has its own ink");
assert.ok(/\.ccset \.ccs-chip:not\(\.ccset-pvw \.ccs-chip\)/.test(ccs), "wallet: light chip rule skips the preview");
assert.ok(/\.ccset \.ccs-link:not\(\.ccset-pvw \.ccs-link\)/.test(ccs), "wallet: light link rule skips the preview");

// Settings icon tiles (owner decision Nov 2026): one --tile-* palette in design-tokens.css, every
// tile gives its white glyph >= 3:1 (WCAG 1.4.11), and every tile list reads the tokens, not hex.
const hexRgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = hexRgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const vsWhite = (h) => 1.05 / (lum(h) + 0.05);
const tokens = here("./design-tokens.css");
const tiles = Object.fromEntries([...tokens.matchAll(/--tile-([a-z]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]));
const TILE_NAMES = ["blue", "brand", "indigo", "purple", "green", "teal", "orange", "yellow", "red", "pink", "gray", "mint"];
for (const n of TILE_NAMES) {
  assert.ok(tiles[n], `design-tokens: --tile-${n} is defined`);
  const ratio = vsWhite(tiles[n]);
  assert.ok(ratio >= 3, `--tile-${n} ${tiles[n]}: white glyph ${ratio.toFixed(2)}:1 < 3:1`);
}
const tileDefs = (tokens.match(/--tile-[a-z]+:/g) || []).length;
assert.equal(tileDefs, TILE_NAMES.length, "design-tokens: the tile palette is defined once");
const s3 = strip(files["settings-v3.css"]);
const svh = strip(here("../components/servers/hub/svh.css"));
const pp = strip(files["premium.css"]);
for (const n of TILE_NAMES) {
  assert.ok(new RegExp(`\\.s3 \\.c-${n} \\{ background: var\\(--tile-${n}\\); \\}`).test(s3), `settings-v3: .s3 .c-${n} uses --tile-${n}`);
  assert.ok(new RegExp(`\\.svh-ico\\.c-${n}\\{background:var\\(--tile-${n}\\)\\}`).test(svh), `svh: .svh-ico.c-${n} uses --tile-${n}`);
}
assert.ok(!/\.(pp-ico|s3|svh-ico)\s*\.?c-[a-z]+\s*\{\s*background:\s*#/.test(s3 + svh + pp), "tile lists: no raw hex tile colours");
assert.ok(!/\.pp-ico\.c-[a-z]+ \{ background: #/.test(pp), "premium: .pp-ico tiles use --tile-*");
const panel = here("../components/layout/UserPanel.jsx");
const hexMap = panel.match(/const S3_TILE_HEX = \{([\s\S]*?)\n\};/);
assert.ok(hexMap, "UserPanel: S3_TILE_HEX exists");
for (const n of TILE_NAMES) assert.ok(new RegExp(`${n}: "var\\(--tile-${n}\\)"`).test(hexMap[1]), `UserPanel: S3_TILE_HEX.${n} -> var(--tile-${n})`);
const navMap = panel.match(/const S3_NAV_TILES = \{([\s\S]*?)\n\};/);
for (const [, color] of navMap[1].matchAll(/\["[a-z]+", "([a-z]+)"\]/g)) assert.ok(TILE_NAMES.includes(color), `S3_NAV_TILES colour ${color} is a tile token`);
const gset = strip(files["glass/settings.css"]);
const navRules = [...gset.matchAll(/\[data-nav="([a-z]+)"\] \.us-nav-ico \{ background: ([^;]+);/g)];
assert.ok(navRules.length >= 8, "glass/settings: iPhone tile rules found");
for (const [, nav, bg] of navRules) {
  const color = (navMap[1].match(new RegExp(`\\b${nav}: \\["[a-z]+", "([a-z]+)"\\]`)) || [])[1];
  assert.equal(bg.trim(), `var(--tile-${color})`, `glass/settings: iPhone ${nav} tile matches the desktop mapping (${color})`);
}

console.log("settingsShopColors selftest ok");
