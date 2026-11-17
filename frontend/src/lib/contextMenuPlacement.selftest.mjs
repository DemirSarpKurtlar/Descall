import assert from "node:assert/strict";
import { placeContextMenu } from "./contextMenuPlacement.js";

const inside = (p, w, h, vw, vh, m = 8) => p.left >= m && p.top >= m && p.left + w <= vw - m && p.top + Math.min(h, p.maxHeight) <= vh - m;

// Fits below the pointer: opens at the pointer.
let p = placeContextMenu({ x: 100, y: 100, width: 240, height: 300, viewportWidth: 1280, viewportHeight: 800 });
assert.deepEqual([p.left, p.top, p.flipped], [100, 100, false]);

// Owner report: 1280x800, right-click low on the stage, menu 480 px with the move list.
p = placeContextMenu({ x: 470, y: 560, width: 240, height: 480, viewportWidth: 1280, viewportHeight: 800 });
assert.equal(p.flipped, true);
assert.ok(inside(p, 240, 480, 1280, 800), JSON.stringify(p));

// 1440x900 remote tile, 596 px tall: still fully on screen.
p = placeContextMenu({ x: 700, y: 480, width: 240, height: 596, viewportWidth: 1440, viewportHeight: 900 });
assert.ok(inside(p, 240, 596, 1440, 900), JSON.stringify(p));

// Taller than the viewport: capped with maxHeight (the menu scrolls).
p = placeContextMenu({ x: 10, y: 300, width: 240, height: 1200, viewportWidth: 1024, viewportHeight: 600 });
assert.equal(p.maxHeight, 584);
assert.equal(p.top, 8);

// Right edge: opens to the left of the pointer.
p = placeContextMenu({ x: 1270, y: 50, width: 240, height: 200, viewportWidth: 1280, viewportHeight: 800 });
assert.equal(p.left, 1030);

// Every pointer position on a short window keeps the menu inside.
for (let y = 0; y <= 700; y += 25) {
  for (const x of [0, 400, 1100, 1280]) {
    const q = placeContextMenu({ x, y, width: 250, height: 520, viewportWidth: 1280, viewportHeight: 700 });
    assert.ok(inside(q, 250, 520, 1280, 700), `${x},${y} ${JSON.stringify(q)}`);
  }
}

console.log("contextMenuPlacement selftest ok");
