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
}

const phosphor = {
  sohbetler: "ChatCircleDots",
  gruplar: "UsersThree",
  sunucular: "HardDrives",
  arkadaslar: "UserPlus",
  aktivite: "Lightning",
  aramalar: "Phone",
  ekle: "Plus",
  ayarlar: "GearSix",
};
for (const component of Object.values(phosphor)) {
  assert.match(icons, new RegExp(`\\b${component}\\b`), component);
}
assert.match(icons, /weight="regular"/);
assert.match(icons, /weight="fill"/);
assert.equal(/@phosphor-icons/.test(icons), false, "rail glyphs are inlined, not fetched from the phosphor package");
assert.match(icons, /phosphorInline\.jsx/);
const tabs = readFileSync(join(here, "../components/layout/tabBarIcons.jsx"), "utf8");
assert.equal(/@phosphor-icons/.test(tabs), false, "tab glyphs are inlined, not fetched from the phosphor package");
assert.match(tabs, /phosphorInline\.jsx/);
const inline = readFileSync(join(here, "../components/layout/phosphorInline.jsx"), "utf8");
assert.match(inline, /viewBox: "0 0 256 256"/);
assert.match(inline, /fill: "currentColor"/);
assert.equal(/@phosphor-icons|lucide-react|@font-face|fonts\.google/.test(inline), false);
const vite = readFileSync(join(here, "../../vite.config.js"), "utf8");
const phosphorChunk = vite.indexOf('id.includes("@phosphor-icons")');
const reactChunk = vite.indexOf('id.includes("/react/")');
assert.ok(phosphorChunk > 0 && phosphorChunk < reactChunk, "phosphor chunk must be decided before vendor-react");
assert.match(css, /\.rail-glyph-fill/);
assert.match(css, /active \.rail-glyph-regular/);

assert.match(styles, /@import '\.\/styles\/feedback-nudge\.css';\s*@import '\.\/styles\/rail-icons\.css';/);
assert.match(css, /fill:\s*#fff/);
assert.match(css, /left:\s*-7px/);
assert.equal(/transform:\s*translateX/.test(css), false);
assert.match(rail, /type:\s*"spring"/);
assert.match(rail, /useReducedMotion/);
assert.match(rail, /stiffness:\s*640/);
assert.equal(icons.includes("feGaussianBlur"), false);
assert.equal(icons.includes("descall-icon.png"), false);

const shell = readFileSync(join(here, "../components/layout/glass/GlassShell.jsx"), "utf8");
const sidebar = readFileSync(join(here, "../components/layout/ServerSidebar.jsx"), "utf8");
const shellCss = readFileSync(join(here, "glass/shell.css"), "utf8");
assert.match(shell, /phosphorInline\.jsx/);
assert.match(sidebar, /phosphorInline\.jsx/);
assert.equal(/from "lucide-react"/.test(shell), false, "toolbar shell must not wait on the lucide chunk");
assert.match(shell, /g-bgroup-plate g-glass/);
assert.equal(/className="g-bgroup g-glass"/.test(shell), false, "toolbar blur must not wrap the glyphs");
assert.match(shellCss, /\.g-bgroup-plate/);
assert.match(shellCss, /display:\s*block/);
for (const name of ["MagnifyingGlass", "Megaphone", "Chat", "Plus", "ChatCircleDots", "User"]) {
  assert.match(inline, new RegExp(`"${name}": \\{\\s*"regular": "[^"]{20,}"`), name);
  assert.match(inline, new RegExp(`"fill": "[^"]{20,}"`), `${name} fill`);
}
const hardFill = inline.match(/"HardDrives":\s*\{[\s\S]*?"fill":\s*"([^"]+)"/);
assert.ok(hardFill, "HardDrives fill path");
assert.match(hardFill[1], /M208,40H48/, "upper drive");
assert.match(hardFill[1], /M208,136H48/, "lower drive stays in the active tab glyph");

console.log("rail-icons.selftest ok");
