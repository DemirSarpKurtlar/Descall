import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  VOICE_SAMPLE_MS,
  classifyAudioTracks,
  createSpeakingGate,
  rmsFromTimeDomain,
  smoothLevel,
} from "./voiceActivityMath.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const silence = new Uint8Array(32).fill(128);
assert.equal(rmsFromTimeDomain(silence), 0);
const loud = new Uint8Array(32);
for (let i = 0; i < loud.length; i += 1) loud[i] = i % 2 ? 200 : 56;
assert.ok(rmsFromTimeDomain(loud) > 0.2);

const gate = createSpeakingGate({ onThreshold: 0.05, offThreshold: 0.02, attackMs: 80, releaseMs: 200 });
assert.equal(gate.push(0.01, 0), false);
assert.equal(gate.push(0.4, 10), false, "one loud sample is not enough");
assert.equal(gate.push(0.4, 100), true);
let held = true;
for (let t = 140; t < 300; t += 40) held = gate.push(0, t);
assert.equal(held, true, "a short dip stays on");
let closed = true;
for (let t = 400; t < 4000; t += 40) closed = gate.push(0, t);
assert.equal(closed, false);
assert.ok(smoothLevel(0, 1) > 0 && smoothLevel(0, 1) < 1);

assert.equal(classifyAudioTracks([
  { kind: "video", readyState: "live", enabled: true, muted: false },
  { kind: "audio", readyState: "live", enabled: false, muted: false },
]).audible, null);
const waiting = { kind: "audio", readyState: "live", enabled: true, muted: true };
assert.equal(classifyAudioTracks([waiting]).waiting, waiting);
const live = { kind: "audio", readyState: "live", enabled: true, muted: false };
assert.equal(classifyAudioTracks([live]).audible, live);

assert.ok(VOICE_SAMPLE_MS >= 33 && VOICE_SAMPLE_MS <= 50, "analyser stays near 20–30 fps");

const engine = read("./voiceActivity.js");
const mic = read("./noiseSuppression.js");
const bridge = read("../hooks/useIosCallKitBridge.js");
const call = read("../hooks/useCall.js");
const speaking = read("../hooks/useSpeaking.js");
const level = read("../hooks/useAudioLevel.js");
const glass = read("../styles/glass/call.css");
const rings = read("../styles/voice-speaking.css");

assert.match(engine, /VOICE_SAMPLE_MS/);
assert.match(engine, /sink\.gain\.value = 0/);
assert.match(engine, /isNativeIosApp\(\)/);
assert.match(engine, /document\.hidden/);
assert.match(engine, /export function primeVoiceActivity/);
assert.match(engine, /export function notifyCallAudioSession/);
assert.doesNotMatch(engine, /webkitAudioContext\(\)[\s\S]{0,80}requestAnimationFrame/);

const acquireAt = mic.indexOf("export async function acquireVoiceMicStream");
const gumAt = mic.indexOf("navigator.mediaDevices.getUserMedia", acquireAt);
assert.ok(acquireAt >= 0 && gumAt > acquireAt);
assert.ok(
  mic.slice(acquireAt, gumAt).includes("primeVoiceActivity()"),
  "mic capture must resume the context in the tap, before getUserMedia"
);

assert.match(bridge, /notifyCallAudioSession\(\)/);
assert.match(call, /notifyCallAudioSession\(\)/);
assert.match(speaking, /useVoiceActivity/);
assert.match(level, /useVoiceActivity/);
assert.match(glass, /--speak-level/);
assert.doesNotMatch(glass, /\.g-call-grid\.is-group \.g-speak-ring \{\s*display:\s*none/);
assert.match(rings, /prefers-reduced-motion[\s\S]*scale:\s*1/);
assert.match(glass, /prefers-reduced-motion[\s\S]*translate\(-50%, -50%\)/);

console.log("voiceActivity selftest ok");
