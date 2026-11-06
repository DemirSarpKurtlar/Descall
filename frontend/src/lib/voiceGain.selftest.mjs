// Playback boost (100–200 %): limited, not clipped.
// Before: source → gain → destination. At 150–200 % loud speech went past
// full scale and hard-clipped (crackle).
// Run from frontend/: node src/lib/voiceGain.selftest.mjs
import assert from "node:assert/strict";

const contexts = [];
class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.out = [];
    this.gain = { value: 1 };
    for (const p of ["threshold", "knee", "ratio", "attack", "release"]) this[p] = { value: null };
  }
  connect(node) {
    this.out.push(node);
    return node;
  }
}
class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.destination = new FakeNode("destination");
    this.closed = 0;
    contexts.push(this);
  }
  createMediaElementSource(el) {
    if (el.__sourced) throw Object.assign(new Error("already connected"), { name: "InvalidStateError" });
    el.__sourced = true;
    return new FakeNode("source");
  }
  createGain() { return new FakeNode("gain"); }
  createDynamicsCompressor() { return new FakeNode("compressor"); }
  resume() { this.state = "running"; return Promise.resolve(); }
  close() { this.state = "closed"; this.closed += 1; return Promise.resolve(); }
}
globalThis.window = { AudioContext: FakeAudioContext };

const { BOOST_LIMITER, __playbackGraph, applyPlaybackGain } = await import("./voiceGain.js");
const { __resetSinkRegistry } = await import("./callAudioDevices.js");
__resetSinkRegistry(() => {});

const element = () => ({ volume: 1, isConnected: true, srcObject: null });

// 1. Up to 100 %: plain element volume, no graph.
{
  const el = element();
  assert.equal(applyPlaybackGain(el, 0.5), 0.5);
  assert.equal(el.volume, 0.5);
  assert.equal(__playbackGraph(el), null);
  assert.equal(contexts.length, 0);
}

// 2. Boost: gain then a brick-wall limiter before the speakers.
{
  const el = element();
  assert.equal(applyPlaybackGain(el, 1.8), 1.8);
  const g = __playbackGraph(el);
  assert.ok(g, "graph built for a boost");
  assert.equal(el.volume, 1);
  assert.equal(g.gain.gain.value, 1.8);
  const source = g.gain; // gain node
  assert.equal(source.out[0], g.limiter, "gain feeds the limiter");
  assert.equal(g.limiter.kind, "compressor");
  assert.deepEqual(g.limiter.out, [g.ctx.destination], "only the limiter reaches the speakers");
  assert.ok(!source.out.includes(g.ctx.destination), "no unlimited path to the output");
  assert.equal(g.limiter.threshold.value, BOOST_LIMITER.threshold);
  assert.ok(BOOST_LIMITER.threshold < 0 && BOOST_LIMITER.threshold >= -3, "just under full scale");
  assert.ok(BOOST_LIMITER.ratio >= 20 && BOOST_LIMITER.knee === 0, "brick wall");
  assert.ok(BOOST_LIMITER.attack <= 0.005, "fast enough for speech peaks");

  // Later levels stay on the same graph (incl. back to 100 % and mute).
  applyPlaybackGain(el, 1);
  assert.equal(__playbackGraph(el), g);
  assert.equal(g.gain.gain.value, 1);
  applyPlaybackGain(el, 0);
  assert.equal(g.gain.gain.value, 0);
  assert.equal(applyPlaybackGain(el, 5), 2, "never above 200 %");
}

console.log("voiceGain selftest ok");
