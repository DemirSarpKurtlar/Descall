"use strict";
// GET /api/webrtc/livekit-screen-token (iOS whole-screen sharing, docs/ios-screen-share.md):
// signed-in, seated in the voice channel, SPEAK + STREAM (stage: speaker), companion identity
// `<userId>:screen` that may publish screen share only and never subscribe; short TTL.
// Run from frontend/: node backend/test/livekitScreenToken.integration.test.cjs
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.LIVEKIT_URL = "wss://lk.example.com";
process.env.LIVEKIT_API_KEY = "lk-test-key";
process.env.LIVEKIT_API_SECRET = "x".repeat(48); // fake, test only

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: createFakeSupabase({
    users: [
      { id: "u-alice", username: "alice", active_sessions: [{ id: "s-alice" }] },
      { id: "u-bob", username: "bob", active_sessions: [{ id: "s-bob" }] },
      { id: "u-carol", username: "carol", active_sessions: [{ id: "s-carol" }] },
      { id: "u-dave", username: "dave", active_sessions: [{ id: "s-dave" }] },
    ],
    server_channels: [
      { id: "ch-voice", server_id: "srv-1", type: "voice", name: "General" },
      { id: "ch-stage", server_id: "srv-1", type: "stage", name: "Stage" },
      { id: "ch-text", server_id: "srv-1", type: "text", name: "chat" },
    ],
  }),
};

// Permission bits per user (the real resolver needs the whole server schema).
const perms = require("../lib/serverPermissions");
const { Permissions } = perms;
const VOICE_BITS = Permissions.VIEW_CHANNEL | Permissions.CONNECT | Permissions.SPEAK;
const bitsByUser = {
  "u-alice": VOICE_BITS | Permissions.STREAM,
  "u-bob": VOICE_BITS, // no STREAM
  "u-carol": VOICE_BITS | Permissions.STREAM,
};
perms.resolveChannelPermissions = async (_db, _serverId, userId) => {
  if (!(userId in bitsByUser)) return { isMember: false, bits: 0n };
  return { isMember: true, bits: bitsByUser[userId] };
};

const express = require("express");
const { signToken } = require("../config/jwt");
const { activeServerVoiceCalls } = require("../runtime/sharedState");
const webrtc = require("../routes/webrtc");
const { resetLimits } = require("../lib/rateLimit");
const companion = require("../lib/screenCompanion");

function seat(channelId, userId, extra = {}) {
  let call = activeServerVoiceCalls.get(channelId);
  if (!call) {
    call = { serverId: "srv-1", participants: new Map() };
    activeServerVoiceCalls.set(channelId, call);
  }
  call.participants.set(userId, { id: userId, ...extra });
}

function decodeJwt(token) {
  const [, payload] = String(token).split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

(async () => {
  // Pure helpers.
  assert.equal(companion.screenCompanionIdentity("u-1"), "u-1:screen");
  assert.equal(companion.screenCompanionIdentity(""), null);
  assert.equal(companion.screenCompanionIdentity("a:b"), null, "an id with a colon never gets a companion");
  assert.equal(companion.companionOwner("u-1:screen"), "u-1");
  assert.equal(companion.companionOwner("u-1"), null);
  assert.equal(companion.companionOwner(":screen"), null);
  companion.markCompanionIssued("c", "u");
  assert.equal(companion.takeCompanionIssued("c", "u"), true);
  assert.equal(companion.takeCompanionIssued("c", "u"), false, "taken once");

  const app = express();
  app.set("trust proxy", 1);
  app.use("/api/webrtc", webrtc);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (token, channelId) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const q = channelId == null ? "" : `?channelId=${encodeURIComponent(channelId)}`;
    const res = await fetch(`${base}/api/webrtc/livekit-screen-token${q}`, { headers });
    return { status: res.status, cache: res.headers.get("cache-control"), body: await res.json() };
  };
  const tok = (id) => signToken({ id, username: id.slice(2), sid: `s-${id.slice(2)}` });

  try {
    assert.equal((await get(null, "ch-voice")).status, 401, "sign-in required");
    assert.equal((await get(tok("u-alice"), null)).status, 400, "channelId required");
    assert.equal((await get(tok("u-alice"), "ch-text")).status, 400, "not a voice channel");
    assert.equal((await get(tok("u-alice"), "ch-missing")).status, 404);
    assert.equal((await get(tok("u-dave"), "ch-voice")).body.code, "NOT_MEMBER");

    const notSeated = await get(tok("u-alice"), "ch-voice");
    assert.equal(notSeated.status, 409);
    assert.equal(notSeated.body.code, "NOT_IN_CHANNEL", "only while seated in the channel");

    seat("ch-voice", "u-alice");
    seat("ch-voice", "u-bob");
    const bob = await get(tok("u-bob"), "ch-voice");
    assert.equal(bob.status, 403);
    assert.equal(bob.body.code, "MISSING_PERMISSION", "STREAM is required");

    const alice = await get(tok("u-alice"), "ch-voice");
    assert.equal(alice.status, 200);
    assert.equal(alice.cache, "private, no-store");
    assert.equal(alice.body.enabled, true);
    assert.equal(alice.body.identity, "u-alice:screen");
    assert.equal(alice.body.room, "server-voice-ch-voice");
    assert.equal(alice.body.livekitUrl, "wss://lk.example.com");
    const claims = decodeJwt(alice.body.token);
    assert.equal(claims.sub, "u-alice:screen", "companion identity, never the user's own");
    assert.equal(claims.video.room, "server-voice-ch-voice");
    assert.equal(claims.video.roomJoin, true);
    assert.equal(claims.video.canSubscribe, false, "the companion never subscribes");
    assert.equal(claims.video.canPublish, true);
    assert.equal(claims.video.canPublishData, false);
    assert.deepEqual(claims.video.canPublishSources, ["screen_share", "screen_share_audio"], "screen share only");
    assert.ok(claims.exp - claims.nbf <= 600 || claims.exp - Math.floor(Date.now() / 1000) <= 600, "short-lived");
    assert.equal(JSON.parse(claims.metadata).companionOf, "u-alice");
    assert.equal(companion.takeCompanionIssued("ch-voice", "u-alice"), true, "issued companion remembered for cleanup");

    // Stage: only a speaker may share.
    seat("ch-stage", "u-carol", { stageRole: "audience" });
    assert.equal((await get(tok("u-carol"), "ch-stage")).body.code, "MISSING_PERMISSION");
    seat("ch-stage", "u-carol", { stageRole: "speaker" });
    const carol = await get(tok("u-carol"), "ch-stage");
    assert.equal(carol.status, 200);
    assert.equal(decodeJwt(carol.body.token).sub, "u-carol:screen");

    // Rate limit: 20 per 10 minutes per user.
    resetLimits();
    let last;
    for (let i = 0; i < 21; i++) last = await get(tok("u-alice"), "ch-voice");
    assert.equal(last.status, 429);
    assert.equal(last.body.code, "RATE_LIMITED");

    // LiveKit not configured: disabled, nothing minted.
    resetLimits();
    const saved = process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_API_SECRET;
    const off = await get(tok("u-alice"), "ch-voice");
    assert.equal(off.status, 200);
    assert.deepEqual(off.body, { enabled: false });
    process.env.LIVEKIT_API_SECRET = saved;

    console.log("livekitScreenToken.integration: all assertions passed");
  } finally {
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
