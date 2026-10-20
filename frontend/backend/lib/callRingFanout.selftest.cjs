// Ring cancellation fan-out: every outcome reaches every channel of the
// callee exactly once, with the right CallKit reason.
// Run from frontend/: node backend/lib/callRingFanout.selftest.cjs
"use strict";
const assert = require("node:assert/strict");
const {
  createRingFanout,
  CALLKIT_REASON,
  RING_TIMEOUT_MS,
  CALLER_LOST_GRACE_MS,
} = require("./callRingFanout");
// CI runs without npm install: stub the APNs transport (needs jsonwebtoken).
const apnsPath = require.resolve("./apnsClient");
require.cache[apnsPath] = {
  id: apnsPath,
  filename: apnsPath,
  loaded: true,
  exports: { http2Transport() {}, apnsHost() { return ""; } },
};
const { buildVoipEndPayload } = require("./voipPush");

function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, tm] of timers) if (tm.at <= end && (!next || tm.at < next[1].at)) next = [id, tm];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
    pending: () => timers.size,
  };
}

function setup(extra = {}) {
  const clock = fakeClock();
  const log = { room: [], user: [], voip: [], web: [], missed: [], lost: [] };
  const fan = createRingFanout({
    emitToUserRoom: (userId, event, payload, except) => log.room.push({ userId, event, payload, except }),
    emitToUser: (userId, event, payload) => log.user.push({ userId, event, payload }),
    sendVoipEnd: async (userId, end) => log.voip.push({ userId, ...end }),
    sendWebPushEnd: async (userId, end) => log.web.push({ userId, ...end }),
    onMissed: async (ring) => log.missed.push(ring.callUuid),
    onCallerLost: async (ring) => log.lost.push(ring.callUuid),
    hasLiveSockets: extra.hasLiveSockets || (() => false),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
    log: { warn() {} },
  });
  return { fan, clock, log };
}

// 1. Answered on one device → every other device (sockets minus the actor,
//    the iPhone via VoIP end push, closed browsers via Web Push) stops.
{
  const { fan, log, clock } = setup();
  fan.ringStarted({ callUuid: "U1", callerId: "A", calleeId: "B", callerName: "Ada" });
  const plan = fan.endRingByPair("A", "B", "answered_elsewhere", { exceptSocketId: "sock-desktop" });
  assert.equal(plan.callKitReason, "answeredElsewhere");
  const ended = log.room.find((e) => e.event === "call:ring-ended");
  assert.deepEqual(ended.payload, { fromUserId: "A", callUuid: "U1", reason: "answered_elsewhere" });
  assert.equal(ended.except, "sock-desktop", "the answering socket must not be told to stop");
  assert.ok(log.room.some((e) => e.event === "call:answered-elsewhere"), "legacy event for old clients");
  assert.deepEqual(log.voip[0], { userId: "B", callUuid: "U1", reason: "answeredElsewhere", callerId: "A" });
  assert.equal(log.web[0].outcome, "answered_elsewhere");
  assert.equal(log.web[0].callerName, "Ada");
  assert.equal(fan.size(), 0);
  // First outcome wins: a racing cancel changes nothing.
  assert.equal(fan.endRingByPair("A", "B", "cancelled"), null);
  assert.equal(log.voip.length, 1);
  clock.advance(RING_TIMEOUT_MS + 1000);
  assert.equal(log.missed.length, 0, "an answered ring never times out");
}

// 2. Declined elsewhere / caller cancel → right reasons.
{
  const { fan, log } = setup();
  fan.ringStarted({ callUuid: "U2", callerId: "A", calleeId: "B" });
  fan.endRingByPair("A", "B", "declined_elsewhere", { exceptSocketId: "s1" });
  assert.equal(log.voip[0].reason, "declinedElsewhere");
  assert.ok(log.room.some((e) => e.event === "call:declined-elsewhere"));
  fan.ringStarted({ callUuid: "U3", callerId: "A", calleeId: "B" });
  fan.endRingByPair("A", "B", "cancelled");
  assert.equal(log.voip[1].reason, "remoteEnded");
  assert.ok(!log.room.filter((e) => e.event === "call:ring-ended").at(-1).except, "a caller cancel stops every callee socket");
}

