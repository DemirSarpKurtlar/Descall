// Tests for desktop/app/shim/native-screen-share.js (node --test, no dependencies).
// - the ring offsets match desktop/crates/descall-capture/src/ring.rs;
// - the JS reader follows the seqlock rules (torn frames dropped, audio drained in order);
// - the page's constraints map to the start request;
// - a fake WebView2 + Tauri page runs lane L1 end to end (buffer, frames, audio, end);
// - lane L4 never returns audio that is not restricted to "everything but Descall".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SHIM = readFileSync(here("../../app/shim/native-screen-share.js"), "utf8");
const RING_RS = readFileSync(here("../../crates/descall-capture/src/ring.rs"), "utf8");

function load(globals = {}) {
  const ctx = vm.createContext({ console, URL, Blob, setTimeout, clearTimeout, setInterval, clearInterval, ...globals });
  vm.runInContext(SHIM, ctx);
  return ctx;
}

/* Minimal JS mirror of ring.rs RingWriter (layout v2). */
function makeRing({ maxW = 4, maxH = 4, vSlots = 3, aSlots = 64 } = {}) {
  const align = (v) => (v + 63) & ~63;
  const vSlotBytes = align(64 + (maxW * maxH * 3) / 2);
  const aSlotBytes = align(32 + 960 * 2 * 4);
  const vOff = 256;
  const aOff = vOff + vSlots * vSlotBytes;
  const total = aOff + aSlots * aSlotBytes;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const put32 = (o, v) => dv.setUint32(o, v, true);
  const put64 = (o, v) => dv.setBigUint64(o, BigInt(v), true);
  put32(0, 0x31435344); put32(4, 2); put32(8, vSlots); put32(12, vSlotBytes); put32(16, aSlots); put32(20, aSlotBytes);
  put32(24, vOff); put32(28, aOff); put32(56, 1); put32(60, 48000); put32(64, 2); put32(68, 1);
  let vSeq = 0; let aSeq = 0;
  return {
    buf, dv, vSlotBytes, vOff, aOff, aSlotBytes, vSlots, aSlots,
    video(w, h, fill, ts = 0) {
      const seq = ++vSeq; const slot = vOff + (seq % vSlots) * vSlotBytes; const len = (w * h * 3) / 2;
      put64(slot, seq); u8.fill(fill, slot + 64, slot + 64 + len);
      put64(slot + 16, ts); put32(slot + 24, w); put32(slot + 28, h); put32(slot + 32, w); put32(slot + 36, w * h); put32(slot + 40, len);
      put64(slot + 8, seq); put64(32, seq); return seq;
    },
    audio(value, ts = 0, frames = 480) {
      const seq = ++aSeq; const slot = aOff + (seq % aSlots) * aSlotBytes;
      put64(slot, seq); new Float32Array(buf, slot + 32, frames * 2).fill(value);
      put64(slot + 16, ts); put32(slot + 24, frames); put32(slot + 28, 0); put64(slot + 8, seq); put64(40, seq); return seq;
    },
    end() { put32(68, 2); },
  };
}

test("ring offsets match ring.rs", () => {
  const { OFF, RING_VERSION } = load().__descallNativeShareInternals;
  const mod = RING_RS.slice(RING_RS.indexOf("pub mod off {"), RING_RS.indexOf("}", RING_RS.indexOf("pub mod off {")));
  const rust = Object.fromEntries([...mod.matchAll(/pub const (\w+): usize = (\d+);/g)].map((m) => [m[1], Number(m[2])]));
  assert.ok(Object.keys(rust).length > 30);
  assert.deepEqual({ ...OFF }, rust);
  assert.equal(RING_VERSION, Number(/pub const VERSION: u32 = (\d+);/.exec(RING_RS)[1]));
});

test("video seqlock: complete frames read, torn and stale dropped", () => {
  const { RingReader } = load().__descallNativeShareInternals;
  const r = makeRing();
  const reader = new RingReader(r.buf);
  const s1 = r.video(4, 4, 7, 1000);
  const copy = (bytes, m) => ({ bytes: Array.from(bytes), ...m });
  const f = reader.readVideo(s1, copy);
  assert.equal(f.width, 4); assert.equal(f.timestamp, 1000); assert.equal(f.bytes.length, 24); assert.equal(f.bytes[0], 7);
  // A writer that starts seq 4 in the same slot while we copy -> dropped.
  let dropped = 0;
  const torn = reader.readVideo(s1, (b, m) => { r.dv.setBigUint64(r.vOff + (1 % 3) * r.vSlotBytes, 4n, true); return copy(b, m); }, () => { dropped += 1; });
  assert.equal(torn, null); assert.equal(dropped, 1);
  for (let i = 0; i < 5; i += 1) r.video(2, 2, i);
  assert.equal(reader.readVideo(2, copy), null, "slot reused");
  assert.equal(reader.readVideo(0, copy), null);
  assert.throws(() => new RingReader(new ArrayBuffer(100)));
});

