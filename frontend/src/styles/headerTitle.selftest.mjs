// Section headers must show the whole word. Run:
// node frontend/src/styles/headerTitle.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)));

function css(rel) {
  return readFileSync(join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

function block(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `missing ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

const layout = css("app-layout.css");
const title = block(layout, ".sidebar-title {");
assert.equal(title.includes("text-overflow: ellipsis"), false, "sidebar title ellipsizes");
assert.match(title, /min-width:\s*min-content/);
assert.match(title, /white-space:\s*nowrap/);
assert.match(block(layout, ".sidebar-header {"), /flex-wrap:\s*wrap/);

const glassChat = css("glass-desktop/chat.css");
const glassTitle = block(glassChat, "html.glass-desktop .sidebar-title {");
assert.equal(glassTitle.includes("text-overflow: ellipsis"), false, "glass sidebar title ellipsizes");
assert.match(glassTitle, /min-width:\s*min-content/);
assert.match(glassTitle, /clamp\(18px,\s*8\.9cqi,\s*24px\)/);
const glassHeader = block(glassChat, "html.glass-desktop .sidebar-header {");
assert.match(glassHeader, /flex-wrap:\s*wrap/);
assert.equal(/container-type:\s*inline-size/.test(glassHeader), false, "header is a query container");
assert.match(glassHeader, /backdrop-filter:\s*none/);
assert.match(block(glassChat, "html.glass-desktop .sidebar-inner {"), /container-type:\s*inline-size/);

const shell = css("glass/shell.css");
const large = block(shell, "html.glass-ui .g-large-title {");
assert.equal(large.includes("text-overflow: ellipsis"), false, "large title ellipsizes");
assert.match(large, /clamp\(22px,\s*8\.6vw,\s*34px\)/);
const tab = block(shell, "html.glass-ui .g-tab-label {");
assert.equal(tab.includes("text-overflow: ellipsis"), false, "tab label ellipsizes");

const server = block(css("servers.css"), ".server-shell-title {");
assert.equal(server.includes("text-overflow: ellipsis"), false);
assert.match(server, /white-space:\s*normal/);

const community = block(css("glass-desktop/community.css"), "html.glass-desktop .server-shell-title {");
assert.equal(community.includes("text-overflow: ellipsis"), false);
assert.match(community, /white-space:\s*normal/);

console.log("headerTitle.selftest ok");
