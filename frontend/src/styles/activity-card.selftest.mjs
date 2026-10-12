import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "activity-card.css"), "utf8");
const styles = readFileSync(join(here, "../styles.css"), "utf8");
const desktop = readFileSync(join(here, "glass-desktop/surfaces.css"), "utf8");

assert.match(
  styles,
  /@import '\.\/styles\/admin-liquid\.css';\s*@import '\.\/styles\/activity-card\.css';/
);
assert.match(css, /\.activity-current-card \{/);
assert.doesNotMatch(css, /var\(--surface-1\)/);
assert.match(css, /rgba\(255,\s*255,\s*255,\s*0\.16\)/);
assert.match(css, /\.activity-view-section \{\s*padding:\s*16px 28px;/);
assert.match(css, /\.activity-view-mobile \.activity-view-section \{\s*padding:\s*16px;/);
assert.match(css, /background:\s*transparent/);
assert.doesNotMatch(
  desktop,
  /html\.glass-desktop \.activity-view-section,\s*html\.glass-desktop \.shop-card/
);

console.log("activity-card.selftest ok");
