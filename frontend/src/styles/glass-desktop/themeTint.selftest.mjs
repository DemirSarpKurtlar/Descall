// Desktop glass must tint every theme, including light and Iriscape.
// Run: node src/styles/glass-desktop/themeTint.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(here, "tokens.css"), "utf8");
const shell = readFileSync(join(here, "shell.css"), "utf8");
const themes = readFileSync(join(here, "themes.css"), "utf8");
const surfaces = readFileSync(join(here, "surfaces.css"), "utf8");
const design = readFileSync(join(here, "../design-tokens.css"), "utf8");

assert.match(tokens, /--gd-brand:\s*var\(--primary/);
assert.match(tokens, /--gd-panel-base:\s*color-mix\(in srgb, var\(--gd-brand\)/);
assert.match(tokens, /--gd-panel-tint:\s*color-mix\(in srgb, var\(--gd-brand\)/);
assert.match(tokens, /--gd-main-fill:\s*var\(--gd-glass-fill\)/);
assert.equal(/--gd-panel-base:\s*color-mix\(in srgb, var\(--surface-1/.test(tokens), false);
assert.match(tokens, /--gd-aurora:[\s\S]*var\(--gd-aurora-a\)/);
assert.match(tokens, /--gd-glass-fill:/);
assert.match(tokens, /--gd-main-fill:/);
assert.match(tokens, /--gd-card-fill:/);
assert.match(tokens, /html\.glass-desktop\[data-theme="light"\][\s\S]*--gd-t1:\s*rgba\(20, 22, 32/);
assert.match(tokens, /html\.glass-desktop\[data-theme="light"\][\s\S]*--gd-aurora-base-1:\s*#f7f8fc/);
assert.match(tokens, /--gd-deep:\s*#0D0E13/);

assert.equal(shell.includes("rgba(88, 122, 246"), false, "shell aurora must not hardcode the default blue");
assert.equal(shell.includes("#151826"), false, "shell aurora must not hardcode the default dark base");
assert.match(shell, /background:\s*var\(--gd-aurora\)\s*!important/);
assert.match(shell, /background:\s*var\(--gd-glass-fill\)/);
assert.match(shell, /background:\s*var\(--gd-main-fill\)/);
assert.match(shell, /html\.glass-desktop\.electron-app[\s\S]*var\(--gd-aurora\)/);
assert.match(shell, /electron-app:not\(\.gd-lite\) \.sidebar-secondary,\nhtml\.glass-desktop\.electron-app:not\(\.gd-lite\) \.app-main-slot/);
assert.match(shell, /electron-app:not\(\.gd-lite\) \.main-panel/);
assert.match(shell, /html\.glass-desktop \.main-panel \{\s*background:\s*var\(--gd-glass-fill\) !important/);
assert.equal(themes.includes("--gd-panel-base: color-mix(in srgb, #241832"), false);
const rail = readFileSync(join(here, "../rail-icons.css"), "utf8");
assert.match(rail, /\.rail-btn\.active \{[\s\S]*var\(--primary/);
assert.equal(rail.includes("#4f72f6"), false);
assert.equal(rail.includes("#8eabff"), false);
const avatar = readFileSync(join(here, "../avatar.css"), "utf8");
assert.match(avatar, /\.ui-avatar-inner \{[\s\S]*var\(--primary/);
assert.equal(avatar.includes("#4f72f6"), false);
const panel = readFileSync(join(here, "../../components/layout/UserPanel.jsx"), "utf8");
assert.match(panel, /applyDocumentTheme\(root, nextTheme, \{ accentColor \}\)/);
const app = readFileSync(join(here, "../../App.jsx"), "utf8");
assert.match(app, /applyDocumentTheme\(root, nextTheme, \{ accentColor: settings\.accentColor \}\)/);

for (const key of ["lagoon", "grove", "hanami", "emberfall", "borealis", "starwell", "chromeveil", "iriscape"]) {
  assert.match(themes, new RegExp(`html\\.glass-desktop\\[data-theme="${key}"\\]`));
  assert.match(design, new RegExp(`\\[data-theme="${key}"\\]`));
}
assert.match(themes, /conic-gradient/);
assert.match(themes, /theme-scene-spin/);
assert.match(themes, /prefers-reduced-motion:\s*reduce/);

assert.match(surfaces, /html\.glass-desktop \.us-theme-card[\s\S]*var\(--gd-card-fill\)/);
assert.match(surfaces, /html\.glass-desktop \.user-settings\.is-desktop \{[\s\S]*var\(--gd-card-fill\)/);
assert.match(surfaces, /--gd-scrim:\s*color-mix\(in srgb, var\(--surface-0/);

const themeNames = [...design.matchAll(/\[data-theme="([\w-]+)"\]/g)].map((m) => m[1]);
assert.ok(themeNames.includes("crimson") && themeNames.includes("light") && themeNames.includes("iriscape"));
assert.ok(themeNames.length >= 30, `expected the full theme catalog, got ${themeNames.length}`);

console.log(`themeTint.selftest ok (${themeNames.length} themes)`);
