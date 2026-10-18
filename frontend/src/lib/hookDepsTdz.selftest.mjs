// Static guard against temporal-dead-zone crashes: a hook dependency array
// (or any render-time read) naming a const/let that the same component
// declares further down throws "Cannot access 'X' before initialization"
// on every render. 2.10.113 shipped one in ServerVoicePanel (`[sharing]`).
// Scans every component and hook; each top-level function is a scope.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p); continue; }
    if (/\.(jsx|js)$/.test(name) && !/selftest|\.test\./.test(name)) files.push(p);
  }
})(src);

const KEYWORDS = new Set(["true", "false", "null", "undefined", "this", "window", "document"]);
const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (!/use(Effect|LayoutEffect|Memo|Callback)\(/.test(text)) continue;
  const lines = text.split("\n");
  // Top-level function boundaries (column 0).
  const starts = [];
  lines.forEach((l, i) => { if (/^(export\s+(default\s+)?)?(async\s+)?function\s|^(export\s+)?const\s+\w+\s*=\s*(memo\(|forwardRef\(|\(|async\s*\()/.test(l)) starts.push(i); });
  starts.push(lines.length);
  for (let s = 0; s < starts.length - 1; s++) {
    const a = starts[s], b = starts[s + 1];
    const body = lines.slice(a, b);
    const decl = new Map();
    body.forEach((l, k) => {
      // Only the component's own top level (2-space indent).
      const m = l.match(/^  (?:const|let)\s+(.+?)\s*=/);
      if (!m) return;
      const names = m[1].replace(/[[\]{}]/g, " ").split(/[\s,:]+/).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
      for (const n of names) if (!decl.has(n)) decl.set(n, k);
    });
    body.forEach((l, k) => {
      const m = l.match(/^  \}, \[([^\]]*)\]\);/);
      if (!m) return;
      for (const raw of m[1].split(",")) {
        const root = raw.trim().split(/[.?[]/)[0];
        if (!root || KEYWORDS.has(root)) continue;
        const at = decl.get(root);
        if (at !== undefined && at > k) hits.push(`${relative(src, file)}:${a + k + 1} uses '${root}' declared at line ${a + at + 1}`);
      }
    });
  }
}
assert.deepEqual(hits, [], `hook deps read a const before its declaration (TDZ):\n${hits.join("\n")}`);
console.log(`hookDepsTdz.selftest ok (${files.length} files)`);
