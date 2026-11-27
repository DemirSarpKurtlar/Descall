// node src/lib/localIceReplay.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalIceLog, isIceUp, MAX_ICE_REPLAYS } from "./localIceReplay.js";

const cand = (n, ufrag = "uA") => ({
  candidate: `candidate:${n} 1 udp 1 10.0.0.${n} 5000 typ host ufrag ${ufrag}`,
  sdpMid: "0",
  sdpMLineIndex: 0,
  usernameFragment: ufrag,
  toJSON() {
    return { candidate: this.candidate, sdpMid: this.sdpMid, sdpMLineIndex: this.sdpMLineIndex, usernameFragment: this.usernameFragment };
  },
});

const pc = { iceConnectionState: "checking", connectionState: "connecting" };
const log = createLocalIceLog();
assert.deepEqual(log.takeReplay(pc), [], "nothing gathered yet");
log.add(pc, cand(1));
log.add(pc, cand(2));
assert.equal(log.add(pc, cand(2)), false, "duplicate ignored");
assert.equal(log.add(pc, null), false);
assert.equal(log.add(pc, { candidate: "" }), false, "end-of-candidates marker ignored");

// Answer arrived while ICE is still checking: everything goes out again.
const r1 = log.takeReplay(pc);
assert.equal(r1.length, 2);
assert.equal(r1[0].usernameFragment, "uA");
assert.equal(typeof r1[0].toJSON, "undefined", "plain JSON for socket.io");

// Budget: at most MAX_ICE_REPLAYS per ICE session.
for (let i = 1; i < MAX_ICE_REPLAYS; i += 1) assert.equal(log.takeReplay(pc).length, 2);
assert.deepEqual(log.takeReplay(pc), [], "budget spent");

// ICE restart (new ufrag): fresh session and budget.
log.add(pc, cand(3, "uB"));
assert.deepEqual(log._state(), { ufrag: "uB", size: 1, replays: 0 });
assert.equal(log.takeReplay(pc).length, 1);

// Connected: no replay.
pc.iceConnectionState = "connected";
assert.deepEqual(log.takeReplay(pc), []);
assert.equal(isIceUp({ iceConnectionState: "completed" }), true);
assert.equal(isIceUp({ iceConnectionState: "checking", connectionState: "connected" }), true);
assert.equal(isIceUp({ iceConnectionState: "new" }), false);

// Another peer connection: its own log; the old pc gets nothing.
const pc2 = { iceConnectionState: "checking" };
log.add(pc2, cand(9, "uC"));
assert.deepEqual(log.takeReplay(pc), [], "stale pc");
assert.equal(log.takeReplay(pc2).length, 1);

// Plain objects without toJSON (react-native-like) and the cap.
const small = createLocalIceLog({ max: 2 });
const p3 = { iceConnectionState: "new" };
small.add(p3, { candidate: "candidate:1 1 udp 1 1.1.1.1 1 typ host", sdpMid: "0", sdpMLineIndex: 0 });
small.add(p3, { candidate: "candidate:2 1 udp 1 1.1.1.2 1 typ host", sdpMid: "0", sdpMLineIndex: 0 });
assert.equal(small.add(p3, { candidate: "candidate:3 1 udp 1 1.1.1.3 1 typ host", sdpMid: "0", sdpMLineIndex: 0 }), false, "capped");
assert.equal(small.takeReplay(p3).length, 2);

// useCall wiring: every gathered candidate is logged, replayed on the answer
// and when the peer asks for our state (native iOS engine right after answering).
const hook = readFileSync(new URL("../hooks/useCall.js", import.meta.url), "utf8");
assert.match(hook, /if \(e\.candidate\) localIceLogRef\.current\.add\(pc, e\.candidate\)/, "candidates logged before the socket check");
assert.match(hook, /flushIce\(pcRef\.current\);\s*\/\/[^\n]*\n[^\n]*\n\s*replayLocalIceRef\.current\?\.\("answer"\)/, "replayed after the answer");
assert.match(hook, /if \(requestState\) replayLocalIceRef\.current\?\.\("peer-ready"\)/, "replayed when the peer comes online");
// The native engine asks for our state right after its answer (that is the trigger).
const native = readFileSync(new URL("../../ios/App/App/DescallNativeCall.swift", import.meta.url), "utf8");
assert.match(native, /sendMediaState\(s, requestState: true\)/, "native engine requests state after answering");

console.log("localIceReplay.selftest ok");
