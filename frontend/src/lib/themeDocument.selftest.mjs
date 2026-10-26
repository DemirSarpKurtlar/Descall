// Catalog themes must clear an inline accent. Dark/light may keep one.
// Run: node src/lib/themeDocument.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { themeAccentAction, isCatalogTheme, glassAccentTokens, applyDocumentTheme, GLASS_ACCENT_PROPS } from "./themeDocument.js";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "../App.jsx"), "utf8");
const panel = readFileSync(join(here, "../components/layout/UserPanel.jsx"), "utf8");
const main = readFileSync(join(here, "../main.jsx"), "utf8");

assert.equal(isCatalogTheme("crimson"), true);
assert.equal(isCatalogTheme("iriscape"), true);
assert.equal(isCatalogTheme("light"), false);
assert.equal(isCatalogTheme("dark"), false);
assert.equal(themeAccentAction("crimson", "#5865F2"), "clear");
assert.equal(themeAccentAction("iriscape", "#5865F2"), "clear");
assert.equal(themeAccentAction("dark", "#ED3B4E"), "apply");
assert.equal(themeAccentAction("light", "#ED3B4E"), "apply");
assert.equal(themeAccentAction("dark", ""), "clear");

// 3.0: App.jsx (login), Settings and the boot path all go through
// lib/appearanceSync -> applyDocumentTheme with the equipped shop theme.
assert.match(app, /applyStoredAppearance\(\{ premium: themeKey \}\)/);
assert.match(panel, /applyStoredAppearance\(\{ premium: premiumKey \|\| null \}\)/);
assert.match(main, /applyStoredAppearance\(\{ premium: prefs\.readStoredSettings\(\)\.premiumThemeKey \|\| null \}\)/);
// ...but lazily, before App renders, so the marketing first-paint entry stays in budget.
assert.doesNotMatch(main, /^import .*appearanceSync/m);
assert.match(main, /Promise\.all\(\[import\("\.\/App\.jsx"\), appearance\]\)/);

// The accent also drives the Liquid Glass tokens (--g-brand*).
function fakeRoot() {
  const props = new Map();
  const attrs = new Map();
  return {
    props,
    style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) },
    setAttribute: (k, v) => attrs.set(k, v),
    getAttribute: (k) => attrs.get(k),
  };
}
const green = glassAccentTokens("#30B05A");
assert.equal(green["--g-brand"], "#30B05A");
assert.equal(green["--g-brand-rgb"], "48,176,90");
assert.match(green["--g-cta-top"], /^rgba\(\d+,\d+,\d+,0\.95\)$/);
let r = fakeRoot();
applyDocumentTheme(r, "dark", { accentColor: "#30B05A" });
assert.equal(r.props.get("--g-brand"), "#30B05A");
assert.equal(r.props.get("--primary"), "#30B05A");
applyDocumentTheme(r, "crimson", { accentColor: "#30B05A" });
for (const p of GLASS_ACCENT_PROPS) assert.equal(r.props.has(p), false, `catalog theme clears ${p}`);
r = fakeRoot();
applyDocumentTheme(r, "dark", { accentColor: "#587AF6" });
assert.equal(r.props.has("--g-brand"), false, "default accent keeps the stylesheet glass tokens");
assert.notEqual(glassAccentTokens("#30B05A", { light: true })["--g-brand-hi"], green["--g-brand-hi"]);
const html = readFileSync(join(here, "../../index.html"), "utf8");
assert.match(html, /premiumThemeKey \|\| \(settings\.darkMode === false \? "light" : "dark"\)/);
assert.match(html, /!settings\.premiumThemeKey && \/\^#\[0-9A-Fa-f\]\{6\}\$\//);

console.log("themeDocument.selftest ok");
