import assert from "node:assert/strict";
import { createPcmFramer, downsampleFloatToInt16, FRAME_SAMPLES } from "./voiceLivePcm.js";

const tone = new Float32Array(48000);
for (let i = 0; i < tone.length; i += 1) tone[i] = Math.sin((i / 48000) * Math.PI * 2 * 440) * 0.5;
const { pcm, rms } = downsampleFloatToInt16(tone, 48000, 16000);
assert.equal(pcm.length, 16000);
assert.ok(rms > 0.2 && rms < 0.5, `rms ${rms}`);
assert.ok(pcm.some((n) => n > 1000) && pcm.some((n) => n < -1000));

const silence = downsampleFloatToInt16(new Float32Array(4800), 48000, 16000);
assert.ok(silence.rms < 0.001);

const framer = createPcmFramer();
const frames = framer.push(pcm.slice(0, FRAME_SAMPLES + 100));
assert.equal(frames.length, 1);
assert.equal(frames[0].length, FRAME_SAMPLES);
assert.equal(framer.push(pcm.slice(0, FRAME_SAMPLES - 100)).length, 1);

console.log("voiceLivePcm.selftest ok");
