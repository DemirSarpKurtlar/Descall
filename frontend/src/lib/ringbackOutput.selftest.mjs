// Ringback and in-call cues play on the call speaker, not the system default.
// Before: audioManager's detached <audio> elements were never routed, so with a
// headset chosen for calls the ringback rang on the laptop speakers.
// Run from frontend/: node src/lib/ringbackOutput.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { default: audioManager, CALL_OUTPUT_TYPES, soundSinkId } = await import("./audioManager.js");
const { __resetSinkRegistry, setOutputSink, routeToSink } = await import("./callAudioDevices.js");

const flush = () => new Promise((r) => setTimeout(r, 0));

class FakeAudio {
  constructor(name) {
    this.name = name;
    this.paused = true;
    this.sinkId = "";
    this.sinkCalls = [];
    this.playLog = [];
    this.volume = 1;
    this.loop = false;
    this.currentTime = 0;
  }
  setSinkId(id) {
    this.sinkCalls.push(id);
    return new Promise((resolve) => setTimeout(() => { this.sinkId = id; resolve(); }, 1));
  }
  play() {
    this.paused = false;
    this.playLog.push(this.sinkId);
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  cloneNode() { return new FakeAudio(`${this.name}-clone`); }
  addEventListener() {}
  remove() {}
}

__resetSinkRegistry(() => {});
// Preload: every sound "loads" at once.
globalThis.Audio = class extends FakeAudio {
  addEventListener(type, fn) { if (type === "canplaythrough") queueMicrotask(fn); }
};
await audioManager.init({});
// Node has no Audio: plug fakes in for the sounds this test plays.
const sounds = {};
for (const type of ["outgoingCall", "incomingCall", "callAccept", "message"]) {
  sounds[type] = new FakeAudio(type);
  audioManager.sounds[type] = sounds[type];
}
audioManager.preloadComplete = true;

// 1. Which sounds follow the call speaker.
for (const type of ["outgoingCall", "callAccept", "callReject", "mute", "userJoin", "screenShareStart"]) {
  assert.ok(CALL_OUTPUT_TYPES.has(type), `${type} is a call sound`);
}
for (const type of ["incomingCall", "message", "notification"]) {
  assert.ok(!CALL_OUTPUT_TYPES.has(type), `${type} stays on the default output`);
}

// 2. Headset chosen for calls: the ringback starts on it (switch first, then play).
await setOutputSink("headset-1", { doc: null });
assert.equal(soundSinkId("outgoingCall"), "headset-1");
assert.equal(soundSinkId("incomingCall"), "", "incoming ringtone stays on the default");
assert.equal(soundSinkId("message", "notif-out"), "notif-out", "Descall+ notification output wins");
assert.equal(audioManager.play("outgoingCall", { loop: true }), true);
await flush();
await flush();
assert.deepEqual(sounds.outgoingCall.sinkCalls, ["headset-1"], "ringback routed to the call speaker");
assert.deepEqual(sounds.outgoingCall.playLog, ["headset-1"], "ringback never starts on the old device");

// 3. Speaker switched mid-ring: the playing ringback moves with it.
await setOutputSink("usb-2", { doc: null });
await flush();
await flush();
assert.equal(sounds.outgoingCall.sinkId, "usb-2", "ringback follows a mid-ring switch");

// 4. Answered right away: a ringback stopped while its output was switching never starts.
audioManager.stop("outgoingCall");
sounds.outgoingCall.playLog = [];
await setOutputSink("headset-1", { doc: null });
audioManager.play("outgoingCall", { loop: true });
audioManager.stop("outgoingCall");
await flush();
await flush();
assert.deepEqual(sounds.outgoingCall.playLog, [], "a stopped ringback does not start late");
assert.ok(sounds.outgoingCall.paused);

// 5. The incoming ringtone is not moved to the headset.
audioManager.play("incomingCall", { loop: true });
await flush();
assert.deepEqual(sounds.incomingCall.sinkCalls, [], "incoming ringtone untouched (default)");
assert.deepEqual(sounds.incomingCall.playLog, [""]);
audioManager.stop("incomingCall");

// 6. routeToSink: no call when unchanged, failures fall back to the old device.
{
  const el = new FakeAudio("x");
  assert.equal(routeToSink(el, ""), null, "fresh element is already on the default");
  const p = routeToSink(el, "a");
  assert.ok(p && typeof p.then === "function");
  await p;
  assert.equal(routeToSink(el, "a"), null);
  const bad = { setSinkId: () => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })) };
  assert.equal(await routeToSink(bad, "b"), false);
  assert.ok(routeToSink(bad, "b"), "a failed switch is retried next time");
  assert.equal(routeToSink({}, "a"), null, "no setSinkId (Safari): plays as before");
}

// 7. Wiring: sound packs route too; Descall+ treats every call sound as a call cue.
const pack = readFileSync(new URL("./soundPackSynth.js", import.meta.url), "utf8");
assert.match(pack, /routeToSink\(audio, sinkId\)/);
assert.match(pack, /stop\.element = audio/);
const bridge = readFileSync(new URL("../premium/usePremiumAudioBridge.js", import.meta.url), "utf8");
assert.match(bridge, /const CALL_CUES = CALL_OUTPUT_TYPES/);
assert.doesNotMatch(bridge, /"callEnd", "callConnected"/, "no made-up cue names");

audioManager.destroy();
console.log("ringbackOutput selftest ok");
process.exit(0); // preload's 5 s load guards are still pending
