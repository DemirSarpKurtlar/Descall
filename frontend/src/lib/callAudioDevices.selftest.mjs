// node src/lib/callAudioDevices.selftest.mjs
import assert from "node:assert/strict";
import {
  readAudioPrefs, writeAudioPref, pickAvailable, isProcessedTrackId, liveMicDeviceId,
  registerSinkElement, registerSinkContext, setOutputSink, getOutputSinkId, __resetSinkRegistry,
  swapMicTrack, iosOutputRows, iosInputRows, iosBuiltInMicRoute, SETTINGS_KEY, LEGACY_SETTINGS_KEY,
} from "./callAudioDevices.js";

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

// Prefs: Settings page keys, legacy fallback, both written.
const st = memStorage({ [LEGACY_SETTINGS_KEY]: JSON.stringify({ selectedAudioIn: "mic-legacy", theme: "x" }) });
assert.deepEqual(readAudioPrefs(st), { input: "mic-legacy", output: "" });
writeAudioPref("output", "spk-2", st);
assert.deepEqual(readAudioPrefs(st), { input: "mic-legacy", output: "spk-2" });
assert.equal(JSON.parse(st.getItem(SETTINGS_KEY)).theme, "x", "other settings kept");
assert.equal(st.getItem(SETTINGS_KEY), st.getItem(LEGACY_SETTINGS_KEY));
writeAudioPref("input", "", st);
assert.equal(readAudioPrefs(st).input, "");
assert.deepEqual(readAudioPrefs(null), { input: "", output: "" });
assert.deepEqual(readAudioPrefs(memStorage({ [SETTINGS_KEY]: "{bad" })), { input: "", output: "" });

const devices = [{ deviceId: "default" }, { deviceId: "a" }, { deviceId: "b" }];
assert.equal(pickAvailable("b", devices), "b");
assert.equal(pickAvailable("gone", devices), "");
assert.equal(pickAvailable("", devices), "");
assert.equal(pickAvailable("default", devices), "default");

assert.ok(isProcessedTrackId("WebAudio-f4fb7561-4779"));
assert.ok(!isProcessedTrackId("0a018e40"));
const tr = (id) => ({ getSettings: () => ({ deviceId: id }) });
assert.equal(liveMicDeviceId({ getAudioTracks: () => [tr("WebAudio-1")] }, tr("raw-1")), "raw-1");
assert.equal(liveMicDeviceId({ getAudioTracks: () => [tr("dev-9")] }, null), "dev-9");
assert.equal(liveMicDeviceId({ getAudioTracks: () => [tr("WebAudio-1")] }, null), "");

// Sink registry: every element + AudioContext, late registrations, errors reported.
const errors = [];
__resetSinkRegistry((...a) => errors.push(a));
const mk = (fail) => ({ sinks: [], isConnected: true, srcObject: {}, async setSinkId(id) { if (fail) throw Object.assign(new Error("x"), { name: "NotAllowedError" }); this.sinks.push(id); } });
const el1 = mk();
const ctx = mk();
const bad = mk(true);
const domEl = mk();
registerSinkElement(el1);
registerSinkContext(ctx);
registerSinkElement(bad);
const fakeDoc = { querySelectorAll: () => [domEl, el1] };
const res = await setOutputSink("spk-2", { doc: fakeDoc });
assert.equal(getOutputSinkId(), "spk-2");
assert.deepEqual(el1.sinks, ["spk-2"]);
assert.deepEqual(ctx.sinks, ["spk-2"], "boost AudioContext follows the sink");
assert.deepEqual(domEl.sinks, ["spk-2"], "unregistered elements in the document too");
assert.equal(res.applied, 3);
assert.equal(res.failed, 1);
assert.deepEqual(res.errors, ["NotAllowedError"]);
assert.ok(errors.length >= 1, "failures are logged, not swallowed");
// Unchanged: no duplicate setSinkId.
await setOutputSink("spk-2", { doc: fakeDoc });
assert.deepEqual(el1.sinks, ["spk-2"]);
// Registered later (new call, screen audio) gets the current sink.
const late = mk();
registerSinkElement(late);
await new Promise((r) => setTimeout(r, 0));
assert.deepEqual(late.sinks, ["spk-2"]);
// Back to default resets every target.
await setOutputSink("", { doc: fakeDoc });
assert.deepEqual(el1.sinks, ["spk-2", ""]);
assert.deepEqual(ctx.sinks, ["spk-2", ""]);
// No sink chosen: registering does not touch a fresh element.
__resetSinkRegistry(() => {});
const fresh = mk();
registerSinkElement(fresh);
await new Promise((r) => setTimeout(r, 0));
assert.deepEqual(fresh.sinks, []);

