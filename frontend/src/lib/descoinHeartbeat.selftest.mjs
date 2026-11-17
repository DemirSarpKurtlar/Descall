import assert from "node:assert/strict";
import { windowSpeaking, SAMPLE_MS, SPEAKING_RATIO } from "./descoinHeartbeat.js";

// 16 s beat / 250 ms samples = 64 samples per window.
const perWindow = Math.round(16_000 / SAMPLE_MS);
assert.equal(perWindow, 64);

// A normal talker (speech with pauses, ~40 % voiced) counts.
assert.equal(windowSpeaking(26, perWindow), true);
// Push-to-talk: one 2 s press in the window (8 samples) counts.
assert.equal(windowSpeaking(8, perWindow), true);
// A cough or a click (1-2 samples) does not.
assert.equal(windowSpeaking(2, perWindow), false);
// Nothing sampled yet (boot tick before the first sample) never counts.
assert.equal(windowSpeaking(0, 0), false);
assert.ok(SPEAKING_RATIO > 0 && SPEAKING_RATIO < 0.5);

console.log("descoinHeartbeat selftest ok");
