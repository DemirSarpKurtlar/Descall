"use strict";

/**
 * Regression (security audit 28 Nov 2026): a block must not be undone by the person who
 * was blocked. Blocking deleted the friendship rows but not the pending message request,
 * and the socket accept paths never looked at the block list, so:
 *   - alice sends bob a message request, then blocks him; bob accepts the stale request
 *     (dm:request:accept) and becomes alice's friend again (friend list, presence,
 *     adding her to group chats);
 *   - a pending friend request that survived the block (another node, a failed
 *     best-effort delete) could still be accepted over the socket (friend:accept),
 *     while the REST /friends/accept route already refused it.
 * Run: node test/blockFriendRestore.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.NODE_ENV = "test";

const path = require("path");
const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const USERS = {
  alice: { id: "u-alice", username: "alice" },
  bob: { id: "u-bob", username: "bob" },
  carol: { id: "u-carol", username: "carol" },
};

const fakeSupabase = createFakeSupabase({
  users: Object.values(USERS).map((u) => ({ ...u, blocked_users: [] })),
  friendships: [],
  dm_message_requests: [],
});
{
  const probe = fakeSupabase.from("__probe__");
  const proto = Object.getPrototypeOf(probe);
  for (const m of ["lt", "lte", "range", "contains", "filter", "match", "returns", "abortSignal", "like", "overlaps", "textSearch"]) {
    if (!proto[m]) proto[m] = function () { return this; };
  }
  const syncThen = proto.then;
  proto.then = function (resolve, reject) {
    return Promise.resolve().then(() => new Promise((res, rej) => syncThen.call(this, res, rej))).then(resolve, reject);
  };
}
fakeSupabase.rpc = async () => ({ data: null, error: null });
fakeSupabase.storage = { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) };

function stubModule(rel, exportsObj) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exportsObj };
}
stubModule("../db/supabase", fakeSupabase);
const asyncNoop = new Proxy({}, { get: () => async () => ({ ok: true }) });
stubModule("../lib/webPush", asyncNoop);
stubModule("../lib/voipPush", asyncNoop);

const { Server } = require("socket.io");
const { io: ioClient } = require(path.join(__dirname, "../../node_modules/socket.io-client"));
const { registerSocketHandlers } = require("../socket/handlers");
const { blockUser, isBlockedEitherWay } = require("../lib/blocking");
const { upsertMessageRequest, listMessageRequests } = require("../lib/messageRequestStore");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

let port;
async function start() {
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: "*" } });
  io.use((socket, next) => {
    const u = USERS[socket.handshake.auth?.as];
    if (!u) return next(new Error("unknown test user"));
    socket.user = { ...u };
    next();
  });
  registerSocketHandlers(io);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
  return { server, io };
}

const openSockets = new Set();
async function connect(as) {
  const s = ioClient(`http://127.0.0.1:${port}`, { auth: { as }, transports: ["websocket"], reconnection: false, forceNew: true });
  openSockets.add(s);
  await new Promise((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  await sleep(30);
  return s;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const acceptedBetween = (a, b) =>
  fakeSupabase._tables.friendships.rows.some(
    (r) => r.status === "accepted" && ((r.user_id === a && r.friend_id === b) || (r.user_id === b && r.friend_id === a))
  );

async function main() {
  const { server, io } = await start();
  try {
    const bob = await connect("bob");
    const carol = await connect("carol");

    // 1) Stale message request: alice -> bob, then alice blocks bob.
    await upsertMessageRequest(fakeSupabase, { fromUserId: USERS.alice.id, toUserId: USERS.bob.id, username: "alice", preview: "hi" });
    const blocked = await blockUser(USERS.alice.id, USERS.bob.id);
    assert(blocked.ok, "alice blocks bob");
    assert(await isBlockedEitherWay(USERS.bob.id, USERS.alice.id), "block is in place");
    const left = await listMessageRequests(fakeSupabase, USERS.bob.id);
    assert(!left.some((r) => r.id === USERS.alice.id), "the block removes alice's pending message request: " + JSON.stringify(left));

    bob.emit("dm:request:accept", { fromUserId: USERS.alice.id });
    await sleep(250);
    assert(!acceptedBetween(USERS.alice.id, USERS.bob.id), "bob cannot turn a stale message request into a friendship with the user who blocked him");

    // 2) A pending friend request that outlived a block (row left behind) is refused on the socket too.
    fakeSupabase._tables.friendships.rows.push({ id: "f-stale", user_id: USERS.alice.id, friend_id: USERS.carol.id, status: "pending" });
    const aliceRow = fakeSupabase._tables.users.rows.find((u) => u.id === USERS.alice.id);
    aliceRow.blocked_users = [...(aliceRow.blocked_users || []), USERS.carol.id];
    require("../lib/blocking").invalidate?.(USERS.alice.id);
    assert(await isBlockedEitherWay(USERS.carol.id, USERS.alice.id), "alice blocked carol");
    carol.emit("friend:accept", { fromUserId: USERS.alice.id });
    await sleep(250);
    assert(!acceptedBetween(USERS.alice.id, USERS.carol.id), "friend:accept refuses a request across a block (REST /friends/accept already did)");

    console.log("blockFriendRestore integration: ok");
  } finally {
    for (const s of openSockets) s.disconnect();
    io.close();
    server.close();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