// Mic swap: replaceTrack on the mic sender (not screen audio), enabled kept,
// old track stopped only after success.
const mkTrack = (id, enabled = true) => ({ id, kind: "audio", enabled, stopped: false, stop() { this.stopped = true; } });
const oldTrack = mkTrack("old", false);
const screenTrack = mkTrack("screen");
const local = { tracks: [oldTrack], getAudioTracks() { return [...this.tracks]; }, removeTrack(t) { this.tracks = this.tracks.filter((x) => x !== t); }, addTrack(t) { this.tracks.push(t); } };
const micSender = { track: oldTrack, async replaceTrack(t) { this.track = t; } };
const screenSender = { track: screenTrack, async replaceTrack() { throw new Error("wrong sender"); } };
const pc = { getSenders: () => [screenSender, micSender] };
let asked = null;
const newTrack = mkTrack("new");
const out = await swapMicTrack({ pc, stream: local, deviceId: "b", excludeSenders: [screenSender], acquire: async (id) => { asked = id; return { getAudioTracks: () => [newTrack] }; } });
assert.equal(asked, "b");
assert.equal(out.replaced, true);
assert.equal(micSender.track, newTrack);
assert.equal(newTrack.enabled, false, "muted stays muted");
assert.ok(oldTrack.stopped);
assert.deepEqual(local.getAudioTracks(), [newTrack]);
// Capture failure: old track untouched, error surfaces.
const keep = mkTrack("keep");
const local2 = { tracks: [keep], getAudioTracks() { return [...this.tracks]; }, removeTrack() {}, addTrack() {} };
await assert.rejects(swapMicTrack({ pc, stream: local2, deviceId: "x", acquire: async () => { throw Object.assign(new Error("o"), { name: "OverconstrainedError" }); } }), /o/);
assert.equal(keep.stopped, false);

// iOS route rows.
const snap = {
  active: true, current: "bluetooth", selected: "input:BT1",
  routes: [
    { id: "receiver", kind: "receiver", name: "" },
    { id: "speaker", kind: "speaker", name: "" },
    { id: "input:BT1", kind: "bluetooth", name: "AirPods Pro" },
    { id: "input:W1", kind: "headphones", name: "Headset" },
  ],
};
const outs = iosOutputRows(snap);
assert.deepEqual(outs.map((r) => r.id), ["receiver", "speaker", "input:BT1", "input:W1"]);
assert.deepEqual(outs.filter((r) => r.selected).map((r) => r.id), ["input:BT1"]);
const ins = iosInputRows(snap, "iPhone");
assert.deepEqual(ins.map((r) => [r.id, r.selected]), [["builtin", false], ["input:BT1", true], ["input:W1", false]]);
assert.equal(iosInputRows({ ...snap, selected: "speaker" })[0].selected, true);
assert.equal(iosBuiltInMicRoute({ selected: "receiver" }), "receiver");
assert.equal(iosBuiltInMicRoute({ selected: "input:BT1" }), "speaker");
assert.deepEqual(iosOutputRows(null), []);
console.log("callAudioDevices selftest ok");

// Preferred mic with fallback.
{
  const { acquirePreferredMic } = await import("./callAudioDevices.js");
  const calls = [];
  const ok = await acquirePreferredMic(async (c) => { calls.push(c); return "s"; }, { video: false }, "m1");
  assert.equal(ok, "s");
  assert.deepEqual(calls[0], { video: false, audio: { deviceId: { exact: "m1" } } });
  const calls2 = [];
  const fb = await acquirePreferredMic(async (c) => { calls2.push(c); if (c.audio) throw Object.assign(new Error("gone"), { name: "OverconstrainedError" }); return "d"; }, { video: false }, "m1");
  assert.equal(fb, "d");
  assert.equal(calls2.length, 2);
  await assert.rejects(acquirePreferredMic(async () => { throw Object.assign(new Error("deny"), { name: "NotAllowedError" }); }, {}, "m1"), /deny/);
  const calls3 = [];
  await acquirePreferredMic(async (c) => { calls3.push(c); return 1; }, { video: false }, "");
  assert.deepEqual(calls3, [{ video: false }]);
  console.log("acquirePreferredMic ok");
}
