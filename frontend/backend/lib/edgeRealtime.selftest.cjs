"use strict";
// node frontend/backend/lib/edgeRealtime.selftest.cjs
const assert = require("assert");
const { edgeRealtimeAdvice, userBucket, normalizeRealtimeUrl, pickEdgeRealtimeConfig, clientPlatform } = require("./edgeRealtime");
const { pickConfig, pickFeatureFlags } = require("./systemSettings");

const env = { EDGE_REALTIME_URL: "wss://rt.descall.com" };
const on = (extra = {}) => ({ featureFlags: { edgeRealtime: true }, edgeRealtimePercent: 0, edgeRealtimePlatforms: ["web"], edgeRealtimeAllowUserIds: [], ...extra });
const uid = "11111111-2222-3333-4444-555555555555";

assert.strictEqual(normalizeRealtimeUrl("wss://rt.descall.com/"), "wss://rt.descall.com");
assert.strictEqual(normalizeRealtimeUrl("wss://evil.example"), null);
assert.strictEqual(edgeRealtimeAdvice({ uid, platform: "web", config: on({ edgeRealtimePercent: 100 }), env: {}, bridgeOpen: true }).reason, "no-url");
assert.strictEqual(edgeRealtimeAdvice({ uid, platform: "web", config: { featureFlags: {} }, env, bridgeOpen: true }).reason, "off");
assert.strictEqual(edgeRealtimeAdvice({ uid, platform: "web", config: on({ edgeRealtimePercent: 100 }), env, bridgeOpen: false }).reason, "bridge-down");
// shadow: switch on, 0 %, nobody allowed
assert.strictEqual(edgeRealtimeAdvice({ uid, platform: "web", config: on(), env, bridgeOpen: true }).realtime, null);
// allow list wins on any platform
assert.strictEqual(edgeRealtimeAdvice({ uid, platform: "ios", config: on({ edgeRealtimeAllowUserIds: [uid] }), env, bridgeOpen: true }).realtime, "wss://rt.descall.com");
// platform gate
assert.strictEqual(edgeRealtimeAdvice({ uid, platform: "electron", config: on({ edgeRealtimePercent: 100 }), env, bridgeOpen: true }).reason, "platform");
assert.strictEqual(edgeRealtimeAdvice({ uid, platform: "web", config: on({ edgeRealtimePercent: 100 }), env, bridgeOpen: true }).realtime, "wss://rt.descall.com");
// percent ≈ share of users, stable
let n = 0;
for (let i = 0; i < 2000; i++) if (edgeRealtimeAdvice({ uid: `user-${i}`, platform: "web", config: on({ edgeRealtimePercent: 10 }), env, bridgeOpen: true }).realtime) n++;
assert.ok(n > 140 && n < 260, `10% bucket got ${n}/2000`);
assert.strictEqual(userBucket("x"), userBucket("x"));
// config picking (admin PATCH /system)
assert.deepStrictEqual(pickEdgeRealtimeConfig({ edgeRealtimePercent: 250, edgeRealtimePlatforms: ["web", "bogus", "ios"], edgeRealtimeAllowUserIds: `${uid}, not-a-uuid!` }), {
  edgeRealtimePercent: 100, edgeRealtimePlatforms: ["web", "ios"], edgeRealtimeAllowUserIds: [uid],
});
assert.strictEqual(pickConfig({ edgeRealtimePercent: 5 }).edgeRealtimePercent, 5);
assert.strictEqual(pickFeatureFlags({}).edgeRealtime, false, "edge realtime is opt-in");
assert.strictEqual(pickFeatureFlags({}).presenceScoped, true, "scoped presence default on");
assert.strictEqual(clientPlatform({ handshake: { auth: { app: "electron" } } }), "electron");
assert.strictEqual(clientPlatform({ handshake: { auth: { platform: "ios" } } }), "ios");
assert.strictEqual(clientPlatform({ handshake: { auth: {} } }), "web");
console.log("edgeRealtime.selftest.cjs: ok");
