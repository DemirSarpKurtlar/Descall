"use strict";

/**
 * Regression (security audit 28 Nov 2026): typing:stop was relayed into any group room,
 * also from a socket that is not in it (typing:start already required the room).
 * Same room gate as typing:start; the DM branch stays friends-only.
 * Run: node test/typingStopGate.integration.test.cjs
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
const GROUP_ID = "g-typing";

const fakeSupabase = createFakeSupabase({
  users: Object.values(USERS).map((u) => ({ ...u, blocked_users: [] })),
  friendships: [{ id: "f1", user_id: USERS.alice.id, friend_id: USERS.bob.id, status: "accepted" }],
  groups: [{ id: GROUP_ID, name: "Squad", avatar_url: null }],
  group_members: [
    { id: "gm-a", group_id: GROUP_ID, user_id: USERS.alice.id },
    { id: "gm-b", group_id: GROUP_ID, user_id: USERS.bob.id },
  ],
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

/** The first matching event, or null after timeoutMs. */
function waitFor(s, event, pred = () => true, timeoutMs = 400) {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      s.off(event, handler);
      resolve(null);
    }, timeoutMs);
    function handler(payload) {
      if (!pred(payload)) return;
      clearTimeout(t);
      s.off(event, handler);
      resolve(payload);
    }
    s.on(event, handler);
  });
}

async function main() {
  const { server, io } = await start();
  try {
    const alice = await connect("alice");
    const bob = await connect("bob");
    const carol = await connect("carol");
    alice.emit("group:join", GROUP_ID);
    bob.emit("group:join", GROUP_ID);
    carol.emit("group:join", GROUP_ID); // not a member: refused
    await sleep(150);

    // A member's stop still reaches the room.
    let got = waitFor(alice, "typing:update", (p) => p?.context === "group");
    bob.emit("typing:stop", { context: "group", groupId: GROUP_ID });
    assert((await got)?.fromUser?.id === USERS.bob.id, "a member's typing:stop reaches the group");

    // An outsider cannot post into the group room.
    got = waitFor(alice, "typing:update", (p) => p?.context === "group");
    carol.emit("typing:stop", { context: "group", groupId: GROUP_ID });
    assert((await got) === null, "a non-member's typing:stop is not relayed into the group room");

    // DM: friends only, as typing:start.
    got = waitFor(alice, "typing:update", (p) => p?.context === "dm");
    carol.emit("typing:stop", { context: "dm", toUserId: USERS.alice.id });
    assert((await got) === null, "a stranger's DM typing:stop is not relayed");

    console.log("typingStopGate integration: ok");
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
