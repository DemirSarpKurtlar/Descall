"use strict";

/**
 * Polish scan (17 Nov 2026), messaging fixes on the fake database:
 *   messaging-22  group:message with a non-string content answers an error, never throws.
 *   messaging-06  DM and group text over Sistem › maxMessageLength is refused.
 *   messaging-19  a group @mention only reaches members (not strangers, not across a block).
 *   messaging-05  a DM edit keeps the stored edit history even with an empty cache.
 *   messaging-04  a DM / group edit runs the same length and type rules as sending.
 *   messaging-14  DM typing only reaches friends.
 *   messaging-08  group create: friends only, no blocks, no orphan group on bad input.
 *   messaging-07  the REST group send route is gone (410).
 * Run: node frontend/backend/test/messagingPolish.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("node:assert/strict");
const http = require("node:http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ALICE = id(1), BOB = id(2), CAROL = id(3), STRANGER = id(4), BLOCKER = id(5);
const G = id(10);
const DM_OLD = id(30);

const fake = createFakeSupabase({
  users: [
    { id: ALICE, username: "alice", active_sessions: [{ id: "s-alice" }], blocked_users: [] },
    { id: BOB, username: "bob", active_sessions: [{ id: "s-bob" }], blocked_users: [] },
    { id: CAROL, username: "carol", active_sessions: [{ id: "s-carol" }], blocked_users: [] },
    { id: STRANGER, username: "stranger", active_sessions: [{ id: "s-stranger" }], blocked_users: [] },
    { id: BLOCKER, username: "blocker", active_sessions: [{ id: "s-blocker" }], blocked_users: [ALICE] },
  ],
  friendships: [
    { id: "f1", user_id: ALICE, friend_id: BOB, status: "accepted" },
    { id: "f2", user_id: ALICE, friend_id: BLOCKER, status: "accepted" },
  ],
  groups: [{ id: G, name: "Ekip", created_by: ALICE }],
  group_members: [
    { group_id: G, user_id: ALICE }, { group_id: G, user_id: BOB }, { group_id: G, user_id: CAROL }, { group_id: G, user_id: BLOCKER },
  ],
  group_messages: [],
  dm_messages: [
    {
      id: DM_OLD, from_user_id: ALICE, to_user_id: BOB, content: "ikinci hali", created_at: "2026-11-01T09:00:00.000Z",
      edited_at: "2026-11-01T09:05:00.000Z", edit_history: [{ text: "ilk hali", editedAt: "2026-11-01T09:05:00.000Z" }],
    },
  ],
  group_read_state: [],
  reactions: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const shared = require("../runtime/sharedState");
const rows = (t) => fake._tables[t]?.rows || [];
const emitted = [];

function makeSocket(userId, username, out) {
  const handlers = new Map();
  const rooms = new Set();
  const sock = {
    id: `sock-${username}`,
    user: { id: userId, username },
    handshake: { auth: {} },
    data: {},
    rooms,
    on(ev, fn) { handlers.set(ev, fn); },
    onAny() {}, use() {},
    emit(ev, data) { out.push({ ev, data }); },
    join(r) { (Array.isArray(r) ? r : [r]).forEach((x) => rooms.add(x)); },
    leave(r) { rooms.delete(r); },
    to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }) }; },
    broadcast: { emit() {}, to: (r) => ({ emit: (event, payload) => emitted.push({ room: r, event, payload }) }) },
    disconnect() {},
  };
  return { sock, handlers };
}

async function socketPart() {
  const target = (room, except = []) => ({
    emit: (event, payload) => emitted.push({ room, except, event, payload }),
    to: () => target(room, except),
    except: (r) => target(room, [...except, ...(Array.isArray(r) ? r : [r])]),
  });
  const sio = {
    _conn: null,
    on(ev, fn) { if (ev === "connection") this._conn = fn; },
    to(room) { return target(room); },
    in(room) { return { ...target(room), socketsLeave() {}, socketsJoin() {}, fetchSockets: async () => [] }; },
    emit() {},
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    of() { return sio; },
    fetchSockets: async () => [],
  };
  const { registerSocketHandlers } = require("../socket/handlers");
  registerSocketHandlers(sio);
  const out = [];
  const alice = makeSocket(ALICE, "alice", out);
  sio.sockets.sockets.set(alice.sock.id, alice.sock);
  sio._conn(alice.sock);
  await new Promise((r) => setTimeout(r, 40));
  for (const [a, b] of [[ALICE, BOB], [ALICE, BLOCKER]]) {
    if (!shared.friends.has(a)) shared.friends.set(a, new Set());
    if (!shared.friends.has(b)) shared.friends.set(b, new Set());
    shared.friends.get(a).add(b);
    shared.friends.get(b).add(a);
  }
  const call = async (event, payload) => { await alice.handlers.get(event)(payload); };
  const lastOut = (ev) => out.filter((e) => e.ev === ev).at(-1);
  const max = Number(shared.systemConfig.maxMessageLength) || 2000;
  await call("group:join", G);

  // messaging-22: bad types never throw, the sender gets an error.
  for (const content of [123, { a: 1 }, ["x"]]) {
    await call("group:message", { groupId: G, tempId: "t-bad", content });
    assert.equal(lastOut("group:message:error")?.data?.tempId, "t-bad");
  }
  await call("group:message", { groupId: 42, content: "x" });
  await call("group:message", { groupId: G, tempId: "t-media", content: "x", mediaUrl: { evil: true } });
  assert.equal(lastOut("group:message:error")?.data?.tempId, "t-media");
  assert.equal(rows("group_messages").length, 0, "nothing stored for malformed sends");

  // messaging-06: too long.
  await call("group:message", { groupId: G, tempId: "t-long", content: "a".repeat(max + 1) });
  assert.equal(lastOut("group:message:error")?.data?.code, "TOO_LONG");
  assert.equal(rows("group_messages").length, 0);
  shared.rateLimitDm.clear();
  await call("dm:send", { toUserId: BOB, tempId: "d-long", text: "a".repeat(max + 1) });
  assert.equal(lastOut("dm:error")?.data?.code, "TOO_LONG");
  assert.equal(lastOut("dm:error")?.data?.tempId, "d-long");
  assert.equal(rows("dm_messages").length, 1, "the long DM is not stored");
  shared.rateLimitDm.clear();
  await call("dm:send", { toUserId: BOB, tempId: "d-obj", text: { x: 1 } });
  assert.equal(lastOut("dm:error")?.data?.code, "BAD_TEXT");

  // messaging-19: @mentions reach members only, never across a block.
  emitted.length = 0;
  await call("group:message", { groupId: G, tempId: "t-m", content: "selam @bob @stranger @blocker @carol" });
  assert.equal(rows("group_messages").length, 1, "the message itself is stored");
  const pinged = emitted.filter((e) => e.event === "mention:received").map((e) => e.room);
  assert.ok(pinged.includes(`user:${BOB}`), "a member is pinged");
  assert.ok(pinged.includes(`user:${CAROL}`), "a non-friend member is pinged");
  assert.ok(!pinged.includes(`user:${STRANGER}`), "a stranger outside the group is never pinged");
  assert.ok(!pinged.includes(`user:${BLOCKER}`), "a member who blocked the sender is not pinged");

  // messaging-05: edit history comes from the database, the cache is empty here.
  shared.dmHistory.clear();
  await call("dm:message:edit", { messageId: DM_OLD, toUserId: BOB, newText: "  üçüncü hali  " });
  const edited = rows("dm_messages").find((m) => m.id === DM_OLD);
  assert.equal(edited.content, "üçüncü hali", "trimmed");
  assert.deepEqual(edited.edit_history.map((h) => h.text), ["ilk hali", "ikinci hali"], "earlier versions are kept");

  // messaging-04: edits follow the send rules.
  await call("dm:message:edit", { messageId: DM_OLD, toUserId: BOB, newText: "a".repeat(max + 1) });
  assert.equal(lastOut("dm:error")?.data?.code, "TOO_LONG");
  await call("dm:message:edit", { messageId: DM_OLD, toUserId: BOB, newText: { a: 1 } });
  assert.equal(lastOut("dm:error")?.data?.code, "BAD_TEXT");
  assert.equal(rows("dm_messages").find((m) => m.id === DM_OLD).content, "üçüncü hali");

  // messaging-14: DM typing only to friends.
  for (const u of [BOB, STRANGER]) sio.sockets.adapter.rooms.set(`user:${u}`, new Set([`sock-${u}`]));
  emitted.length = 0;
  const typingTo = () => emitted.filter((e) => e.event === "typing:update").map((e) => e.room);
  await call("typing:start", { context: "dm", toUserId: STRANGER });
  assert.ok(!typingTo().includes(`user:${STRANGER}`), "no typing to a stranger");
  await call("typing:start", { context: "dm", toUserId: BOB });
  assert.ok(typingTo().includes(`user:${BOB}`), "typing to a friend still works");
}

async function restPart() {
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const groupsRouter = require("../routes/groups");
  const app = express();
  app.use(express.json());
  app.set("io", { to: () => ({ emit() {} }), in: () => ({ socketsJoin() {}, socketsLeave() {} }) });
  app.use("/api/groups", groupsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/groups`;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${signToken({ id: ALICE, username: "alice", sid: "s-alice" })}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const groupCount = () => rows("groups").length;
  try {
    const before = groupCount();
    let r = await call("POST", "/create", { name: "Yabancılar", memberIds: [STRANGER] });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "NOT_FRIENDS");
    r = await call("POST", "/create", { name: "Engel", memberIds: [BLOCKER] });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "BLOCKED");
    r = await call("POST", "/create", { name: "Bozuk", memberIds: "bob" });
    assert.equal(r.status, 400);
    r = await call("POST", "/create", { name: "Bozuk", memberIds: [123] });
    assert.equal(r.status, 400);
    assert.equal(groupCount(), before, "no group row for a refused create");

    r = await call("POST", "/create", { name: "Arkadaşlar", memberIds: [BOB, BOB, ALICE] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.group.memberCount, 2, "duplicates and self are dropped");
    assert.equal(r.body.details, undefined);

    r = await call("POST", `/${G}/messages`, { content: "rest", mediaType: "app_card" });
    assert.equal(r.status, 410);
    assert.ok(!rows("group_messages").some((m) => m.content === "rest"));
  } finally {
    server.close();
  }
}

(async () => {
  await socketPart();
  await restPart();
  console.log("messagingPolish integration OK");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
