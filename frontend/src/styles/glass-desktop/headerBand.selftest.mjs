// List headers must not paint a square frosted strip. Run:
// node frontend/src/styles/glass-desktop/headerBand.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function css(name) {
  return readFileSync(join(root, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

function block(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `missing ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

const chat = css("chat.css");
const header = block(chat, "html.glass-desktop .sidebar-header {");
assert.match(header, /backdrop-filter:\s*none/);
assert.match(header, /background:\s*transparent/);
assert.equal(/container-type:\s*inline-size/.test(header), false);
assert.match(block(chat, "html.glass-desktop .sidebar-inner {"), /container-type:\s*inline-size/);
assert.match(block(chat, "html.glass-desktop .sidebar-header .sidebar-title:not(.server-shell-title) {"), /border-radius:\s*18px/);
assert.match(block(chat, "html.glass-desktop .sidebar-actions::before {"), /border-radius:\s*18px/);
assert.match(block(chat, "html.glass-desktop .sidebar-actions::before {"), /backdrop-filter:/);

const community = css("community.css");
const server = block(community, "html.glass-desktop .server-shell-header {");
assert.match(server, /backdrop-filter:\s*none/);
assert.equal(/container-type:\s*inline-size/.test(server), false);

const surfaces = css("surfaces.css");
const slab = block(surfaces, "html.glass-desktop .lfg-sidebar-header,");
assert.match(slab, /backdrop-filter:\s*none/);
assert.match(slab, /container-type:\s*normal/);
for (const name of ["lfg-sidebar-header", "activity-view-toolbar", "us-main-header", "server-shell-header", "members-panel-header"]) {
  assert.ok(slab.includes(name) || surfaces.includes(name), name);
}
assert.match(block(surfaces, "html.glass-desktop .lfg-sidebar-header h2 {"), /border-radius:\s*18px/);

console.log("headerBand.selftest ok");
