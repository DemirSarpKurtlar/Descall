// node src/lib/callTelemetry.selftest.mjs — 3.0.0 A0: call telemetry schema, privacy, offline queue,
// timeline phases and group / server voice summaries.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  sanitizeCallTelemetry,
  createCallTelemetrySender,
  CALL_TELEMETRY_NUMBER_FIELDS,
  CALL_TELEMETRY_STRING_FIELDS,
  CALL_TELEMETRY_BOOL_FIELDS,
  CALL_TELEMETRY_QUEUE_MAX,
} from "./callTelemetry.js";
import { createCallSetupTimeline } from "./callSetupTimeline.js";
import { createGroupCallTelemetry } from "./groupCallTelemetry.js";

const require = createRequire(import.meta.url);
const server = require("../../backend/lib/callTelemetry.js");

// Client and server share one schema.
assert.deepEqual([...server.NUMBER_FIELDS], [...CALL_TELEMETRY_NUMBER_FIELDS], "number fields in sync");
assert.deepEqual([...server.STRING_FIELDS], [...CALL_TELEMETRY_STRING_FIELDS], "string fields in sync");
assert.deepEqual([...server.BOOL_FIELDS], [...CALL_TELEMETRY_BOOL_FIELDS], "bool fields in sync");

// Privacy: ids, names, uuids, unknown keys never pass.
const dirty = {
  kind: "dm",
  direction: "incoming",
  result: "done",
  platform: "ios-app",
  pair: "relay/srflx",
  path: "native",
  callerId: "8d2e5c1a-0000-4000-8000-000000000001",
  userId: "u-1",
  callerName: "Ayşe",
  tokenError: "8d2e5c1a-0000-4000-8000-000000000001",
  entry: "Ayşe Yılmaz",
  gum: 412.6,
  mediaVerified: 1830.2,
  turn: true,
  queued: "yes",
};
for (const clean of [sanitizeCallTelemetry(dirty), server.sanitizeCallTelemetry(dirty)]) {
  assert.deepEqual(clean, {
    gum: 413,
    mediaVerified: 1830,
    kind: "dm",
    direction: "incoming",
    result: "done",
    platform: "ios-app",
    pair: "relay/srflx",
    path: "native",
    turn: true,
  });
  const text = JSON.stringify(clean);
  assert(!/8d2e5c1a|u-1|Ay/.test(text), "no id / name in " + text);
}
assert.equal(sanitizeCallTelemetry(null), null);
assert.equal(sanitizeCallTelemetry({ userId: "x" }), null);
assert.equal(server.sanitizeCallTelemetry({ gum: 1e12 }).gum, 600000, "numbers clamped");

// Offline queue: sessionStorage, max 10, flushed on connect.
const mem = new Map();
const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const emitted = [];
const sock = { connected: false, emit: (name, payload) => emitted.push([name, payload]) };
const sender = createCallTelemetrySender({ getSocket: () => sock, storage });
for (let i = 0; i < 12; i += 1) assert.equal(sender.send({ kind: "dm", gum: i }), false);
assert.equal(sender.pending(), CALL_TELEMETRY_QUEUE_MAX, "queue capped");
assert.equal(emitted.length, 0);
assert.equal(sender.flush(), 0, "no flush while offline");
sock.connected = true;
assert.equal(sender.flush(), 10);
assert.equal(sender.pending(), 0);
assert.deepEqual(emitted[0], ["call:telemetry", { gum: 2, kind: "dm", queued: true }], "oldest dropped, queued flag");
assert.equal(sender.send({ kind: "group", peers: 3, userId: "x" }), true);
assert.deepEqual(emitted.at(-1), ["call:telemetry", { peers: 3, kind: "group" }]);
assert(!/userId/.test(mem.get("descall:call-telemetry-queue") || ""), "queue holds no ids");

