// Desktop glass CSS must never apply unless html.glass-desktop is set.
// Run: node src/styles/glass-desktop/glass-desktop-scope.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".css") && f !== "index.css");
assert.ok(files.includes("tokens.css") && files.includes("auth.css") && files.includes("shell.css"));

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
      if (!atRule) out.push(head);
      stack.push(head);
      depth++;
    } else if (ch === "}") {
      stack.pop();
      depth--;
      buf = "";
    } else if (ch === ";") {
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
      assert.ok(
        /^html\.glass-desktop(?=[\s.[:#>]|$)/.test(sel),
        `${f}: unscoped selector "${sel}"`
      );
      assert.ok(!sel.includes("glass-ui"), `${f}: desktop sheet must not touch html.glass-ui ("${sel}")`);
    }
  }
}
assert.ok(count > 20, `found ${count} selectors`);

const tokens = readFileSync(join(here, "tokens.css"), "utf8");
for (const exact of ["--gd-deep: #0D0E13", "--gd-r-panel: 24px", "--gd-tb: 40px"]) {
  assert.ok(tokens.includes(exact), `missing ${exact}`);
}

console.log(`glass-desktop-scope.selftest ok (${count} selectors)`);
