/**
 * Lightweight regression checks for group screen-share classification / glare helpers.
 * Run: node frontend/src/lib/webrtcScreenShare.selftest.mjs
 */
import {
  isRemoteScreenVideoTrack,
  buildDisplayMediaConstraints,
} from "./webrtcScreenShare.js";
import { applyRemoteOffer, isPolitePeer } from "./webrtcNegotiation.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const videoScreen = { kind: "video", label: "screen:0:0" };
const videoCam = { kind: "video", label: "Integrated Camera" };

assert(isRemoteScreenVideoTrack(videoScreen, {}), "screen label");
assert(!isRemoteScreenVideoTrack(videoCam, {}), "camera not screen by default");
assert(
  isRemoteScreenVideoTrack(
    { kind: "video", label: "Visual Studio Code", getSettings: () => ({ displaySurface: "window" }) },
    {}
  ),
  "displaySurface marks a window capture"
);
assert(
  isRemoteScreenVideoTrack(videoCam, { peerExpectsScreen: true }),
  "expectScreenShare"
);
assert(
  !isRemoteScreenVideoTrack(videoCam, { rawStream: null }),
  "missing rawStream must not imply screen"
);

const main = {
  id: "main",
  getVideoTracks: () => [videoCam],
  getAudioTracks: () => [{ kind: "audio" }],
};
const micOnly = {
  id: "mic",
  getVideoTracks: () => [],
  getAudioTracks: () => [{ kind: "audio" }],
};
const cameraMs = {
  id: "cam",
  getVideoTracks: () => [videoCam],
  getAudioTracks: () => [],
};
const screenMs = {
  id: "screen",
  getVideoTracks: () => [videoScreen],
  getAudioTracks: () => [],
};
assert(
  !isRemoteScreenVideoTrack(videoCam, {
    rawStream: cameraMs,
    mainRemoteStream: micOnly,
  }),
  "camera on its own stream is not a screen"
);
assert(
  isRemoteScreenVideoTrack(videoScreen, {
    rawStream: screenMs,
    mainRemoteStream: main,
  }),
  "screen label still wins on a distinct stream"
);
assert(
  isRemoteScreenVideoTrack(
    { kind: "video", label: "FaceTime", getSettings: () => ({ displaySurface: "monitor" }) },
    { rawStream: cameraMs, mainRemoteStream: micOnly }
  ),
  "displaySurface marks a capture"
);

assert(isPolitePeer("a", "b") === true, "polite lower id");
assert(isPolitePeer("b", "a") === false, "impolite higher id");

const constraints = buildDisplayMediaConstraints({ width: 1280, height: 720, fps: 20 });
assert(!("displaySurface" in (constraints.video || {})), "desktop default omits displaySurface (full picker)");
assert(constraints.preferCurrentTab === false, "preferCurrentTab false (survives background)");
assert(!("max" in (constraints.video.width || {})), "no hard max width");
assert(constraints.audio && typeof constraints.audio === "object", "request display audio constraints");
assert(constraints.systemAudio === "include", "allow system audio selection");

const tabFirst = buildDisplayMediaConstraints({
  width: 1280,
  height: 720,
  fps: 20,
  preferTab: true,
});
assert(tabFirst.video.displaySurface === "browser", "preferTab true → browser");

const monitorFirst = buildDisplayMediaConstraints({
  width: 1280,
  height: 720,
  fps: 20,
  preferTab: false,
});
assert(!("displaySurface" in (monitorFirst.video || {})), "preferTab false → omit surface (full picker)");
assert(monitorFirst.preferCurrentTab === false, "never lock current tab");

console.log("webrtcScreenShare.selftest.mjs: ok");
