"use strict";

/**
 * Master Update A2 (PR-6): reaction:add / reaction:remove answer an optional
 * ack so the client can roll back an optimistic chip, and a block (either
 * way) stops DM reactions server-side. Old callers without an ack still work.
 * Run: node frontend/backend/test/reactionAck.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };

const fake = createFakeSupabase({
  users: [
    { id: "u-alice", username: "alice", active_sessions: [{ id: "s-alice" }], blocked_users: [] },
    { id: "u-bob", username: "bob", active_sessions: [{ id: "s-bob" }], blocked_users: [] },
    { id: "u-carol", username: "carol", active_sessions: [{ id: "s-carol" }], blocked_users: ["u-alice"] },
  ],
  friendships: [
    { id: "f1", user_id: "u-alice", friend_id: "u-bob", status: "accepted" },
    { id: "f2", user_id: "u-alice", friend_id: "u-carol", status: "accepted" },
  ],
  reactions: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const { friends } = require("../runtime/sharedState");
const rows = (t) => fake._tables[t]?.rows || [];
const emitted = [];

function makeSocket(userId, out) {
  const handlers = new Map();
  const rooms = new Set();
  const sock = {
    id: `sock-${userId}`,
    user: { id: userId, username: userId.slice(2) },
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
  const sio = {
    _conn: null,
    on(ev, fn) { if (ev === "connection") this._conn = fn; },
    to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }), to: () => sio.to(room) }; },
    in(room) { return { ...sio.to(room), socketsLeave() {}, socketsJoin() {}, fetchSockets: async () => [] }; },
    emit() {},
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    of() { return sio; },
    fetchSockets: async () => [],
  };
  const { registerSocketHandlers } = require("../socket/handlers");
  registerSocketHandlers(sio);
  const aliceOut = [];
  const alice = makeSocket("u-alice", aliceOut);
  sio.sockets.sockets.set(alice.sock.id, alice.sock);
  sio._conn(alice.sock);
  await new Promise((r) => setTimeout(r, 40));
  // Friend graph as the connect handler would hydrate it.
  for (const [a, b] of [["u-alice", "u-bob"], ["u-alice", "u-carol"]]) {
    if (!friends.has(a)) friends.set(a, new Set());
    if (!friends.has(b)) friends.set(b, new Set());
    friends.get(a).add(b);
    friends.get(b).add(a);
  }

  const ask = (event, payload) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event}: no ack`)), 2000);
    alice.handlers.get(event)(payload, (res) => { clearTimeout(timer); resolve(res); });
  });
  const dm = (peer, emoji, extra = {}) => ({ messageId: "msg-1", conversationType: "dm", conversationId: `u-alice::${peer}`, emoji, ...extra });

  // add → ok + stored + self echo
  let res = await ask("reaction:add", dm("u-bob", "❤️", { clientReqId: "rx-1" }));
  assert.deepEqual(res, { ok: true });
  assert.equal(rows("reactions").filter((r) => r.user_id === "u-alice" && r.emoji === "❤️").length, 1);
  assert.ok(aliceOut.some((e) => e.ev === "reaction:update" && e.data.emoji === "❤️" && !e.data.removed), "self echo");

  // remove → ok + gone
  res = await ask("reaction:remove", dm("u-bob", "❤️"));
  assert.deepEqual(res, { ok: true });
  assert.equal(rows("reactions").filter((r) => r.user_id === "u-alice" && r.emoji === "❤️").length, 0);

  // invalid payload → ok:false (no hang)
  res = await ask("reaction:add", { messageId: "msg-1" });
  assert.equal(res.ok, false);
  res = await ask("reaction:remove", { conversationType: "dm" });
  assert.equal(res.ok, false);

  // unknown conversation type → ok:false
  res = await ask("reaction:add", { messageId: "m", conversationType: "nope", conversationId: "x", emoji: "👍" });
  assert.equal(res.ok, false);

  // blocked (carol blocked alice) → refused + nothing stored
  const before = rows("reactions").length;
  res = await ask("reaction:add", dm("u-carol", "👍"));
  assert.deepEqual(res, { ok: false, error: "blocked" });
  assert.equal(rows("reactions").length, before, "no row for a blocked pair");

  // a non-friend with no open thread → refused
  res = await ask("reaction:add", dm("u-zed", "👍"));
  assert.equal(res.ok, false);

  // Old clients: no ack callback must not throw.
  await alice.handlers.get("reaction:add")(dm("u-bob", "🔥"));
  await alice.handlers.get("reaction:add")({});
  assert.equal(rows("reactions").filter((r) => r.emoji === "🔥").length, 1);

  // Storage failure → ok:false "failed"
  const realFrom = fake.from.bind(fake);
  fake.from = (t) => {
    if (t !== "reactions") return realFrom(t);
    return { upsert: () => ({ select: async () => ({ data: null, error: { message: "boom" } }) }) };
  };
  const origErr = console.error;
  console.error = () => {};
  try {
    res = await ask("reaction:add", dm("u-bob", "😮"));
  } finally {
    console.error = origErr;
    fake.from = realFrom;
  }
  assert.deepEqual(res, { ok: false, error: "failed" });

  console.log("reactionAck.integration.test.cjs: ok");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
