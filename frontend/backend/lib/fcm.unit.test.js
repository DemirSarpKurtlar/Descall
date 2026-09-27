"use strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const assert = require("assert");
const { isApnsDeviceToken, buildApnsBody, apnsTokenShouldDrop } = require("./fcm");

assert.equal(isApnsDeviceToken("ab".repeat(32)), true);
assert.equal(isApnsDeviceToken("AB".repeat(32)), true);
assert.equal(isApnsDeviceToken("c".repeat(64)), true);
assert.equal(isApnsDeviceToken("not-a-device-token"), false);
assert.equal(isApnsDeviceToken("a".repeat(63)), false);
assert.equal(isApnsDeviceToken(""), false);

const callBody = buildApnsBody({
  type: "call",
  title: "Incoming call",
  body: "Someone is calling you on Descall",
  fromId: "user-1",
  callType: "voice",
});
assert.equal(callBody.aps.alert.title, "Incoming call");
assert.equal(callBody.aps.alert.body, "Someone is calling you on Descall");
assert.equal(callBody.aps.category, "INCOMING_CALL");
assert.equal(callBody.aps.sound, "default");
assert.equal(callBody.type, "call");
assert.equal(callBody.fromId, "user-1");
assert.equal(callBody.callType, "voice");

const dmBody = buildApnsBody({ type: "dm", title: "Ada", body: "hello", fromId: "user-2" });
assert.equal(dmBody.aps.category, undefined);
assert.equal(dmBody.title, "Ada");
assert.equal(dmBody.body, "hello");

assert.equal(apnsTokenShouldDrop(410, ""), true);
assert.equal(apnsTokenShouldDrop(400, '{"reason":"BadDeviceToken"}'), true);
assert.equal(apnsTokenShouldDrop(400, '{"reason":"PayloadTooLarge"}'), false);
assert.equal(apnsTokenShouldDrop(200, ""), false);

console.log("fcm.unit.test.js: ok");
