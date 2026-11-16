// Market 2.0 (C4) join sounds: recipe validation, the 32 catalog recipes, WAV encoding,
// waveform peaks, listener throttle and settings.
// Run: node src/lib/joinSoundEngine.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { validateRecipe, noteFreq, encodeWav, peaksOf, normalizeBuffer, MAX_DURATION } from "./joinSoundEngine.js";
import { normalizeJoinSoundPrefs, readJoinSoundPrefs, writeJoinSoundPrefs } from "./joinSoundPrefs.js";

const require = createRequire(import.meta.url);
const RECIPES = require("../../backend/catalog/shop2/c4-join-sounds.json");
const { items } = require("../../backend/catalog/shop2/c4-voice.js");

// Notes.
assert.equal(Math.round(noteFreq("A4")), 440);
assert.equal(Math.round(noteFreq("A5")), 880);
assert.equal(Math.round(noteFreq("C#5") * 10) / 10, 554.4);
assert.ok(Number.isNaN(noteFreq("H2")));
assert.equal(noteFreq(123), 123);

// Every catalog recipe is valid and short.
const keys = Object.keys(RECIPES);
assert.equal(keys.length, 32);
for (const k of keys) {
  const v = validateRecipe(RECIPES[k]);
  assert.ok(v.ok, `${k}: ${v.errors.join(", ")}`);
  assert.ok(RECIPES[k].dur <= 1.5 && RECIPES[k].dur < 1.5 + 1e-9, `${k} under 1.5 s`);
  if (RECIPES[k].echo) assert.ok(RECIPES[k].echo.fb < 0.7, `${k} echo cannot run away`);
}
const sounds = items.filter((i) => i.category === "join_sound");
assert.equal(sounds.length, 32);
assert.equal(sounds.filter((i) => i.set_key).length, 16);
for (const it of sounds) assert.deepEqual(it.recipe, RECIPES[it.effect_key], `${it.sku} carries its recipe`);

// Rejections.
const ok = { v: 1, dur: 1, voices: [{ type: "osc", f: "A4", t: 0, d: 0.5, g: 0.5 }] };
assert.ok(validateRecipe(ok).ok);
const bad = (patch, what) => assert.ok(!validateRecipe({ ...ok, ...patch }).ok, what);
bad({ v: 2 }, "unknown version");
bad({ dur: MAX_DURATION + 0.1 }, "longer than 1.5 s");
bad({ voices: [] }, "no voices");
bad({ voices: new Array(17).fill(ok.voices[0]) }, "too many voices");
bad({ voices: [{ ...ok.voices[0], t: 0.8, d: 0.5 }] }, "voice ends after the sound");
bad({ voices: [{ ...ok.voices[0], f: 30000 }] }, "inaudible frequency");
bad({ voices: [{ ...ok.voices[0], g: 1.5 }] }, "gain above 1");
bad({ voices: [{ ...ok.voices[0], type: "sample" }] }, "unknown voice type");
bad({ voices: [{ ...ok.voices[0], w: "noise" }] }, "unknown wave");
bad({ echo: { time: 0.2, fb: 0.9, mix: 0.3 } }, "runaway feedback");
bad({ voices: [{ ...ok.voices[0], filt: { type: "notch", f: 100 } }] }, "unknown filter");
assert.ok(!validateRecipe(null).ok);
assert.ok(!validateRecipe({ v: 1, dur: "1", voices: ok.voices }).ok, "strings are not numbers");

// WAV + peaks + normalise (fake buffer).
const n = 3200;
const ch = new Float32Array(n).map((_, i) => Math.sin(i / 10) * (1 - i / n) * 2);
const wav = new DataView(encodeWav([ch, ch], 32000));
assert.equal(String.fromCharCode(...new Uint8Array(wav.buffer, 0, 4)), "RIFF");
assert.equal(wav.getUint32(24, true), 32000);
assert.equal(wav.getUint16(22, true), 2);
assert.equal(wav.byteLength, 44 + n * 4);
const peaks = peaksOf(ch, 40);
assert.equal(peaks.length, 40);
assert.equal(Math.max(...peaks), 1);
assert.ok(peaks[0] > peaks[39], "decaying sound -> decaying bars");
const fake = { numberOfChannels: 1, length: n, sampleRate: 32000, getChannelData: () => ch };
normalizeBuffer(fake, 0.89);
assert.ok(Math.max(...ch.map(Math.abs)) <= 0.8901, "peak never above target");
assert.equal(Math.abs(ch[n - 1]), 0, "faded at the cut");

// Settings.
const mem = new Map();
const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
assert.deepEqual(readJoinSoundPrefs(store), { enabled: true, volume: 0.6 }, "default on, 60 %");
writeJoinSoundPrefs({ enabled: false }, store);
assert.equal(readJoinSoundPrefs(store).enabled, false);
writeJoinSoundPrefs({ volume: 7 }, store);
assert.equal(readJoinSoundPrefs(store).volume, 1, "volume clamps to 1");
assert.deepEqual(normalizeJoinSoundPrefs({ volume: "x" }), { enabled: true, volume: 0.6 });
mem.set("descall.joinSounds.v1", "{oops");
assert.deepEqual(readJoinSoundPrefs(store), { enabled: true, volume: 0.6 }, "broken JSON -> defaults");

// Throttle.
const { throttleAllows, PER_USER_MS, GLOBAL_GAP_MS, WINDOW_MAX, joinSoundOf } = await import("./joinSounds.js");
const st = { lastAny: 0, recent: [], lastByUser: new Map() };
let t = 1_000_000;
assert.ok(throttleAllows(st, "a", t), "first join plays");
assert.ok(!throttleAllows(st, "b", t + GLOBAL_GAP_MS - 1), "too close to the last sound");
assert.ok(throttleAllows(st, "b", (t += GLOBAL_GAP_MS)), "after the gap");
assert.ok(!throttleAllows(st, "a", (t += GLOBAL_GAP_MS)), "same person again within 45 s");
assert.ok(throttleAllows(st, "c", t), "someone else still plays");
assert.ok(throttleAllows(st, "d", (t += GLOBAL_GAP_MS)));
assert.ok(!throttleAllows(st, "e", (t += GLOBAL_GAP_MS)), `max ${WINDOW_MAX} in 10 s`);
assert.ok(throttleAllows(st, "a", (t += PER_USER_MS)), "same person after 45 s");
assert.equal(joinSoundOf({ equippedJoinSound: { effect_key: "js-cam-can" } })?.effect_key, "js-cam-can");
assert.equal(joinSoundOf({ equippedJoinSound: {} }), null);
assert.equal(joinSoundOf(null), null);

console.log(`joinSoundEngine.selftest: ok (${keys.length} recipes)`);
