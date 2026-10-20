// Speaking glow timing (2.13.6): on fast, off ~250–350 ms after speech, no flicker between words.
import assert from "node:assert/strict";
import {
  createSpeakingGate, VOICE_SAMPLE_MS, SPEAKING_HOLD_MS, SPEAKING_FADE_MS,
} from "./voiceActivityMath.js";
import { levelFromSources, RTP_LEVEL_FRESH_MS } from "./rtpAudioLevel.js";

function run(pattern, ms = 4000, opts = {}) {
  const g = createSpeakingGate({ onThreshold: 0.02, ...opts });
  const out = [];
  for (let t = 0; t < ms; t += VOICE_SAMPLE_MS) out.push([t, g.push(pattern(t), t)]);
  return out;
}
for (const loud of [0.04, 0.08, 0.3]) {
  const s = run((t) => (t >= 1000 && t < 2000 ? loud : 0.003));
  const on = s.find(([t, v]) => t >= 1000 && v)[0] - 1000;
  const off = s.find(([t, v]) => t >= 2000 && !v)[0] - 2000;
  assert.ok(on <= 120, `on ${on}ms (level ${loud})`);
  const total = off + SPEAKING_HOLD_MS;
  assert.ok(total >= 200 && total <= 350, `off ${total}ms (level ${loud})`);
}
// Words with 150 ms gaps: one continuous ON stretch.
const words = run((t) => (t % 450 < 300 ? 0.08 : 0.003), 3000);
let flips = 0;
for (let i = 1; i < words.length; i++) if (words[i][1] !== words[i - 1][1]) flips++;
assert.equal(flips, 1, "no flicker between words");
// A single noise spike does not light the ring.
assert.ok(!run((t) => (t === 400 ? 0.1 : 0.003), 1200).some(([, v]) => v));
assert.ok(SPEAKING_FADE_MS <= 160);
// Remote RTP level: a last speech packet goes stale fast (Opus DTX).
assert.ok(RTP_LEVEL_FRESH_MS <= 300);
assert.equal(levelFromSources([{ audioLevel: 0.5, timestamp: 1000 }], [1000 + 400]), 0);
assert.equal(levelFromSources([{ audioLevel: 0.5, timestamp: 1000 }], [1000 + 100]), 0.5);
console.log("speakingTiming.selftest ok");
