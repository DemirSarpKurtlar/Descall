import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(jsx|js|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const allow = new Set([
  join(src, "components/ui/GlassCheckbox.jsx"),
  // Selector string for the haptic hint, not a rendered control.
  join(src, "lib/fluid/haptics.js"),
]);

const offenders = [];
for (const path of walk(src)) {
  if (allow.has(path)) continue;
  const text = readFileSync(path, "utf8");
  if (/type=["']checkbox["']/.test(text)) offenders.push(path.slice(src.length + 1));
}
assert.deepEqual(offenders, [], `native checkbox left in ${offenders.join(", ")}`);

const css = readFileSync(join(src, "styles/checkbox.css"), "utf8");
assert.match(css, /width:\s*44px/);
assert.match(css, /height:\s*44px/);
assert.match(css, /stroke-dashoffset:\s*0/);
assert.match(css, /scale\(0\.92\)/);
assert.match(css, /#8fa6ff/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /dc-check-pop/);
assert.match(css, /backdrop-filter:\s*blur\(18px\)/);

const styles = readFileSync(join(src, "styles.css"), "utf8");
assert.match(
  styles,
  /@import '\.\/styles\/auth-sheet\.css';\s*@import '\.\/styles\/checkbox\.css';\s*@import '\.\/styles\/google-signin\.css';/
);
const marketing = readFileSync(join(src, "site/marketing-entry.css"), "utf8");
assert.match(marketing, /@import "\.\.\/styles\/checkbox\.css";/);

console.log("GlassCheckbox.selftest ok");
