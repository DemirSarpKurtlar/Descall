// Screen-share audio level (DM, group, server voice).
// Before: deafen did not silence a received share (you heard the stream
// while deafened), every volume tick rebound the stream (srcObject null and
// back: a dropout per slider step), and each render wrapped track.onunmute
// again. One shared sink now: components/call/RemoteScreenAudioSink.jsx.
// Run from frontend/: node src/lib/screenAudioLevel.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { liveAudioTrackKey, screenAudioGain } from "./screenAudioLevel.js";

// 1. Level.
assert.equal(screenAudioGain({ volume: 100 }), 1);
assert.equal(screenAudioGain({ volume: 50 }), 0.5);
assert.equal(screenAudioGain({ volume: 180 }), 1.8, "boost kept (limited in voiceGain)");
assert.equal(screenAudioGain({ volume: 500 }), 2);
assert.equal(screenAudioGain({ volume: -5 }), 0);
assert.equal(screenAudioGain({ volume: 0 }), 0);
assert.equal(screenAudioGain({ volume: 100, deafened: true }), 0, "deafen silences the share");
assert.equal(screenAudioGain({ volume: 180, deafened: true }), 0);
assert.equal(screenAudioGain(), 1);

// 2. Track key: changes only when the live audio track set changes.
const track = (id, readyState = "live") => ({ id, readyState });
const stream = (...tracks) => ({ getAudioTracks: () => tracks });
assert.equal(liveAudioTrackKey(null), "");
assert.equal(liveAudioTrackKey(stream()), "");
assert.equal(liveAudioTrackKey(stream(track("b"), track("a"))), "a,b", "order does not matter");
assert.equal(liveAudioTrackKey(stream(track("a"), track("b", "ended"))), "a", "ended tracks do not count");

// 3. The sink component.
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const sink = read("../components/call/RemoteScreenAudioSink.jsx");
const bind = sink.slice(sink.indexOf("// Stream binding"), sink.indexOf("// Level:"));
const level = sink.slice(sink.indexOf("// Level:"), sink.indexOf("return <audio"));
assert.match(bind, /\}, \[stream, trackKey\]\);/, "rebinds only on a new stream / track set");
assert.doesNotMatch(bind, /volume|deafened/, "volume and deafen never rebind the stream");
assert.match(bind, /addEventListener\?\.\("unmute", play\)/);
assert.match(bind, /removeEventListener\?\.\("unmute", play\)/, "unmute listener removed, no growing chain");
assert.doesNotMatch(sink, /\.onunmute\s*=/);
assert.match(level, /screenAudioGain\(\{ volume, deafened \}\)/);
assert.match(level, /el\.muted = Boolean\(deafened\)/);
assert.doesNotMatch(level, /srcObject/);

// 4. Both call surfaces use it and pass deafen.
const overlay = read("../components/CallOverlay.jsx");
assert.doesNotMatch(overlay, /function RemoteScreenAudioSink/, "no second copy");
const durable = overlay.slice(overlay.indexOf("const durableScreenAudio = "), overlay.indexOf("Incoming DM: FaceTime-style"));
assert.match(durable, /deafened=\{Boolean\(deafened\)\}/);
const panel = read("../components/servers/ServerVoicePanel.jsx");
assert.doesNotMatch(panel, /function RemoteScreenAudioSink/);
assert.match(panel, /deafened=\{deafened\}/);
assert.match(panel, /deafened=\{Boolean\(serverVoice\?\.deafened \|\| serverVoice\?\.serverDeafened\)\}/);

console.log("screenAudioLevel selftest ok");
