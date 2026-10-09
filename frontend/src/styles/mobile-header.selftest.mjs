// Phone chat header: name never breaks one letter per line next to the admin
// badge (2.9.153). Run: node src/styles/mobile-header.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./mobile.css", import.meta.url), "utf8");
const i = css.indexOf("Mobile chat header: admin badge + long names");
assert.ok(i > 0, "mobile header block present");
const block = css.slice(i);
assert.ok(/\.panel-header \.header-title-block\.is-dm \.header-title-text \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;[^}]*overflow-wrap: normal;/s.test(block), "DM name: one line + ellipsis, no anywhere-break");
assert.ok(/\.panel-header \.header-title-block\.is-dm \{[^}]*flex: 1 1 0;[^}]*min-width: 0;/s.test(block), "name column takes the free space");
assert.ok(/\.dsc-admin-badge--inline \.dsc-admin-badge-label \{\s*display: none;/s.test(block), "badge compacts to the shield");
assert.ok(/@media \(max-width: 768px\)/.test(block), "phones only (desktop unchanged)");
console.log("mobile-header.selftest ok");
