// Theme ink contrast (color sweep, Nov 2026). For every [data-theme] in
// design-tokens.css (missing tokens fall back to the default dark block):
//   - muted / link / status ink reach WCAG AA 4.5:1 on --surface-1..3;
//   - the ink on a --primary fill (--on-primary, white by default) reaches 3:1,
//     so light accents (mint, solar, cyberpunk...) get a dark ink;
//   - desktop chrome (Electron toast, HUD, boot retry) carries no Discord
//     blurple (#5865F2 / 88,101,242) where the logo blue belongs.
// Run: node src/styles/themeContrast.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "design-tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const blocks = {};
for (const m of css.matchAll(/((?:\[data-theme="[a-z]+"\][\s,]*)+|:root,\s*\[data-theme="dark"\])\s*\{([^}]*)\}/g)) {
  const names = [...m[1].matchAll(/data-theme="([a-z]+)"/g)].map((x) => x[1]);
  if (names.length !== 1) continue;
  const vars = {};
  for (const v of m[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[v[1]] = v[2].trim();
  blocks[names[0]] = { ...(blocks[names[0]] || {}), ...vars };
}
assert.ok(blocks.dark && blocks.light && Object.keys(blocks).length > 30, "parsed the theme blocks");

const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
const lum = (c) => {
  const a = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};
const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s || "");

const fails = [];
for (const [name, own] of Object.entries(blocks)) {
  const t = { ...blocks.dark, ...own };
  for (const fg of ["--text-3", "--text-muted", "--text-link", "--danger-text", "--success-text", "--warning-text"]) {
    for (const bg of ["--surface-1", "--surface-2", "--surface-3"]) {
      if (!isHex(t[fg]) || !isHex(t[bg])) continue;
      const r = ratio(t[fg], t[bg]);
      if (r < 4.5) fails.push(`${name}: ${fg} ${t[fg]} on ${bg} ${t[bg]} = ${r.toFixed(2)}`);
    }
  }
  if (isHex(t["--primary"]) && isHex(t["--on-primary"])) {
    const r = ratio(t["--on-primary"], t["--primary"]);
    if (r < 3) fails.push(`${name}: --on-primary ${t["--on-primary"]} on --primary ${t["--primary"]} = ${r.toFixed(2)}`);
  }
}
assert.deepEqual(fails, [], "theme ink below AA:\n  " + fails.join("\n  "));

const root = join(here, "..", "..");
for (const rel of ["electron/notificationCard.cjs", "electron/premium/hudHtml.cjs", "index.html"]) {
  const src = readFileSync(join(root, rel), "utf8");
  assert.ok(!/#5865f2|88,\s*101,\s*242/i.test(src), `${rel}: Discord blurple instead of the logo blue`);
}

console.log("themeContrast selftest OK", Object.keys(blocks).length, "themes");
