// Speaking detection: real sent / received levels, survives track
// replacement and a suspended / interrupted AudioContext, sane thresholds.
// Run from frontend/: node src/lib/speakingDetection.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createLocalLevelProbe,
  levelFromSources,
  levelFromStatsReport,
  readRemoteAudioLevel,
} from "./rtpAudioLevel.js";
import { combineLevels, createSpeakingGate } from "./voiceActivityMath.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// 1. Probe vs analyser.
assert.equal(combineLevels(0.02, null), 0.02);
assert.equal(combineLevels(0, 0.12), 0.12, "dead analyser graph → probe keeps the ring alive");
assert.equal(combineLevels(0.2, 0.05), 0.2);
assert.equal(combineLevels(NaN, 2), 1);

// 2. Remote: RTP levels of the receivers, fresh only, screen audio excluded.
{
  const now = 50_000;
  assert.equal(levelFromSources([{ audioLevel: 0.3, timestamp: now - 100 }], [now]), 0.3);
  assert.equal(levelFromSources([{ audioLevel: 0.3, timestamp: now - 5000 }], [now]), 0, "stale = silent (DTX)");
  assert.equal(levelFromSources([], [now]), null);
  const mk = (id, level) => ({
    track: { kind: "audio", id },
    getSynchronizationSources: () => [{ audioLevel: level, timestamp: Date.now() }],
  });
  const pc = { connectionState: "connected", receivers: [mk("mic-1", 0.08), mk("screen-a", 0.9)], getReceivers() { return this.receivers; } };
  assert.equal(readRemoteAudioLevel(pc, { excludeTrackIds: ["screen-a"] }), 0.08);
  // The peer replaced its mic (device switch / iOS mic restart): same
  // receiver, new level — nothing to rebuild.
  pc.receivers[0] = mk("mic-1", 0.21);
  assert.equal(readRemoteAudioLevel(pc, { excludeTrackIds: new Set(["screen-a"]) }), 0.21);
  assert.equal(readRemoteAudioLevel({ connectionState: "closed", getReceivers: () => [] }), null);
}

// 3. Local: level of the track actually SENT, across replaceTrack.
{
  const report = (level) => new Map([["ms1", { type: "media-source", kind: "audio", audioLevel: level }], ["o", { type: "outbound-rtp" }]]);
  assert.equal(levelFromStatsReport(report(0.4)), 0.4);
  assert.equal(levelFromStatsReport(new Map()), null);
  const sender = { track: { kind: "audio", enabled: true, id: "raw" }, level: 0.05, async getStats() { return report(this.level); } };
  const screenSender = { track: { kind: "audio", enabled: true, id: "screen" }, async getStats() { return report(0.99); } };
  const pc = { connectionState: "connected", getSenders: () => [screenSender, sender] };
  const probe = createLocalLevelProbe({ getPc: () => pc, excludeSender: () => screenSender });
  await probe._poll();
  assert.equal(probe.read(), 0.05);
  sender.track = { kind: "audio", enabled: true, id: "replaced-after-device-switch" };
  sender.level = 0.33;
  await probe._poll();
  assert.equal(probe.read(), 0.33, "follows replaceTrack");
  sender.track.enabled = false;
  await probe._poll();
  assert.equal(probe.read(), 0, "user mute = silent");
  probe.stop();
  assert.equal(probe.read(), null);
}

// 4. Thresholds: normal / quiet speech opens the gate, room noise does not.
{
  const { speakingThreshold } = await import("./voiceProfile.js").catch(() => ({}));
  const on = typeof speakingThreshold === "function" ? speakingThreshold(45) : 0.0297;
  const run = (level, ms = 600) => {
    const g = createSpeakingGate({ onThreshold: on });
    let s = false;
    for (let t = 0; t <= ms; t += 40) s = g.push(level, t);
    return s;
  };
  assert.equal(run(0.06), true, "normal speech");
  assert.equal(run(0.04), true, "quiet speech");
  assert.equal(run(0.008), false, "room noise");
}

// 5. Wiring.
{
  const va = read("./voiceActivity.js");
  assert.match(va, /VOICE_FFT_SIZE = 1024/);
  assert.match(va, /analyser\.fftSize = VOICE_FFT_SIZE/);
  assert.match(va, /function keepContextRunning/, "resumes a suspended / interrupted context in the sampling loop");
  assert.match(va, /ctx\.state !== "running"/);
  assert.match(va, /combineLevels\(readRms\(graph\), probe\)/);
  const hook = read("../hooks/useVoiceActivity.js");
  assert.match(hook, /levelProbe/);
  const overlay = read("../components/CallOverlay.jsx");
  assert.match(overlay, /levelProbe=\{call\?\.getRemoteAudioLevel\}/);
  assert.match(overlay, /levelProbe=\{isDm \? call\?\.getLocalAudioLevel : null\}/);
  const useCall = read("../hooks/useCall.js");
  assert.match(useCall, /createLocalLevelProbe\(/);
  assert.match(useCall, /readRemoteAudioLevel\(pcRef\.current/);
}

console.log("speakingDetection.selftest ok");
