import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The glass-desktop list column: 296px up to 1440px, +0.3px/px, capped at 380px.
const css = readFileSync(new URL("../styles/glass-desktop/tokens.css", import.meta.url), "utf8");
const num = (name) => Number(css.match(new RegExp(`--${name}:\\s*(\\d+)px`))[1]);
const base = num("sidebar-width-base");
const bp = num("sidebar-width-breakpoint");
const max = num("sidebar-width-max");
const slope = Number(css.match(/\(100vw - var\(--sidebar-width-breakpoint\)\) \* ([\d.]+)/)[1]);
assert.match(css, /--sidebar-width: clamp\(\s*var\(--sidebar-width-base\)/);
const width = (vw) => Math.min(max, Math.max(base, base + (vw - bp) * slope));

assert.equal(base, 296, "normal window sizes keep the current width");
for (const vw of [1024, 1280, 1366, 1440]) assert.equal(width(vw), 296, `unchanged at ${vw}`);
assert.ok(width(1600) > 296 && width(1600) < max);
assert.equal(width(1920), max);
assert.equal(width(2560), max);
assert.ok(max <= 380, "upper cap");
// Chat stays dominant: list column never exceeds ~22% of the window above the breakpoint.
for (const vw of [1600, 1920, 2560]) assert.ok(width(vw) / vw <= 0.22, `ratio at ${vw}`);
// Continuous (no jump) around the breakpoint.
assert.ok(Math.abs(width(bp + 1) - width(bp)) < 1);

// Small windows (now incl. 769–1024 px web tablets, 2.10.114) keep a compact column
// that still fits DM names next to the time/pin slot.
const shell = readFileSync(new URL("../styles/glass-desktop/shell.css", import.meta.url), "utf8");
assert.match(shell, /@media \(max-width: 1024px\)\s*\{\s*html\.glass-desktop\s*\{[^}]*--sidebar-width: 272px/);

console.log("sidebarWidth.selftest ok");
