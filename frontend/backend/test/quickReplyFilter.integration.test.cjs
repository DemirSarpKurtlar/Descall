"use strict";
// Regression (security scan 17 Nov 2026): DM replies from a notification, the Apple Watch
// and scheduled DMs (lib/notifyActions.js replyDm) inserted into dm_messages without the
// word filter that dm:send runs. A "block" rule word is now refused with content_blocked.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
const assert = require("assert");
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const fake = createFakeSupabase({
  users: [
    { id: "u-alice", username: "alice", active_sessions: [{ id: "s-alice" }], blocked_users: [] },
    { id: "u-bob", username: "bob", active_sessions: [], blocked_users: [] },
  ],
  friendships: [{ id: "f1", user_id: "u-alice", friend_id: "u-bob", status: "accepted" }],
  dm_messages: [], reactions: [], device_push_tokens: [], flagged_messages: [],
  profanity_rules: [{ id: "r1", pattern: "yasakkelime", kind: "word", severity: "high", language: "all", action: "block", created_at: "2026-01-01" }],
});
require.cache[require.resolve("../db/supabase")] = { id: "s", filename: "s", loaded: true, exports: fake };
const cf = require("../lib/contentFilter");
const notify = require("../lib/notifyActions");
const shared = require("../runtime/sharedState");
const io = { to() { return { emit() {}, to() { return this; } }; }, in() { return this.to(); }, emit() {}, sockets: { sockets: new Map(), adapter: { rooms: new Map() } }, of() { return io; } };
(async () => {
  await cf.loadRules({ force: true });
  assert.ok(cf.check("selam yasakkelime")?.block, "rule blocks on the socket path");
  const actions = notify.createNotifyActions();
  await assert.rejects(actions.reply(io, "u-alice", { conv: "dm:u-bob", text: "selam yasakkelime" }), (e) => e.code === "content_blocked" && e.status === 422);
  assert.strictEqual(fake._tables.dm_messages.rows.length, 0, "blocked text is not stored");
  shared.rateLimitDm.clear?.();
  await actions.reply(io, "u-alice", { conv: "dm:u-bob", text: "selam" });
  assert.deepStrictEqual(fake._tables.dm_messages.rows.map((r) => r.content), ["selam"], "clean text is sent");
  console.log("quickReplyFilter test ok");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
