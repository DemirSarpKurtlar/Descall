"use strict";
// 2.13.6: a caller whose iPhone was locked while it rang gets the answer (and
// the callee ICE) replayed when its socket returns, for ANSWER_REPLAY_MS.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "x";
const assert = require("assert");
const log = require("./dmCallLog");
const clock = require("./callClock");
const { CALLER_LOST_GRACE_MS } = require("./callRingFanout");

assert.ok(CALLER_LOST_GRACE_MS >= 30_000, "locked caller keeps ringing at least 30 s");
log._resetDmCallStateForTests?.();
log.trackOffer({ callerId: "a", calleeId: "b", callType: "voice", offer: { type: "offer", sdp: "o" } });
assert.equal(log.answerReplayForCaller("a", "b"), null, "nothing before the answer");
log.markAnswered({ callerId: "a", calleeId: "b", answer: { type: "answer", sdp: "x" } });
log.bufferCalleeIce({ fromId: "b", toId: "a", candidate: { candidate: "c1" } });
log.bufferCalleeIce({ fromId: "a", toId: "b", candidate: { candidate: "caller" } });
const r = log.answerReplayForCaller("a", "b");
assert.equal(r.answer.sdp, "x");
assert.deepEqual(r.candidates.map((c) => c.candidate), ["c1"], "only callee ICE is replayed");
assert.equal(log.answerReplayForCaller("b", "a"), null, "callee never gets its own answer");
if (typeof clock.set === "function" || typeof clock._setNow === "function") {
  const base = Date.now();
  (clock.set || clock._setNow)(() => base + log.ANSWER_REPLAY_MS + 1);
  assert.equal(log.answerReplayForCaller("a", "b"), null, "replay window closes");
}
console.log("dmCallAnswerReplay.selftest.cjs: ok");
