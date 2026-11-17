// node src/lib/voiceDiagnostics.selftest.mjs — 3.7.27 voice diagnostic snapshot:
// the right numbers, no personal data (IPs, ports, ids, labels).
import assert from "node:assert/strict";
import { captureVoiceDiagnostics, getLastVoiceDiagnostics, sanitizeVoiceDiagnostics, summarizeStats } from "./voiceDiagnostics.js";
import { buildSubmitBody, emptyForm } from "./feedbackForm.js";

const stats = new Map(Object.entries({
  T: { id: "T", type: "transport", selectedCandidatePairId: "P" },
  P: { id: "P", type: "candidate-pair", localCandidateId: "L", remoteCandidateId: "R", state: "succeeded" },
  L: { id: "L", type: "local-candidate", candidateType: "relay", protocol: "udp", address: "203.0.113.5", port: 5000 },
  R: { id: "R", type: "remote-candidate", candidateType: "srflx", address: "198.51.100.7", port: 6000 },
  O: { id: "O", type: "outbound-rtp", kind: "audio", bytesSent: 12000, packetsSent: 300 },
  I: { id: "I", type: "inbound-rtp", kind: "audio", bytesReceived: 9000, packetsReceived: 250, audioLevel: 0.04 },
  M: { id: "M", type: "media-source", kind: "audio", audioLevel: 0.12 },
}));
const sum = summarizeStats(stats);
assert.equal(sum.bytesSent, 12000);
assert.equal(sum.bytesReceived, 9000);
assert.equal(sum.audioLevelOut, 0.12);
assert.equal(sum.candidateType, "relay");
assert.equal(sum.remoteCandidateType, "srflx");

const pc = { iceConnectionState: "connected", connectionState: "connected", getStats: async () => stats };
const track = { enabled: true, muted: false, readyState: "live", label: "MacBook Pro Microphone", id: "abc" };
const snap = await captureVoiceDiagnostics({
  pc, localTrack: track, uiMuted: false,
  ns: { enabled: true, engine: "gtcrn", audioContextState: "running", rawRms: 0.02, processedRms: 0.015, fallback: null },
  ice: { fetchOk: true, turnPresent: true, fetchAttempts: 1, fetchStatus: 200 },
});
assert.equal(snap.audioContextState, "running");
assert.equal(snap.nsEngine, "gtcrn");
assert.equal(snap.trackEnabled, true);
assert.equal(snap.trackReadyState, "live");
assert.equal(snap.turnPresent, true);
assert.equal(snap.iceConfigFetchOk, true);
assert.equal(snap.candidateType, "relay");
assert.equal(snap.bytesSent, 12000);
const json = JSON.stringify(snap);
assert.ok(!/203\.0\.113|198\.51\.100|MacBook|"abc"|port|address/.test(json), "no IPs, ports, labels or ids");
assert.ok(getLastVoiceDiagnostics().ageMs >= 0);

// Sanitizer drops junk / long strings / unknown keys.
assert.deepEqual(sanitizeVoiceDiagnostics({ ip: "1.2.3.4", nsEngine: "x".repeat(40), bytesSent: "12", turnPresent: "yes" }), { bytesSent: 12 });
assert.equal(sanitizeVoiceDiagnostics(null), null);

// Feedback body carries it only for voice / bug reports with device info on.
const vd = { nsEngine: "gtcrn" };
assert.deepEqual(buildSubmitBody({ ...emptyForm("bug"), text: "ses gitmiyor" }, { platform: "Web", voiceDiag: vd }).voiceDiag, vd);
assert.deepEqual(buildSubmitBody({ ...emptyForm("suggestion"), text: "ses ayarı", area: "voice" }, { voiceDiag: vd }).voiceDiag, vd);
assert.equal(buildSubmitBody({ ...emptyForm("suggestion"), text: "tema güzel" }, { voiceDiag: vd }).voiceDiag, undefined);
assert.equal(buildSubmitBody({ ...emptyForm("bug"), text: "ses gitmiyor", includeDevice: false }, { voiceDiag: vd }).voiceDiag, undefined);

console.log("voiceDiagnostics.selftest ok");

// 3.7.28: sample rates, underruns and engine reason reach the feedback row.
{
  const { sanitizeVoiceDiagnostics: sv } = await import("./voiceDiagnostics.js");
  const o = sv({ contextSampleRate: 44100, captureSampleRate: 48000, nsUnderruns: 3, nsEngineReason: "firefox", processedRms: 0.001 });
  assert.equal(o.contextSampleRate, 44100);
  assert.equal(o.captureSampleRate, 48000);
  assert.equal(o.nsUnderruns, 3);
  assert.equal(o.nsEngineReason, "firefox");
  const { createRequire } = await import("node:module");
  const be = createRequire(import.meta.url)("../../backend/lib/userFeedback.js");
  const b = be.sanitizeVoiceDiag({ contextSampleRate: 44100, captureSampleRate: 48000, nsUnderruns: 3, nsEngineReason: "firefox" });
  assert.deepEqual(b, { contextSampleRate: 44100, captureSampleRate: 48000, nsUnderruns: 3, nsEngineReason: "firefox" }, "backend whitelist matches");
}

// Polish (calls-02): group calls and server voice snapshot every mesh link,
// with what the far ends report about OUR audio (uplink loss, round trip).
{
  const { captureVoiceDiagnostics: cap, getLastVoiceDiagnostics: last, worstPeer } = await import("./voiceDiagnostics.js");
  const link = (state, sent, lost, frac, rtt) => ({
    connectionState: state,
    iceConnectionState: state,
    getStats: async () => new Map(Object.entries({
      O: { id: "O", type: "outbound-rtp", kind: "audio", bytesSent: sent * 100, packetsSent: sent },
      RI: { id: "RI", type: "remote-inbound-rtp", kind: "audio", packetsLost: lost, fractionLost: frac, roundTripTime: rtt },
    })),
  });
  const a = link("connected", 1000, 3, 0.01, 0.04);
  const b = link("disconnected", 500, 40, 0.18, 0.21);
  assert.equal(worstPeer([a, b]), b);
  const s = await cap({ pcs: [a, b], ns: { enabled: true, engine: "gtcrn" }, kind: "group" });
  assert.equal(s.kind, "group");
  assert.equal(s.peerCount, 2);
  assert.equal(s.connectionState, "disconnected");
  assert.equal(s.packetsSent, 1500);
  assert.equal(s.outPacketsLost, 43);
  assert.equal(s.outFractionLost, 0.18);
  assert.equal(s.rttMs, 210);
  assert.equal(last().kind, "group", "the last snapshot survives hang-up for the feedback form");
  // No links (alone in the room): still a snapshot with the mic pipeline state.
  const alone = await cap({ pcs: [], ns: { enabled: true, engine: "rnnoise" }, kind: "server" });
  assert.equal(alone.peerCount, 0);
  assert.equal(alone.nsEngine, "rnnoise");
}
console.log("voiceDiagnostics.selftest group ok");
