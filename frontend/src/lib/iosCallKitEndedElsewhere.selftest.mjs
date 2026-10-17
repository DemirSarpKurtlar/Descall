// iOS: the VoIP "call-end" push (answered / declined elsewhere, caller
// cancel, missed) ends the ringing CallKit call and the web ring.
// Run from frontend/: node src/lib/iosCallKitEndedElsewhere.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCallKitController } from "./iosCallKitController.js";

const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const plugin = {
  reportIncomingCall: () => Promise.resolve({ status: "reported" }),
  reportCallEnded() {},
  endCall() {},
  answerCall() {},
  setMuted() {},
  callJoined() {},
};
let t = 0;
const timers = new Map();
let seq = 0;
const base = {
  plugin,
  getSocket: () => ({ connected: true, emit() {} }),
  isHidden: () => false,
  newUuid: () => "11111111-1111-4111-8111-111111111111",
  now: () => t,
  setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: t + ms }); return id; },
  clearTimer: (id) => timers.delete(id),
};

{
  let cleaned = 0;
  const call = {
    mode: "incoming",
    peer: { id: "user-1", username: "Ada" },
    callUuid: UUID,
    callType: "voice",
    cleanup: () => { cleaned += 1; },
    acceptIncoming() {},
  };
  const ctl = createCallKitController({ ...base, getCall: () => call });
  ctl.sync();
  ctl.handleEvent("endedElsewhere", { uuid: UUID.toUpperCase(), reason: "answeredElsewhere" });
  assert.equal(cleaned, 1, "the web ring stops with CallKit");
}

{
  // Already answered here: an end push for the same uuid must not hang up.
  let cleaned = 0;
  const call = { mode: "active", peer: { id: "user-1" }, callUuid: UUID, cleanup: () => { cleaned += 1; } };
  const ctl = createCallKitController({ ...base, getCall: () => call });
  ctl.sync();
  ctl.handleEvent("endedElsewhere", { uuid: UUID });
  assert.equal(cleaned, 0);
}

{
  const swift = readFileSync(new URL("../../ios/App/App/DescallCallManager.swift", import.meta.url), "utf8");
  assert.match(swift, /func handleCallEndPush/);
  assert.match(swift, /reportAndEndPlaceholder/, "iOS 13+: every VoIP push reports a call, even a late end push");
  assert.match(swift, /endedRecently/, "an incoming push after its end push is reported and ended at once");
  assert.match(swift, /case "answeredElsewhere": return \.answeredElsewhere|"answeredElsewhere"/);
}

console.log("iosCallKitEndedElsewhere.selftest ok");
