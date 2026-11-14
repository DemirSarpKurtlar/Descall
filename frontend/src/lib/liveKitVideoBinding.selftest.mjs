// LiveKit adaptiveStream sees the server voice <video> elements. Run: node src/lib/liveKitVideoBinding.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bindLiveKitVideo,
  createVideoElementInfo,
  liveKitTrackFor,
  registerLiveKitVideoTrack,
  unregisterLiveKitVideoTrack,
} from "./liveKitVideoBinding.js";

// Fake observers driven by the test.
const ioInstances = [];
class FakeIO {
  constructor(cb) { this.cb = cb; this.targets = []; this.disconnected = false; ioInstances.push(this); }
  observe(el) { this.targets.push(el); }
  disconnect() { this.disconnected = true; }
  fire(isIntersecting) { this.cb(this.targets.map((target) => ({ target, isIntersecting }))); }
}
const roInstances = [];
class FakeRO {
  constructor(cb) { this.cb = cb; this.disconnected = false; roInstances.push(this); }
  observe() {}
  disconnect() { this.disconnected = true; }
  fire() { this.cb([]); }
}
const opts = { IntersectionObserverImpl: FakeIO, ResizeObserverImpl: FakeRO, now: () => 1000, doc: null };

// Minimal stand-in for livekit-client's RemoteVideoTrack adaptiveStream logic:
// visible = some element info visible; no element → not visible (paused).
function fakeLiveKitTrack() {
  return {
    infos: [],
    resizes: 0,
    observeElementInfo(info) {
      info.handleResize = () => { this.resizes += 1; };
      info.handleVisibilityChanged = () => {};
      this.infos.push(info);
      info.observe();
    },
    stopObservingElementInfo(info) {
      info.stopObserving();
      this.infos = this.infos.filter((i) => i !== info);
    },
    get visible() { return this.infos.some((i) => i.visible); },
  };
}
function fakeStream(tracks) {
  const listeners = {};
  return {
    tracks,
    getVideoTracks() { return this.tracks; },
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
    emit(type) { listeners[type]?.(); },
    listeners,
  };
}
const el = { clientWidth: 220, clientHeight: 165 };

// ElementInfo: visible until the observer says otherwise; reports size.
const info = createVideoElementInfo(el, opts);
assert.equal(info.visible, true);
assert.equal(info.width(), 220);
assert.equal(info.height(), 165);
let changes = 0;
info.handleVisibilityChanged = () => { changes += 1; };
info.observe();
const io = ioInstances.at(-1);
io.fire(false);
assert.equal(info.visible, false, "scrolled out of the grid → hidden");
assert.equal(info.visibilityChangedAt, 1000);
io.fire(true);
assert.equal(info.visible, true);
assert.equal(changes, 2);
info.stopObserving();
assert.equal(io.disconnected, true);

// Registry: only LiveKit tracks with observeElementInfo are kept.
const camTrack = { kind: "video", id: "cam" };
const lk = fakeLiveKitTrack();
registerLiveKitVideoTrack(camTrack, lk);
assert.equal(liveKitTrackFor(camTrack), lk);
registerLiveKitVideoTrack({ kind: "video" }, { attach() {} });
assert.equal(liveKitTrackFor({ kind: "video" }), null);

// bind: the element is reported, the stream is never touched, cleanup stops observing.
const stream = fakeStream([camTrack]);
const unbind = bindLiveKitVideo(el, stream, opts);
assert.equal(lk.infos.length, 1);
assert.equal(lk.visible, true, "a tile on screen keeps the camera flowing");
ioInstances.at(-1).fire(false);
assert.equal(lk.visible, false, "an off-screen tile lets the SFU pause it");
roInstances.at(-1).fire();
assert.equal(lk.resizes, 1, "tile size changes reach LiveKit (layer choice)");
assert.deepEqual(stream.tracks, [camTrack], "the shared MediaStream keeps its track");
unbind();
assert.equal(lk.infos.length, 0);
assert.equal(stream.listeners.addtrack, undefined);

// Screen share merged later: tracks added to the stream get bound too.
const screenTrack = { kind: "video", id: "screen" };
const lkScreen = fakeLiveKitTrack();
const merged = fakeStream([]);
const unbindScreen = bindLiveKitVideo(el, merged, opts);
assert.equal(lkScreen.infos.length, 0);
registerLiveKitVideoTrack(screenTrack, lkScreen);
merged.tracks.push(screenTrack);
merged.emit("addtrack");
assert.equal(lkScreen.infos.length, 1);
unbindScreen();
assert.equal(lkScreen.infos.length, 0);

// Mesh / local streams (nothing registered) and missing inputs: no-op.
assert.doesNotThrow(() => bindLiveKitVideo(el, fakeStream([{ kind: "video" }]), opts)());
assert.doesNotThrow(() => bindLiveKitVideo(null, stream, opts)());
assert.doesNotThrow(() => bindLiveKitVideo(el, null, opts)());
unregisterLiveKitVideoTrack(camTrack);
assert.equal(liveKitTrackFor(camTrack), null);

// Wiring: the hook registers subscribed video, the room keeps adaptiveStream, the panel binds its videos.
const hook = readFileSync(new URL("../hooks/useServerVoice.js", import.meta.url), "utf8");
assert.match(hook, /registerLiveKitVideoTrack\(mediaTrack, track\)/);
assert.match(hook, /unregisterLiveKitVideoTrack\(mediaTrack\)/);
const profile = readFileSync(new URL("./voiceProfile.js", import.meta.url), "utf8");
assert.match(profile, /adaptiveStream: true/);
const panel = readFileSync(new URL("../components/servers/ServerVoicePanel.jsx", import.meta.url), "utf8");
assert.ok((panel.match(/useLiveKitVideoBinding\(/g) || []).length >= 5, "tile, fullscreen tile, share card, stage, expanded stage");
assert.doesNotMatch(panel, /\.attach\(/, "attach() would unmute screen audio and strip shared streams");
const film = readFileSync(new URL("../components/voice/ShareFilmstrip.jsx", import.meta.url), "utf8");
assert.match(film, /bindLiveKitVideo\(ref\.current, stream\)/);

console.log("liveKitVideoBinding selftest: ok");
