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
assert.match(shell, /electron-app\.gd-lite \.sidebar-secondary,\nhtml\.glass-desktop\.electron-app\.gd-lite \.app-main-slot/);
assert.match(shell, /electron-app\.gd-lite \.main-panel,/);
assert.match(shell, /electron-app\.gd-lite \.titlebar \{/);
assert.match(shell, /electron-app\.gd-lite \.search-input,/);
assert.equal(/html\.glass-desktop\.electron-app \.search-input/.test(shell), false, "a normal Electron window keeps the website search blur");
assert.equal(/html\.glass-desktop\.electron-app \.titlebar/.test(shell), false, "a normal Electron window keeps the website title bar blur");
assert.match(shell, /html\.glass-desktop body \.nav-rail \.rail-btn \{[\s\S]*var\(--gd-glass-fill\)/);
assert.match(shell, /html\.glass-desktop \.group-icon \{[\s\S]*var\(--gd-glass-fill\) !important/);
assert.equal(/electron-app \.conv-more-btn/.test(shell), false, "more buttons keep the shared glass tint");
assert.equal(/electron-app \.group-icon/.test(shell), false, "group tiles use the shared glass rule");
const chat = readFileSync(join(here, "chat.css"), "utf8");
assert.match(chat, /html\.glass-desktop \.search-input,\nhtml\.glass-desktop \.sidebar-search input \{[\s\S]*blur\(16px\)/);
assert.match(chat, /html\.glass-desktop \.header-identity \{[\s\S]*blur\(26px\)/);
assert.match(shell, /messages-container > \.empty-state[\s\S]*border:\s*none !important/);
assert.equal(/electron-app:not\(\.gd-lite\) \.sidebar-secondary/.test(shell), false);
assert.match(shell, /html\.glass-desktop \.main-panel \{\s*background:\s*var\(--gd-glass-fill\) !important/);
assert.equal(themes.includes("--gd-panel-base: color-mix(in srgb, #241832"), false);
const layout = readFileSync(join(here, "../app-layout.css"), "utf8");
const paused = layout.slice(layout.indexOf("html.g-theme-paused"));
assert.match(paused, /animation-play-state:\s*paused !important/);
assert.equal(/backdrop-filter:\s*none/.test(paused.slice(0, 500)), false, "a hidden Electron window must not strip glass blur");
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
assert.match(themes, /radial-gradient\(90% 80% at 12% 18%, rgba\(124, 58, 237, 0\.55\), transparent 64%\)/);
assert.match(themes, /rgba\(34, 211, 238, 0\.42\)/);
assert.match(themes, /rgba\(244, 114, 182, 0\.5\)/);
assert.match(themes, /rgba\(250, 204, 21, 0\.3\)/);
assert.equal(themes.includes("conic-gradient"), false, "iriscape must not use a conic wheel");
assert.equal(themes.includes("body::before"), false, "the iris is the window background, not a spinning layer");
const iosScenes = readFileSync(join(here, "../glass/theme-scenes.css"), "utf8");
assert.match(iosScenes, /radial-gradient\(90% 80% at 12% 18%, rgba\(124, 58, 237, 0\.55\), transparent 64%\)/);
assert.equal(/iriscape"\] \.g-theme-drift \{[^}]*conic-gradient/.test(iosScenes), false);
const classic = readFileSync(join(here, "../theme-scenes.css"), "utf8");
assert.match(classic, /radial-gradient\(90% 80% at 12% 18%, rgba\(124, 58, 237, 0\.55\), transparent 64%\)/);
assert.equal(/data-theme="iriscape"\] body::before/.test(classic), false);

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
