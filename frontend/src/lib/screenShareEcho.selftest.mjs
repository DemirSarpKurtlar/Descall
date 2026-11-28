/**
 * 3.7.33: viewers heard their own voice inside a friend's screen share.
 * The share's system loopback contained Descall's own call playback.
 * Run: node frontend/src/lib/screenShareEcho.selftest.mjs
 */
import { buildDisplayMediaConstraints, captureScreenShareStream, _resetScreenShareNotices, SCREEN_AUDIO_VIDEO_ONLY_NOTICE } from "./webrtcScreenShare.js";

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

function setup({ selectOk = true, gdmFails = false, legacy = false, gdmAudio = true } = {}) {
  const calls = { gum: [], gdm: [], selected: [], notices: [] };
  _resetScreenShareNotices();
  globalThis.window = { electronAPI: { isElectron: true, getScreenSources: async () => [{ id: "screen:1:0", name: "S" }],
    ...(legacy ? {} : { selectDisplaySource: async (id) => { calls.selected.push(id); return selectOk; } }) } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Windows", mediaDevices: {
    getUserMedia: async (k) => { calls.gum.push(k); return fakeStream(k.audio !== false); },
    getDisplayMedia: async (k) => { calls.gdm.push(k); if (gdmFails) { const e = new Error("x"); e.name = "NotReadableError"; throw e; } return fakeStream(gdmAudio && k.audio !== false); },
  } } });
  return calls;
}
const notices = [];
const opts = { width: 1280, height: 720, fps: 30, pickSource: async (s) => s[0].id, notify: (m) => notices.push(m) };

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

// 4.2.1: Electron main answers { ok, audio } with its system-audio policy.
notices.length = 0;
calls = setup({ selectOk: { ok: true, audio: "exclude-self" } });
const s1 = await captureScreenShareStream(opts);
assert(calls.gdm.length === 1 && calls.gdm[0].audio.restrictOwnAudio === true, "exclude-self: system audio asked for");
assert(s1.getAudioTracks().length === 1 && notices.length === 0, "audio without Descall goes out, no notice");

notices.length = 0;
calls = setup({ selectOk: { ok: true, audio: "off" } });
const s2 = await captureScreenShareStream(opts);
assert(calls.gdm.length >= 1 && calls.gdm.every((k) => k.audio === false), "policy off (Windows < 2004, Linux): never ask for loopback");
assert(s2.getAudioTracks().length === 0, "video only");
assert(notices.length === 1 && notices[0] === SCREEN_AUDIO_VIDEO_ONLY_NOTICE, "the sharer is told it is video only");
await captureScreenShareStream(opts);
assert(notices.length === 1, "notice once per app run");

notices.length = 0;
calls = setup({ selectOk: { ok: true, audio: "exclude-self" }, gdmAudio: false });
await captureScreenShareStream(opts);
assert(notices.length === 1, "process loopback could not start (old macOS / Windows): notice, still no echo");

notices.length = 0;
calls = setup({ selectOk: true, gdmAudio: false });
await captureScreenShareStream(opts);
assert(notices.length === 0, "Tauri answers true and shows its own notices");

notices.length = 0;
calls = setup({ legacy: true });
await captureScreenShareStream(opts);
assert(calls.gum.length === 1 && calls.gum[0].audio === false, "no selectDisplaySource: never the whole-system desktop audio");
assert(notices.length === 1, "legacy shell: video-only notice");

console.log("screenShareEcho.selftest.mjs: ok");
