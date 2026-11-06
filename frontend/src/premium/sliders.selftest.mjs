import assert from "node:assert/strict";
import { clampValue, fillStop, integerScale, rangeFraction, stepDecimals, stepReachesEnds, thumbCenter } from "./ui/rangeMath.js";

assert.equal(stepDecimals(1), 0);
assert.equal(stepDecimals(0.05), 2);
assert.equal(stepDecimals("0.25"), 2);
assert.deepEqual(integerScale(0.3, 1, 0.05), { factor: 100, min: 30, max: 100, step: 5 });
assert.deepEqual(integerScale(-80, -10, 1), { factor: 1, min: -80, max: -10, step: 1 });

// Every slider config used in Settings > Descall+ reaches both ends.
const CONFIGS = [
  [30, 100, 5], // window_opacity (percent)
  [0.3, 1, 0.05], // HUD opacity
  [0, 200, 4], // HUD margin
  [-80, -10, 1], [0, 30, 1], [0, 1000, 10], // noise_gate
  [0, 200, 5], // mic_presets gain, stream volumes
  [0, 100, 5], // mic_monitor
  [0, 600, 10], [1, 120, 1], // global_ptt
  [5, 50, 5], // per_user_volume_hotkeys
];
for (const [a, b, s] of CONFIGS) assert.ok(stepReachesEnds(a, b, s), `${a}..${b} by ${s} misses an end`);
assert.equal(stepReachesEnds(0, 10, 3), false);
assert.equal(stepReachesEnds(0, 1050, 100), false);

assert.equal(clampValue(250, 0, 200), 200);
assert.equal(clampValue("x", 5, 50), 5);
assert.equal(rangeFraction(-10, -80, -10), 1);
assert.equal(rangeFraction(-80, -80, -10), 0);
assert.equal(rangeFraction(150, 0, 100), 1);
assert.equal(rangeFraction(1, 1, 1), 0);

// The fill meets the thumb centre at both ends and in the middle.
assert.equal(thumbCenter(0, 200, 18), 9);
assert.equal(thumbCenter(1, 200, 18), 191);
assert.equal(thumbCenter(0.5, 200, 18), 100);
assert.equal(fillStop(0), "calc(9px + (100% - 18px) * 0)");
assert.equal(fillStop(1), "calc(9px + (100% - 18px) * 1)");
assert.equal(fillStop(2), "calc(9px + (100% - 18px) * 1)");

console.log("sliders.selftest ok");
