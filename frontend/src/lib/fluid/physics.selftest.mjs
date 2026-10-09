// lib/fluid physics, springs and drag controller (2.9.151). Run: node src/lib/fluid/physics.selftest.mjs
import assert from "node:assert/strict";
import {
  project,
  rubberband,
  rubberbandInverse,
  rubberbandClamp,
  computeVelocity,
  nearestSnap,
  createSpring,
  DECELERATION_NORMAL,
  RUBBER_BAND_CONSTANT,
} from "./physics.js";
import { SPRINGS, framerSpring, physicsSpring } from "./springs.js";
import { createDragController } from "./drag.js";
import { createValueAnimator } from "./animator.js";

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// Momentum projection: (v/1000)·d/(1−d)
assert.equal(DECELERATION_NORMAL, 0.998);
near(project(1000), 499, 0.01, "1000 px/s projects ~499 px");
near(project(-500), -249.5, 0.01, "sign kept");
assert.equal(project(0), 0);

// Rubber band (constant 0.55): monotone, < overshoot, invertible
assert.equal(RUBBER_BAND_CONSTANT, 0.55);
const r100 = rubberband(100, 400);
assert.ok(r100 > 0 && r100 < 100, "resists");
assert.ok(rubberband(200, 400) > r100, "monotone");
near(rubberbandInverse(r100, 400), 100, 0.01, "inverse");
assert.equal(rubberbandClamp(50, 0, 100, 400), 50, "inside range untouched");
assert.ok(rubberbandClamp(150, 0, 100, 400) < 150 && rubberbandClamp(150, 0, 100, 400) > 100, "past max resists");
assert.ok(rubberbandClamp(-50, 0, 100, 400) < 0 && rubberbandClamp(-50, 0, 100, 400) > -50, "past min resists");

// Velocity from the last 90 ms only
const v = computeVelocity([
  { x: 0, t: 0 },
  { x: 0, t: 200 },
  { x: 10, t: 210 },
  { x: 20, t: 220 },
]);
assert.ok(v > 0.5 && v < 1.5, `recent velocity ~1 px/ms (${v})`);

// Snap by projected position
assert.equal(nearestSnap(40, 0, [0, 100]), 0, "slow release stays");
assert.equal(nearestSnap(40, 0.5, [0, 100]), 100, "flick carries to the next snap");

// Springs: critically damped never overshoots; ζ<1 does; release velocity carried
{
  const s = createSpring({ from: 0, to: 100, response: 350, dampingRatio: 1 });
  let maxX = 0;
  for (let i = 0; i < 200 && !s.done; i++) maxX = Math.max(maxX, s.step(16));
  assert.ok(s.done && s.value === 100, "settles exactly on target");
  assert.ok(maxX <= 100.0001, "ζ=1 no overshoot");
}
{
  const s = createSpring({ from: 0, to: 100, response: 350, dampingRatio: 0.6 });
  let maxX = 0;
  for (let i = 0; i < 300 && !s.done; i++) maxX = Math.max(maxX, s.step(16));
  assert.ok(maxX > 100.5, "ζ<1 overshoots (bounce only for flung motion)");
}
{
  const a = createSpring({ from: 0, to: 100, response: 350, dampingRatio: 1, velocity: 0 });
  const b = createSpring({ from: 0, to: 100, response: 350, dampingRatio: 1, velocity: 2 });
  a.step(16);
  b.step(16);
  assert.ok(b.value > a.value, "gesture velocity is handed to the spring");
}
{
  const s = createSpring({ from: 0, to: 1, response: 220, dampingRatio: 1, restDelta: 0.0005, restSpeed: 0.00002 });
  s.step(16);
  assert.ok(!s.done, "scale-sized rest thresholds keep small springs alive");
}

// Spring presets → framer mapping
for (const [name, p] of Object.entries(SPRINGS)) {
  assert.ok(p.response >= 0.2 && p.response <= 0.5, `${name}: response 0.2–0.5 s`);
  assert.ok(p.dampingRatio === 1 || p.dampingRatio === 0.8, `${name}: ζ 1 (or 0.8 for flung)`);
}
const fs = framerSpring({ dampingRatio: 1, response: 0.5 }, 300);
near(fs.stiffness, (2 * Math.PI / 0.5) ** 2, 1e-6, "stiffness = (2π/response)²");
near(fs.damping, (4 * Math.PI) / 0.5, 1e-6, "damping = 4πζ/response");
assert.equal(fs.velocity, 300);
assert.deepEqual(physicsSpring(SPRINGS.press), { dampingRatio: 1, response: 220 });

// Drag controller: hysteresis, axis lock, 1:1 tracking, rubber band, release
{
  const d = createDragController({ min: 0, max: 300, snapPoints: [0, 300], dimension: 400 });
  d.begin({ main: 100, cross: 0, t: 0, liveValue: 0 });
  assert.equal(d.move({ main: 105, cross: 0, t: 8 }).type, "none", "inside 10 px slop");
  assert.equal(d.move({ main: 112, cross: 1, t: 16 }).type, "lock", "locks after slop");
  assert.equal(d.move({ main: 162, cross: 1, t: 24 }).value, 50, "1:1 from the lock point");
  const up = d.end({ t: 30 });
  assert.equal(up.type, "release");
  assert.equal(up.target, 300, "fast flick projects to the far snap");
  const d2 = createDragController({ min: 0, max: 300 });
  d2.begin({ main: 0, cross: 0, t: 0 });
  assert.equal(d2.move({ main: 2, cross: 20, t: 10 }).type, "reject", "vertical scroll wins");
  const d3 = createDragController({ min: 0, max: 100, dimension: 400 });
  d3.begin({ main: 0, t: 0, liveValue: 100 });
  d3.move({ main: 11, t: 10 });
  const over = d3.move({ main: 111, t: 20 }).value;
  assert.ok(over > 100 && over < 200, "rubber-bands past the end");
  const tap = createDragController();
  tap.begin({ main: 0, t: 0 });
  assert.equal(tap.end({ t: 50 }).type, "tap");
  const mid = createDragController({ min: 0, max: 300 });
  mid.begin({ main: 0, t: 0, liveValue: 137 });
  mid.move({ main: 20, t: 10 });
  assert.equal(mid.move({ main: 30, t: 20 }).value, 147, "grab mid-flight continues from the live value");
}

// Animator: interruptible retarget from the live value
await (async () => {
  const frames = [];
  const a = createValueAnimator(0, (x) => frames.push(x));
  const p = a.to(100, { preset: SPRINGS.default });
  await new Promise((r) => setTimeout(r, 60));
  const live = a.value;
  assert.ok(live > 0 && live < 100, "mid-flight");
  const back = a.to(0);
  assert.ok(Math.abs(a.value - live) < 1e-9, "retarget starts from the presentation value");
  assert.equal(await back, 0);
  assert.equal(await p, 0, "earlier promise resolves when the motion ends");
  a.set(10, 1000);
  a.set(20, 1010);
  assert.ok(Math.abs(a.velocity - 1) < 1e-9, "set() tracks velocity for the release handoff");
})();

console.log("fluid physics.selftest ok");
