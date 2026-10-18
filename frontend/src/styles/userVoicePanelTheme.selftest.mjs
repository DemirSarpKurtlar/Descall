// The bottom user/voice panel follows the equipped catalog theme and is the same
// material as the chat-list column under desktop Liquid Glass (2.11.6).
// Run from frontend/: node src/styles/userVoicePanelTheme.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "user-voice-panel.css"), "utf8");
const shell = readFileSync(join(here, "glass-desktop", "shell.css"), "utf8");

function block(source, selector) {
  const i = source.indexOf(`${selector} {`);
  assert.notEqual(i, -1, `missing rule: ${selector}`);
  return source.slice(i, source.indexOf("\n}", i));
}

const panel = block(css, "html.glass-desktop .uvp");
const list = block(shell, "html.glass-desktop .sidebar-secondary");

// Theme tokens, not a private slab.
for (const [name, value] of [
  ["--uvp-ink", "var(--gd-t1)"],
  ["--uvp-ink-2", "var(--gd-t2)"],
  ["--uvp-ink-3", "var(--gd-t3)"],
  ["--uvp-btn", "var(--gd-chip)"],
  ["--uvp-btn-hover", "var(--gd-chip-hover)"],
  ["--uvp-accent", "var(--gd-brand)"],
  ["--uvp-base", "var(--gd-solid)"],
]) {
  assert.match(panel, new RegExp(`${name}:\\s*${value.replace(/[()]/g, "\\$&")};`), `${name} uses ${value}`);
}
assert.match(panel, /--uvp-hair:\s*color-mix\(in srgb, var\(--g-t1\) 10%, transparent\)/, "hairline is the theme ink");
assert.match(panel, /rgba\(var\(--g-brand-rgb\), 0\.\d+\)/, "theme wash / glow use the theme brand");
assert.doesNotMatch(panel, /--gd-aurora-base-1/, "no private dark slab");
assert.doesNotMatch(panel.replace(/rgba\(0, 0, 0, [\d.]+\)/g, ""), /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/, "no hard-coded colour except neutral drop shadows");

// Same material, radius and blur as the list column.
assert.match(list, /background:\s*var\(--gd-glass-fill\)/);
assert.match(panel, /var\(--gd-glass-fill\)/, "same fill as the list");
assert.match(list, /border-radius:\s*var\(--gd-r-panel\)/);
assert.match(panel, /border-radius:\s*var\(--gd-r-panel\)/, "same radius as the list");
assert.match(panel, /backdrop-filter:\s*blur\(var\(--gd-blur-panel\)\) saturate\(var\(--gd-saturate\)\)/, "same heavy blur as the list");
assert.match(panel, /border:\s*none/, "no separate-card border");
assert.match(css, /html\.glass-desktop \.uvp::before \{[\s\S]*?mask-composite/, "edge highlight like the list");
assert.match(css, /html\.glass-desktop \.uvp::after \{[\s\S]*?inset 10px 12px 24px -16px/, "inner sheen like the list");

// Subtle inner divider.
const idle = block(css, "html.glass-desktop .uvp-idle");
assert.match(idle, /border-bottom:\s*0/);
assert.match(idle, /linear-gradient\(90deg, transparent, var\(--uvp-hair\)/);

// Accessibility and lite modes still win.
assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{\n  \.uvp,\n  html\.glass-desktop \.uvp \{[\s\S]*?backdrop-filter: none/);
assert.match(css, /html\.glass-desktop\.a11y-solid \.uvp,\nhtml\.glass-desktop\.gd-lite \.uvp \{[\s\S]*?backdrop-filter: none/);
assert.match(css, /html\.glass-desktop\.electron-app\.gd-lite:not\(\.a11y-solid\) \.uvp \{[\s\S]*?var\(--gd-glass-fill\)/, "lite Electron matches the forced list frost");
assert.ok(css.indexOf("html.glass-desktop .uvp {") < css.indexOf("html.glass-desktop.a11y-solid .uvp"), "a11y-solid comes after the glass rule");

console.log("userVoicePanelTheme.selftest: ok");
