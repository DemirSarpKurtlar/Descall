import assert from "node:assert/strict";
import {
  TOSS, TOSS_TOTAL_MS, landingAngle, faceAngle, heightAt, spinAt, bounceAt, shadowFor, tossFrame, isFreshRound,
} from "./coinTossMotion.js";

const mod = (a) => ((a % 360) + 360) % 360;
for (const start of [180, 194, 0, 725]) {
  for (const face of ["heads", "tails"]) {
    for (const rot of [5, 6, 7, 8]) {
      const end = landingAngle(start, face, rot);
      assert.equal(mod(end), faceAngle(face), `${start}/${face}/${rot} lands on the server face`);
      assert.ok(end - start >= rot * 360 && end - start < (rot + 1) * 360);
    }
  }
}
assert.equal(heightAt(0), 0);
assert.equal(heightAt(TOSS.flightMs), 0);
assert.ok(Math.abs(heightAt(TOSS.flightMs / 2) - TOSS.apexPx) < 1e-9, "apex height at mid-flight");
assert.equal(spinAt(TOSS.flightMs, 0, 2160), 2160);
// decaying spin: first half covers more than half the angle
assert.ok(spinAt(TOSS.flightMs / 2, 0, 2160) > 1080);
// bounces: first hump ~9px, second ~3px, then rest
const hump = (a, b) => Math.max(...Array.from({ length: 200 }, (_, i) => bounceAt(a + ((b - a) * i) / 199)));
const h1 = hump(0, 130), h2 = hump(130, 260);
assert.ok(h1 > 8 && h1 < 10.5, `first bounce ≈9px (${h1.toFixed(2)})`);
assert.ok(h2 > 2.4 && h2 < 3.8, `second bounce ≈3px (${h2.toFixed(2)})`);
assert.equal(bounceAt(TOSS.settleMs), 0);
const s0 = shadowFor(0), sTop = shadowFor(TOSS.apexPx);
assert.equal(s0.scale, 1);
assert.ok(sTop.scale < s0.scale && sTop.opacity < s0.opacity && sTop.blur > s0.blur, "shadow shrinks/fades/blurs with height");
const end = landingAngle(180, "heads", 6);
const last = tossFrame(TOSS_TOTAL_MS, { start: 180, end });
assert.equal(last.done, true);
assert.equal(last.theta, end);
assert.equal(last.y + 0, 0);
assert.ok(isFreshRound(Date.now() - 1000));
assert.equal(isFreshRound(Date.now() - 60000), false);
console.log("coinTossMotion selftest ok");
