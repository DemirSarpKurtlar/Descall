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
const palette = readFileSync(join(here, "palette.css"), "utf8");
const ios = readFileSync(join(here, "../glass/themes.css"), "utf8");

assert.match(tokens, /--gd-brand:\s*var\(--g-brand\)/);
assert.match(tokens, /--gd-t1:\s*var\(--g-t1\)/);
assert.match(tokens, /--gd-glass-fill:[\s\S]*var\(--g-tint-top\)[\s\S]*var\(--g-tint-base\)/);
assert.match(tokens, /--gd-main-fill:\s*var\(--gd-glass-fill\)/);
assert.match(tokens, /--gd-aurora:[\s\S]*var\(--g-brand-rgb\)[\s\S]*var\(--g-amb-a\)/);
assert.match(tokens, /--gd-cta:\s*linear-gradient\(180deg, var\(--g-cta-top\), var\(--g-cta-bot\)\)/);
assert.match(tokens, /--g-brand: #587AF6/);
assert.match(tokens, /--gd-deep:\s*#0D0E13/);
assert.match(tokens, /--gd-heavy-base:\s*var\(--g-heavy-base\)/);
assert.match(tokens, /--gd-panel-tint:\s*var\(--g-tint-base\)/);
assert.match(tokens, /--gd-panel-base:\s*var\(--g-solid\)/);
assert.match(tokens, /--gd-hair:\s*var\(--g-hair\)/);
assert.equal(/--gd-panel-base:\s*color-mix\(in srgb, var\(--surface-1/.test(tokens), false);

function blockBody(css, scope, name) {
  const re = new RegExp(`${scope.replace(".", "\\.")}\\[data-theme="${name}"\\] \\{([\\s\\S]*?)\\n\\}`);
  const hit = re.exec(css);
  assert.ok(hit, `${scope} ${name}`);
  return hit[1].trim();
}
for (const name of ["light", "emerald", "crimson", "ocean", "midnight", "iriscape"]) {
  assert.equal(blockBody(palette, "html.glass-desktop", name), blockBody(ios, "html.glass-ui", name), name);
}

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
assert.match(palette, /--g-t3: rgba\(28,32,48,0\.70\)/);
assert.match(palette, /--g-tint-base: rgba\(255,255,255,0\.80\)/);
assert.match(palette, /--g-heavy-base: rgba\(255,255,255,0\.88\)/);
const light = readFileSync(join(here, "light.css"), "utf8");
assert.match(light, /html\.glass-desktop\[data-theme="light"\]/);
assert.match(light, /--gd-scrim:\s*color-mix\(in srgb, var\(--g-deep\)/);
const settings = readFileSync(join(here, "../settings.css"), "utf8");
assert.equal(settings.includes("background: #1a1b1e"), false);
assert.equal(settings.includes("rgba(20, 22, 26, 0.4)"), false);
const iosLight = readFileSync(join(here, "../glass/light.css"), "utf8");
assert.match(iosLight, /html\.glass-ui\[data-theme="light"\]/);
assert.match(iosLight, /var\(--g-chip-bg\)/);

const themeNames = [...design.matchAll(/\[data-theme="([\w-]+)"\]/g)].map((m) => m[1]);
assert.ok(themeNames.includes("crimson") && themeNames.includes("light") && themeNames.includes("iriscape"));
assert.ok(themeNames.length >= 30, `expected the full theme catalog, got ${themeNames.length}`);

console.log(`themeTint.selftest ok (${themeNames.length} themes)`);
