// Dynamic resolution controller (3D world frame-rate governor).
// Run: node src/world3d/engine/dynamicResolution.selftest.mjs
import assert from "node:assert/strict";
import { createResolutionController, DEFAULT_LEVELS, hardwareScalingFor } from "./dynamicResolution.js";

/** Feed `ms` worth of frames of `interval` ms (and optional gpu ms). Returns the scales it changed to. */
function run(c, clock, ms, interval, gpu = null) {
  const out = [];
  const end = clock.t + ms;
  while (clock.t < end) {
    clock.t += interval;
    const s = c.push(interval, clock.t, typeof gpu === "function" ? gpu(clock.t) : gpu);
    if (s != null) out.push(s);
  }
  return out;
}

// 1. A steady 60 fps never changes anything (interval mode, vsync ticks with jitter).
{
  const c = createResolutionController();
  const clock = { t: 0 };
  let changes = [];
  for (let i = 0; i < 600; i += 1) {
    clock.t += i % 2 ? 16.2 : 17.1;
    const s = c.push(i % 2 ? 16.2 : 17.1, clock.t);
    if (s != null) changes.push(s);
  }
  // only a probe can happen at level 0: there is no level above 1
  assert.deepEqual(changes, []);
  assert.equal(c.scale, 1);
}

// 2. GPU-bound and too slow: steps down one level at a time (cooldown between steps) until
//    the frames fit. Later probes up are rare and back off when they fail.
{
  const c = createResolutionController();
  let t = 0;
  const changes = [];
  const interval = () => 12 + 16 * c.scale * c.scale; // 28 ms at full scale, cheaper with fewer pixels
  const step = () => {
    const iv = interval();
    t += iv;
    const s = c.push(iv, t);
    if (s != null) changes.push([t, s]);
  };
  while (t < 7500) step();
  assert.ok(changes.length >= 3, `several steps, got ${JSON.stringify(changes)}`);
  for (let i = 1; i < changes.length; i += 1) {
    assert.ok(changes[i][1] < changes[i - 1][1], "only downward steps while slow");
    assert.ok(changes[i][0] - changes[i - 1][0] >= 1200, "cooldown between steps");
  }
  assert.ok(interval() <= (1000 / 60) * 1.12, `ends at a scale that holds 60 fps (${c.scale})`);
  const settled = changes.length;
  const wait0 = c.probeWait;
  while (t < 7500 + 120000) step();
  assert.ok(changes.length - settled <= 8, `few probes in two minutes, got ${changes.length - settled}`);
  assert.ok(c.probeWait >= wait0 * 4, "failed probes back off");
  assert.ok(interval() <= (1000 / 60) * 1.12 || c.level > 0, "never stuck above budget");
}

// 3. A single hitch (GC, alert) or a short burst does not change the level.
{
  const c = createResolutionController();
  const clock = { t: 0 };
  run(c, clock, 2000, 16.7);
  clock.t += 400;
  assert.equal(c.push(400, clock.t), null, "a 400 ms pause is ignored");
  const burst = [...run(c, clock, 200, 30), ...run(c, clock, 2000, 16.7)];
  assert.deepEqual(burst, [], "200 ms of slow frames inside a fine second is not enough");
  assert.equal(c.scale, 1);
}

// 4. With a GPU timer: down on slow GPU time, up again after steady headroom, never above 1.
{
  const c = createResolutionController();
  const clock = { t: 0 };
  const down = run(c, clock, 2500, 20, 21);
  assert.ok(down.length >= 1, "slow GPU time steps down");
  const level = c.level;
  assert.ok(level >= 1);
  const up = run(c, clock, 30000, 16.7, 7);
  assert.ok(up.length >= level, "steady GPU headroom climbs back");
  assert.equal(c.scale, 1, "never above the preset's full resolution");
  // no oscillation: GPU time inside the hysteresis band (between fast and slow) holds still
  const c2 = createResolutionController({ startLevel: 2 });
  const clock2 = { t: 0 };
  assert.deepEqual(run(c2, clock2, 20000, 16.7, 14), [], "14 ms GPU at level 2: neither up nor down");
}

// 5. Without a GPU timer: probe up after a calm period, back off when the probe fails.
{
  const c = createResolutionController({ startLevel: 3 });
  const clock = { t: 0 };
  const probe = run(c, clock, 8500, 16.7);
  assert.deepEqual(probe, [DEFAULT_LEVELS[2]], "one probe step up after 8 s of calm");
  const wait0 = c.probeWait;
  // the probe was too much: slow again right away -> back down, and the next probe waits longer
  const back = run(c, clock, 2500, 24);
  assert.equal(back[0], DEFAULT_LEVELS[3]);
  assert.ok(c.probeWait > wait0, "probe backoff grows");
}

// 6. CPU-bound: stepping down does not shorten the frames -> undo and hold.
{
  const c = createResolutionController();
  const clock = { t: 0 };
  const steps = run(c, clock, 3000, 25);
  assert.equal(steps[0], DEFAULT_LEVELS[1], "first it tries a lower resolution");
  assert.ok(steps.includes(1), "then it undoes the step because frames did not get faster");
  const held = run(c, clock, 8000, 25);
  assert.deepEqual(held, [], "and holds instead of dropping the resolution for nothing");
}

// 7. Lock (perf probe / manual) and forced steps.
{
  const c = createResolutionController();
  c.lock(0.25);
  assert.equal(c.scale, 0.25);
  assert.equal(c.push(40, 100), null);
  c.lock(null);
  assert.equal(c.scale, 1);
  assert.equal(c.stepDown(200), DEFAULT_LEVELS[1]);
  for (let i = 0; i < 10; i += 1) c.stepDown(300 + i);
  assert.equal(c.scale, DEFAULT_LEVELS[DEFAULT_LEVELS.length - 1], "floor at the last level");
  assert.equal(c.stepDown(400), null);
}

// 8. Hardware scaling from DPR, preset cap and scale.
{
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  near(hardwareScalingFor({ devicePixelRatio: 1, maxPixelRatio: 1.25, presetScale: 1, scale: 1 }), 1);
  near(hardwareScalingFor({ devicePixelRatio: 2, maxPixelRatio: 1.25, presetScale: 1, scale: 1 }), 1 / 1.25);
  near(hardwareScalingFor({ devicePixelRatio: 1.25, maxPixelRatio: 1.25, presetScale: 1, scale: 0.8 }), 1);
  near(hardwareScalingFor({ devicePixelRatio: 1, maxPixelRatio: 1, presetScale: 0.75, scale: 1 }), 1 / 0.75);
}

console.log("dynamicResolution selftest ok");
