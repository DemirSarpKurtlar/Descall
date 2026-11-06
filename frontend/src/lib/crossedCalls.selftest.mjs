// Crossed DM calls (both press call at the same moment).
// Before: each side kept the other's offer as a "refreshed" ring and stayed
// on its own ringback until the 45 s "No answer"; nobody got connected.
// Now exactly one side (the polite peer) answers the other's offer on its
// own dialing connection and the server drops the reverse ring.
// Server side: backend/test/callSignalAck.integration.test.cjs (crossed calls).
// Run from frontend/: node src/lib/crossedCalls.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { crossedCallRole } = await import("./callRingSync.js");
const { isPolitePeer } = await import("./webrtcNegotiation.js");

// 1. Exactly one side answers, whatever the id types.
for (const [a, b] of [["u-alice", "u-bob"], ["7", "12"], [3, 10], ["b", "a"]]) {
  const sideA = crossedCallRole({ mode: "outgoing", peerId: b }, b, a);
  const sideB = crossedCallRole({ mode: "outgoing", peerId: a }, a, b);
  assert.deepEqual([sideA, sideB].sort(), ["answer", "wait"], `${a} / ${b}: one answers, one waits`);
  assert.equal(sideA === "answer", isPolitePeer(String(a), String(b)), "same rule as the renegotiation glare");
}

// 2. Not a crossed call: ringing, connected, idle, another peer, own id.
assert.equal(crossedCallRole({ mode: "incoming", peerId: "b" }, "b", "a"), null, "a re-sent ring is just refreshed");
assert.equal(crossedCallRole({ mode: "active", peerId: "b" }, "b", "a"), null);
assert.equal(crossedCallRole({ mode: null, peerId: null }, "b", "a"), null);
assert.equal(crossedCallRole({ mode: "outgoing", peerId: "c" }, "b", "a"), null, "someone else calling: busy path");
assert.equal(crossedCallRole({ mode: "outgoing", peerId: "b" }, "b", null), null, "unknown self: no guess");
assert.equal(crossedCallRole({ mode: "outgoing", peerId: "a" }, "a", "a"), null);

// 3. useCall wiring.
const src = readFileSync(new URL("../hooks/useCall.js", import.meta.url), "utf8");
const onOffer = src.slice(src.indexOf("const onOffer = async"), src.indexOf("const onAnswer = async"));
const crossedAt = onOffer.indexOf("crossedCallRole(");
const refreshAt = onOffer.indexOf("// Already ringing this peer");
assert.ok(crossedAt > 0 && crossedAt < refreshAt, "crossed calls are decided before the 'refresh the ring' path");
assert.match(onOffer, /if \(crossedRole === "wait"\) return;/);
assert.match(onOffer, /crossedOfferRef\.current = \{/);
assert.match(onOffer, /takeCrossedOfferRef\.current\?\.\(\)/);
const take = src.slice(src.indexOf("const takeCrossedOffer = async"), src.indexOf("takeCrossedOfferRef.current = takeCrossedOffer;"));
assert.match(take, /dialingRef\.current\) return false/, "never touches a pc while startCall is still offering");
assert.match(take, /applyRemoteOffer\(pc, crossed\.offer, \{ polite: true/, "rolls our offer back, same pc and mic");
assert.match(take, /"call:answer"/);
assert.match(take, /setMode\("active"\)/, "straight to active: the ringback stops, no ringtone in between");
assert.doesNotMatch(take, /acquireCallMicStream|getUserMedia/, "no second microphone capture");
const startCall = src.slice(src.indexOf("const startCall = useCallback"), src.indexOf("const acceptIncoming = useCallback"));
assert.match(startCall, /dialingRef\.current = true;/);
assert.match(startCall, /if \(crossedOfferRef\.current\) await takeCrossedOfferRef\.current\?\.\(\);/, "an offer that came in while dialing is answered once ours is out");
assert.match(startCall, /finally \{\s*dialingRef\.current = false;/);
const cleanup = src.slice(src.indexOf("const cleanup = useCallback"), src.indexOf("const gracefulEnd = useCallback"));
assert.match(cleanup, /crossedOfferRef\.current = null;/);

// 4. Server: the answer drops the reverse ring.
const handlers = readFileSync(new URL("../../backend/socket/handlers.js", import.meta.url), "utf8");
const answer = handlers.slice(handlers.indexOf('socket.on("call:answer"'), handlers.indexOf('socket.on("call:ice-candidate"'));
assert.match(answer, /if \(dropCrossedRing\(myId, toUserId\)\) \{\s*getRingFanout\(io\)\.endRingByPair\(myId, toUserId, "cancelled"\);/);

console.log("crossedCalls selftest ok");
