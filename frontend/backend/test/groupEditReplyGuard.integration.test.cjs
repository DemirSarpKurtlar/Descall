"use strict";

/**
 * Security review F1 / F2 / F4.
 *   F1: group:message:edit only changes the sender's own message in that
 *       group; anything else is refused and never broadcast.
 *   F2: group and DM reply quotes are read from the database (same
 *       conversation only); a forged quote is replaced or dropped, and the
 *       forward mark only comes from `forwarded: true`.
 *   F4: group:read skips members who turned read receipts off.
 * Run: node frontend/backend/test/groupEditReplyGuard.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ALICE = id(1), BOB = id(2), CAROL = id(3), DAVE = id(4);
const G = id(10), G2 = id(11);
const BOB_MSG = id(20), ALICE_MSG = id(21), OTHER_GROUP_MSG = id(22), ALICE_MSG_G2 = id(23);
const DM_BOB = id(30), DM_FOREIGN = id(31);

const fake = createFakeSupabase({
  users: [
    { id: ALICE, username: "alice", avatar_url: "https://cdn.example/a.png", read_receipts: true, active_sessions: [{ id: "s-a" }], blocked_users: [] },
    { id: BOB, username: "bob", avatar_url: "https://cdn.example/b.png", read_receipts: true, active_sessions: [{ id: "s-b" }], blocked_users: [] },
    { id: CAROL, username: "carol", read_receipts: false, active_sessions: [{ id: "s-c" }], blocked_users: [] },
    { id: DAVE, username: "dave", active_sessions: [{ id: "s-d" }], blocked_users: [] },
  ],
  friendships: [{ id: "f1", user_id: ALICE, friend_id: BOB, status: "accepted" }],
  groups: [{ id: G, name: "Ekip" }, { id: G2, name: "Diğer" }],
  group_members: [
    { group_id: G, user_id: ALICE }, { group_id: G, user_id: BOB }, { group_id: G, user_id: CAROL },
    { group_id: G2, user_id: ALICE }, { group_id: G2, user_id: DAVE },
  ],
  group_messages: [
    { id: BOB_MSG, group_id: G, sender_id: BOB, content: "Bob'un asıl mesajı", created_at: "2026-11-06T10:00:00.000Z" },
    { id: ALICE_MSG, group_id: G, sender_id: ALICE, content: "Alice ilk hali", created_at: "2026-11-06T10:01:00.000Z" },
    { id: OTHER_GROUP_MSG, group_id: G2, sender_id: DAVE, content: "başka grup", created_at: "2026-11-06T10:02:00.000Z" },
    { id: ALICE_MSG_G2, group_id: G2, sender_id: ALICE, content: "G2'deki mesajım", created_at: "2026-11-06T10:03:00.000Z" },
  ],
  dm_messages: [
    { id: DM_BOB, from_user_id: BOB, to_user_id: ALICE, content: "DM asıl metin", created_at: "2026-11-06T09:00:00.000Z" },
    { id: DM_FOREIGN, from_user_id: CAROL, to_user_id: DAVE, content: "gizli", created_at: "2026-11-06T09:00:00.000Z" },
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

async function run() {
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
  const aliceOut = [];
  const alice = makeSocket(ALICE, "alice", aliceOut);
  sio.sockets.sockets.set(alice.sock.id, alice.sock);
  sio._conn(alice.sock);
  await new Promise((r) => setTimeout(r, 40));
  for (const [a, b] of [[ALICE, BOB]]) {
    if (!shared.friends.has(a)) shared.friends.set(a, new Set());
    if (!shared.friends.has(b)) shared.friends.set(b, new Set());
    shared.friends.get(a).add(b);
    shared.friends.get(b).add(a);
  }
  const call = async (event, payload) => { await alice.handlers.get(event)(payload); };
  await call("group:join", G);
  await call("group:join", G2);
  assert.ok(alice.sock.rooms.has(`group:${G}`) && alice.sock.rooms.has(`group:${G2}`));

  // ── F1: edit ──
  const edits = () => emitted.filter((e) => e.event === "group:message:edited");
  const errors = () => aliceOut.filter((e) => e.ev === "group:message:error");
  const content = (mid) => rows("group_messages").find((m) => m.id === mid).content;

  await call("group:message:edit", { groupId: G, messageId: BOB_MSG, newText: "Alice yazdı" });
  assert.equal(content(BOB_MSG), "Bob'un asıl mesajı", "another member's message is untouched");
  assert.equal(edits().length, 0, "nothing broadcast for a refused edit");
  assert.equal(errors().length, 1, "the editor is told it failed");
  assert.equal(errors()[0].data.messageId, BOB_MSG);

  // My own message, but named under another group I am in: refused, nothing broadcast.
  await call("group:message:edit", { groupId: G2, messageId: ALICE_MSG, newText: "yanlış grup" });
  assert.equal(content(ALICE_MSG), "Alice ilk hali");
  assert.equal(edits().length, 0);
  assert.equal(errors().length, 2);

  // Too long / empty: refused before any write.
  await call("group:message:edit", { groupId: G, messageId: ALICE_MSG, newText: "x".repeat((shared.systemConfig.maxMessageLength || 2000) + 1) });
  await call("group:message:edit", { groupId: G, messageId: ALICE_MSG, newText: "   " });
  assert.equal(content(ALICE_MSG), "Alice ilk hali");
  assert.equal(edits().length, 0);
  assert.equal(errors().length, 4);

  // My own message in its group: stored and broadcast once, trimmed.
  await call("group:message:edit", { groupId: G, messageId: ALICE_MSG, newText: "  Alice yeni hali  " });
  assert.equal(content(ALICE_MSG), "Alice yeni hali");
  assert.equal(edits().length, 1);
  assert.equal(edits()[0].room, `group:${G}`);
  assert.equal(edits()[0].payload.newText, "Alice yeni hali");
  assert.equal(edits()[0].payload.editedBy, ALICE);
  assert.equal(errors().length, 4);

  // ── F2: group reply quotes ──
  const lastGroupRow = () => rows("group_messages").at(-1);
  const send = (payload) => call("group:message", { groupId: G, tempId: `t-${Math.random()}`, ...payload });

  await send({ content: "cevap", replyTo: { id: BOB_MSG, text: "Bob: şifrem 1234", mediaType: "image", from: { id: BOB, username: "admin", avatar: "javascript:x" } } });
  let row = lastGroupRow();
  assert.equal(row.content, "cevap");
  assert.deepEqual(row.reply_to, {
    id: BOB_MSG,
    text: "Bob'un asıl mesajı",
    mediaType: null,
    from: { id: BOB, username: "bob", avatar: "https://cdn.example/b.png" },
  }, "the forged quote is replaced by the stored message");
  const echo = emitted.filter((e) => e.event === "group:message" && e.room === `group:${G}`).at(-1);
  assert.deepEqual(echo.payload.message.replyTo, row.reply_to, "the live echo carries the same quote");

  await send({ content: "başka gruptan alıntı", replyTo: { id: OTHER_GROUP_MSG, text: "uydurma" } });
  row = lastGroupRow();
  assert.equal(row.content, "başka gruptan alıntı");
  assert.equal(row.reply_to ?? null, null, "a quote from another group is dropped");

  await send({ content: "olmayan", replyTo: { id: id(999), text: "uydurma", from: { username: "x" } } });
  assert.equal(lastGroupRow().reply_to ?? null, null, "a missing message is dropped");

  await send({ content: "sahte iletim", replyTo: { forwarded: true } });
  assert.equal(lastGroupRow().reply_to ?? null, null, "a client cannot set the forward mark through replyTo");

  await send({ content: "iletildi", forwarded: true, replyTo: { id: BOB_MSG } });
  assert.deepEqual(lastGroupRow().reply_to, { forwarded: true }, "the forward path still marks the message");

  // ── F2: DM reply quotes ──
  const lastDm = () => rows("dm_messages").at(-1);
  shared.rateLimitDm.clear();
  await call("dm:send", { toUserId: BOB, tempId: "d1", text: "dm cevap", replyTo: { id: DM_BOB, text: "uydurma", from: { username: "admin" } } });
  assert.equal(lastDm().content, "dm cevap");
  assert.deepEqual(lastDm().reply_to, {
    id: DM_BOB,
    text: "DM asıl metin",
    mediaType: null,
    from: { id: BOB, username: "bob", avatar: "https://cdn.example/b.png" },
  });
  shared.rateLimitDm.clear();
  await call("dm:send", { toUserId: BOB, tempId: "d2", text: "sızdırma", replyTo: { id: DM_FOREIGN, text: "x" } });
  assert.equal(lastDm().content, "sızdırma");
  assert.equal(lastDm().reply_to, null, "a message from someone else's DM is never quoted");
  shared.rateLimitDm.clear();
  await call("dm:send", { toUserId: BOB, tempId: "d3", text: "ilet", forwarded: true });
  assert.deepEqual(lastDm().reply_to, { forwarded: true });

  // The size cap keeps the stored JSON small.
  const { capReplyMeta, REPLY_JSON_MAX } = require("../lib/replyMeta");
  const big = { id: BOB_MSG, text: "a".repeat(500), mediaType: null, from: { id: BOB, username: "bob", avatar: `data:image/png;base64,${"A".repeat(5000)}` } };
  const capped = capReplyMeta(big);
  assert.equal(capped.from.avatar, null, "a huge avatar is dropped first");
  assert.ok(JSON.stringify(capped).length <= REPLY_JSON_MAX);

  // ── F4: group:read skips members with receipts off ──
  await call("group:mark_read", { groupId: G });
  const read = emitted.filter((e) => e.event === "group:read").at(-1);
  assert.ok(read, "the read is reported");
  assert.equal(read.room, `group:${G}`);
  assert.deepEqual(read.except, [`user:${CAROL}`], "carol turned receipts off: she does not get it");

  console.log("groupEditReplyGuard integration test OK");
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
