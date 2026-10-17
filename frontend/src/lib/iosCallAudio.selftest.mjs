/**
 * Cold-start CallKit microphone + loudspeaker routing.
 * No Capacitor import: CI runs this with plain node.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMicGuard } from "./iosCallMic.js";
import { createCallKitController } from "./iosCallKitController.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

function createClock() {
  let now = 10_000;
  let seq = 1;
  const timers = [];
  return {
    now: () => now,
    setTimer(fn, ms) {
      const id = seq++;
      timers.push({ id, fn, at: now + ms });
      return id;
    },
    clearTimer(id) {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = timers
          .filter((t) => t.at <= target)
          .sort((a, b) => a.at - b.at || a.id - b.id);
        if (!due.length) break;
        const next = due[0];
        const i = timers.findIndex((t) => t.id === next.id);
        if (i >= 0) timers.splice(i, 1);
        now = next.at;
        next.fn();
      }
      now = target;
    },
  };
}

async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function liveTrack(id, extra = {}) {
  return {
    id,
    kind: "audio",
    readyState: "live",
    muted: false,
    enabled: true,
    contentHint: "",
    addEventListener() {},
    stop() {
      this.readyState = "ended";
    },
    ...extra,
  };
}

function makeGuard(clock, { ongoing = () => true, trackExtra = {}, ice = "connected" } = {}) {
  const reasons = [];
  const logs = [];
  const old = liveTrack("old", trackExtra);
  const stream = {
    tracks: [old],
    getAudioTracks() {
      return this.tracks.filter((t) => t.kind === "audio");
    },
    addTrack(t) {
      this.tracks.push(t);
    },
    removeTrack(t) {
      this.tracks = this.tracks.filter((x) => x !== t);
    },
  };
  const sender = {
    track: old,
    async replaceTrack(t) {
      this.track = t;
    },
  };
  const pc = {
    iceConnectionState: ice,
    connectionState: ice === "connected" || ice === "completed" ? "connected" : "connecting",
    getSenders: () => [sender],
    getTransceivers: () => [],
    async getStats() {
      return new Map([
        ["src", { type: "media-source", kind: "audio", totalAudioEnergy: 0, audioLevel: 0, trackIdentifier: "old" }],
        ["out", { type: "outbound-rtp", kind: "audio", packetsSent: 4, mediaSourceId: "src" }],
      ]);
    },
  };
  let nextId = 1;
  const guard = createMicGuard({
    getPc: () => pc,
    getLocalStream: () => stream,
    isCallOngoing: ongoing,
    getUserMedia: async () => {
      const track = liveTrack(`new-${nextId++}`);
      return { getAudioTracks: () => [track], getTracks: () => [track] };
    },
    reactivateCapture: async () => ({ micReactivated: false, webView: true }),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    wait: () => Promise.resolve(),
    log: (...args) => {
      const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      logs.push(line);
      const reason = args.find((a) => a && typeof a === "object" && a.reason)?.reason;
      if (typeof args[0] === "string" && args[0].startsWith("silent-")) reasons.push(args[0]);
      if (reason) reasons.push(reason);
    },
  });
  return { guard, reasons, logs, stream, sender, old, pc };
}

const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function pluginStub() {
  return {
    reportIncomingCall: () => Promise.resolve({ status: "reported" }),
    reportCallEnded() {},
    endCall() {},
    answerCall() {},
    setMuted() {},
    callJoined() {},
  };
}

// ── Cold start: didActivate before getUserMedia still refreshes the mic ──

{
  const clock = createClock();
  let ongoing = false;
  const { guard, reasons, logs, old } = makeGuard(clock, { ongoing: () => ongoing });
  guard.onAudioSessionActivated();
  assert.equal(guard._state().activateBeforeCapture, true);
  assert.ok(logs.some((line) => line.includes("activate-then-capture")));
  assert.equal(reasons.length, 0, "no refresh before the track exists");

  guard.noteCaptureStart();
  assert.equal(guard._state().activateBeforeCapture, false);
  ongoing = true;
  clock.advance(350);
  await flush();
  assert.ok(reasons.includes("callkit-before-capture"), `reasons=${reasons.join(",")}`);
  assert.equal(old.readyState, "ended", "the silent first track is stopped");
  assert.ok(logs.some((line) => line.includes("mic refreshed")));
}

// ── Still connecting: do not stop the mic track (that freezes "Bağlanıyor…") ──

{
  const clock = createClock();
  const { guard, reasons, old, pc } = makeGuard(clock, { ice: "checking" });
  guard.onAudioSessionActivated();
  guard.noteCaptureStart();
  clock.advance(2000);
  await flush();
  assert.equal(reasons.includes("callkit-before-capture"), false, `reasons=${reasons.join(",")}`);
  assert.equal(old.readyState, "live");
  pc.iceConnectionState = "connected";
  pc.connectionState = "connected";
  clock.advance(1000);
  await flush();
  assert.ok(reasons.includes("callkit-before-capture"), `reasons=${reasons.join(",")}`);
  assert.equal(old.readyState, "ended");
}

// ── App already open: capture then didActivate still refreshes ──

{
  const clock = createClock();
  const { guard, reasons, logs } = makeGuard(clock);
  guard.noteCaptureStart();
  guard.onAudioSessionActivated();
  assert.equal(guard._state().activateBeforeCapture, false);
  assert.ok(logs.some((line) => line.includes("capture-then-activate")));
  clock.advance(350);
  await flush();
  assert.ok(reasons.includes("callkit-activate"), `reasons=${reasons.join(",")}`);
  assert.equal(reasons.includes("callkit-before-capture"), false);
}

// ── Outbound stats: a muted track is treated as silence and refreshed ──

{
  const clock = createClock();
  const { guard, reasons } = makeGuard(clock, { trackExtra: { muted: true } });
  guard.noteCaptureStart();
  guard.startMonitoring();
  clock.advance(1000);
  await flush();
  clock.advance(1000);
  await flush();
  assert.ok(reasons.includes("silent-track-muted"), `reasons=${reasons.join(",")}`);
}

// ── Killed app: activation is queued before the offer; accept waits for both ──

{
  const clock = createClock();
  const accepted = [];
  let call = { mode: null, peer: null, acceptIncoming() {} };
  const ctl = createCallKitController({
    plugin: pluginStub(),
    getCall: () => call,
    getSocket: () => ({ connected: true, emit() {} }),
    isHidden: () => false,
    newUuid: () => "11111111-1111-4111-8111-111111111111",
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  ctl.handleEvent("audioSessionActivated", {});
  ctl.handleEvent("answer", { uuid: UUID, callerId: "user-1" });
  assert.equal(accepted.length, 0);
  assert.equal(ctl._state().audioActive, true);
  assert.ok(ctl._state().pendingAnswer);
  call = {
    mode: "incoming",
    peer: { id: "user-1", username: "Ada" },
    callUuid: UUID,
    callType: "voice",
    acceptIncoming: (opts) => accepted.push(opts),
  };
  ctl.sync();
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].fromCallKit, true);
}

// ── Locked phone: join waits until the app is visible, and for didActivate ──

{
  const clock = createClock();
  const accepted = [];
  let hidden = true;
  const ctl = createCallKitController({
    plugin: pluginStub(),
    getCall: () => ({
      mode: "incoming",
      peer: { id: "user-1", username: "Ada" },
      callUuid: UUID,
      callType: "voice",
      acceptIncoming: (opts) => accepted.push(opts),
    }),
    getSocket: () => ({ connected: true, emit() {} }),
    isHidden: () => hidden,
    newUuid: () => "11111111-1111-4111-8111-111111111111",
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  ctl.sync();
  ctl.handleEvent("answer", { uuid: UUID, callerId: "user-1", awaitingJoin: true });
  ctl.handleEvent("audioSessionActivated", {});
  assert.equal(accepted.length, 0, "locked screen does not start the mic");
  hidden = false;
  ctl.onAppVisible();
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].fromCallKit, true);
}

// ── Native source: loudspeaker, re-applied, headphones/Bluetooth excepted ──

const manager = read("../../ios/App/App/DescallCallManager.swift");
const keepAlive = read("../../ios/App/App/CallKeepAlivePlugin.swift");
const mic = read("./iosCallMic.js");
const group = read("../hooks/useGroupCall.js");

assert.equal(mic.includes("if (!s.captureStartedAt) return"), false);
assert.ok(mic.includes("activate-then-capture"));
assert.ok(mic.includes("callkit-before-capture"));
assert.ok(mic.includes("outbound mic energy"));

assert.ok(manager.includes(".defaultToSpeaker"));
assert.ok(manager.includes("overrideOutputAudioPort(.speaker)"));
assert.ok(manager.includes("DescallAudioRouter.shared.sessionActivated()"));
assert.ok(manager.includes("interruptionNotification"));
assert.ok(manager.includes("prefersExternalRoute"));
assert.ok(manager.includes("bluetoothHFP"));
assert.ok(manager.includes(".headphones"));
assert.equal(manager.includes("video ? .speaker : .receiver"), false);
assert.ok(manager.includes("return .speaker"));
assert.ok(manager.includes("scheduleSpeakerFollowUp"));
assert.ok(manager.includes("Re-applying here fights WebKit"));
assert.equal(manager.includes("didActivate category failed"), false);
assert.ok(mic.includes("transportReady"));
assert.ok(mic.includes("iceConnectionState"));

assert.ok(keepAlive.includes(".defaultToSpeaker"));
assert.ok(keepAlive.includes("overrideOutputAudioPort(.speaker)"));
assert.ok(keepAlive.includes("hasExternalAudio"));
assert.ok(keepAlive.includes(".voiceChat"));

assert.ok(group.includes('beginIosCallAudio({ video: false, owner: "group" })'));
assert.ok(group.includes('endIosCallAudio("group")'));

console.log("iosCallAudio.selftest: ok");
