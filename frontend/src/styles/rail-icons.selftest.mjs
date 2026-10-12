import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const icons = readFileSync(join(here, "../components/layout/railIcons.jsx"), "utf8");
const rail = readFileSync(join(here, "../components/layout/NavigationRail.jsx"), "utf8");
const css = readFileSync(join(here, "rail-icons.css"), "utf8");
const styles = readFileSync(join(here, "../styles.css"), "utf8");
const dir = join(root, "assets/rail");
const files = readdirSync(dir).filter((f) => f.endsWith(".svg")).sort();

const names = [
  "sohbetler",
  "gruplar",
  "sunucular",
  "oyna",
  "arkadaslar",
  "aktivite",
  "aramalar",
  "ekle",
  "ayarlar",
];

assert.deepEqual(files, names.flatMap((n) => [`${n}-active.svg`, `${n}.svg`]).sort());

for (const file of files) {
  const svg = readFileSync(join(dir, file), "utf8");
  assert.match(svg, /viewBox="0 0 24 24"/, file);
  assert.equal(/filter=|feGaussianBlur|feTurbulence|feFlood/.test(svg), false, file);
  if (file.endsWith("-active.svg")) {
    assert.match(svg, /fill="#fff"/, file);
  } else {
    assert.match(svg, /<linearGradient/, file);
  }
  const nums = [...svg.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[1] ? m[0] : m[0]));
  for (const n of nums) {
    if (!Number.isFinite(n)) continue;
    const snapped = Math.abs(n * 2 - Math.round(n * 2)) < 1e-6;
    assert.equal(snapped, true, `${file} off-grid ${n}`);
  }
  const fragment = svg.match(/d="([^"]{12,48})/)?.[1];
  if (fragment) assert.ok(icons.includes(fragment), `${file} path missing from railIcons`);
}

assert.match(styles, /@import '\.\/styles\/feedback-nudge\.css';\s*@import '\.\/styles\/rail-icons\.css';/);
assert.match(css, /fill:\s*#fff/);
assert.match(css, /left:\s*-7px/);
assert.equal(/transform:\s*translateX/.test(css), false);
assert.match(rail, /type:\s*"spring"/);
assert.match(rail, /useReducedMotion/);
assert.match(rail, /stiffness:\s*640/);
assert.equal(icons.includes("feGaussianBlur"), false);
assert.equal(icons.includes("descall-icon.png"), false);

console.log("rail-icons.selftest ok");