// 3. Nobody answers → missed: callee devices stop ("unanswered"), the caller
//    gets call:declined with reason no_answer (old clients end on it too),
//    history is finalized once.
{
  const { fan, log, clock } = setup();
  fan.ringStarted({ callUuid: "U4", callerId: "A", calleeId: "B" });
  clock.advance(RING_TIMEOUT_MS - 1);
  assert.equal(log.voip.length, 0);
  clock.advance(2);
  assert.equal(log.voip[0].reason, "unanswered");
  assert.ok(log.room.some((e) => e.event === "call:ring-ended" && e.payload.reason === "missed"));
  assert.deepEqual(log.user[0], { userId: "A", event: "call:declined", payload: { fromUserId: "B", callUuid: "U4", reason: "no_answer" } });
  assert.deepEqual(log.missed, ["U4"]);
  assert.equal(clock.pending(), 0);
}

// 4. Caller's app dies mid-ring → cancelled after the grace, unless it is back.
{
  const { fan, log, clock } = setup();
  fan.ringStarted({ callUuid: "U5", callerId: "A", calleeId: "B" });
  fan.callerSocketsGone("A");
  clock.advance(5_000);
  fan.callerSocketsBack("A");
  clock.advance(1000);
  assert.equal(log.voip.length, 0, "a caller that reconnected keeps ringing");
  fan.callerSocketsGone("A");
  clock.advance(CALLER_LOST_GRACE_MS + 1);
  assert.equal(log.voip[0].reason, "remoteEnded");
  assert.ok(log.room.some((e) => e.event === "call:cancelled"));
  assert.deepEqual(log.lost, ["U5"]);
}

// 5. Same uuid twice = one ring; a new uuid for the pair replaces the stale one.
{
  const { fan } = setup();
  fan.ringStarted({ callUuid: "U6", callerId: "A", calleeId: "B" });
  fan.ringStarted({ callUuid: "U6", callerId: "A", calleeId: "B" });
  assert.equal(fan.size(), 1);
  fan.ringStarted({ callUuid: "U7", callerId: "A", calleeId: "B" });
  assert.equal(fan.size(), 1);
  assert.equal(fan.ringingFor("A", "B").callUuid, "U7");
}

// 6. VoIP end payload the iOS app maps to CXCallEndedReason.
{
  for (const reason of Object.values(CALLKIT_REASON)) {
    const p = buildVoipEndPayload({ callUuid: "U8", callerId: "A", reason });
    assert.equal(p.type, "call-end");
    assert.equal(p.callUuid, "U8");
    assert.equal(p.reason, reason);
  }
  assert.equal(buildVoipEndPayload({ callUuid: "U9", reason: "bogus" }).reason, "remoteEnded");
}

// 7. Server wiring: every ring path goes through the fan-out.
{
  const fs = require("node:fs");
  const path = require("node:path");
  const handlers = fs.readFileSync(path.join(__dirname, "../socket/handlers.js"), "utf8");
  for (const needle of [
    'endRingByPair(toUserId, myId, "answered_elsewhere"',
    '"declined_elsewhere"',
    '"cancelled"',
    "ringStarted({",
    'socket.on("call:ring-status"',
    "callerSocketsGone(",
    "callerSocketsBack(",
    '"call:peer-presence"',
  ]) {
    assert.ok(handlers.includes(needle), `handlers.js must contain ${needle}`);
  }
  const swift = fs.readFileSync(path.join(__dirname, "../../ios/App/App/DescallCallManager.swift"), "utf8");
  for (const needle of [".answeredElsewhere", ".declinedElsewhere", ".remoteEnded", ".unanswered", "handleCallEndPush", "\"call-end\""]) {
    assert.ok(swift.includes(needle), `DescallCallManager.swift must contain ${needle}`);
  }
}

console.log("callRingFanout.selftest ok");
