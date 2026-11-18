// node scripts/phosphor-weights.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripPhosphorWeights, KEEP_WEIGHTS } from "./phosphor-weights-lib.mjs";

const dir = new URL("../node_modules/@phosphor-icons/react/dist/defs/", import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith(".es.js"));
assert.ok(files.length > 1000, "phosphor defs present");
// Evaluate the Map with a stub React and check the kept weights survive intact.
const React = { Fragment: "F", createElement: (t, p, ...c) => ({ t, p, c }) };
let before = 0, after = 0;
for (const f of files.filter((_, i) => i % 50 === 0).concat(["Warning.es.js", "X.es.js"])) {
  const src = readFileSync(join(dir, f), "utf8");
  const out = stripPhosphorWeights(src);
  before += src.length; after += out.length;
  const run = (code) => {
    const mapVar = /const (\w+) = (?:\/\* @__PURE__ \*\/ )?new Map/.exec(code)[1];
    const body = code.replace(/^import \* as (\w+) from "react";/m, "const $1 = __R;").replace(/export\s*\{[^}]*\};?\s*$/m, `return ${mapVar};`);
    return new Function("__R", body)(React);
  };
  const full = run(src), lean = run(out);
  assert.deepEqual([...lean.keys()].sort(), [...KEEP_WEIGHTS].sort(), f);
  for (const w of KEEP_WEIGHTS) assert.deepEqual(lean.get(w), full.get(w), `${f} ${w}`);
}
assert.ok(after < before * 0.6, `smaller: ${before} -> ${after}`);
console.log(`phosphor-weights selftest: ok (${Math.round((1 - after / before) * 100)}% smaller)`);
