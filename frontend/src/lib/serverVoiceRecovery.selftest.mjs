// node src/lib/serverVoiceRecovery.selftest.mjs
import assert from "node:assert/strict";
import {
  mergeRejoinRoster,
  sdpFingerprints,
  isNewRemoteSession,
  isPoliteSide,
  iceRestartDelay,
  peerLinkDecision,
  PEER_REBUILD_AFTER_MS,
  DISCONNECTED_GRACE_MS,
  dropResultFor,
  dropReasonToken,
  liveKitDropAction,
  liveKitRetryBudget,
  LIVEKIT_RETRY_WINDOW_MS,
} from "./serverVoiceRecovery.js";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed += 1;
  console.log("ok -", name);
};

t("rejoin keeps media of existing entries and takes server fields", () => {
  const screen = { id: "s" };
  const cam = { id: "c" };
  const audio = { id: "a" };
  const prev = [
    { id: "u1", username: "old", stream: audio, screenStream: screen, isScreenSharing: true, cameraStream: cam, cameraOn: true, hasAudio: true },
    { id: "u2", username: "gone" },
  ];
  const next = mergeRejoinRoster(prev, [
    { id: "u1", username: "new", muted: true, isScreenSharing: false },
    { id: "u3", username: "fresh" },
  ]);
  assert.equal(next.length, 2);
  assert.equal(next[0].username, "new");
  assert.equal(next[0].muted, true);
  assert.equal(next[0].stream, audio);
  assert.equal(next[0].screenStream, screen);
  assert.equal(next[0].cameraStream, cam);
  assert.equal(next[0].isScreenSharing, true, "a share still received stays visible");
  assert.deepEqual(next[1], { id: "u3", username: "fresh", hasAudio: true });
  assert.ok(!next.some((p) => p.id === "u2"), "someone who left during the outage is dropped");
});

t("rejoin with numeric vs string ids still matches", () => {
  const next = mergeRejoinRoster([{ id: 7, stream: "s" }], [{ id: "7", username: "x" }]);
  assert.equal(next[0].stream, "s");
  assert.equal(next[0].id, 7);
});

const SDP_A = "v=0\r\na=fingerprint:sha-256 AA:BB:CC\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fingerprint:sha-256 AA:BB:CC\r\na=ice-ufrag:x1\r\n";
const SDP_A_RESTART = SDP_A.replace("ice-ufrag:x1", "ice-ufrag:y2");
const SDP_B = "v=0\r\na=fingerprint:sha-256 DD:EE:FF\r\na=ice-ufrag:z9\r\n";

t("fingerprints parsed and deduplicated", () => {
  assert.deepEqual(sdpFingerprints(SDP_A), ["sha-256 AA:BB:CC"]);
  assert.deepEqual(sdpFingerprints(null), []);
});

t("new remote pc is detected; ICE restart / renegotiation is not", () => {
  assert.equal(isNewRemoteSession(SDP_A, SDP_B), true);
  assert.equal(isNewRemoteSession(SDP_A, SDP_A_RESTART), false);
  assert.equal(isNewRemoteSession(null, SDP_B), false, "no remote description yet: not a new session");
});

t("exactly one polite side per pair", () => {
  assert.notEqual(isPoliteSide("a", "b"), isPoliteSide("b", "a"));
  assert.equal(isPoliteSide("u-2", "u-1"), true);
});

t("restart backoff 2/4/8/15 s, last repeats", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(iceRestartDelay), [2000, 4000, 8000, 15000, 15000, 15000]);
});

t("link decisions", () => {
  assert.deepEqual(peerLinkDecision({ state: "connected" }), { action: "healthy" });
  assert.deepEqual(peerLinkDecision({ state: "connecting" }), { action: "wait" });
  assert.deepEqual(peerLinkDecision({ state: "closed" }), { action: "wait" });
  assert.deepEqual(peerLinkDecision({ state: "disconnected", attempt: 0 }), { action: "restart", delayMs: DISCONNECTED_GRACE_MS });
  assert.deepEqual(peerLinkDecision({ state: "failed", attempt: 0 }), { action: "restart", delayMs: 2000 });
  assert.deepEqual(peerLinkDecision({ state: "failed", attempt: 2, polite: true }), { action: "restart", delayMs: 9500 });
  assert.deepEqual(
    peerLinkDecision({ state: "failed", troubleSinceMs: 0, nowMs: PEER_REBUILD_AFTER_MS, attempt: 5 }),
    { action: "rebuild" }
  );
});

t("drop results and reason tokens", () => {
  assert.equal(dropResultFor("disconnected"), "dropped");
  assert.equal(dropResultFor("kick"), "kicked");
  assert.equal(dropResultFor("afk"), "afk");
  assert.equal(dropResultFor("timeout"), "timedout");
  assert.equal(dropResultFor(""), "dropped");
  assert.equal(dropReasonToken("channel_deleted"), "channel_deleted");
  assert.equal(dropReasonToken("u-123"), "u-");
  assert.equal(dropReasonToken(null), "unknown");
});

t("LiveKit drop actions", () => {
  assert.equal(liveKitDropAction(1), "none");
  assert.equal(liveKitDropAction(2), "other-device");
  assert.equal(liveKitDropAction(4), "rejoin-later");
  assert.equal(liveKitDropAction(5), "rejoin-later");
  assert.equal(liveKitDropAction(9), "rejoin");
  assert.equal(liveKitDropAction(undefined), "rejoin");
});

t("LiveKit retry budget: 3 per 2 minutes", () => {
  assert.equal(liveKitRetryBudget([], 1000).allowed, true);
  assert.equal(liveKitRetryBudget([1, 2, 3], 1000).allowed, false);
  const later = liveKitRetryBudget([1, 2, 3], 3 + LIVEKIT_RETRY_WINDOW_MS);
  assert.equal(later.allowed, true);
  assert.deepEqual(later.kept, []);
});

console.log(`serverVoiceRecovery: ${passed} passed`);
