import assert from "node:assert/strict";
import {
  adoptLateScreenShare,
  classifyLiveKitTrack,
  looksLikeDisplayTrack,
  nextShareSelection,
  pickAnnouncedScreenTrack,
  screenAudioAlongside,
  screenShareStillLive,
  tracksAfterMerge,
  visibleScreenStream,
} from "./screenShareTracks.js";

assert.equal(classifyLiveKitTrack({ kind: "audio", source: "screen_share_audio" }), "screen");
assert.equal(classifyLiveKitTrack({ kind: "video", source: "screen_share" }), "screen");
assert.equal(classifyLiveKitTrack({ kind: "audio", source: "microphone" }), "mic");
assert.equal(classifyLiveKitTrack({ kind: "video", source: "camera" }), "camera");
assert.equal(classifyLiveKitTrack({ kind: "audio" }), "mic");
assert.equal(
  classifyLiveKitTrack({
    kind: "video",
    trackName: "descall-screen",
    announcement: { streamId: "other", videoMid: null, audioMid: null },
  }),
  "screen"
);
assert.equal(
  classifyLiveKitTrack({
    kind: "video",
    source: "camera",
    announcement: { streamId: "s", videoMid: "1", audioMid: null },
    streamId: "s",
  }),
  "camera"
);
assert.equal(classifyLiveKitTrack({ kind: "video", label: "", source: "" }), "camera");

const live = { getVideoTracks: () => [{ readyState: "live" }] };
const adopted = adoptLateScreenShare({ id: "u", cameraStream: live, cameraOn: true });
assert.equal(adopted.cameraStream, live);
assert.equal(adopted.screenStream, undefined);
assert.equal(adopted.cameraOn, true);
assert.equal(adopted.isScreenSharing, true);
const keptCamera = adoptLateScreenShare({ id: "u", cameraStream: live, cameraOn: true, cameraAnnounced: true });
assert.equal(keptCamera.cameraStream, live);
assert.equal(keptCamera.screenStream, undefined);
const keptScreen = adoptLateScreenShare({ id: "u", screenStream: live, cameraStream: { getVideoTracks: () => [{ readyState: "live" }] } });
assert.equal(keptScreen.screenStream, live);
assert.equal(keptScreen.cameraStream.getVideoTracks().length, 1);

const video = { kind: "video", readyState: "live" };
const audio = { kind: "audio", readyState: "live" };
const nextVideo = { kind: "video", readyState: "live" };
const merged = tracksAfterMerge(tracksAfterMerge([], video), audio);
assert.deepEqual(merged, [video, audio]);
assert.deepEqual(tracksAfterMerge(merged, nextVideo), [audio, nextVideo]);
assert.equal(screenShareStillLive({ getVideoTracks: () => [video] }), true);
assert.equal(screenShareStillLive({ getVideoTracks: () => [{ kind: "video", readyState: "ended" }] }), false);
assert.equal(screenShareStillLive(null), false);

const misfiled = { isScreenSharing: true, cameraStream: live, cameraOn: true };
assert.equal(visibleScreenStream(misfiled), null);
assert.equal(visibleScreenStream({ isScreenSharing: true, cameraStream: live, cameraAnnounced: true }), null);
assert.equal(visibleScreenStream({ isScreenSharing: false, cameraStream: live }), null);
assert.equal(visibleScreenStream({ screenStream: live, cameraStream: { getVideoTracks: () => [{ readyState: "live" }] } }), live);

const screenVideo = { kind: "video", readyState: "live", label: "", id: "sv" };
const cameraVideo = { kind: "video", readyState: "live", label: "Integrated Camera", id: "cv" };
const tabAudio = { kind: "audio", readyState: "live", id: "ta" };
const micAudio = { kind: "audio", readyState: "live", id: "mic" };
assert.equal(looksLikeDisplayTrack(screenVideo), false);
assert.equal(looksLikeDisplayTrack({ kind: "video", label: "screen:0:0", readyState: "live" }), true);
// Share-with-audio: the only video is the screen even though the stream has audio
// and the remote label is empty (Chrome receivers omit displaySurface).
assert.equal(pickAnnouncedScreenTrack([screenVideo], { cameraTracks: [] }), screenVideo);
assert.equal(
  pickAnnouncedScreenTrack([cameraVideo, screenVideo], { cameraTracks: [cameraVideo] }),
  screenVideo
);
assert.equal(
  pickAnnouncedScreenTrack([cameraVideo], { cameraTracks: [cameraVideo] }),
  null
);
const bundled = {
  getAudioTracks: () => [micAudio, tabAudio],
};
assert.deepEqual(screenAudioAlongside(bundled, { micTracks: [micAudio] }), [tabAudio]);

const first = nextShareSelection({ ids: ["a"], previousIds: [] });
assert.equal(first.activeId, "a");
const added = nextShareSelection({ ids: ["a", "b"], activeId: "a", previousIds: ["a"] });
assert.equal(added.activeId, "b");
assert.equal(added.pinnedId, null);
const pinned = nextShareSelection({ ids: ["a", "b"], activeId: "a", pinnedId: "a", previousIds: ["a"] });
assert.equal(pinned.activeId, "a");
assert.equal(pinned.pinnedId, "a");
const stopped = nextShareSelection({ ids: ["b"], activeId: "a", pinnedId: "a", previousIds: ["a", "b"] });
assert.equal(stopped.activeId, "b");
assert.equal(stopped.pinnedId, null);

const withAudio = { getVideoTracks: () => [screenVideo], getAudioTracks: () => [tabAudio] };
const adoptedAudio = adoptLateScreenShare({ cameraStream: withAudio, cameraOn: true });
assert.equal(adoptedAudio.isScreenSharing, true);
assert.equal(adoptedAudio.cameraStream, withAudio);
assert.equal(adoptedAudio.screenStream, undefined);

console.log("screenShareTracks.selftest ok");
