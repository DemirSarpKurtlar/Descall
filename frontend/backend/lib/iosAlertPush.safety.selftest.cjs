"use strict";
/**
 * 2.9.141: iOS alert pushes mask bad words and skip recipients who blocked the sender.
 * Run: node frontend/backend/lib/iosAlertPush.safety.selftest.cjs
 */
const assert = require("node:assert/strict");
const { createIosAlertPusher } = require("./iosAlertPush");

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

function fakeDb() {
  const tables = {
    device_push_tokens: [
      { token: TOKEN_A, user_id: "alice", platform: "ios", locale: "en" },
      { token: TOKEN_B, user_id: "bob", platform: "ios", locale: "en" },
    ],
    users: [
      { id: "alice", presence_status: "online", language: "en", blocked_users: [] },
      { id: "bob", presence_status: "online", language: "en", blocked_users: ["mallory"] },
    ],
  };
  return {
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(col, val) { filters.push((r) => r[col] === val); return q; },
        in(col, vals) { filters.push((r) => vals.includes(r[col])); return q; },
        delete() { return q; },
        then(resolve) {
          resolve({ data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null });
        },
      };
      return q;
    },
  };
}

(async () => {
  const sent = [];
  const pusher = createIosAlertPusher({
    getDb: fakeDb,
    transport: async (req) => {
      sent.push(req);
      return { status: 200, body: "" };
    },
    context: { isForeground: () => false, isViewing: () => false },
    apnsConfig: () => ({ keyId: "k", teamId: "t", bundleId: "com.descall.app" }),
    getApnsJwt: () => "jwt",
    log: { warn() {} },
  });

  const res = await pusher.sendToUsers(["alice", "bob"], {
    type: "group",
    groupId: "g1",
    groupName: "G",
    from: "mallory",
    fromId: "mallory",
    excludeUserId: "mallory",
    text: "you are a fucking idiot",
  });
  assert.equal(res.sent, 1, "only alice gets it; bob blocked the sender");
  const body = JSON.parse(sent[0].body);
  assert.match(body.aps.alert.body, /\*\*\*/);
  assert.doesNotMatch(body.aps.alert.body, /fuck/i);
  console.log("iosAlertPush safety selftest ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
