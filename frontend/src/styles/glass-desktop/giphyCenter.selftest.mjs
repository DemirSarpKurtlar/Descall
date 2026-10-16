// The GIF picker is centred under the title bar. The attach-button
// anchor must not pin it, and composer popovers stay by the composer.
// Run: node frontend/src/styles/glass-desktop/giphyCenter.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "../..");

function css(path) {
  return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

function block(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `missing ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

const menus = css(join(root, "menus.css"));
const overlay = block(menus, "html.glass-desktop .giphy-overlay {");
assert.match(overlay, /display:\s*flex !important/);
assert.match(overlay, /align-items:\s*center !important/);
assert.match(overlay, /justify-content:\s*center !important/);
assert.match(overlay, /padding-top:\s*calc\(24px \+ var\(--electron-titlebar-h, 0px\)\) !important/);
assert.match(overlay, /var\(--gd-scrim\)/);

const panel = block(menus, "html.glass-desktop .giphy-panel {");
assert.match(panel, /position:\s*relative !important/);
assert.match(panel, /left:\s*auto !important/);
assert.match(panel, /bottom:\s*auto !important/);
assert.match(panel, /var\(--electron-titlebar-h, 0px\)/);
assert.match(panel, /var\(--g-heavy-base\)/);
assert.match(panel, /var\(--g-heavy-top\)/);
assert.equal(/#1e1f22|#1E1F22|rgba\(0,\s*0,\s*0,\s*0\.26\)/.test(panel), false);

assert.match(block(menus, "html.glass-desktop .giphy-search input {"), /var\(--gd-field-bg\)/);
assert.match(block(menus, "html.glass-desktop .giphy-tabs button.active,"), /var\(--gd-chip-hover\)/);
assert.match(block(menus, "html.glass-desktop .giphy-close {"), /var\(--g-chip-bg\)/);

const surfaces = css(join(root, "surfaces.css"));
const sheets = block(surfaces, "html.glass-desktop.electron-app .user-panel-backdrop,");
assert.match(sheets, /padding-top:\s*calc\(24px \+ var\(--electron-titlebar-h, 0px\)\) !important/);
for (const name of ["add-modal-backdrop", "feedback-overlay", "g-alert-scrim", "conv-confirm-overlay", "giphy-overlay", "server-modal-overlay"]) {
  assert.ok(sheets.length > 0 && surfaces.includes(`html.glass-desktop.electron-app .${name}`), name);
}

const layout = css(join(root, "../app-layout.css"));
assert.match(block(layout, ".emoji-picker {"), /position:\s*absolute/);
assert.match(block(layout, ".attachment-menu {"), /position:\s*absolute/);
assert.match(block(layout, ".slash-command-menu {"), /position:\s*absolute/);
assert.equal(/html\.glass-desktop \.emoji-picker \{[^}]*position:\s*fixed/.test(menus), false);

const picker = readFileSync(join(src, "components/chat/GiphyPicker.jsx"), "utf8");
assert.match(picker, /const centered = glass \|\| desktopGlass/);
assert.match(picker, /if \(!isOpen \|\| centered\) return/);
assert.match(picker, /style=\{centered \? undefined/);

console.log("giphyCenter.selftest ok");
