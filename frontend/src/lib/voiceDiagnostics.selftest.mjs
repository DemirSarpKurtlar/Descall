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
