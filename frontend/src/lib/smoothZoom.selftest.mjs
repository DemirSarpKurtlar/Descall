import assert from "node:assert/strict";
import { createZoomPhysics, wheelPixels, clampZoom, MIN_ZOOM, MAX_ZOOM } from "./smoothZoom.js";

const run = (p, seconds) => { let z = p.zoom; for (let t = 0; t < seconds; t += 1 / 60) z = p.step(1 / 60); return z; };

// One notch down zooms out about 10 %, gliding (not a jump), then stops.
{
  const p = createZoomPhysics(1);
  p.push(100);
  const first = p.step(1 / 60);
  assert.ok(first < 1 && first > 0.98, `first frame moves only a little (${first})`);
  const end = run(p, 3);
  assert.ok(end > 0.87 && end < 0.93, `one notch ~10 % (${end})`);
  assert.equal(p.moving, false, "comes to rest");
}
// A fast flick (three quick notches) travels further than one notch.
{
  const a = createZoomPhysics(1); a.push(-100); const one = run(a, 3);
  const b = createZoomPhysics(1); b.push(-100); b.push(-100); b.push(-100); const three = run(b, 3);
  assert.ok(three > one * 1.2, `flick goes further (${one} vs ${three})`);
}
// Clamped to 50 % .. 200 %.
{
  const p = createZoomPhysics(1);
  for (let i = 0; i < 40; i++) p.push(-500);
  assert.equal(Math.round(run(p, 5) * 1000) / 1000, MAX_ZOOM);
  const q = createZoomPhysics(1);
  for (let i = 0; i < 40; i++) q.push(500);
  assert.equal(Math.round(run(q, 5) * 1000) / 1000, MIN_ZOOM);
}
// Ctrl+0 eases back to exactly 100 %; Ctrl+= steps ~10 %.
{
  const p = createZoomPhysics(1.6);
  p.easeTo(1);
  assert.equal(run(p, 1), 1);
  p.nudge(1);
  const up = run(p, 1);
  assert.ok(up > 1.09 && up < 1.12, `nudge ~10 % (${up})`);
}
assert.equal(wheelPixels({ deltaY: 3, deltaMode: 1 }), 48);
assert.equal(clampZoom("x"), 1);
assert.equal(clampZoom(9), MAX_ZOOM);
console.log("smoothZoom.selftest ok");
