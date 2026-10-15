// Catalog themes must clear an inline accent. Dark/light may keep one.
// Run: node src/lib/themeDocument.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { themeAccentAction, isCatalogTheme } from "./themeDocument.js";

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

assert.match(app, /applyDocumentTheme\(root, nextTheme, \{ accentColor: settings\.accentColor \}\)/);
assert.match(panel, /applyDocumentTheme\(root, nextTheme, \{ accentColor \}\)/);
assert.match(main, /applyDocumentTheme\(document\.documentElement, theme, \{ accentColor \}\)/);
const html = readFileSync(join(here, "../../index.html"), "utf8");
assert.match(html, /premiumThemeKey \|\| \(settings\.darkMode === false \? "light" : "dark"\)/);
assert.match(html, /!settings\.premiumThemeKey && \/\^#\[0-9A-Fa-f\]\{6\}\$\//);

console.log("themeDocument.selftest ok");
