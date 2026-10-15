// Shop category strip: drag, wheel, arrows, and the selected chip.
// Run: node src/lib/shopChipScroll.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rubberbandClamp } from "./fluid/physics.js";
import {
  CHIP_SLOP_PX,
  classifyChipDrag,
  coastTarget,
  dragOffset,
  overflowEdges,
  pageOffset,
  revealOffset,
  wheelScrollDelta,
} from "./shopChipScroll.js";

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(here, "../components/settings/ShopPanel.jsx"), "utf8");
const hook = readFileSync(join(here, "../hooks/useShopChipScroll.js"), "utf8");
const css = readFileSync(join(here, "../styles/shop.css"), "utf8");

assert.equal(CHIP_SLOP_PX, 10);
assert.equal(classifyChipDrag(4, 3), "pending");
assert.equal(classifyChipDrag(14, 2), "lock");
assert.equal(classifyChipDrag(-12, 4), "lock");
assert.equal(classifyChipDrag(3, 16), "reject");

assert.equal(wheelScrollDelta({ deltaX: 12, deltaY: 2 }), 12);
assert.equal(wheelScrollDelta({ deltaX: 2, deltaY: 20, shiftKey: true }), 20);
assert.equal(wheelScrollDelta({ deltaX: 0, deltaY: 30 }), 30);
assert.equal(wheelScrollDelta({ deltaX: 0, deltaY: 2, deltaMode: 1 }), 32);

const pulled = dragOffset(0, -40, 0, 200, 120);
assert.ok(pulled < 0 && pulled > -40, `edge rubber-bands, got ${pulled}`);
assert.ok(Math.abs(pulled - rubberbandClamp(-40, 0, 200, 120)) < 1e-6);
assert.equal(dragOffset(20, -8, 0, 200, 120), 12);

const flicked = coastTarget(40, 0.8, 0, 500);
assert.ok(flicked > 40, `a rightward flick coasts forward, got ${flicked}`);
assert.equal(coastTarget(20, -2, 0, 500), 0, "a flick off the start rests at 0");
assert.equal(coastTarget(480, 1, 0, 500), 500, "a flick off the end rests at the end");

assert.deepEqual(overflowEdges(0, 0), { left: false, right: false });
assert.deepEqual(overflowEdges(0, 80), { left: false, right: true });
assert.deepEqual(overflowEdges(80, 80), { left: true, right: false });
assert.deepEqual(overflowEdges(20, 80), { left: true, right: true });

assert.equal(revealOffset(0, 200, 180, 240, 100, 16), 156);
assert.equal(revealOffset(150, 200, 10, 70, 100, 16), 0);
assert.equal(revealOffset(40, 200, 50, 90, 100, 16), 34);
assert.equal(pageOffset(0, 200, 100, 1), 72);
assert.equal(pageOffset(10, 200, 100, -1), 0);

assert.match(panel, /useShopChipScroll/);
assert.match(panel, /shop-chip-arrow is-prev/);
assert.match(panel, /shop-chip-arrow is-next/);
assert.match(panel, /data-tab-id=\{tab\.id\}/);
assert.equal(panel.includes("row.scrollLeft = next"), false);

assert.match(hook, /classifyChipDrag/);
assert.match(hook, /coastTarget/);
assert.match(hook, /prefers-reduced-motion/);
assert.match(hook, /ArrowRight/);
assert.match(hook, /shiftKey/);

assert.match(css, /\.shop-chip-arrow/);
assert.match(css, /backdrop-filter:\s*blur\(16px\) saturate\(160%\)/);
assert.match(css, /prefers-reduced-transparency:\s*reduce/);
assert.match(css, /html\.a11y-solid \.shop-chip-arrow/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /is-fade-left/);
assert.match(css, /is-fade-right/);

console.log("shopChipScroll.selftest ok");
