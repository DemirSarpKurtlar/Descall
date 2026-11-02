// node src/lib/micFailsafe.selftest.mjs — 3.7.27 "ses gitmiyor": the processed
// (noise-suppressed) mic track is never sent silent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSilenceWatchdog, rms, swapToRawTrack, SILENCE_WINDOW_MS, SUSPENDED_MS, TICK_MS } from "./micFailsafe.js";

assert.equal(rms(new Float32Array([0, 0, 0])), 0);
assert.ok(Math.abs(rms(new Float32Array([0.5, -0.5])) - 0.5) < 1e-9);

function drive(opts, ticks) {
  let t = 0;
  const reasons = [];
  const wd = createSilenceWatchdog({ now: () => t, onFallback: (r) => reasons.push(r), setTimer: () => 1, clearTimer: () => {}, ...opts });
  for (let i = 0; i < ticks; i += 1) { t += TICK_MS; wd.step(); }
  return { reasons, wd };
}
const n = (ms) => Math.ceil(ms / TICK_MS) + 1;

// 1) talking, processed output silent for 3 s → fallback once.
let r = drive({ readRaw: () => 0.02, readOut: () => 0 }, n(SILENCE_WINDOW_MS) + 10);
assert.deepEqual(r.reasons, ["processed-silent"]);
// 2) processed output fine → never.
r = drive({ readRaw: () => 0.02, readOut: () => 0.01 }, 100);
assert.deepEqual(r.reasons, []);
// 3) nobody talks (raw quiet) → never.
r = drive({ readRaw: () => 0.0005, readOut: () => 0 }, 100);
assert.deepEqual(r.reasons, []);
// 4) muted (track disabled) → never, even with raw signal.
r = drive({ readRaw: () => 0.02, readOut: () => 0, isEnabled: () => false }, 100);
assert.deepEqual(r.reasons, []);
// 5) short silence under the window → no fallback.
r = drive({ readRaw: () => 0.02, readOut: () => 0 }, n(SILENCE_WINDOW_MS) - 3);
assert.deepEqual(r.reasons, []);
// 6) context suspended and resume does not help → fallback; resume was tried first.
let resumes = 0;
r = drive({ readRaw: () => 0, readOut: () => 0, getCtxState: () => "suspended", tryResume: () => { resumes += 1; } }, n(SUSPENDED_MS) + 2);
assert.deepEqual(r.reasons, ["context-suspended"]);
assert.equal(resumes, 1);
// 7) context suspended then resumed in time → no fallback.
{
  let t = 0; let state = "suspended"; const reasons = [];
  const wd = createSilenceWatchdog({ now: () => t, readRaw: () => 0.02, readOut: () => 0.01, getCtxState: () => state, onFallback: (x) => reasons.push(x), setTimer: () => 1, clearTimer: () => {} });
  for (let i = 0; i < 3; i += 1) { t += TICK_MS; wd.step(); }
  state = "running";
  for (let i = 0; i < 40; i += 1) { t += TICK_MS; wd.step(); }
  assert.deepEqual(reasons, []);
}
// 8) iOS "interrupted" counts as not running.
r = drive({ readRaw: () => 0, readOut: () => 0, getCtxState: () => "interrupted" }, n(SUSPENDED_MS) + 2);
assert.deepEqual(r.reasons, ["context-suspended"]);

// swapToRawTrack: stream + every sender, mute kept, closed pcs skipped.
function track(id, enabled = true) { return { id, enabled, kind: "audio", readyState: "live" }; }
function stream(tracks) {
  const list = [...tracks];
  return { getAudioTracks: () => list.filter((t) => t.kind === "audio"), removeTrack: (t) => list.splice(list.indexOf(t), 1), addTrack: (t) => list.push(t), _list: list };
}
function pc(tracks, state = "connected") {
  const senders = tracks.map((t) => ({ track: t, async replaceTrack(nt) { this.track = nt; } }));
  return { connectionState: state, signalingState: state === "closed" ? "closed" : "stable", getSenders: () => senders, senders };
}
{
  const processed = track("p", false); // muted
  const raw = track("r", true);
  const video = { id: "v", kind: "video" };
  const s = stream([processed, video]);
  const a = pc([processed, video]);
  const b = pc([processed]);
  const closed = pc([processed], "closed");
  const switched = await swapToRawTrack({ stream: s, processedTrack: processed, rawTrack: raw, peers: [a, b, closed] });
  assert.equal(switched, 2);
  assert.equal(raw.enabled, false, "mute state kept");
  assert.deepEqual(s.getAudioTracks().map((t) => t.id), ["r"]);
  assert.equal(a.senders[0].track, raw);
  assert.equal(a.senders[1].track, video, "video sender untouched");
  assert.equal(closed.senders[0].track, processed);
}

// Wiring in noiseSuppression.js (source shape; the browser e2e covers behavior).
const src = readFileSync(new URL("./noiseSuppression.js", import.meta.url), "utf8");
const acquire = src.slice(src.indexOf("export async function acquireVoiceMicStream"));
assert.ok(acquire.indexOf("primeNoiseSuppressionContext()") > -1 && acquire.indexOf("primeNoiseSuppressionContext()") < acquire.indexOf("navigator.mediaDevices.getUserMedia"), "context is created / resumed before getUserMedia (user gesture)");
assert.match(src, /if \(!\(await resumeContext\(ctx, 400\)\)\)[\s\S]{0,300}return rawStream;/, "a context that does not run → raw mic");
assert.match(src, /addEventListener\?\.\("statechange"/, "statechange handler");
assert.match(src, /getLivePeerConnections\(\)/, "fallback reaches every live sender");
assert.doesNotMatch(src.slice(src.indexOf("async function ensureContext"), src.indexOf("function buildDspFallback")), /catch \{\s*\/\* ignore \*\/\s*\}/, "resume failure no longer swallowed");

// Noise gate safe for quiet mics.
const { gateSettings } = await import("./voiceProfile.js");
assert.ok(gateSettings("on").openThreshold <= -58, "default gate opens for quiet mics");
assert.ok(gateSettings("on").closeThreshold < gateSettings("on").openThreshold);

console.log("micFailsafe.selftest ok");
