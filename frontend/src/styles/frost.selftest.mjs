// Every floating surface is heavy frosted glass (2.10.113): blur >= 40px,
// saturate 180%, base alpha >= 0.82 dark / 0.85 light, opaque fallbacks, and
// the same surface list in every block. Run: node src/styles/frost.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "frost.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const styles = readFileSync(join(here, "..", "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const imports = [...styles.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
assert.equal(imports.at(-1), "./styles/frost.css", "frost.css must be the last import");

const lists = [...css.matchAll(/:is\(\s*((?:\.[a-z0-9-]+\s*,\s*)+\.[a-z0-9-]+)\s*\)/g)]
  .map((m) => m[1].split(",").map((s) => s.trim()).sort().join(","))
  .filter((l) => l.split(",").length > 10);
assert.equal(lists.length, 4, "base + @supports + a11y-solid/gd-lite + reduced-transparency");
assert.ok(lists.every((l) => l === lists[0]), "surface lists must match in every block");
const surfaces = lists[0].split(",");
for (const must of [
  ".g-call-menu", ".g-call-sheet", ".grp-menu", ".gd-row-menu", ".gs-sheet", ".group-info-sheet",
  ".pinned-popover", ".slash-command-menu", ".attachment-menu", ".emoji-picker", ".g-alert",
  ".conv-confirm-card", ".server-voice-device-menu", ".call-device-menu", ".toast-item",
  ".g-menu", ".server-member-menu", ".server-channel-menu", ".img-crop-modal", ".user-hover-card",
  ".g-react-bar",
]) assert.ok(surfaces.includes(must), `${must} must be frosted`);
// Layout wrappers must not be frosted: .g-msg-pop is the full-screen long-press
// layer; frosting it drew an opaque box behind the lifted bubble (2.11.16).
for (const wrapper of [".g-msg-pop", ".g-msg-stack", ".g-lift"]) {
  assert.ok(!surfaces.includes(wrapper), `${wrapper} is a layout wrapper, not a surface`);
}

const alpha = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*rgba\\(\\s*\\d+,\\s*\\d+,\\s*\\d+,\\s*([0-9.]+)\\)`));
  assert.ok(m, name);
  return Number(m[1]);
};
assert.ok(alpha("frost-base-dark") >= 0.82 && alpha("frost-base-dark") <= 0.9);
assert.ok(alpha("frost-base-light") >= 0.85 && alpha("frost-base-light") <= 0.92);
assert.ok(Number(css.match(/--frost-blur:\s*(\d+)px/)[1]) >= 40);
assert.match(css, /--frost-saturate:\s*180%/);
assert.match(css, /:root\[data-theme="light"\]\s*\{[^}]*--frost-base:\s*var\(--frost-base-light\)/);

const base = css.slice(css.indexOf(":is("), css.indexOf("@supports"));
assert.match(base, /background:[^;]*var\(--frost-base\)[^;]*!important/);
assert.match(base, /-webkit-backdrop-filter:\s*blur\(var\(--frost-blur\)\)[^;]*!important/);
assert.match(base, /\bbackdrop-filter:\s*blur\(var\(--frost-blur\)\)[^;]*!important/);
assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
assert.match(css, /:root:root:root:root:is\(\.a11y-solid, \.gd-lite\) :is\(/);
// Specificity must beat `html.glass-ui[data-theme="light"] .x` (0,3,1) !important rules.
assert.equal((css.match(/:root:root:root:root :is\(/g) || []).length, 3);
assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
assert.equal((css.match(/background:\s*var\(--frost-solid\) !important/g) || []).length, 3);
console.log(`frost selftest ok (${surfaces.length} surfaces)`);
