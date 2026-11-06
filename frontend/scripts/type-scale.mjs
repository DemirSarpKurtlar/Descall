#!/usr/bin/env node
/**
 * Type scale ratchet (UI audit #129, 2026-11-06).
 *
 * The app type scale is seven steps, 11 / 12 / 13 / 15 / 17 / 20 / 28 px, as
 * rem tokens in styles/design-tokens.css (--fs-11 ... --fs-28). New CSS uses
 * those tokens; a literal `font-size: NNpx` is legacy.
 *
 *   node scripts/type-scale.mjs                 report; exit 1 if a file has MORE
 *                                               literal px font-sizes (or more
 *                                               half-pixel ones) than its baseline
 *   node scripts/type-scale.mjs --update-baseline   lower the baseline after migrating
 *   node scripts/type-scale.mjs --migrate=<file.css> [...]
 *                                               rewrite exact on-scale px sizes
 *                                               (11/12/13/15/17/20/28) in those files
 *                                               to the tokens. 1rem = 16px (html is
 *                                               pinned to 16px in base.css), so the
 *                                               rendered size does not change.
 *
 * Baseline: scripts/type-scale-baseline.json. A file may go down, never up; a
 * new CSS file starts at zero.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src");
const BASELINE = join(root, "scripts", "type-scale-baseline.json");
export const SCALE = [11, 12, 13, 15, 17, 20, 28];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".css")) out.push(p);
  }
  return out;
}

const PX_RE = /font-size\s*:\s*(-?\d+(?:\.\d+)?)px/g;

export function countFile(css) {
  let px = 0;
  let half = 0;
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(PX_RE)) {
    px += 1;
    if (!Number.isInteger(Number(m[1]))) half += 1;
  }
  return { px, half };
}

export function migrateCss(css) {
  return css.replace(/font-size(\s*):(\s*)(\d+)px(?=\s*(?:!important)?\s*[;}])/g, (all, a, b, n) =>
    SCALE.includes(Number(n)) ? `font-size${a}:${b}var(--fs-${n})` : all,
  );
}

export function scan() {
  const out = {};
  for (const f of walk(SRC)) {
    const c = countFile(readFileSync(f, "utf8"));
    if (c.px || c.half) out[relative(root, f).split("\\").join("/")] = c;
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const migrate = args.filter((a) => a.startsWith("--migrate=")).map((a) => a.slice(10));
  if (migrate.length) {
    for (const rel of migrate) {
      const p = join(root, rel);
      const before = readFileSync(p, "utf8");
      const after = migrateCss(before);
      writeFileSync(p, after);
      console.log(`${rel}: ${countFile(before).px} -> ${countFile(after).px} px font-sizes`);
    }
    process.exit(0);
  }
  const now = scan();
  if (args.includes("--update-baseline")) {
    writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
    console.log("type-scale baseline updated");
    process.exit(0);
  }
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  const bad = [];
  let total = 0;
  let halves = 0;
  for (const [file, c] of Object.entries(now)) {
    total += c.px;
    halves += c.half;
    const b = base[file] || { px: 0, half: 0 };
    if (c.px > b.px || c.half > b.half) bad.push(`${file}: ${c.px} px (${c.half} half) > baseline ${b.px} (${b.half})`);
  }
  console.log(`literal px font-sizes: ${total} (${halves} half-pixel) in ${Object.keys(now).length} files`);
  if (bad.length) {
    console.error(`type-scale: new literal px font-sizes; use var(--fs-11|12|13|15|17|20|28):\n  ${bad.join("\n  ")}`);
    process.exit(1);
  }
  console.log("type-scale check: ok");
}
