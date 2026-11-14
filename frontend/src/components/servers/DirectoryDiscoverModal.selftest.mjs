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
// Every topic has a banner colour.
for (const id of DIRECTORY_CATEGORIES) {
  assert.ok(css.includes(`.dir-card[data-cat="${id}"]`), `banner colour for topic ${id}`);
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
