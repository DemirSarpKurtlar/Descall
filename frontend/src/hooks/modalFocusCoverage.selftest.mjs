// Every dialog that tells assistive tech it is modal (aria-modal) must also behave
// modally for the keyboard: Tab stays inside, the page behind is inert, focus returns
// to the opener. Use hooks/useModalFocus.js (or an existing Tab trap). Polish scan
// i18n-a11y-04: 34 such dialogs let Tab walk into the app behind them.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const TRAP = /useModalFocus(?:Ref)?\(|key\s*[!=]==\s*["']Tab["']|\buseTrap\(|\buseFocusTrap\(|\buseLayerKeys\(/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx$/.test(name) && !/\.(selftest|test)\./.test(name)) out.push(p);
  }
  return out;
}

const missing = [];
for (const file of walk(join(SRC, "components"))) {
  const src = readFileSync(file, "utf8");
  if (!/aria-modal=/.test(src)) continue;
  if (!TRAP.test(src)) missing.push(relative(SRC, file));
}
assert.deepEqual(missing, [], `aria-modal dialogs without a focus trap (use hooks/useModalFocus.js):\n  ${missing.join("\n  ")}`);
console.log("modalFocusCoverage.selftest: ok");
