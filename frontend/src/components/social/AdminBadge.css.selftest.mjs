// The Ekip badge must never be clipped by a row with overflow: hidden (iPad / iPhone DM header).
// Run: node src/components/social/AdminBadge.css.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "AdminBadge.css"), "utf8");
const block = (sel) => {
  const i = css.indexOf(`${sel} {`);
  assert.ok(i >= 0, `${sel} rule exists`);
  return css.slice(i, css.indexOf("}", i));
};

const base = block(".dsc-admin-badge");
assert.doesNotMatch(base, /box-shadow:\s*0 0 0 1px/, "no outer 1px ring on the badge: it sits outside the box and gets clipped");
assert.match(base, /position:\s*relative/, "the badge positions its inner edge");
const edge = block(".dsc-admin-badge::after");
assert.match(edge, /inset:\s*0/, "the edge covers the badge");
assert.match(edge, /box-shadow:\s*inset 0 0 0 1px var\(--staff-edge\)/, "the edge is drawn inside");
assert.match(edge, /pointer-events:\s*none/, "the edge never takes taps");
assert.match(
  css,
  /:where\(\.header-title, \.g-peer-name[^)]*\) > \.dsc-admin-badge--inline \{\s*align-self: center;\s*transform: none;/,
  "in flex rows the badge is centered without the 1px baseline nudge",
);
console.log("AdminBadge.css.selftest: ok");