test("audio drains in order and skips what was overwritten", () => {
  const { RingReader } = load().__descallNativeShareInternals;
  const r = makeRing();
  const reader = new RingReader(r.buf);
  for (let i = 0; i < 5; i += 1) r.audio(i, i * 10000);
  let { packets, last } = reader.readAudioSince(0);
  assert.deepEqual(Array.from(packets, (p) => p.seq), [1, 2, 3, 4, 5]);
  assert.equal(packets[3].samples[0], 3); assert.equal(packets[3].samples.length, 960); assert.equal(last, 5);
  for (let i = 0; i < 200; i += 1) r.audio(0.5);
  ({ packets, last } = reader.readAudioSince(5));
  assert.equal(last, 205); assert.equal(packets.length, 63); assert.equal(packets[0].seq, 143);
});

test("page constraints map to the start request", () => {
  const { buildRequest, pickLane, parseWake } = load().__descallNativeShareInternals;
  // Shape of buildDisplayMediaConstraints() in frontend/src/lib/webrtcScreenShare.js.
  const page = { video: { cursor: "motion", frameRate: { ideal: 60, max: 60 }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: { restrictOwnAudio: true, echoCancellation: false } };
  assert.deepEqual({ ...buildRequest("screen:0:0", page) }, { sourceId: "screen:0:0", width: 2560, height: 1440, fps: 60, contentHint: undefined, cursor: true, audio: true });
  const r = buildRequest("window:5:0", { video: { cursor: "never" }, audio: false });
  assert.equal(r.cursor, false); assert.equal(r.audio, false); assert.equal(r.fps, undefined);
  assert.equal(buildRequest("screen:0:0", { video: true, audio: true }).audio, true);
  assert.equal(pickLane({ nativeOk: true, hasMstg: true, wantsAudio: true, audioOk: true }), "L1");
  assert.equal(pickLane({ nativeOk: true, hasMstg: true, wantsAudio: true, audioOk: false }), "L2");
  assert.equal(pickLane({ nativeOk: true, hasMstg: false, wantsAudio: true, audioOk: true }), "L3");
  assert.equal(pickLane({ nativeOk: false }), "L4");
  assert.deepEqual({ ...parseWake("descall-share:7:end:source-closed") }, { id: 7, kind: "end", arg: "source-closed" });
  assert.equal(parseWake("other"), null); assert.equal(parseWake("descall-share:x:v:1"), null);
});

/* ---- a fake WebView2 page */

class FakeTarget {
  constructor() { this.l = {}; }
  addEventListener(t, f) { (this.l[t] ||= []).push(f); }
  removeEventListener() {}
  dispatchEvent(e) { (this.l[e.type] || []).forEach((f) => f(e)); if (this["on" + e.type]) this["on" + e.type](e); return true; }
}

function fakePage({ startInfo, restrictOwnAudio = false, gdmAudioSettings = {} } = {}) {
  const calls = [];
  const webview = new FakeTarget();
  const written = { video: [], audio: [] };
  class Track extends FakeTarget {
    constructor(kind) { super(); this.kind = kind; this.readyState = "live"; this.contentHint = ""; }
    stop() { this.readyState = "ended"; }
    getSettings() { return this.kind === "audio" ? gdmAudioSettings : {}; }
  }
  class MediaStreamTrackGenerator extends Track {
    constructor({ kind }) {
      super(kind);
      this.writable = { getWriter: () => ({ desiredSize: 1, write: async (x) => { written[kind].push(x); }, close: () => { this.closed = true; } }) };
    }
  }
  class MediaStream { constructor(t) { this.t = t; } getTracks() { return this.t; } getAudioTracks() { return this.t.filter((x) => x.kind === "audio"); } getVideoTracks() { return this.t.filter((x) => x.kind === "video"); } removeTrack(x) { this.t = this.t.filter((y) => y !== x); } }
  class VideoFrame { constructor(bytes, init) { this.bytes = Uint8Array.from(bytes); this.codedWidth = init.codedWidth; this.codedHeight = init.codedHeight; this.init = init; } close() { this.closedFrame = true; } }
  class AudioData { constructor(init) { this.init = init; } close() {} }
  const ring = makeRing({ maxW: 4, maxH: 4 });
  const invoke = async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === "screen_share_start") {
      setTimeout(() => webview.dispatchEvent({ type: "sharedbufferreceived", additionalData: { descallShare: startInfo.id }, getBuffer: () => ring.buf }), 5);
      return startInfo;
    }
    if (cmd === "screen_share_stats") return { blackStreak: 0 };
    return null;
  };
  const original = async (c) => { calls.push(["original", c]); return new MediaStream([new Track("video"), new Track("audio")]); };
  const doc = { documentElement: { lang: "tr" }, images: [], body: { appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {} }) };
  const window = new FakeTarget();
  Object.assign(window, {
    __TAURI__: { core: { invoke } }, chrome: { webview }, MediaStreamTrackGenerator, VideoFrame,
  });
  window.top = window;
  const ctx = load({
    window, document: doc, navigator: { language: "tr-TR", mediaDevices: { getDisplayMedia: original, getSupportedConstraints: () => ({ restrictOwnAudio }) } },
    MediaStreamTrackGenerator, MediaStream, VideoFrame, AudioData, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } }, Event: class { constructor(t) { this.type = t; } },
    requestAnimationFrame: (f) => f(),
  });
  return { ctx, window, webview, ring, calls, written };
}

