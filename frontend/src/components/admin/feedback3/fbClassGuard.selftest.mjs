// Guard: the Geri Bildirim panel uses short class names (.c, .pv, .bd, .l1 ...) scoped under
// .fb3 in admin-feedback-v3.css. Every admin chunk stays in the document once loaded, so a
// stylesheet elsewhere with an unscoped root rule on the same word restyles the panel. That is
// how ".ago" from the Ajan page (min-height: 640px) stretched every feedback row (Nov 2026).
// This test lists the class tokens the panel renders and fails when another stylesheet starts
// a selector with one of them.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "../../..");
const OWN_CSS = join(SRC, "styles/admin-feedback-v3.css");

const jsx = readFileSync(join(here, "AdminFeedbackV3.jsx"), "utf8");
const tokens = new Set();
for (const m of jsx.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
  const raw = (m[1] || m[2] || "").replace(/\$\{[^}]*\}/g, " ");
  for (const tok of raw.split(/\s+/)) if (/^[a-z][\w-]*$/i.test(tok)) tokens.add(tok);
}
assert.ok(tokens.has("fb3-row") && tokens.has("fb3-ago"), "panel class names were read");
assert.ok(!tokens.has("ago"), "the row time uses .fb3-ago, not the Ajan page's .ago root");

function cssFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) cssFiles(p, out);
    else if (name.endsWith(".css") && p !== OWN_CSS) out.push(p);
  }
  return out;
}

const hits = [];
for (const file of cssFiles(SRC)) {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of css.split("}")) {
    const prelude = block.split("{")[0];
    if (!prelude || prelude.trim().startsWith("@")) continue;
    for (const item of prelude.split(",")) {
      const sel = item.trim().replace(/^:where\(|^:is\(/, "");
      const m = /^\.([a-z][\w-]*)/i.exec(sel);
      if (m && tokens.has(m[1]) && !m[1].startsWith("fb3")) hits.push(`${relative(SRC, file)}: ${item.trim()}`);
    }
  }
}
assert.deepEqual(hits, [], `unscoped root rules collide with Geri Bildirim class names:\n${hits.join("\n")}`);
console.log(`fbClassGuard.selftest: ok (${tokens.size} class names, no foreign root rules)`);
