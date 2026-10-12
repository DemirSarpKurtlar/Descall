import assert from "node:assert/strict";
import {
  LIVEKIT_SOURCE,
  ROLE_CAMERA,
  ROLE_SCREEN,
  TRACK_NAME,
  addDedicatedSender,
  announcementFromSenders,
  assertPublishRole,
  classifyInboundMedia,
  collectScreenAudioTrackIds,
  dropScreenEntries,
  guardDisplayCapture,
  layoutInboundEntries,
  liveKitScreenAudioPublishOptions,
  liveKitScreenVideoPublishOptions,
  mergeScreenAnnouncement,
  partitionInbound,
  playbackGains,
  sanitizeScreenAnnouncement,
  stopDedicatedSender,
  tagLocalTrack,
} from "./screenShareIdentity.js";
import { formatStressTable, runScreenShareStress } from "./screenShareStress.js";

assert.equal(
  classifyInboundMedia({ kind: "video", source: LIVEKIT_SOURCE.screen }),
  ROLE_SCREEN
);
assert.equal(
  classifyInboundMedia({ kind: "audio", source: LIVEKIT_SOURCE.screenAudio }),
  "screen-audio"
);
assert.equal(
  classifyInboundMedia({
    kind: "video",
    source: LIVEKIT_SOURCE.camera,
    announcement: { streamId: "s", videoMid: "1", audioMid: null },
    streamId: "s",
  }),
  ROLE_CAMERA,
  "camera source stays a camera even when the stream id collides"
);
assert.equal(
  classifyInboundMedia({
    kind: "video",
    trackName: TRACK_NAME.camera,
    announcement: { v: 1, streamId: "other", videoMid: "9", audioMid: null },
  }),
  ROLE_CAMERA
);
assert.equal(
  classifyInboundMedia({
    kind: "video",
    streamId: "screen-1",
    announcement: { streamId: "screen-1", videoMid: null, audioMid: null },
  }),
  ROLE_SCREEN
);
assert.equal(
  classifyInboundMedia({
    kind: "audio",
    streamId: "screen-1",
    announcement: { streamId: "screen-1", videoMid: "v", audioMid: "a" },
  }),
  "screen-audio"
);
const shareAudio = { id: "a-share", kind: "audio", readyState: "live" };
const micTrack = { id: "a-mic", kind: "audio", readyState: "live" };
const ids = collectScreenAudioTrackIds(
  [
    { track: shareAudio, kind: "audio", streamId: "screen-1" },
    { track: micTrack, kind: "audio", streamId: "cam" },
  ],
  { streamId: "screen-1", videoMid: "v", audioMid: "a" }
);
assert.equal(ids.has("a-share"), true);
assert.equal(ids.has("a-mic"), false);
assert.equal(
  classifyInboundMedia({
    kind: "video",
    streamId: "cam",
    label: "Integrated Camera",
    announcement: { streamId: "screen-1", videoMid: "v", audioMid: null },
  }),
  ROLE_CAMERA,
  "expecting a share does not steal the camera"
);
assert.equal(
  classifyInboundMedia({ kind: "video", displaySurface: "window", label: "Visual Studio Code" }),
  ROLE_SCREEN
);
assert.equal(
  classifyInboundMedia({ kind: "video", label: "Visual Studio Code" }),
  ROLE_CAMERA,
  "a window title alone is not a display capture"
);
assert.equal(classifyInboundMedia({ kind: "audio" }), "mic");

const camera = {
  kind: "video",
  label: "Integrated Camera",
  getSettings: () => ({ facingMode: "user" }),
};
tagLocalTrack(camera, ROLE_CAMERA);
assert.throws(() => assertPublishRole(camera, ROLE_SCREEN), /Refusing to publish/);

const display = {
  kind: "video",
  label: "Screen 1",
  getSettings: () => ({ displaySurface: "monitor" }),
  readyState: "live",
};
tagLocalTrack(display, ROLE_SCREEN);
assert.equal(assertPublishRole(display, ROLE_SCREEN), true);
assert.throws(() => assertPublishRole(display, ROLE_CAMERA), /Refusing to publish/);
const untaggedDisplay = {
  kind: "video",
  label: "Screen 1",
  getSettings: () => ({ displaySurface: "monitor" }),
};
assert.throws(() => assertPublishRole(untaggedDisplay, ROLE_CAMERA), /display capture/);

