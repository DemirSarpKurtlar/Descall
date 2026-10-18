// node src/lib/remoteAudioKeeper.selftest.mjs
import assert from "node:assert/strict";
import { createRemoteAudioKeeper, pickInboundAudio, inboundAudioVerdict, liveAudioTracks } from "./remoteAudioKeeper.js";

const track = (id, readyState = "live") => ({ id, kind: "audio", readyState });
const stream = (tracks) => ({ tracks, getAudioTracks: () => tracks });
function element() {
  const listeners = {};
  const el = {
    srcObject: null,
    muted: false,
    paused: true,
    plays: 0,
    assigns: 0,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    fire: (t) => (listeners[t] || []).forEach((fn) => fn({ type: t })),
    play() { this.plays += 1; this.paused = false; return Promise.resolve(); },
  };
  return new Proxy(el, {
    set(target, prop, value) {
      if (prop === "srcObject") target.assigns += 1;
      target[prop] = value;
      return true;
    },
  });
}

let tracks = [track("a")];
let deaf = false;
let active = true;
const el = element();
const timers = [];
const logs = [];
const k = createRemoteAudioKeeper({
  getElement: () => el,
  getTracks: () => tracks,
  isActive: () => active,
  isDeafened: () => deaf,
  makeStream: (t) => stream(t),
  setTimer: (fn) => { timers.push(fn); return timers.length; },
  clearTimer: () => {},
  log: (...a) => logs.push(a[0]),
});

// First attach sets srcObject once and plays.
assert.equal(k.attach("track"), "attached");
assert.equal(el.assigns, 1);
assert.equal(el.plays, 1);
// Same track set: no reassignment (the old overlay/hook flip-flop).
assert.equal(k.attach("overlay"), "unchanged");
assert.equal(k.attach("render"), "unchanged");
assert.equal(el.assigns, 1, "no srcObject flip-flop for an unchanged track set");
// A new track (renegotiation) reattaches.
tracks = [track("a"), track("b")];
assert.equal(k.attach("track"), "attached");
assert.equal(el.assigns, 2);
// Ended tracks are ignored; order does not matter.
tracks = [track("b"), track("a"), track("c", "ended")];
assert.equal(k.attach("x"), "unchanged");

// Paused by WebKit (interruption) → pause event resumes.
el.paused = true;
const before = el.plays;
el.fire("pause");
assert.equal(el.plays, before + 1);
// Watchdog: attach on a paused element kicks it.
el.paused = true;
k.start();
timers[0]();
assert.equal(el.paused, false);

// Rebind after CallKit didActivate / mic capture restart: fresh srcObject + play.
const assigns = el.assigns;
assert.equal(k.rebind("callkit-activated"), true);
assert.equal(el.assigns, assigns + 2, "null then a fresh stream");
assert.ok(el.srcObject.tracks.length === 2);

// Deafened: never unmuted, never kicked.
deaf = true;
el.paused = true;
k.attach("deaf");
assert.equal(el.muted, true);
const p = el.plays;
el.fire("pause");
assert.equal(el.plays, p, "no resume while deafened");
assert.equal(k.kick("x"), false);
deaf = false;
k.attach("undeaf");
assert.equal(el.muted, false);

// Call not active: events do nothing.
active = false;
el.paused = true;
const p2 = el.plays;
el.fire("pause");
assert.equal(el.plays, p2);
active = true;

// No tracks clears srcObject.
tracks = [];
assert.equal(k.attach("gone"), "cleared");
assert.equal(el.srcObject, null);
assert.equal(k.rebind("x"), false);

// No element yet (ontrack before the overlay mounted).
const k2 = createRemoteAudioKeeper({ getElement: () => null, getTracks: () => [track("z")] });
assert.equal(k2.attach("early"), "none");

assert.deepEqual(liveAudioTracks(stream([track("a"), track("b", "ended")])).map((t) => t.id), ["a"]);

// Stats helpers.
const report = new Map([
  ["1", { type: "inbound-rtp", kind: "video", packetsReceived: 900 }],
  ["2", { type: "inbound-rtp", kind: "audio", packetsReceived: 120, bytesReceived: 9000, audioLevel: 0.031234, totalSamplesReceived: 48000, concealedSamples: 10, jitter: 0.0042 }],
  ["3", { type: "outbound-rtp", kind: "audio", packetsSent: 5 }],
]);
const inbound = pickInboundAudio(report);
assert.equal(inbound.packetsReceived, 120);
assert.equal(inbound.audioLevel, 0.0312);
assert.equal(pickInboundAudio(new Map()), null);
assert.equal(inboundAudioVerdict({ inbound, elapsedMs: 100, hasElement: true, elementPaused: false }), "flowing");
assert.equal(inboundAudioVerdict({ inbound, elapsedMs: 100, hasElement: true, elementPaused: true }), "resume");
assert.equal(inboundAudioVerdict({ inbound: null, elapsedMs: 2000 }), "wait");
assert.equal(inboundAudioVerdict({ inbound: { packetsReceived: 0 }, elapsedMs: 9000 }), "missing");
console.log("remoteAudioKeeper selftest ok");
