// Takım bul header: chips stay inside the screen, list is not a black slab.
// Run: node src/styles/glass/play-header.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "play.css"), "utf8");

assert.match(css, /html\.glass-ui \.app-root\.g-shell\.is-mobile\[data-view="play"\] \.lfg-lobby-list,[\s\S]*background: transparent !important/);
assert.match(css, /html\.glass-ui \.app-root\.g-shell\.is-mobile\[data-view="play"\] \.lfg-filters-bar \{[\s\S]*min-width: 0/);
assert.match(css, /html\.glass-ui \.app-root\.g-shell\.is-mobile\[data-view="play"\] \.lfg-filters \{[\s\S]*overflow-x: auto/);
assert.match(css, /field-sizing: content/);
assert.match(css, /html\.glass-ui \.app-root\.g-shell\.is-mobile\[data-view="play"\] \.lfg-mic-toggle-label \{[\s\S]*clip: rect\(0, 0, 0, 0\)/);
assert.doesNotMatch(css, /\.lfg-sidebar-header::after/);
assert.doesNotMatch(css, /\.lfg-main,\nhtml\.glass-ui \.app-root\.g-shell\.is-mobile\[data-view="play"\] \.lfg-empty/);

console.log("play-header.selftest ok");
