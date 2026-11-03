/**
 * 3.7.33: viewers heard their own voice inside a friend's screen share.
 * The share's system loopback contained Descall's own call playback.
 * Run: node frontend/src/lib/screenShareEcho.selftest.mjs
 */
import { buildDisplayMediaConstraints, captureScreenShareStream } from "./webrtcScreenShare.js";

function assert(c, m) { if (!c) throw new Error(m); }

const c = buildDisplayMediaConstraints({ width: 1280, height: 720, fps: 30 });
assert(c.audio.restrictOwnAudio === true, "display audio excludes Descall's own playback");
assert(c.audio.suppressLocalAudioPlayback === false, "sharer still hears their own tab");

const fakeTrack = (kind) => ({ kind, label: kind === "video" ? "screen:0:0" : "System Audio", readyState: "live",
  getSettings: () => (kind === "video" ? { displaySurface: "monitor" } : {}), stop() {}, addEventListener() {} });
const fakeStream = (audio = true) => {
  const tracks = [fakeTrack("video"), ...(audio ? [fakeTrack("audio")] : [])];
  return { getTracks: () => tracks, getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"), removeTrack() {}, addTrack() {} };
};

function setup({ selectOk = true, gdmFails = false, legacy = false } = {}) {
  const calls = { gum: [], gdm: [], selected: [] };
  globalThis.window = { electronAPI: { isElectron: true, getScreenSources: async () => [{ id: "screen:1:0", name: "S" }],
    ...(legacy ? {} : { selectDisplaySource: async (id) => { calls.selected.push(id); return selectOk; } }) } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Windows", mediaDevices: {
    getUserMedia: async (k) => { calls.gum.push(k); return fakeStream(k.audio !== false); },
    getDisplayMedia: async (k) => { calls.gdm.push(k); if (gdmFails) { const e = new Error("x"); e.name = "NotReadableError"; throw e; } return fakeStream(true); },
  } } });
  return calls;
}
const opts = { width: 1280, height: 720, fps: 30, pickSource: async (s) => s[0].id };

let calls = setup();
await captureScreenShareStream(opts);
assert(calls.selected[0] === "screen:1:0", "picked source handed to main");
assert(calls.gdm.length === 1 && calls.gdm[0].audio.restrictOwnAudio === true, "Electron uses getDisplayMedia with restrictOwnAudio");
assert(calls.gum.length === 0, "no whole-system chromeMediaSource loopback");

calls = setup({ gdmFails: true });
await captureScreenShareStream(opts);
assert(calls.gum.length === 1 && calls.gum[0].audio === false, "fallback is video-only, never echoing loopback");

calls = setup({ selectOk: false });
await captureScreenShareStream(opts);
assert(calls.gdm.length === 0 && calls.gum.every((k) => k.audio === false), "rejected source id → video-only");

console.log("screenShareEcho.selftest.mjs: ok");
