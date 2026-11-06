// UI audit #129: one type scale, and literal px font-sizes may only go down.
// Run: node frontend/src/styles/typeScale.selftest.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCALE, migrateCss, countFile } from "../../scripts/type-scale.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(here, "design-tokens.css"), "utf8");
for (const n of SCALE) {
  const m = tokens.match(new RegExp(`--fs-${n}:\\s*([0-9.]+)rem;`));
  assert.ok(m, `--fs-${n} token`);
  assert.equal(Number(m[1]) * 16, n, `--fs-${n} is ${n}px at the 16px root`);
}
assert.match(readFileSync(join(here, "base.css"), "utf8"), /html, body \{[^}]*font-size:\s*16px/, "rem tokens assume a 16px root");

// Migration only touches on-scale integers and keeps !important.
assert.equal(migrateCss(".a{font-size:13px}"), ".a{font-size:var(--fs-13)}");
assert.equal(migrateCss(".a { font-size: 17px !important; }"), ".a { font-size: var(--fs-17) !important; }");
assert.equal(migrateCss(".a { font-size: 12.5px; }"), ".a { font-size: 12.5px; }");
assert.equal(migrateCss(".a { font-size: 14px; }"), ".a { font-size: 14px; }");
assert.deepEqual(countFile(".a{font-size:12.5px}.b{font-size:14px}/* font-size: 9px */"), { px: 2, half: 1 });

// The ratchet itself.
execFileSync(process.execPath, [join(here, "../../scripts/type-scale.mjs")], { stdio: "pipe" });
console.log("typeScale.selftest ok");
