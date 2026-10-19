// DM and Group right-click menus share one opening animation.
// Run: node frontend/src/lib/rowMenuMotion.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../components/layout/ServerSidebar.jsx"), "utf8");
const lib = readFileSync(join(here, "rowMenuMotion.js"), "utf8");
assert.match(lib, /SPRINGS\.materialize/);
assert.match(lib, /scale: 0\.6/);
const dm = src.slice(src.indexOf("function DmContextMenu"), src.indexOf("function GroupContextMenu"));
const grp = src.slice(src.indexOf("function GroupContextMenu"));
for (const [name, body] of [["dm", dm], ["group", grp]]) {
  assert.match(body, /\{\.\.\.rowMenuMotion\(reduceMotion\)\}/, `${name} menu uses the shared motion`);
  assert.match(body, /useReducedMotion\(\)/, `${name} menu respects reduced motion`);
  assert.match(body, /transformOrigin: position\.origin/, `${name} menu opens from the pointer`);
  assert.match(body, /rowMenuOrigin\(/);
}
console.log("rowMenuMotion selftest ok");
