// Run from frontend/: node src/lib/mediaViewerMath.selftest.mjs
import assert from "node:assert/strict";
import { rubberBand, zoomAt, clampPan, shouldDismiss, swipeStep, MAX_SCALE } from "./mediaViewerMath.js";
assert.ok(rubberBand(100, 800) < 100 && rubberBand(100, 800) > 0, "rubber band resists");
assert.ok(rubberBand(10000, 800) < 800, "never past the viewport");
assert.equal(rubberBand(-50, 800), -rubberBand(50, 800));
const z = zoomAt({ scale: 1, x: 0, y: 0 }, 2, 100, 0);
assert.equal(z.scale, 2); assert.equal(z.x, -100, "point under cursor stays fixed");
assert.deepEqual(zoomAt(z, 0.5, 0, 0), { scale: 1, x: 0, y: 0 }, "back to fit recentres");
assert.equal(zoomAt(z, 99, 0, 0).scale, MAX_SCALE);
assert.deepEqual(clampPan({ scale: 2, x: 9999, y: -9999 }, 400, 300, 800, 600), { scale: 2, x: 0, y: 0 });
assert.equal(clampPan({ scale: 4, x: 9999, y: 0 }, 400, 300, 800, 600).x, 400);
assert.equal(shouldDismiss(200, 0, 800), true);
assert.equal(shouldDismiss(30, 1, 800), true, "flick");
assert.equal(shouldDismiss(30, 0.1, 800), false);
assert.equal(swipeStep(-120, 0, 800), 1);
assert.equal(swipeStep(40, 0.8, 800), -1);
assert.equal(swipeStep(10, 0, 800), 0);
console.log("mediaViewerMath.selftest: ok");
