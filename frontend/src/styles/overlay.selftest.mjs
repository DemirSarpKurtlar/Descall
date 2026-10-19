// Every modal / sheet / dialog backdrop covers the whole window (2.13.x modal
// audit). Run: node src/styles/overlay.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const css = readFileSync(join(here, "overlay.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const styles = readFileSync(join(src, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const imports = [...styles.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
assert.equal(imports.at(-2), "./styles/overlay.css", "overlay.css loads right before frost.css");

const lists = [...css.matchAll(/:is\(\s*((?:\.[a-z0-9-]+\s*,\s*)+\.[a-z0-9-]+)\s*\)/g)]
  .map((m) => m[1].split(",").map((s) => s.trim()).sort().join(","))
  .filter((l) => l.split(",").length > 20);
assert.ok(lists.length >= 4, "base + @supports + a11y/lite + title bar");
const base = lists[0];
for (const l of lists) assert.ok(l === base || l === [...base.split(","), ".user-settings-shell"].sort().join(",") || l.includes(".modal-backdrop"), "backdrop lists match");
const backdrops = base.split(",");
for (const must of [".modal-backdrop", ".user-profile-scrim", ".add-modal-backdrop", ".feedback-overlay", ".server-modal-overlay", ".report-modal-overlay", ".g-alert-scrim", ".dsx-scrim", ".o3-scrim", ".gs-scrim"]) {
  assert.ok(backdrops.includes(must), `${must} is a full-window backdrop`);
}
// Menu click-catchers stay transparent and anchored.
for (const menu of [".g-msg-scrim", ".reaction-picker-backdrop", ".g-attach-scrim", ".server-voice-menu-backdrop"]) {
  assert.ok(!backdrops.includes(menu), `${menu} is a menu click-catcher, not a modal backdrop`);
}
assert.equal((css.match(/\(/g) || []).length, (css.match(/\)/g) || []).length, "balanced parentheses (a stray one drops the rule when minified)");
assert.match(css, /position:\s*fixed !important;\s*inset:\s*0 !important/);
assert.match(css, /backdrop-filter:\s*blur\(var\(--overlay-blur\)\)/);
assert.ok(Number(css.match(/--overlay-blur:\s*(\d+)px/)[1]) >= 24, "heavy blur");
assert.ok(Number(css.match(/--overlay-dim:\s*rgba\([^)]*,\s*([0-9.]+)\)/)[1]) >= 0.55, "heavy dim");
assert.match(css, /\.titlebar::after/, "the Electron title bar gets the same dim + blur");

// Every component that renders one of these backdrops portals it to
// document.body (createPortal, <OverlayPortal> or the polls <Portal>), so a
// transformed / filtered / isolated panel can never scope it.
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.jsx$/.test(f) ? [p] : []; });
const names = backdrops.map((b) => b.slice(1));
const offenders = [];
for (const file of walk(src)) {
  const code = readFileSync(file, "utf8");
  const uses = names.filter((n) => new RegExp(`className=\\{?["\`][^"\`]*\\b${n}\\b`).test(code));
  if (!uses.length) continue;
  if (!/createPortal\(|<OverlayPortal\b|<Portal\b/.test(code)) offenders.push(`${file.slice(src.length + 1)} (${uses.join(", ")})`);
}
assert.deepEqual(offenders, [], "backdrops rendered in place");
const profile = readFileSync(join(src, "components/social/UserProfileModal.jsx"), "utf8");
assert.match(profile, /<OverlayPortal>\s*<AnimatePresence>/, "desktop profile popup is portaled (was scoped to the chat panel)");
console.log(`overlay selftest ok (${backdrops.length} backdrops)`);

// Surfaces are never see-through: frost bases >= 0.85, separate transparent
// Electron windows >= 0.94 (CSS blur cannot sample the desktop), every frost
// and backdrop rule has an opaque fallback, purchase modal base >= 0.85.
const alpha = (s, re) => Number(s.match(re)[1]);
const frost = readFileSync(join(here, "frost.css"), "utf8");
assert.ok(alpha(frost, /--frost-base-dark:\s*rgba\([^)]*,\s*([0-9.]+)\)/) >= 0.85, "dark frost base >= 0.85");
assert.ok(alpha(frost, /--frost-base-light:\s*rgba\([^)]*,\s*([0-9.]+)\)/) >= 0.85, "light frost base >= 0.85");
assert.match(frost, /@supports not \(\(backdrop-filter/, "frost opaque fallback");
assert.match(css, /@supports not \(\(backdrop-filter/, "backdrop opaque fallback");
assert.match(css, /@supports not \(background: color-mix/, "color-mix fallback");
const spm = readFileSync(join(here, "store-purchase-modal.css"), "utf8");
assert.ok(Number("0" + spm.match(/--heavy:\s*rgba\([^)]*,\s*0?(\.[0-9]+)\)/)[1]) >= 0.85, "purchase modal base >= 0.85");
assert.ok(backdrops.includes(".spm-scrim"), "store purchase scrim uses the shared backdrop");
const card = readFileSync(join(src, "..", "electron", "notificationCard.cjs"), "utf8");
assert.ok(alpha(card, /rgba\(\s*18,\s*20,\s*30,\s*([0-9.]+)\)/) >= 0.94, "Electron notification card >= 0.94");
const splash = readFileSync(join(src, "..", "electron", "splash.html"), "utf8");
assert.ok(alpha(splash, /rgba\(\s*20,\s*21,\s*30,\s*([0-9.]+)\)/) >= 0.94, "splash card >= 0.94");
console.log("overlay alpha checks ok");