const START = { id: 3, bytes: 0, width: 1920, height: 1080, fps: 60, displaySurface: "window", hdr: false, cursor: true, audio: true, audioError: null, echoRisk: false, lane: "L1" };

test("lane L1 end to end: picker id -> native tracks -> frames -> source closed", async () => {
  const p = fakePage({ startInfo: START });
  const api = p.window.__descallNativeShare;
  assert.ok(api.supported);
  assert.equal(await api.select("window:123:0"), true);
  const stream = await p.ctx.navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60 } }, audio: { restrictOwnAudio: true } });
  assert.equal(p.calls.find((c) => c[0] === "screen_share_start")[1].req.sourceId, "window:123:0");
  const [v] = stream.getVideoTracks();
  const [a] = stream.getAudioTracks();
  assert.equal(v.getSettings().displaySurface, "window");
  assert.equal(a.getSettings().restrictOwnAudio, true);
  assert.equal(api.lane, "L1");

  const seq = p.ring.video(4, 4, 9, 5000);
  p.webview.dispatchEvent({ type: "message", data: `descall-share:3:v:${seq}` });
  assert.equal(p.written.video.length, 1);
  assert.equal(p.written.video[0].init.format, "NV12");
  assert.equal(p.written.video[0].init.timestamp, 5000);
  assert.equal(p.written.video[0].bytes[0], 9);
  p.ring.audio(0.25, 100); p.ring.audio(0.25, 10100);
  p.webview.dispatchEvent({ type: "message", data: "descall-share:3:a:2" });
  assert.equal(p.written.audio.length, 2);
  assert.equal(p.written.audio[1].init.timestamp, 10100);

  let ended = 0;
  v.addEventListener("ended", () => { ended += 1; });
  p.webview.dispatchEvent({ type: "message", data: "descall-share:3:end:source-closed" });
  assert.equal(v.readyState, "ended");
  assert.equal(ended, 1);
  assert.ok(!p.calls.some((c) => c[0] === "screen_share_stop"), "host already stopped it");
});

test("lane L2: no loopback -> video only, user told", async () => {
  const p = fakePage({ startInfo: { ...START, audio: false, audioError: "process loopback needs Windows 10 2004", lane: "L2" } });
  await p.window.__descallNativeShare.select("screen:0:0");
  const stream = await p.ctx.navigator.mediaDevices.getDisplayMedia({ video: {}, audio: true });
  assert.equal(stream.getAudioTracks().length, 0);
  assert.equal(p.window.__descallNativeShare.lane, "L2");
  // The page stopping the track stops the native share.
  stream.getVideoTracks()[0].stop();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(p.calls.some((c) => c[0] === "screen_share_stop"));
});

test("lane L4: no restrictOwnAudio support -> no audio requested at all", async () => {
  const p = fakePage({ startInfo: START, restrictOwnAudio: false });
  const stream = await p.ctx.navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  const orig = p.calls.find((c) => c[0] === "original")[1];
  assert.equal(orig.audio, false);
  assert.equal(p.window.__descallNativeShare.lane, "L4");
  void stream;
});

test("lane L4: audio kept only when restrictOwnAudio is really applied", async () => {
  const notApplied = fakePage({ startInfo: START, restrictOwnAudio: true, gdmAudioSettings: {} });
  let s = await notApplied.ctx.navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  assert.equal(notApplied.calls.find((c) => c[0] === "original")[1].audio.restrictOwnAudio, true);
  assert.equal(s.getAudioTracks().length, 0, "unrestricted loopback dropped");
  const applied = fakePage({ startInfo: START, restrictOwnAudio: true, gdmAudioSettings: { restrictOwnAudio: true } });
  s = await applied.ctx.navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  assert.equal(s.getAudioTracks().length, 1);
});

test("a failing native start falls back to L4 for the same call", async () => {
  const p = fakePage({ startInfo: START });
  p.window.__TAURI__.core.invoke = async (cmd) => { if (cmd === "screen_share_start") throw new Error("WGC unsupported"); return null; };
  await p.window.__descallNativeShare.select("screen:0:0");
  const warn = console.warn; console.warn = () => {};
  try { await p.ctx.navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); } finally { console.warn = warn; }
  assert.ok(p.calls.some((c) => c[0] === "original"));
  assert.equal(p.window.__descallNativeShare.lane, "L4");
});
