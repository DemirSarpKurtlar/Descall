// Snapshot interpolation + clock for remote avatars.
// Run: node src/world3d/net/snapshotBuffer.selftest.mjs
import assert from "node:assert/strict";
import { createClock, createSnapshotBuffer, lerpAngle } from "./snapshotBuffer.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const snap = (x, z, yaw = 0, state = 1) => ({ x, y: 0, z, yaw, state, emote: 0, emoteSeq: 0, seat: -1 });

// Angle lerp takes the short way across +-PI.
const mid = lerpAngle(3.0, -3.0, 0.5);
assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 0.2, `short way across PI, got ${mid}`);
near(lerpAngle(0, 1, 0.25), 0.25);
near(lerpAngle(-0.5, 0.5, 0.5), 0);

// Empty buffer.
const b = createSnapshotBuffer({ delayMs: 100 });
assert.equal(b.sample(1000), null);

// 10 Hz snapshots moving +1 m per 100 ms along x.
for (let i = 0; i <= 5; i += 1) b.push(1000 + i * 100, snap(i, 0));
// Render time = now - 100 ms.
let p = b.sample(1350); // rt = 1250 -> halfway between x=2 and x=3
near(p.x, 2.5);
assert.equal(p.interpolated, true);
p = b.sample(1400); // rt = 1300 exactly on a snapshot
near(p.x, 3);
// Monotonic: sampling forward never goes back.
let last = -Infinity;
for (let t = 1100; t <= 1600; t += 7) {
  const s = b.sample(t);
  assert.ok(s.x >= last - 1e-9, `monotonic at ${t}`);
  last = s.x;
}
// Past the newest snapshot: brief extrapolation, then hold (no runaway).
const ex = b.sample(1600 + 50); // rt = 1550, newest at 1500 (x=5): +50 ms
near(ex.x, 5.5);
const held = b.sample(1600 + 1000);
near(held.x, 5 + 1.2, 1e-9); // capped at EXTRAPOLATE_MS (120 ms) = 1.2 m
assert.equal(held.interpolated, false);

// Out-of-order and duplicate packets are absorbed.
const c = createSnapshotBuffer({ delayMs: 100 });
c.push(1000, snap(0, 0));
c.push(1200, snap(2, 0));
c.push(1100, snap(1, 0));
c.push(1100, snap(1, 0));
assert.equal(c.size, 3);
near(c.sample(1250).x, 1.5);

// Discrete fields switch at the later snapshot; yaw interpolates.
const d = createSnapshotBuffer({ delayMs: 0 });
d.push(0, { ...snap(0, 0, 0, 0) });
d.push(100, { ...snap(0, 1, 1, 4), seat: 2 });
const q = d.sample(50);
near(q.z, 0.5);
near(q.yaw, 0.5);
assert.equal(q.state, 4);
assert.equal(q.seat, 2);

// Buffer stays bounded.
const e = createSnapshotBuffer();
for (let i = 0; i < 500; i += 1) e.push(i * 100, snap(i, 0));
assert.ok(e.size <= 32);

// Clock: keeps the least delayed sample, maps local -> server time.
const clock = createClock();
clock.observe(10_000, 1_000); // server ahead by 9000 minus delay
clock.observe(10_150, 1_100); // this one had less delay (offset 9050)
near(clock.offset, 9050);
near(clock.serverNow(2_000), 11_050);
clock.observe(10_300, 1_300); // more delay: offset only drifts slightly
assert.ok(clock.offset <= 9050 && clock.offset > 9040);

console.log("snapshotBuffer.selftest: ok");
