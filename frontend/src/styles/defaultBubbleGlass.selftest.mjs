// 3.7.34 default message bubble "Logo Mavisi Cam" (design/bubble-mockups/02).
//  - only bubbles without an equipped catalog bubble are painted;
//  - fills are >= 0.94 opaque (no see-through), no backdrop-filter per bubble;
//  - Reduce Transparency / a11y-solid / gd-lite get a flat opaque fill;
//  - loaded after the glass layers so it wins on web, Electron and iPhone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "default-bubble-glass.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const entry = readFileSync(join(here, "../styles.css"), "utf8");

// Load order: after glass + glass-desktop, so its rules beat the old theme paint.
const iGlass = entry.indexOf("./styles/glass/index.css");
const iDesk = entry.indexOf("./styles/glass-desktop/index.css");
const iMine = entry.indexOf("./styles/default-bubble-glass.css");
assert.ok(iMine > iGlass && iMine > iDesk, "default-bubble-glass.css is imported after both glass layers");

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
let painted = 0;
for (const { sel, body } of rules) {
  if (!/\.message-bubble(?![-\w])/.test(sel)) continue;
  for (const part of sel.split(/,(?![^(]*\))/)) {
    if (!/\.message-bubble(?![-\w])/.test(part)) continue;
    assert.match(part, /:not\(\.cosmetic-chat-bubble\)/, `"${part.trim()}" must yield to an equipped store bubble`);
    assert.match(part, /glass-desktop|glass-ui/, `"${part.trim()}" is scoped to the glass UIs (Android/classic untouched)`);
  }
  if (/(^|[;\s])background\s*:/.test(body)) {
    painted += 1;
    for (const part of sel.split(/,(?![^(]*\))/)) {
      if (!/\.message-bubble[^\s]*$/.test(part.trim())) continue; // paints a child, not the bubble
      if (/is-editing/.test(part)) continue;
      assert.match(part, /:not\(\.has-media-only\)/, `"${part.trim()}" leaves media-only bubbles alone`);
    }
  }
  assert.doesNotMatch(body, /backdrop-filter/, `${sel}: no per-bubble backdrop-filter`);
}
assert.ok(painted >= 6, "incoming, own and the fallbacks paint the bubble");

// Opacity: every rgba() fill token is >= 0.94 (heavy frost, nothing behind shows).
for (const name of ["--dbub-in", "--dbub-own"]) {
  for (const m of css.matchAll(new RegExp(`${name}:([^;]+);`, "g"))) {
    for (const a of m[1].matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)) assert.ok(Number(a[1]) >= 0.94, `${name} alpha ${a[1]} >= 0.94`);
  }
}
// Solid fallbacks are opaque colours, not gradients.
for (const m of css.matchAll(/--dbub-(in|own)-solid:([^;]+);/g)) assert.doesNotMatch(m[2], /gradient|rgba/, `--dbub-${m[1]}-solid is opaque`);

// Light theme has its own incoming fill and dark ink; own keeps white ink.
assert.match(css, /html\[data-theme="light"\]\s*\{[^}]*--dbub-in:[^}]*--dbub-in-ink:\s*#2E3338/);
assert.match(css, /--dbub-own-ink:\s*#FFFFFF/);
// Own bubble: logo blue from the theme brand token.
assert.match(css, /--dbub-own:\s*linear-gradient\(160deg,\s*rgba\(var\(--g-brand-rgb, 79, 124, 255\), 0\.94\)/);

// Reduce Transparency paths.
assert.match(css, /html:is\(\.a11y-solid, \.gd-lite\):is\(\.glass-desktop, \.glass-ui\)[^{]*\{\s*background: var\(--dbub-in-solid\) !important;/);
assert.match(css, /@media \(prefers-reduced-transparency: reduce\)\s*\{[\s\S]*var\(--dbub-own-solid\)/);

console.log("defaultBubbleGlass selftest OK");
