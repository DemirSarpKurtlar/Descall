// node src/lib/ringLoop.selftest.mjs — calls-01: the call rings loop gaplessly
// through Web Audio and each ring file is one full cycle (phrase + rest).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { RING_CYCLE_S, _resetRingLoopCacheForTests, startRingLoop, webRingSupported } from "./ringLoop.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i += 1) await tick(); };

function makeCtor({ startState = "suspended", resumes = true, sinkLog = [] } = {}) {
  const made = [];
  class FakeCtx {
    constructor() {
      this.state = startState;
      this.closed = false;
      this.sources = [];
      this.destination = { id: "dest" };
      made.push(this);
    }
    resume() { if (resumes) this.state = "running"; return Promise.resolve(); }
    close() { this.closed = true; this.state = "closed"; return Promise.resolve(); }
    setSinkId(id) { sinkLog.push(id); return Promise.resolve(); }
    decodeAudioData(bytes) { return Promise.resolve({ duration: 4, bytes }); }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    createBufferSource() {
      const s = { loop: false, started: false, stopped: false, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
      this.sources.push(s);
      return s;
    }
  }
  return { Ctor: FakeCtx, made };
}
const okFetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
const timers = { setTimer: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimer: (id) => clearTimeout(id) };

// 1) Plays: one looping buffer source, routed to the sink, gain = volume.
{
  _resetRingLoopCacheForTests();
  const sinkLog = [];
  const { Ctor, made } = makeCtor({ sinkLog });
  let started = 0, failed = null;
  const ring = startRingLoop({ url: "/sounds/outgoing-call.mp3", volume: 0.4, sinkId: "headset", Ctor, fetchImpl: okFetch, onStart: () => { started += 1; }, onFail: (r) => { failed = r; }, ...timers });
  await settle();
  assert.equal(failed, null);
  assert.equal(started, 1);
  assert.equal(made.length, 1);
  assert.equal(made[0].sources.length, 1);
  assert.equal(made[0].sources[0].loop, true, "gapless: the buffer source loops, not the element");
  assert.equal(made[0].sources[0].started, true);
  assert.deepEqual(sinkLog, ["headset"]);
  assert.equal(ring.playing, true);
  // routeToSink() moves it like a media element.
  await ring.setSinkId("speakers");
  assert.deepEqual(sinkLog, ["headset", "speakers"]);
  ring.stop();
  assert.equal(made[0].sources[0].stopped, true);
  assert.equal(made[0].closed, true, "the ring's context is closed on stop (no idle audio service)");
  assert.equal(ring.playing, false);
}

// 2) Context never starts (autoplay policy) → onFail once, context closed, nothing plays.
{
  _resetRingLoopCacheForTests();
  const { Ctor, made } = makeCtor({ resumes: false });
  const reasons = [];
  startRingLoop({ url: "/sounds/incoming-call.mp3", Ctor, fetchImpl: okFetch, onFail: (r) => reasons.push(r), ...timers });
  await new Promise((r) => setTimeout(r, 30));
  await settle();
  assert.deepEqual(reasons, ["suspended"]);
  assert.equal(made[0].closed, true);
  assert.equal(made[0].sources.length, 0);
}

// 3) File cannot be fetched (Electron file:// etc.) → onFail("decode").
{
  _resetRingLoopCacheForTests();
  const { Ctor } = makeCtor();
  const reasons = [];
  startRingLoop({ url: "sounds/outgoing-call.mp3", Ctor, fetchImpl: () => Promise.reject(new Error("nope")), onFail: (r) => reasons.push(r), ...timers });
  await settle();
  assert.deepEqual(reasons, ["decode"]);
}

// 4) Answered at once: stop() before the file is decoded → never starts, no fallback.
{
  _resetRingLoopCacheForTests();
  const { Ctor, made } = makeCtor();
  const reasons = [];
  let release;
  const slowFetch = () => new Promise((r) => { release = () => r({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }); });
  const ring = startRingLoop({ url: "/sounds/outgoing-call.mp3", Ctor, fetchImpl: slowFetch, onFail: (r) => reasons.push(r), ...timers });
  await tick();
  ring.stop();
  release();
  await settle();
  assert.deepEqual(reasons, []);
  assert.equal(made[0].sources.length, 0);
  assert.equal(made[0].closed, true);
}

// 5) No Web Audio / native iOS → element path.
assert.equal(webRingSupported({ Ctor: null, nativeIos: false }), false);
assert.equal(webRingSupported({ Ctor: function A() {}, nativeIos: true }), false);
assert.equal(webRingSupported({ Ctor: function A() {}, nativeIos: false }), true);
{
  const reasons = [];
  startRingLoop({ url: "/x.mp3", Ctor: null, fetchImpl: okFetch, onFail: (r) => reasons.push(r) });
  await settle();
  assert.deepEqual(reasons, ["unsupported"]);
}

// 6) The shipped files are one full ring cycle each (128 kb/s CBR → duration from size),
//    not the old 2.0 s slice cut mid-phrase. Regenerate with scripts/generate_ring_sounds.py.
for (const [type, file] of [["outgoingCall", "outgoing-call.mp3"], ["incomingCall", "incoming-call.mp3"]]) {
  const p = path.join(here, "../../public/sounds", file);
  const seconds = (statSync(p).size * 8) / 128_000;
  assert.ok(Math.abs(seconds - RING_CYCLE_S[type]) < 0.2, `${file}: ${seconds.toFixed(2)} s, expected ${RING_CYCLE_S[type]} s`);
  assert.ok(RING_CYCLE_S[type] >= 3, `${file}: a ring cycle needs a rest after the phrase`);
}
const gen = readFileSync(path.join(here, "../../scripts/generate_ring_sounds.py"), "utf8");
assert.match(gen, /np\.zeros\(int\(SR \* 4\.0\)\)/, "generator ringback cycle matches RING_CYCLE_S.outgoingCall");
assert.match(gen, /np\.zeros\(int\(SR \* 3\.0\)\)/, "generator ringtone cycle matches RING_CYCLE_S.incomingCall");
assert.match(gen, /must end in silence/);

console.log("ringLoop.selftest OK");
