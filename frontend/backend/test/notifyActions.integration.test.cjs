"use strict";

/**
 * 3.0.0 (A4): quick reply / reactions / read from an iOS notification.
 * Real handlers + routes against the in-memory Supabase stand-in.
 * Run: node frontend/backend/test/notifyActions.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const pushPath = require.resolve("../lib/webPush");
const pushCalls = [];
require.cache[pushPath] = {
  id: pushPath,
  filename: pushPath,
  loaded: true,
  exports: new Proxy({}, { get: (_, name) => async (...args) => { pushCalls.push({ name, args }); return { ok: true }; } }),
};

const fake = createFakeSupabase({
  users: [
    { id: "u-alice", username: "alice", display_name: "Alice", active_sessions: [{ id: "s-alice" }], blocked_users: [] },
    { id: "u-bob", username: "bob", display_name: "Bob", active_sessions: [{ id: "s-bob" }], blocked_users: [] },
    { id: "u-carol", username: "carol", active_sessions: [{ id: "s-carol" }], blocked_users: ["u-alice"] },
    { id: "u-dave", username: "dave", active_sessions: [{ id: "s-dave" }], blocked_users: [] },
  ],
  friendships: [
    { id: "f1", user_id: "u-alice", friend_id: "u-bob", status: "accepted" },
    { id: "f2", user_id: "u-alice", friend_id: "u-carol", status: "accepted" },
  ],
  dm_messages: [
    { id: "dm-1", from_user_id: "u-bob", to_user_id: "u-alice", content: "Kim geliyor bu akşam?", created_at: "2026-10-26T17:39:00.000Z", read_at: null },
    { id: "dm-2", from_user_id: "u-alice", to_user_id: "u-bob", content: "Ben varım", created_at: "2026-10-26T17:40:00.000Z", read_at: null },
    { id: "dm-3", from_user_id: "u-bob", to_user_id: "u-alice", content: "Bu akşam 21:00'de sesli kanalda buluşuyoruz, gelen?", created_at: "2026-10-26T17:41:00.000Z", read_at: null },
    { id: "dm-x", from_user_id: "u-carol", to_user_id: "u-dave", content: "secret", created_at: "2026-10-26T17:41:00.000Z", read_at: null },
  ],
  groups: [{ id: "g1", name: "Hafta Sonu Ekibi" }],
  group_members: [
    { group_id: "g1", user_id: "u-alice" },
    { group_id: "g1", user_id: "u-bob" },
    { group_id: "g1", user_id: "u-dave" },
  ],
  group_messages: [
    { id: "gm-1", group_id: "g1", sender_id: "u-bob", content: "Bu akşam 21:00?", created_at: "2026-10-26T17:41:00.000Z" },
  ],
  reactions: [],
  device_push_tokens: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const shared = require("../runtime/sharedState");
const notify = require("../lib/notifyActions");
const { signToken, verifyToken } = require("../config/jwt");
const rows = (t) => fake._tables[t]?.rows || [];

const emitted = [];
const io = {
  to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }), to: () => io.to(room) }; },
  in(room) { return io.to(room); },
  emit() {},
  sockets: {
    sockets: new Map(),
    adapter: { rooms: new Map([["user:u-alice", new Set(["x"])], ["user:u-bob", new Set(["y"])]]) },
  },
  of() { return io; },
};
const sent = (room, event) => emitted.filter((e) => e.room === room && e.event === event);

async function request(app, method, path, { token, body } = {}) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json() };
  } finally {
    server.close();
  }
}

async function run() {
  for (const [a, b] of [["u-alice", "u-bob"], ["u-alice", "u-carol"]]) {
    if (!shared.friends.has(a)) shared.friends.set(a, new Set());
    if (!shared.friends.has(b)) shared.friends.set(b, new Set());
    shared.friends.get(a).add(b);
    shared.friends.get(b).add(a);
  }

  // ── Token scoping ──
  const session = signToken({ id: "u-alice", username: "alice", sid: "s-alice" });
  const scoped = notify.signNotifyToken({ userId: "u-alice", sid: "s-alice" });
  assert.equal(notify.verifyNotifyToken(scoped).sub, "u-alice");
  assert.throws(() => notify.verifyNotifyToken(session), (e) => e.status === 401, "a session JWT is not a notify token");
  assert.throws(() => verifyToken(scoped), "a notify token is not a session JWT");
  assert.throws(() => notify.signNotifyToken({ userId: "u-alice" }), (e) => e.code === "session_required");
  const expired = notify.signNotifyToken({ userId: "u-alice", sid: "s-alice" }, { ttlSec: -10 });
  assert.throws(() => notify.verifyNotifyToken(expired), (e) => e.code === "token_expired");

  // ── Pure helpers ──
  assert.deepEqual(notify.parseConversation("dm:u-bob"), { type: "dm", id: "u-bob" });
  assert.throws(() => notify.parseConversation("dm:../x"), (e) => e.code === "bad_conversation");
  assert.throws(() => notify.parseConversation("server:1"), (e) => e.code === "bad_conversation");
  assert.throws(() => notify.normalizeReplyText("   "), (e) => e.code === "empty");
  assert.throws(() => notify.normalizeReplyText("/zar"), (e) => e.code === "slash_in_app");
  assert.throws(() => notify.normalizeReplyText("x".repeat(11), 10), (e) => e.code === "too_long");
  assert.deepEqual(notify.QUICK_REACTIONS, ["❤️", "😂", "👍", "😮", "😢"]);
  assert.equal(notify.messageKind({ media_type: "image", media_url: "x" }), "image");
  assert.equal(notify.messageKind({ content: "__voice__:3" }), "voice");

  const router = require("../routes/notifyActions").createNotifyActionsRouter({ io });
  const app = express();
  app.use(express.json());
  app.use("/api/messages", router);

  // ── Mint: session JWT → scoped token; no auth → 401 ──
  assert.equal((await request(app, "POST", "/api/messages/notify-token")).status, 401);
  const minted = await request(app, "POST", "/api/messages/notify-token", { token: session });
  assert.equal(minted.status, 200);
  assert.equal(minted.json.userId, "u-alice");
  const token = minted.json.token;
  assert.equal((await request(app, "POST", "/api/messages/quick-reply", { token: session, body: { conv: "dm:u-bob", text: "x" } })).status, 401, "session JWT refused on action routes");

  // ── DM quick reply ──
  const before = rows("dm_messages").length;
  const r1 = await request(app, "POST", "/api/messages/quick-reply", { token, body: { conv: "dm:u-bob", text: "Geliyorum 👍" } });
  assert.equal(r1.status, 200, JSON.stringify(r1.json));
  assert.equal(rows("dm_messages").length, before + 1);
  const stored = rows("dm_messages").at(-1);
  assert.equal(stored.from_user_id, "u-alice");
  assert.equal(stored.to_user_id, "u-bob");
  assert.equal(stored.content, "Geliyorum 👍");
  assert.equal(r1.json.messageId, stored.id);
  const toBob = sent("user:u-bob", "dm:message");
  assert.equal(toBob.length, 1);
  assert.equal(toBob[0].payload.convWith, "u-alice");
  assert.equal(toBob[0].payload.text, "Geliyorum 👍");
  assert.equal(sent("user:u-alice", "dm:message")[0].payload.convWith, "u-bob", "echo to my other devices");
  assert.deepEqual(sent("user:u-bob", "dm:unread:sync").at(-1).payload, { peerId: "u-alice", count: 1 });
  assert.ok(pushCalls.some((c) => c.name === "sendDmMessagePush" && c.args[0][0] === "u-bob"), "recipient gets the push");
  // Replying marks bob's messages to me as read.
  assert.ok(rows("dm_messages").filter((m) => m.from_user_id === "u-bob" && m.to_user_id === "u-alice").every((m) => m.read_at));
  assert.ok(sent("user:u-bob", "dm:peer_read").length >= 1);

  shared.rateLimitDm.clear();
  // Blocked (carol blocked alice) / not friends / slash / empty.
  assert.equal((await request(app, "POST", "/api/messages/quick-reply", { token, body: { conv: "dm:u-carol", text: "hi" } })).json.error, "blocked");
  shared.rateLimitDm.clear();
  assert.equal((await request(app, "POST", "/api/messages/quick-reply", { token, body: { conv: "dm:u-dave", text: "hi" } })).status, 409);
  assert.equal((await request(app, "POST", "/api/messages/quick-reply", { token, body: { conv: "dm:u-bob", text: "/zar" } })).status, 422);
  assert.equal((await request(app, "POST", "/api/messages/quick-reply", { token, body: { conv: "dm:u-bob", text: "" } })).status, 400);

  // ── Group quick reply through the real group handler ──
  const gBefore = rows("group_messages").length;
  const g = await request(app, "POST", "/api/messages/quick-reply", { token, body: { conv: "group:g1", text: "Ben varım" } });
  assert.equal(g.status, 200, JSON.stringify(g.json));
  assert.equal(rows("group_messages").length, gBefore + 1);
  const gRow = rows("group_messages").at(-1);
  assert.equal(gRow.sender_id, "u-alice");
  assert.equal(gRow.content, "Ben varım");
  const gEmit = sent("group:g1", "group:message");
  assert.equal(gEmit.length, 1);
  assert.equal(gEmit[0].payload.message.id, gRow.id);
  assert.equal(g.json.messageId, gRow.id);
  // Not a member.
  const carolToken = notify.signNotifyToken({ userId: "u-carol", sid: "s-carol" });
  const g2 = await request(app, "POST", "/api/messages/quick-reply", { token: carolToken, body: { conv: "group:g1", text: "hi" } });
  assert.equal(g2.status, 403);
  assert.equal(g2.json.error, "not_member");

  // ── Quick reactions ──
  const react = await request(app, "POST", "/api/messages/quick-react", { token, body: { conv: "dm:u-bob", messageId: "dm-3", emoji: "😂" } });
  assert.equal(react.status, 200, JSON.stringify(react.json));
  const rx = rows("reactions").find((r) => r.message_id === "dm-3");
  assert.equal(rx.emoji, "😂");
  assert.equal(rx.conversation_type, "dm");
  assert.equal(rx.user_id, "u-alice");
  assert.equal(sent("user:u-bob", "reaction:update").at(-1).payload.emoji, "😂");
  assert.equal((await request(app, "POST", "/api/messages/quick-react", { token, body: { conv: "dm:u-bob", messageId: "dm-3", emoji: "🔥" } })).status, 400, "only the five");
  assert.equal((await request(app, "POST", "/api/messages/quick-react", { token, body: { conv: "dm:u-bob", messageId: "dm-x", emoji: "❤️" } })).status, 404, "foreign message");
  const gr = await request(app, "POST", "/api/messages/quick-react", { token, body: { conv: "group:g1", messageId: "gm-1", emoji: "❤️" } });
  assert.equal(gr.status, 200);
  assert.equal(sent("group:g1", "reaction:update").at(-1).payload.conversationId, "g1");

  // ── Mark as read ──
  rows("dm_messages").push({ id: "dm-4", from_user_id: "u-bob", to_user_id: "u-alice", content: "?", created_at: "2026-10-26T17:45:00.000Z", read_at: null });
  const rd = await request(app, "POST", "/api/messages/quick-read", { token, body: { conv: "dm:u-bob" } });
  assert.equal(rd.status, 200);
  assert.ok(rows("dm_messages").find((m) => m.id === "dm-4").read_at);
  assert.deepEqual(sent("user:u-alice", "dm:unread:sync").at(-1).payload, { peerId: "u-bob", count: 0 });
  const rdg = await request(app, "POST", "/api/messages/quick-read", { token, body: { conv: "group:g1" } });
  assert.equal(rdg.json.scope, "device");

  // ── Thread preview ──
  const th = await request(app, "GET", `/api/messages/notify-thread?conv=${encodeURIComponent("dm:u-bob")}&messageId=dm-3`, { token });
  assert.equal(th.status, 200, JSON.stringify(th.json));
  assert.deepEqual(th.json.messages.map((m) => m.id), ["dm-1", "dm-2", "dm-3"]);
  assert.deepEqual(th.json.messages.map((m) => m.mine), [false, true, false]);
  assert.equal(th.json.messages[0].fromName, "Bob");
  const thg = await request(app, "GET", `/api/messages/notify-thread?conv=${encodeURIComponent("group:g1")}`, { token });
  assert.equal(thg.json.title, "Hafta Sonu Ekibi");
  assert.equal(thg.json.memberCount, 3);
  assert.equal((await request(app, "GET", `/api/messages/notify-thread?conv=${encodeURIComponent("group:g1")}`, { token: carolToken })).status, 403);

  // ── Signed-out session kills the scoped token ──
  fake._tables.users.rows.find((u) => u.id === "u-alice").active_sessions = [];
  require("../lib/sessionGuard").invalidateSessionCache?.("u-alice");
  shared.revokedSessionIds.add("s-alice");
  const gone = await request(app, "POST", "/api/messages/quick-read", { token, body: { conv: "dm:u-bob" } });
  assert.equal(gone.status, 401);
  assert.equal(gone.json.error, "session_revoked");

  console.log("notifyActions integration ok");
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
