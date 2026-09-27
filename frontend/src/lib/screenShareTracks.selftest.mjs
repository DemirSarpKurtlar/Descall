import assert from "node:assert/strict";
import { classifyLiveKitTrack, screenShareStillLive, tracksAfterMerge } from "./screenShareTracks.js";

assert.equal(classifyLiveKitTrack({ kind: "audio", source: "screen_share_audio" }), "screen");
assert.equal(classifyLiveKitTrack({ kind: "video", source: "screen_share" }), "screen");
assert.equal(classifyLiveKitTrack({ kind: "audio", source: "microphone" }), "mic");
assert.equal(classifyLiveKitTrack({ kind: "video", source: "camera" }), "camera");
assert.equal(classifyLiveKitTrack({ kind: "audio" }), "mic");

const video = { kind: "video", readyState: "live" };
const audio = { kind: "audio", readyState: "live" };
const nextVideo = { kind: "video", readyState: "live" };
const merged = tracksAfterMerge(tracksAfterMerge([], video), audio);
assert.deepEqual(merged, [video, audio]);
assert.deepEqual(tracksAfterMerge(merged, nextVideo), [audio, nextVideo]);
assert.equal(screenShareStillLive({ getVideoTracks: () => [video] }), true);
assert.equal(screenShareStillLive({ getVideoTracks: () => [{ kind: "video", readyState: "ended" }] }), false);
assert.equal(screenShareStillLive(null), false);

console.log("screenShareTracks.selftest ok");
