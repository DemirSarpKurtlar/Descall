// node src/styles/hasSelectorGuard.selftest.mjs
// performance-01: body:has(.app-root...) and the marketing .seo-hero:has() (whose CSS
// also ships in the app) made every hover and scroll restyle ~3000 elements each
// (Chromium re-checks the whole document on any class change). Use a class set from JS.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".css")) files.push(p);
  }
})(root);

// Measured with a devtools trace (elements restyled per hover): these two cost ~3000
// elements each on every hover; the other :has() rules in the app measured near zero.
const BANNED = [/\bbody:has\(\s*\.app-root/, /\.seo-hero:has\(/];
const hits = [];
for (const f of files) {
  const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const re of BANNED) if (re.test(css)) hits.push(`${relative(root, f)}: ${re}`);
}
assert.deepEqual(hits, [], `costly :has() selectors:\n${hits.join("\n")}`);
console.log(`hasSelectorGuard selftest: ok (${files.length} css files)`);
