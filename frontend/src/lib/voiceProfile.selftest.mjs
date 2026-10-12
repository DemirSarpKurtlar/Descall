import assert from "node:assert/strict";
import {
  audioBitrateForQuality,
  clampGain,
  jitterBufferTargetSeconds,
  matchPushToTalkEvent,
  opusFmtp,
  micRecapturePlan,
  networkQualityTooltipKey,
  shouldRecaptureMic,
  softCueVolume,
  speakingThreshold,
  tuneOpusSdp,
} from "./voiceProfile.js";

assert.equal(audioBitrateForQuality("excellent"), 64_000);
assert.equal(audioBitrateForQuality("good"), 48_000);
assert.equal(audioBitrateForQuality("fair"), 32_000);
assert.equal(audioBitrateForQuality("poor"), 24_000);
assert.equal(audioBitrateForQuality("good", { music: true }), 96_000);

assert.equal(jitterBufferTargetSeconds("good"), 0.05);
assert.equal(jitterBufferTargetSeconds("fair"), 0.1);
assert.equal(jitterBufferTargetSeconds("poor"), 0.16);

assert.ok(speakingThreshold(100) < speakingThreshold(0));
assert.ok(speakingThreshold(45) > 0.03 && speakingThreshold(45) < 0.05);

assert.equal(clampGain(3), 2);
assert.equal(clampGain(-1), 0);
assert.equal(clampGain(1.5), 1.5);

const fmtp = opusFmtp({ maxAverageBitrate: 48000, stereo: false, dtx: true, fec: true });
assert.match(fmtp, /useinbandfec=1/);
assert.match(fmtp, /usedtx=1/);
assert.match(fmtp, /maxaveragebitrate=48000/);
assert.match(fmtp, /stereo=0/);

const sdp = [
  "v=0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
].join("\r\n");
const tuned = tuneOpusSdp(sdp, { maxAverageBitrate: 48000, dtx: true, fec: true, stereo: false });
assert.match(tuned, /a=fmtp:111 .*usedtx=1/);
assert.match(tuned, /useinbandfec=1/);
assert.equal(tuneOpusSdp("v=0\r\n"), "v=0\r\n");

assert.equal(shouldRecaptureMic({ currentDeviceId: "a", inputIds: ["b"], preferredId: "" }), "current-missing");
assert.equal(shouldRecaptureMic({ currentDeviceId: "a", inputIds: ["a"], preferredId: "gone" }), "preferred-missing");
assert.equal(
  shouldRecaptureMic({ currentDeviceId: "a", inputIds: ["a", "b"], preferredId: "", addedLabels: ["AirPods Pro"] }),
  "headset-added"
);
assert.equal(shouldRecaptureMic({ currentDeviceId: "a", inputIds: ["a"], preferredId: "" }), null);
assert.equal(
  micRecapturePlan({
    previousIds: [],
    inputs: [{ deviceId: "mic", label: "Mic" }, { deviceId: "buds", label: "AirPods" }],
    currentDeviceId: "mic",
    preferredId: "",
  }).reason,
  null
);
assert.equal(
  micRecapturePlan({
    previousIds: ["mic"],
    inputs: [{ deviceId: "mic", label: "Mic" }, { deviceId: "buds", label: "AirPods" }],
    currentDeviceId: "mic",
    preferredId: "",
  }).deviceId,
  "buds"
);
assert.equal(networkQualityTooltipKey("fair"), "Connection is medium. Voice bitrate is reduced.");
assert.equal(networkQualityTooltipKey("excellent"), "Connection is good");
assert.equal(networkQualityTooltipKey("lost"), "Connection is poor. Extra redundancy is on to ride out packet loss.");

assert.equal(matchPushToTalkEvent({ code: "KeyM", shiftKey: true, ctrlKey: true }, "mod+shift+m"), true);
assert.equal(matchPushToTalkEvent({ code: "KeyM", shiftKey: true, ctrlKey: true, repeat: true }, "mod+shift+m"), false);
assert.equal(matchPushToTalkEvent({ code: "KeyM", shiftKey: false, ctrlKey: true }, "mod+shift+m"), false);

assert.equal(softCueVolume(1), 0.55);
assert.ok(softCueVolume(0.2) < 0.2);

console.log("voiceProfile.selftest: ok");
