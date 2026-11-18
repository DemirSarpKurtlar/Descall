"use strict";

/**
 * "Gönderilen" friend requests (polish scan 17 Nov 2026, world-social-10): the sender
 * gets friend:outgoing on every device and can take a request back with friend:cancel;
 * the target's pending list follows. Real Socket.IO + handlers on the fake Supabase.
 *
 * Run: node test/friendOutgoing.integration.test.cjs
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
  dave: { id: "u-dave", username: "dave" },
};

const fakeSupabase = createFakeSupabase({
  users: Object.values(USERS).map((u) => ({ ...u, blocked_users: [], active_sessions: [{ id: `s-${u.username}` }] })),
  friendships: [{ id: "f1", user_id: USERS.alice.id, friend_id: USERS.carol.id, status: "accepted", created_at: "2026-01-01T00:00:00Z" }],
  message_requests: [],
});
// Builder methods some boot paths use that the shared fake lacks: no-op filters.
{
  const probe = fakeSupabase.from("__probe__");
  const proto = Object.getPrototypeOf(probe);
  for (const m of ["lt", "lte", "range", "contains", "filter", "match", "returns", "abortSignal", "like", "overlaps", "textSearch"]) {
    if (!proto[m]) proto[m] = function () { return this; };
  }
  // Real supabase-js resolves asynchronously; the shared fake resolves inside
  // .then() synchronously, which would run "after insert" callbacks before
  // the handler's next line (e.g. before activeGroupCalls.set).
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
// No real pushes from a test.
const asyncNoop = new Proxy({}, { get: () => async () => ({ ok: true }) });
stubModule("../lib/webPush", asyncNoop);
stubModule("../lib/voipPush", asyncNoop);


const express = require("express");
const { Server } = require("socket.io");
const { io: ioClient } = require(path.join(__dirname, "../../node_modules/socket.io-client"));
const { registerSocketHandlers } = require("../socket/handlers");
const friendsRouter = require("../routes/friends");
const { signToken } = require("../config/jwt");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let port;
async function start() {
  const app = express();
  app.use(express.json());
  app.use("/api/friends", friendsRouter);
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });
  app.set("io", io);
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
/** A device: a socket plus every event it received. */
async function device(as) {
  const s = ioClient(`http://127.0.0.1:${port}`, { auth: { as }, transports: ["websocket"], reconnection: false, forceNew: true });
  openSockets.add(s);
  const log = [];
  s.onAny((event, payload) => log.push({ event, payload }));
  await new Promise((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  await sleep(150); // boot emits (friend:list, friend:requests, ...)
  return { s, log, clear: () => (log.length = 0) };
}
const got = (d, event, pred = () => true) => d.log.filter((e) => e.event === event && pred(e.payload));
const listHas = (id) => (list) => Array.isArray(list) && list.some((u) => u?.id === id);
const listLacks = (id) => (list) => Array.isArray(list) && !list.some((u) => u?.id === id);

async function rest(as, route, body) {
  const u = USERS[as];
  const res = await fetch(`http://127.0.0.1:${port}/api/friends/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: u.id, username: u.username, sid: `s-${u.username}` })}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function restGet(as, route) {
  const u = USERS[as];
  const res = await fetch(`http://127.0.0.1:${port}/api/friends/${route}`, {
    headers: { Authorization: `Bearer ${signToken({ id: u.id, username: u.username, sid: `s-${u.username}` })}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const settle = () => sleep(250);

async function run() {
  const { server, io } = await start();
  try {
    const davePhone = await device("dave");
    const daveWeb = await device("dave");
    const carol = await device("carol");
    for (const d of [davePhone, daveWeb, carol]) d.clear();

    daveWeb.s.emit("friend:request", { toUsername: "carol" });
    await settle();
    for (const [name, d] of [["davePhone", davePhone], ["daveWeb", daveWeb]]) {
      assert(got(d, "friend:outgoing", listHas(USERS.carol.id)).length >= 1, `${name} got friend:outgoing with carol`);
    }
    assert(got(carol, "friend:requests", listHas(USERS.dave.id)).length >= 1, "carol sees dave's request");

    // friend:list (app boot / refresh) includes the outgoing list too.
    davePhone.clear();
    davePhone.s.emit("friend:list");
    await settle();
    assert(got(davePhone, "friend:outgoing", listHas(USERS.carol.id)).length === 1, "friend:list answers with friend:outgoing");

    // A bad id is refused without touching the database.
    daveWeb.clear();
    daveWeb.s.emit("friend:cancel", { toUserId: "x),or(user_id.not.is.null" });
    await settle();
    assert(got(daveWeb, "friend:error").length === 1, "bad cancel id refused");

    for (const d of [davePhone, daveWeb, carol]) d.clear();
    daveWeb.s.emit("friend:cancel", { toUserId: USERS.carol.id });
    await settle();
    for (const [name, d] of [["davePhone", davePhone], ["daveWeb", daveWeb]]) {
      assert(got(d, "friend:outgoing", listLacks(USERS.carol.id)).length >= 1, `${name} got friend:outgoing without carol`);
    }
    assert(got(carol, "friend:requests", listLacks(USERS.dave.id)).length >= 1, "carol's pending list drops dave");
    const rows = fakeSupabase._tables.friendships.rows.filter((r) => r.user_id === USERS.dave.id && r.friend_id === USERS.carol.id);
    assert(rows.length === 0, "row deleted");

    // REST request (profile "Arkadaş ekle") updates the sender's list as well.
    for (const d of [davePhone, daveWeb]) d.clear();
    const r = await rest("dave", "request", { username: "bob" });
    assert(r.status === 200, `REST request ok (${r.status})`);
    await settle();
    assert(got(davePhone, "friend:outgoing", listHas(USERS.bob.id)).length >= 1, "REST request updates friend:outgoing");
    console.log("friendOutgoing.integration.test: ok");
  } finally {
    for (const s of openSockets) s.close();
    io.close();
    server.close();
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
