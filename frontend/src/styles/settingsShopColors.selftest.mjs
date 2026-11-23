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

console.log("settingsShopColors selftest ok");
