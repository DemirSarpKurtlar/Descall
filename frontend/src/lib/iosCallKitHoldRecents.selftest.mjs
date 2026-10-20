// iOS CallKit: hold mutes the mic and restores the previous state on resume;
// a Phone-app Recents tap (INStartCallIntent) calls the user back.
// Run from frontend/: node src/lib/iosCallKitHoldRecents.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCallKitController } from "./iosCallKitController.js";

const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const plugin = {
  reportIncomingCall: () => Promise.resolve({ status: "reported" }),
  reportOutgoingCall: () => Promise.resolve({}),
  startOutgoingCall: () => Promise.resolve({}),
  reportCallEnded() {}, endCall() {}, answerCall() {}, setMuted() {}, callJoined() {}, reportConnected() {},
};
let seq = 0;
const base = {
  plugin,
  getSocket: () => ({ connected: true, emit() {} }),
  isHidden: () => false,
  newUuid: () => UUID,
  now: () => 0,
  setTimer: () => ++seq,
  clearTimer: () => {},
};

for (const startMuted of [false, true]) {
  const call = { mode: "incoming", acceptIncoming() {}, cleanup() {}, peer: { id: "user-1" }, callUuid: UUID, callType: "voice", muted: startMuted,
    toggleMute() { this.muted = !this.muted; } };
  const ctl = createCallKitController({ ...base, getCall: () => call });
  ctl.sync();
  await new Promise((r) => setTimeout(r, 0));
  call.mode = "active";
  ctl.sync();
  ctl.handleEvent("hold", { uuid: UUID.toUpperCase(), held: true });
  assert.equal(call.muted, true, "held → mic muted");
  ctl.handleEvent("hold", { uuid: UUID, held: false });
  assert.equal(call.muted, startMuted, "resume → previous mute state");
}

{
  const started = [];
  const call = { mode: null, startCall: (f, t) => started.push([f.id, t]) };
  const ctl = createCallKitController({ ...base, getCall: () => call,
    onStartCallIntent: ({ userId, video }) => started.push([userId, video]) });
  ctl.handleEvent("startCallIntent", { userId: "user-9", video: true });
  assert.deepEqual(started, [["user-9", true]]);
  ctl.handleEvent("startCallIntent", {});
  assert.equal(started.length, 1, "no handle → ignored");
}

{
  const swift = readFileSync(new URL("../../ios/App/App/DescallCallManager.swift", import.meta.url), "utf8");
  assert.match(swift, /includesCallsInRecents = true/);
  assert.match(swift, /supportsHolding = true/);
  assert.match(swift, /func handleStartCallIntent/);
  assert.doesNotMatch(swift, /CXSetHeldCallAction\) \{\s*\/\/[^\n]*\n\s*action\.fail\(\)/);
  const plist = readFileSync(new URL("../../ios/App/App/Info.plist", import.meta.url), "utf8");
  assert.match(plist, /INStartCallIntent/);
  assert.match(plist, /<string>voip<\/string>/);
  const scene = readFileSync(new URL("../../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8");
  assert.match(scene, /handleStartCallIntent/);
}
console.log("iosCallKitHoldRecents.selftest: ok");
