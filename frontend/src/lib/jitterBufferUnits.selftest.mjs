// Receiver jitter buffer: jitterBufferTarget is in milliseconds.
// Before: tuneAudioReceiver wrote the seconds value (0.16 for a poor link)
// into jitterBufferTarget (= 0.16 ms), right after applyAdaptiveJitterBuffer
// set 120 ms on the same receivers, so every group / server voice stats tick
// undid the deeper buffer on a lossy link.
// Run from frontend/: node src/lib/jitterBufferUnits.selftest.mjs
import assert from "node:assert/strict";
import { jitterBufferTargetMs, tuneAudioReceiver } from "./voiceProfile.js";
import { applyAdaptiveJitterBuffer } from "./adaptiveBitrate.js";

const modern = () => ({ jitterBufferTarget: null, track: { kind: "audio" } });

// 1. Modern receivers: milliseconds, null (browser default) on a good link.
for (const [quality, ms] of [["good", null], ["excellent", null], ["fair", 80], ["poor", 120], ["failed", 120]]) {
  const r = modern();
  tuneAudioReceiver(r, quality);
  assert.equal(r.jitterBufferTarget, ms, `${quality}: ${ms} ms`);
  assert.equal(r.jitterBufferTarget, jitterBufferTargetMs(quality));
}
{
  const r = modern();
  tuneAudioReceiver(r);
  assert.equal(r.jitterBufferTarget, null, "ontrack default: lowest delay");
}

// 2. The stats tick order used by group / server voice keeps the deeper buffer.
{
  const r = modern();
  const pc = { getReceivers: () => [r] };
  applyAdaptiveJitterBuffer(pc, "poor", { current: null });
  assert.equal(r.jitterBufferTarget, 120);
  tuneAudioReceiver(r, "poor");
  assert.equal(r.jitterBufferTarget, 120, "not overwritten with 0.16");
}

// 3. Older Chromium (playoutDelayHint only): seconds.
{
  const r = { playoutDelayHint: 0 };
  tuneAudioReceiver(r, "poor");
  assert.equal(r.playoutDelayHint, 0.16);
  assert.ok(!("jitterBufferTarget" in r));
}

// 4. Nothing supported / no receiver: no throw.
tuneAudioReceiver({}, "poor");
tuneAudioReceiver(null, "poor");
{
  const r = { track: { kind: "audio" } };
  Object.defineProperty(r, "jitterBufferTarget", { get: () => null, set: () => { throw new RangeError("x"); } });
  tuneAudioReceiver(r, "poor");
}

console.log("jitterBufferUnits selftest ok");
