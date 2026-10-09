#!/usr/bin/env node
/**
 * Generates src/styles/glass/themes.css — theme-aware Liquid Glass tokens for
 * every [data-theme] in src/styles/design-tokens.css (dark, light, premium).
 *
 * The default dark theme is NOT generated: it uses the approved mockup values
 * verbatim (src/styles/glass/tokens.css). Every other theme keeps the same
 * materials/geometry and derives tint + ambient from its own palette:
 *   brand     ← --primary          brand-hi ← --text-link
 *   brand2    ← --primary-2        (second ambient light)
 *   base/deep ← --surface-0/1      text     ← --text-1
 * Light-scheme themes get a light material (white glass, dark text).
 *
 * Run: node scripts/generate-glass-themes.mjs   (selftest checks it is current)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(here, "..", "src", "styles", "design-tokens.css");
const outPath = join(here, "..", "src", "styles", "glass", "themes.css");

function hexToRgb(hex) {
  const h = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => c.join(",");
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

export function parseThemes(css) {
  const out = [];
  const re = /\[data-theme="([\w-]+)"\]\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(css))) {
    const [, name, body] = m;
    const get = (k) => (new RegExp(`--${k}:\\s*([^;]+);`).exec(body) || [])[1]?.trim();
    const scheme = (/color-scheme:\s*(\w+)/.exec(body) || [])[1] || "dark";
    out.push({ name, scheme, primary: get("primary"), primary2: get("primary-2"), surface0: get("surface-0"), surface1: get("surface-1"), text1: get("text-1"), link: get("text-link") });
  }
  return out;
}

const DARK_DEFAULT = { primary: "#4F7CFF", primary2: "#3B63E6" };

export function themeBlock(t) {
  const brand = hexToRgb(t.primary) || hexToRgb(DARK_DEFAULT.primary);
  const brand2 = hexToRgb(t.primary2) || mix(brand, [0, 0, 0], 0.15);
  const light = t.scheme === "light";
  const link = hexToRgb(t.link) || mix(brand, [255, 255, 255], 0.35);
  const s0 = hexToRgb(t.surface0) || (light ? [242, 243, 245] : [17, 18, 20]);
  const s1 = hexToRgb(t.surface1) || (light ? [255, 255, 255] : [30, 31, 34]);
  const text = hexToRgb(t.text1) || (light ? [46, 51, 56] : [242, 243, 245]);
  const sel = `html.glass-ui[data-theme="${t.name}"]`;
  if (light) {
    const deep = mix(s0, brand, 0.04);
    return `${sel} {
  --g-scheme: light;
  --g-brand: ${hex(brand)};
  --g-brand-rgb: ${rgb(brand)};
  --g-brand-hi: ${hex(link)};
  --g-brand2-rgb: ${rgb(brand2)};
  --g-deep: ${hex(deep)};
  --g-edge-rgb: ${rgb(deep)}; --g-ring: ${hex(mix(s0, s1, 0.5))};
  --g-base-0: ${hex(mix(s1, brand, 0.05))};
  --g-base-1: ${hex(mix(s0, s1, 0.5))};
  --g-base-2: ${hex(mix(s0, [0, 0, 0], 0.03))};
  --g-amb-a: 0.22; --g-amb-b: 0.16; --g-amb-c: 0.10; --g-amb-d: 0.14; --g-glow: 0.26;
  --g-t1: rgba(10,12,22,0.92); --g-t2: rgba(30,34,52,0.68); --g-t3: rgba(30,34,52,0.48); --g-t4: rgba(30,34,52,0.30);
  --g-tint-top: rgba(255,255,255,0.72); --g-tint-bot: rgba(255,255,255,0.50); --g-tint-base: rgba(255,255,255,0.30);
  --g-heavy-top: rgba(255,255,255,0.80); --g-heavy-bot: rgba(255,255,255,0.62); --g-heavy-base: rgba(255,255,255,0.55);
  --g-chip-bg: rgba(255,255,255,0.55); --g-lens-top: rgba(255,255,255,0.95); --g-lens-bot: rgba(255,255,255,0.80);
  --g-shadow: 0 12px 32px rgba(20,30,60,0.14), 0 2px 6px rgba(20,30,60,0.10);
  --g-shadow-heavy: 0 24px 64px rgba(20,30,60,0.20), 0 4px 14px rgba(20,30,60,0.10);
  --g-rim-a: rgba(255,255,255,0.95); --g-rim-b: rgba(255,255,255,0.40); --g-rim-c: rgba(255,255,255,0.10); --g-rim-d: rgba(255,255,255,0.30); --g-rim-e: rgba(255,255,255,0.70);
  --g-refract-a: rgba(255,255,255,0.55); --g-refract-b: rgba(255,255,255,0.25);
  --g-hair: rgba(0,0,0,0.12);
  --g-fill: rgba(0,0,0,0.05); --g-fill-hair: rgba(0,0,0,0.08);
  --g-field-bg: rgba(255,255,255,0.62); --g-field-shadow: inset 0 1px 2px rgba(0,0,0,0.06), inset 0 0 0 0.5px rgba(0,0,0,0.10);
  --g-apple-bg: #000; --g-apple-fg: #fff;
  --g-seg-on: rgba(10,12,22,0.92);
  --g-solid: ${hex(mix(s1, s0, 0.3))}; --g-solid-heavy: ${hex(s1)};
  --g-contrast-border: rgba(0,0,0,0.55);
  --g-on-brand: #fff;
  --g-cta-top: rgba(${rgb(mix(brand, [255, 255, 255], 0.2))},0.97); --g-cta-bot: rgba(${rgb(mix(brand, [0, 0, 0], 0.05))},0.97);
}`;
  }
  const deep = mix(s0, [0, 0, 0], 0.2);
  return `${sel} {
  --g-scheme: dark;
  --g-brand: ${hex(brand)};
  --g-brand-rgb: ${rgb(brand)};
  --g-brand-hi: ${hex(link)};
  --g-brand2-rgb: ${rgb(brand2)};
  --g-deep: ${hex(deep)};
  --g-edge-rgb: ${rgb(deep)}; --g-ring: ${hex(mix(s0, s1, 0.5))};
  --g-base-0: ${hex(mix(s1, brand, 0.06))};
  --g-base-1: ${hex(mix(s0, s1, 0.6))};
  --g-base-2: ${hex(mix(s0, [0, 0, 0], 0.1))};
  --g-t1: rgba(${rgb(mix(text, [255, 255, 255], 0.5))},0.96); --g-t2: rgba(${rgb(text)},0.72); --g-t3: rgba(${rgb(text)},0.46); --g-t4: rgba(${rgb(text)},0.28);
  --g-tint-base: rgba(${rgb(s1)},0.22);
  --g-heavy-base: rgba(${rgb(mix(s1, [0, 0, 0], 0.15))},0.62);
  --g-solid: ${hex(mix(s1, [0, 0, 0], 0.05))}; --g-solid-heavy: ${hex(s1)};
  --g-cta-top: rgba(${rgb(mix(brand, [255, 255, 255], 0.2))},0.95); --g-cta-bot: rgba(${rgb(mix(brand, [0, 0, 0], 0.05))},0.95);
}`;
}

export function generate(css) {
  const themes = parseThemes(css).filter((t) => t.name !== "dark");
  return `/* GENERATED by scripts/generate-glass-themes.mjs — do not edit by hand.
   Theme-aware Liquid Glass tokens (2.9.151). The default dark theme uses the
   approved mockup values in tokens.css; every other theme derives its tint and
   ambient light from its own palette in design-tokens.css. */

${themes.map(themeBlock).join("\n\n")}
`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const css = readFileSync(tokensPath, "utf8");
  const next = generate(css);
  if (process.argv.includes("--check")) {
    const cur = readFileSync(outPath, "utf8");
    if (cur !== next) {
      console.error("themes.css is stale — run node scripts/generate-glass-themes.mjs");
      process.exit(1);
    }
    console.log("themes.css up to date");
  } else {
    writeFileSync(outPath, next);
    console.log("wrote", outPath, parseThemes(css).length - 1, "themes");
  }
}
