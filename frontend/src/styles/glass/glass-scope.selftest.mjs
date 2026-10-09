// Liquid Glass CSS must never leak to desktop / web / Android (2.9.151).
// Every selector in src/styles/glass/*.css is scoped under html.glass-ui, and the
// generated theme file is current. Run: node src/styles/glass/glass-scope.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "../../../scripts/generate-glass-themes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".css"));
assert.ok(files.includes("tokens.css") && files.includes("material.css") && files.includes("auth.css"));

function selectors(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  let buf = "";
  const stack = [];
  for (const ch of src) {
    if (ch === "{") {
      const head = buf.trim();
      buf = "";
      const atRule = head.startsWith("@");
      // Inside a keyframes block the "selectors" are offsets, not elements.
      const inKeyframes = stack.some((h) => /^@(-webkit-)?keyframes/.test(h));
      if (!atRule && !inKeyframes) out.push(head);
      stack.push(head);
      depth++;
    } else if (ch === "}") {
      stack.pop();
      depth--;
      buf = "";
    } else if (ch === ";" ) {
      buf = "";
    } else {
      buf += ch;
    }
  }
  assert.equal(depth, 0, "balanced braces");
  return out;
}

let count = 0;
for (const f of files) {
  const css = readFileSync(join(here, f), "utf8");
  for (const group of selectors(css)) {
    for (const sel of group.split(",").map((s) => s.trim()).filter(Boolean)) {
      count++;
      assert.ok(/^html\.glass-ui(?=[\s.[:#>]|$)/.test(sel), `${f}: unscoped selector "${sel}"`);
    }
  }
  assert.ok(!/@import\s+url\(\s*['"]?https?:/i.test(css), `${f}: no remote imports`);
}
assert.ok(count > 100, `found ${count} selectors`);

// themes.css is generated from design-tokens.css and must be current.
const tokensCss = readFileSync(join(here, "..", "design-tokens.css"), "utf8");
assert.equal(readFileSync(join(here, "themes.css"), "utf8"), generate(tokensCss), "themes.css is stale: run node scripts/generate-glass-themes.mjs");

// Mockup-exact dark defaults (final/src/glass.css).
const tokens = readFileSync(join(here, "tokens.css"), "utf8");
for (const exact of [
  "--g-brand: #587AF6",
  "--g-brand-hi: #8FA6FF",
  "--g-deep: #0D0E13",
  "--g-t1: rgba(255,255,255,0.96)",
  "--g-t2: rgba(235,238,255,0.72)",
  "--g-t3: rgba(235,238,255,0.46)",
]) {
  assert.ok(tokens.includes(exact), `tokens.css keeps ${exact}`);
}

// Loaded once, after every legacy sheet (same specificity rules win by order).
const styles = readFileSync(join(here, "..", "..", "styles.css"), "utf8");
const imports = [...styles.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
assert.equal(imports[imports.length - 1], "./styles/glass/index.css", "glass imported last");

console.log(`glass-scope.selftest ok (${count} selectors)`);