let stopped = 0;
const displayAudio = { kind: "audio", readyState: "live" };
const guarded = guardDisplayCapture({
  getVideoTracks: () => [display],
  getAudioTracks: () => [displayAudio],
});
assert.equal(displayAudio.__descallRole, "screen-audio");
assert.throws(
  () =>
    guardDisplayCapture({
      getVideoTracks: () => [camera],
      getAudioTracks: () => [],
      getTracks: () => [
        {
          stop() {
            stopped += 1;
          },
        },
      ],
    }),
  (err) => err.code === "SCREEN_SHARE_ROLE_MISMATCH" || err.code === "SCREEN_SHARE_CAMERA_REFUSED"
);

const videoOptions = liveKitScreenVideoPublishOptions();
const audioOptions = liveKitScreenAudioPublishOptions();
assert.equal(videoOptions.source, LIVEKIT_SOURCE.screen);
assert.equal(videoOptions.name, TRACK_NAME.screen);
assert.equal(audioOptions.source, LIVEKIT_SOURCE.screenAudio);
assert.equal(audioOptions.dtx, false);
assert.notEqual(videoOptions.source, audioOptions.source);

const gains = playbackGains({ micVolume: 1, screenVolume: 0.25 });
assert.equal(gains.mic, 1);
assert.equal(gains.screen, 0.25);
assert.deepEqual(playbackGains({ micVolume: 1, screenVolume: 0.25, deafened: true }), { mic: 0, screen: 0 });

const announcement = sanitizeScreenAnnouncement({
  streamId: "  stream-1 ",
  videoMid: "0",
  audioMid: "",
  extra: "nope",
});
assert.deepEqual(announcement, { v: 1, streamId: "stream-1", videoMid: "0", audioMid: null });
assert.equal(sanitizeScreenAnnouncement({ streamId: 12 }), null);
assert.deepEqual(
  mergeScreenAnnouncement({ streamId: "s", videoMid: null, audioMid: null }, { videoMid: "4" }),
  { v: 1, streamId: "s", videoMid: "4", audioMid: null }
);

const live = { id: "t", kind: "video", readyState: "live", label: "" };
const mic = { id: "m", kind: "audio", readyState: "live", label: "mic" };
const screenAudio = { id: "sa", kind: "audio", readyState: "live", label: "tab" };
const entries = [
  { track: live, kind: "video", streamId: "s", mid: "1", id: "t" },
  { track: screenAudio, kind: "audio", streamId: "s", mid: "2", id: "sa" },
  { track: mic, kind: "audio", streamId: "mic", mid: "3", id: "m" },
];
const parts = partitionInbound(entries, { streamId: "s", videoMid: "1", audioMid: "2" });
assert.deepEqual(parts.screen, [live, screenAudio]);
assert.deepEqual(parts.main, [mic]);
assert.equal(dropScreenEntries(entries, { streamId: "s", videoMid: "1", audioMid: "2" }).length, 1);

const senders = [];
const transceivers = [];
const pc = {
  addTransceiver(track) {
    const sender = { track };
    const transceiver = {
      sender,
      mid: transceivers.length === 0 ? "v" : "a",
      stopped: false,
      stop() {
        this.stopped = true;
      },
    };
    senders.push(sender);
    transceivers.push(transceiver);
    return transceiver;
  },
  getTransceivers() {
    return transceivers;
  },
};
const videoSender = addDedicatedSender(pc, { kind: "video" }, { id: "screen-stream" });
const audioSender = addDedicatedSender(pc, { kind: "audio" }, { id: "screen-stream" });
assert.equal(announcementFromSenders(pc, { id: "screen-stream" }, videoSender, audioSender).videoMid, "v");
stopDedicatedSender(pc, videoSender);
assert.equal(pc.getTransceivers()[0].stopped, true);

const layout = layoutInboundEntries(
  [
    { id: "cam", kind: "video", source: "camera", streamId: "c", hasAudio: false },
    { id: "scr", kind: "video", source: "screen_share", streamId: "s", hasAudio: true },
  ],
  { streamId: "s", videoMid: "v", audioMid: null }
);
assert.equal(layout.screen, "scr");
assert.equal(layout.camera, "cam");

const report = runScreenShareStress({ randomCount: 360, seed: 6440 });
assert.equal(report.after.failed, 0, `after failures: ${report.after.failures.join(", ")}`);
assert.equal(report.after.passRate, 1);
assert.equal(report.threeClient.pass, true, report.threeClient.failures.join(", "));
assert.equal(report.audioSeparated, true);
assert.equal(report.cameraRefused, true);
assert.equal(report.longShare?.pass, true);
assert.ok(report.before.passRate < 1, "legacy classifier should still fail the known bugs");
console.log(formatStressTable(report));
console.log("screenShareIdentity.selftest ok");