// DM timeline: split gum / ICE-config phases, meta tags, counters, media verified.
{
  let t = 0;
  const summaries = [];
  const tl = createCallSetupTimeline({ now: () => t, log: () => {}, onSummary: (s) => summaries.push(s) });
  tl.start("incoming", "voice", { entry: "callkit", push: "voip", path: "bogus" });
  tl.mark("iceCfgStart");
  tl.mark("gumStart");
  t = 120; tl.mark("iceCfgEnd");
  t = 300; tl.mark("gumEnd");
  t = 450; tl.mark("answerSent");
  tl.count("reneg");
  tl.count("reconnects");
  tl.count("reconnects");
  tl.count("nope");
  tl.setMeta({ entry: "notification" });
  t = 900; tl.mark("mediaVerified");
  tl.finish("done");
  const s = summaries[0];
  assert.equal(s.kind, "dm");
  assert.equal(s.path, "js", "invalid path ignored, default js");
  assert.equal(s.entry, "notification");
  assert.equal(s.push, "voip");
  assert.equal(s.iceCfgEnd - s.iceCfgStart, 120);
  assert.equal(s.gumEnd - s.gumStart, 300);
  assert.equal(s.mediaVerifiedMs, 450);
  assert.equal(s.reneg, 1);
  assert.equal(s.reconnects, 2);
  assert(sanitizeCallTelemetry(s), "summary passes the schema");
}

// watch(): mediaVerified needs packetsSent AND packetsReceived rising between samples.
{
  let t = 0;
  const summaries = [];
  const timers = [];
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  globalThis.setInterval = (fn) => (timers.push(fn), timers.length);
  globalThis.clearInterval = () => { timers.length = 0; };
  const samples = [
    { sent: 10, recv: 0, energy: 0 },
    { sent: 20, recv: 0, energy: 0 }, // outbound only: not verified
    { sent: 30, recv: 5, energy: 0 }, // both rising: verified (no energy yet)
    { sent: 40, recv: 9, energy: 0.2 }, // heard: summary sent
  ];
  let i = 0;
  const pc = {
    connectionState: "connected",
    iceConnectionState: "connected",
    async getStats() {
      const x = samples[Math.min(i++, samples.length - 1)];
      return new Map([
        ["o", { type: "outbound-rtp", kind: "audio", packetsSent: x.sent }],
        ["i", { type: "inbound-rtp", kind: "audio", packetsReceived: x.recv, totalAudioEnergy: x.energy }],
      ]);
    },
  };
  const tl = createCallSetupTimeline({ now: () => t, log: () => {}, onSummary: (s) => summaries.push(s) });
  tl.start("outgoing", "voice");
  tl.watch(pc);
  for (let k = 0; k < 4 && timers.length; k += 1) {
    t += 100;
    await timers[0]();
  }
  globalThis.setInterval = realSet;
  globalThis.clearInterval = realClear;
  assert.equal(summaries.length, 1, "finished once media verified + heard");
  assert.equal(summaries[0].mediaVerified, 300, "both counters rose between samples 2 and 3");
  assert.equal(summaries[0].heard, 400);
  assert.equal(summaries[0].in, 300);
}

// Group mesh + server voice summaries: counts only.
{
  let t = 0;
  const sent = [];
  const g = createGroupCallTelemetry({ now: () => t, send: (s) => sent.push(s), setTimer: () => 1, clearTimer: () => {} });
  g.begin("group", "incoming", "voice");
  g.mark("gumStart");
  t = 200; g.mark("gumEnd");
  t = 700; g.notePeer("peer-a", { sent: 12, received: 0 });
  g.notePeer("peer-b", { sent: 0, received: 0 });
  t = 950; g.notePeer("peer-a", { sent: 20, received: 4 });
  g.notePeer("peer-c", { sent: 3, received: 2 });
  const s = g.finish("ended");
  assert.equal(sent.length, 1);
  assert.equal(g.finish("ended"), null, "only once");
  assert.equal(s.kind, "group");
  assert.equal(s.peers, 3);
  assert.equal(s.peersAudio, 2);
  assert.equal(s.silentPeers, 1, "peer-b never got our audio");
  assert.equal(s.firstAudioMs, 950);
  const clean = sanitizeCallTelemetry(s);
  assert(!/peer-/.test(JSON.stringify(clean)), "peer keys never leave the device");

  const v = createGroupCallTelemetry({ now: () => t, send: (x) => sent.push(x), setTimer: () => 1, clearTimer: () => {} });
  t = 0;
  v.begin("server", "outgoing", "voice");
  t = 150; v.mark("gumEnd");
  t = 400; v.mark("tokenMs");
  t = 900; v.mark("lkConnectMs");
  v.set("media", "sfu");
  v.set("tokenError", "http-server");
  v.countReconnect();
  const vs = v.finish("ended");
  assert.equal(vs.kind, "server");
  assert.equal(vs.lkConnectMs, 900);
  assert.equal(vs.media, "sfu");
  assert.equal(sanitizeCallTelemetry(vs).tokenError, "http-server");
  assert.equal(vs.reconnects, 1);
}

console.log("callTelemetry selftest ok");
