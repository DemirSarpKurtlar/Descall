// Discover modal, gallery layout (owner-picked draft A): wiring and styling guards.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DIRECTORY_CATEGORIES } from "../../lib/serverDirectory.js";

const jsx = readFileSync(new URL("./DirectoryDiscoverModal.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../styles/server-directory.css", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./ServersSidebar.jsx", import.meta.url), "utf8");

// Every topic has an icon on its chip and card banner.
const iconBlock = jsx.slice(jsx.indexOf("const CATEGORY_ICONS"), jsx.indexOf("};", jsx.indexOf("const CATEGORY_ICONS")));
for (const id of DIRECTORY_CATEGORIES) {
  assert.ok(iconBlock.includes(`"${id}"`) || iconBlock.includes(`  ${id}:`), `icon for topic ${id}`);
}
// Topic colours (owner decision Nov 2026): one curated palette, defined once on the modal, every
// topic maps to it, no neon hex left on cards, and the colours keep their glyph / icon contrast.
const strip = (c) => c.replace(/\/\*[\s\S]*?\*\//g, "");
const code = strip(css);
const palette = Object.fromEntries([...code.matchAll(/--dir-cat-([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]));
assert.deepEqual(Object.keys(palette).sort(), [...DIRECTORY_CATEGORIES].sort(), "one palette entry per topic");
assert.equal((code.match(/--dir-cat-[a-z0-9-]+:\s*#/gi) || []).length, DIRECTORY_CATEGORIES.length, "topic colours are defined once");
for (const id of DIRECTORY_CATEGORIES) {
  assert.ok(code.includes(`.dir-modal [data-cat="${id}"] { --cat: var(--dir-cat-${id}); }`), `topic ${id} reads its palette colour`);
}
assert.doesNotMatch(code, /--cat-[ab]:|#e96bd8|#ff5c8a/i, "no per-card hand-picked neon pairs");
assert.match(code, /\.dir-card-banner \{[^}]*var\(--cat\)/, "banner draws the topic colour");
assert.match(jsx, /className=\{`dir-chip\$\{category === id \? " is-on" : ""\}`\} data-cat=\{id\}/, "topic chips carry data-cat");

const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgbOf = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
const lum = (rgb) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const over = (fg, alpha, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
const mixSrgb = (a, p, b) => a.map((v, i) => Math.round(v * p + b[i] * (1 - p)));
const WHITE = [255, 255, 255];
// Surfaces: the dark modal (rgba(24,25,36,.92) + 7% white top, over a dark backdrop) and the light one.
const darkModal = over(WHITE, 0.07, over([24, 25, 36], 0.92, [12, 13, 18]));
const darkCard = over(WHITE, 0.045, darkModal);
const darkChip = over(WHITE, 0.06, darkModal);
const lightModal = over(WHITE, 0.85, over([246, 247, 252], 0.94, WHITE));
const lightCard = over(WHITE, 0.7, lightModal);
const lightChip = over([20, 24, 40], 0.045, lightModal);
for (const [id, hex] of Object.entries(palette)) {
  const c = rgbOf(hex);
  assert.ok(ratio(WHITE, c) >= 3, `${id} ${hex}: white glyph ${ratio(WHITE, c).toFixed(2)}:1 < 3:1`);
  assert.ok(ratio(c, lightChip) >= 3, `${id} ${hex}: light chip icon ${ratio(c, lightChip).toFixed(2)}:1 < 3:1`);
  const darkIcon = mixSrgb(c, 0.55, WHITE);
  assert.ok(ratio(darkIcon, darkChip) >= 3, `${id}: dark chip icon ${ratio(darkIcon, darkChip).toFixed(2)}:1 < 3:1`);
}
// Card title / meta / description inks on the card surface, both themes (AA text).
const ink = (name, block) => { const m = block.match(new RegExp(`--dir-${name}: rgba\\((\\d+), (\\d+), (\\d+), ([0-9.]+)\\)`)); return [[+m[1], +m[2], +m[3]], +m[4]]; };
const darkVars = code.match(/\.server-modal\.dir-modal \{([^}]*)\}/)[1];
const lightVars = code.match(/html\[data-theme="light"\] \.server-modal\.dir-modal \{([^}]*)\}/)[1];
for (const name of ["ink", "ink-2", "ink-3"]) {
  const [dc, da] = ink(name, darkVars);
  const [lc, la] = ink(name, lightVars);
  const d = ratio(over(dc, da, darkCard), darkCard);
  const l = ratio(over(lc, la, lightCard), lightCard);
  assert.ok(d >= 4.5, `dark card --dir-${name}: ${d.toFixed(2)}:1 < 4.5:1`);
  assert.ok(l >= 4.5, `light card --dir-${name}: ${l.toFixed(2)}:1 < 4.5:1`);
}

// Sort is a segmented radio group, not a native select.
assert.match(jsx, /className="dir-sort" role="radiogroup"/);
assert.doesNotMatch(jsx, /<select/);
// The topic row scrolls sideways without a visible scrollbar.
assert.match(css, /\.dir-modal \.dir-chips \{[^}]*scrollbar-width: none/);
assert.match(css, /\.dir-modal \.dir-chips::-webkit-scrollbar \{\s*display: none/);
assert.match(jsx, /useSidewaysWheel\(chipsRef\)/);

// Modal rules are scoped: the admin user directory reuses .dir-tools / .dir-chip / .dir-list.
for (const cls of [".dir-tools", ".dir-chip", ".dir-list", ".dir-search", ".dir-sort", ".dir-empty"]) {
  const re = new RegExp(`(^|\\n)\\${cls}[ ,{:.]`);
  assert.doesNotMatch(css, re, `${cls} is scoped under .dir-modal`);
}

// Empty state: per-topic and per-search titles, and the way to list a server.
assert.match(jsx, /dir\.discover\.emptyCategory/);
assert.match(jsx, /dir\.discover\.emptySearch/);
assert.match(jsx, /onListServer \? \(/);
assert.match(jsx, /dir\.discover\.step1/);
// The sidebar only offers "List my server" to someone who can list the open server.
assert.match(sidebar, /onListServer=\{\s*canListActiveServer/);
assert.match(sidebar, /const canListActiveServer =/);

// Every locale has the new strings.
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
for (const loc of LOCALES) {
  const mod = await import(`../../i18n/locales/dir.${loc}.js`);
  const dict = Object.values(mod).find((v) => v && v.discover);
  for (const k of ["emptyCategory", "emptySearch", "listMine", "allTopics", "step1", "step2", "step3"]) {
    assert.ok(dict.discover[k], `${loc}: dir.discover.${k}`);
  }
  assert.match(dict.discover.emptyCategory, /\{category\}/, `${loc}: emptyCategory keeps {category}`);
}

console.log("DirectoryDiscoverModal.selftest.mjs: ok");
