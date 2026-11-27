"use strict";
// node lib/voipPush.selftest.cjs — PushKit ring the way APNs / CallKit need it (no network).
const assert = require("assert");
const voip = require("./voipPush");
const apns = require("./apnsClient");

const cfg = { keyId: "K", teamId: "T", privateKey: "unused", bundleId: "com.descall.app" };
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

// Headers: VoIP topic, voip push type, immediate priority, no store-and-forward.
const h = voip.buildVoipHeaders(cfg, TOKEN_A, "jwt");
assert.strictEqual(h["apns-topic"], "com.descall.app.voip");
assert.strictEqual(h["apns-push-type"], "voip");
assert.strictEqual(h["apns-priority"], "10");
assert.strictEqual(h["apns-expiration"], "0");
assert.strictEqual(h[":path"], `/3/device/${TOKEN_A}`);

// Payload: what DescallCallManager.handleIncomingVoipPush reads for CallKit.
const p = voip.buildVoipPayload({ callUuid: "u-1", callerId: "c", callerName: "  Ali  ", video: false, statusToken: "s", calleeId: "e", statusUrl: "https://x/api/calls/voip-status" });
assert.strictEqual(p.type, "call");
assert.strictEqual(p.callUuid, "u-1");
assert.strictEqual(p.callerName, "Ali");
assert.strictEqual(p.callType, "voice");
assert.strictEqual(p.statusUrl, "https://x/api/calls/voip-status");
assert.ok(!("aps" in p), "VoIP pushes need no aps block");
assert.ok(Buffer.byteLength(JSON.stringify(voip.buildVoipPayload({ callUuid: "u", callerName: "x".repeat(500), callerAvatar: "https://" + "a".repeat(900) }))) < 5120, "under the 5 KB VoIP limit");
assert.strictEqual(voip.buildVoipPayload({ callUuid: "u", statusUrl: "http://insecure", statusToken: "s", calleeId: "e" }).statusUrl, undefined, "https status url only");
const end = voip.buildVoipEndPayload({ callUuid: "u-1", reason: "nope" });
assert.strictEqual(end.type, "call-end");
assert.strictEqual(end.reason, "remoteEnded");

// Host: production unless APNS_VOIP_USE_SANDBOX=true (TestFlight / App Store tokens are production).
delete process.env.APNS_VOIP_USE_SANDBOX;
assert.strictEqual(voip.voipHost(), apns.PROD_HOST);
process.env.APNS_VOIP_USE_SANDBOX = "true";
assert.strictEqual(voip.voipHost(), apns.SANDBOX_HOST);
delete process.env.APNS_VOIP_USE_SANDBOX;

// APNs reasons for logs.
assert.strictEqual(voip.apnsReason(400, '{"reason":"BadDeviceToken"}'), "BadDeviceToken");
assert.strictEqual(voip.apnsReason(403, "<html>"), "http403");

(async () => {
  const sent = [];
  const deleted = [];
  const fakeDb = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: async () => ({ data: [{ token: TOKEN_A }, { token: TOKEN_B }, { token: TOKEN_A }, { token: "short" }], error: null }) }) }),
      delete: () => ({ eq: async (_c, token) => { deleted.push(token); return { error: null }; } }),
    }),
  };
  const fcm = {
    VOIP_PLATFORM: "ios_voip",
    isApnsDeviceToken: apns.isApnsDeviceToken,
    apnsTokenShouldDrop: apns.apnsTokenShouldDrop,
    apnsConfig: () => cfg,
    getApnsJwt: () => "jwt",
  };
  const transport = async ({ host, headers, body }) => {
    sent.push({ host, headers, body: JSON.parse(body) });
    if (headers[":path"].endsWith(TOKEN_B)) return { status: 410, body: '{"reason":"Unregistered"}' };
    return { status: 200, body: "" };
  };
  const pusher = voip.createVoipPusher({ fcm, getDb: () => fakeDb, transport, log: { warn() {} } });
  process.env.JWT_SECRET = "selftest-secret";
  const r = await pusher.sendIncomingCallVoip("user-1", { callUuid: "ring-1", callerId: "c", callerName: "Ali" });
  assert.strictEqual(r.tokens, 2, "deduped, invalid tokens skipped");
  assert.strictEqual(r.sent, 1);
  assert.strictEqual(r.dropped, 1);
  assert.deepStrictEqual(deleted, [TOKEN_B], "410 Unregistered token removed");
  assert.ok(sent.every((s) => s.host === apns.PROD_HOST));
  assert.ok(sent[0].body.statusToken && sent[0].body.calleeId === "user-1", "status token for the lock-screen report");

  // No APNs key configured: skipped, nothing sent.
  const none = voip.createVoipPusher({ fcm: { ...fcm, apnsConfig: () => null }, getDb: () => fakeDb, transport: async () => { throw new Error("must not send"); }, log: { warn() {} } });
  const r2 = await none.sendIncomingCallVoip("user-1", { callUuid: "ring-2" });
  assert.strictEqual(r2.skipped, true);
  // Network error is counted, never thrown.
  const broken = voip.createVoipPusher({ fcm, getDb: () => fakeDb, transport: async () => { throw new Error("ECONNRESET"); }, log: { warn() {} } });
  const r3 = await broken.sendIncomingCallVoip("user-1", { callUuid: "ring-3" });
  assert.strictEqual(r3.failed, 2);
  assert.deepStrictEqual(r3.reasons, ["network", "network"]);
  console.log("voipPush.selftest ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
