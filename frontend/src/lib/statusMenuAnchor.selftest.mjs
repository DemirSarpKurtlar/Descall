import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GLASS_STATUS_GAP, glassStatusAnchor, glassStatusMenuStyle } from "./statusMenuAnchor.js";

const docWith = (rect) => ({
  querySelector: (sel) => (sel === '[data-gid="toolbar-avatar"]' && rect ? { getBoundingClientRect: () => rect } : null),
});

// Toolbar avatar at top-left (iPhone): 44pt at (16, 12).
const anchor = glassStatusAnchor(docWith({ left: 16, top: 12, right: 60, bottom: 56, width: 44, height: 44 }));
assert.deepEqual(anchor, { left: 16, top: 12, bottom: 56, width: 44 });
const style = glassStatusMenuStyle(anchor);
assert.equal(style["--g-status-left"], "16px", "left edge = avatar left edge");
assert.equal(style["--g-status-top"], `${56 + GLASS_STATUS_GAP}px`, "directly under the avatar with a gap");
assert.ok(GLASS_STATUS_GAP >= 6 && GLASS_STATUS_GAP <= 12, "normal gap, no overlap");
assert.equal(style["--g-mat-origin"], "22px 0%");

// Not on screen → CSS fallback (no vars).
assert.equal(glassStatusAnchor(docWith(null)), null);
assert.equal(glassStatusAnchor(docWith({ left: 0, top: 0, bottom: 0, width: 0, height: 0 })), null);
assert.equal(glassStatusAnchor(null), null);
assert.deepEqual(glassStatusMenuStyle(null), { "--g-mat-origin": "22px 0%" });

// CSS: hangs from the top (not from the tab bar), stays heavy glass.
const css = readFileSync(new URL("../styles/glass/shell.css", import.meta.url), "utf8");
const rule = css.match(/html\.glass-ui \.status-picker\.g-status-menu \{[^}]*\}/)[0];
assert.match(rule, /left: var\(--g-status-left, 16px\);/);
assert.match(rule, /top: var\(--g-status-top, calc\(var\(--g-chrome-top, 12px\) \+ 52px\)\);/);
assert.match(rule, /bottom: auto;/);
assert.doesNotMatch(rule, /--g-bar-bottom/);
const rail = readFileSync(new URL("../components/layout/NavigationRail.jsx", import.meta.url), "utf8");
assert.match(rail, /g-status-menu g-glass g-heavy/);
assert.match(rail, /setGlassAnchor\(glassStatusAnchor\(\)\)/);
assert.match(rail, /glassStatusMenuStyle\(glassAnchor\)/);
const shell = readFileSync(new URL("../components/layout/glass/GlassShell.jsx", import.meta.url), "utf8");
assert.match(shell, /data-gid="toolbar-avatar"/);

console.log("statusMenuAnchor.selftest ok");
