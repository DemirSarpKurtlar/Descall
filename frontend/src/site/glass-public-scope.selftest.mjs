// Public glass CSS must not touch the iPhone glass class or the app shell.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const css = ["glass-public.css", "glass-public-frames.css"].map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
assert.ok(!/glass-ui|glass-desktop/.test(css), "public glass must not name the app glass classes");

const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
const selectors = [];
let buf = "";
let depth = 0;
for (const ch of src) {
  if (ch === "{") {
    if (depth === 0 && buf.trim() && !buf.trim().startsWith("@")) selectors.push(buf.trim());
    buf = "";
    depth++;
  } else if (ch === "}") {
    depth--;
    buf = "";
  } else if (ch !== ";" || depth > 0) {
    buf += ch;
  } else {
    buf = "";
  }
}
assert.ok(selectors.length > 10, `expected selectors, got ${selectors.length}`);
for (const group of selectors) {
  for (const sel of group.split(",").map((s) => s.trim()).filter(Boolean)) {
    assert.ok(
      sel.startsWith(".mkt") || sel.startsWith(".dc-consent") || sel.startsWith("body:has(.mkt)") || sel.startsWith(".invite-landing"),
      `unscoped public selector: ${sel}`
    );
  }
}
console.log(`glass-public-scope.selftest ok (${selectors.length} groups)`);
