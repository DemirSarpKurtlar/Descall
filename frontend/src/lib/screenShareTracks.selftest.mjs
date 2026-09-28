import assert from "node:assert/strict";
import { adoptLateScreenShare, classifyLiveKitTrack, screenShareStillLive, tracksAfterMerge, visibleScreenStream } from "./screenShareTracks.js";

assert.equal(classifyLiveKitTrack({ kind: "audio", source: "screen_share_audio" }), "screen");
assert.equal(classifyLiveKitTrack({ kind: "video", source: "screen_share" }), "screen");
assert.equal(classifyLiveKitTrack({ kind: "audio", source: "microphone" }), "mic");
assert.equal(classifyLiveKitTrack({ kind: "video", source: "camera" }), "camera");
assert.equal(classifyLiveKitTrack({ kind: "audio" }), "mic");
assert.equal(classifyLiveKitTrack({ kind: "video", screenExpected: true }), "screen");
assert.equal(classifyLiveKitTrack({ kind: "video", source: "camera", screenExpected: true }), "camera");

const live = { getVideoTracks: () => [{ readyState: "live" }] };
const adopted = adoptLateScreenShare({ id: "u", cameraStream: live, cameraOn: true });
assert.equal(adopted.screenStream, live);
assert.equal(adopted.cameraStream, null);
assert.equal(adopted.cameraOn, false);
assert.equal(adopted.isScreenSharing, true);
const keptCamera = adoptLateScreenShare({ id: "u", cameraStream: live, cameraOn: true, cameraAnnounced: true });
assert.equal(keptCamera.cameraStream, live);
assert.equal(keptCamera.screenStream, undefined);
const keptScreen = adoptLateScreenShare({ id: "u", screenStream: live, cameraStream: { getVideoTracks: () => [{ readyState: "live" }] } });
assert.equal(keptScreen.screenStream, live);

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
assert.equal(visibleScreenStream(misfiled), live);
assert.equal(visibleScreenStream({ isScreenSharing: true, cameraStream: live, cameraAnnounced: true }), null);
assert.equal(visibleScreenStream({ isScreenSharing: false, cameraStream: live }), null);
assert.equal(visibleScreenStream({ screenStream: live, cameraStream: { getVideoTracks: () => [{ readyState: "live" }] } }), live);

console.log("screenShareTracks.selftest ok");
