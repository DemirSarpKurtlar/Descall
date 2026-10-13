// Mobile tab-bar drag. Run: node frontend/src/lib/fluid/tabBarDrag.selftest.mjs
import assert from "node:assert/strict";
import { createDragController } from "./drag.js";
import { rubberbandClamp } from "./physics.js";
import {
  TAB_DECEL,
  TAB_HOLD_MS,
  TAB_LIFT_SCALE,
  TAB_SLOP_PX,
  classifyTabMove,
  previewTabIndex,
  tabReleasePreset,
  tabReleaseTarget,
} from "./tabBarDrag.js";

assert.equal(TAB_HOLD_MS, 250);
assert.equal(TAB_SLOP_PX, 10);
assert.equal(TAB_LIFT_SCALE, 1.06);
assert.equal(TAB_DECEL, 0.99);

assert.equal(classifyTabMove({ dx: 4, dy: 3 }), "pending");
assert.equal(classifyTabMove({ dx: 14, dy: 2 }), "lift");
assert.equal(classifyTabMove({ dx: -12, dy: 4 }), "lift");
assert.equal(classifyTabMove({ dx: 4, dy: 16 }), "reject");

assert.equal(previewTabIndex(0.4, 7), 0);
assert.equal(previewTabIndex(2.5, 7), 3);
assert.equal(previewTabIndex(2.49, 7), 2);
assert.equal(previewTabIndex(-0.8, 7), 0, "rubber-band past the start stays on the first tab");
assert.equal(previewTabIndex(8.2, 7), 6, "rubber-band past the end stays on the last tab");

// A resting finger lands on the nearest tab. A one-tab flick (about 10 indexes/s) carries one ahead.
assert.equal(tabReleaseTarget(2.2, 0, 7), 2);
assert.equal(tabReleaseTarget(2.8, 0, 7), 3);
const flick = tabReleaseTarget(1.1, 0.01, 7);
assert.equal(flick, 2, `a one-tab flick lands on the next tab, got ${flick}`);
assert.equal(tabReleaseTarget(3.8, 0, 7), 4, "a stopped finger keeps the tab under it");
assert.equal(tabReleaseTarget(3.8, 0.2, 7), 5, "a hard flick carries at most one extra tab");
assert.equal(tabReleaseTarget(6.4, 0.02, 7), 6, "a flick off the end stays on the last tab");
assert.equal(tabReleasePreset(0), "move");
assert.equal(tabReleasePreset(0.001), "move");
assert.equal(tabReleasePreset(-0.004), "flick");

// Controller: 10px on a 50px tab is the slop. Horizontal locks, vertical rejects.
// Long-press arms without eating the grab, then tracks 1:1. Release is not a tap.
const stride = 50;
const drag = createDragController({
  min: 0,
  max: 6,
  snapPoints: [0, 1, 2, 3, 4, 5, 6],
  slop: TAB_SLOP_PX / stride,
  dimension: 2,
  decelerationRate: TAB_DECEL,
  slopMode: "threshold",
});
drag.begin({ main: 100 / stride, cross: 40 / stride, t: 0, liveValue: 1 });
assert.equal(drag.move({ main: 106 / stride, cross: 40 / stride, t: 20 }).type, "none");
const locked = drag.move({ main: 112 / stride, cross: 41 / stride, t: 40 });
assert.equal(locked.type, "lock");
// 12px of travel, 10px of slop: the pill has already moved 2px (0.04 tab).
assert.ok(Math.abs(locked.value - (1 + 2 / stride)) < 1e-6, `lock keeps the excess, got ${locked.value}`);
const tracked = drag.move({ main: 162 / stride, cross: 41 / stride, t: 80 });
assert.equal(tracked.type, "drag");
// 62px from the grab, minus 10px slop → 1.04 tabs from the live index.
assert.ok(Math.abs(tracked.value - (1 + 52 / stride)) < 1e-6, `1:1 after the slop, got ${tracked.value}`);

const jumped = createDragController({
  min: 0,
  max: 6,
  slop: TAB_SLOP_PX / stride,
  dimension: 2,
  slopMode: "threshold",
});
jumped.begin({ main: 0, cross: 0, t: 0, liveValue: 1 });
const jump = jumped.move({ main: 40 / stride, cross: 0, t: 16 });
assert.equal(jump.type, "lock");
assert.ok(Math.abs(jump.value - (1 + 30 / stride)) < 1e-6, `fast sample tracks past the slop, got ${jump.value}`);
const released = drag.end({ t: 90 });
assert.equal(released.type, "release");
assert.equal(typeof released.velocity, "number");

const held = createDragController({
  min: 0,
  max: 6,
  snapPoints: [0, 1, 2, 3, 4, 5, 6],
  slop: TAB_SLOP_PX / stride,
  dimension: 2,
  decelerationRate: TAB_DECEL,
});
held.begin({ main: 2, cross: 0, t: 0, liveValue: 2 });
assert.equal(held.end({ t: 40 }).type, "tap", "a quick release is a tap, not a navigation");

const armed = createDragController({
  min: 0,
  max: 6,
  snapPoints: [0, 1, 2, 3, 4, 5, 6],
  slop: 0.2,
  dimension: 2,
  decelerationRate: TAB_DECEL,
});
armed.begin({ main: 0, cross: 0, t: 0, liveValue: 0 });
assert.equal(armed.arm(), true);
const pulled = armed.move({ main: -1.5, cross: 0, t: 40 });
assert.equal(pulled.type, "drag");
assert.ok(pulled.value < 0 && pulled.value > -1.5, `edge rubber-bands, got ${pulled.value}`);
assert.ok(Math.abs(pulled.value - rubberbandClamp(-1.5, 0, 6, 2)) < 1e-6);
assert.equal(armed.end({ t: 50 }).target, 0);

const retarget = createDragController({ min: 0, max: 4, snapPoints: [0, 1, 2, 3, 4], slop: 0.2, dimension: 2 });
retarget.begin({ main: 0, cross: 0, t: 0, liveValue: 1.4 });
assert.equal(retarget.phase, "pending");
retarget.cancel();
assert.equal(retarget.move({ main: 3, cross: 0, t: 10 }).type, "none");

console.log("tabBarDrag.selftest ok");
