"use strict";

/**
 * Friend events reach every device in real time (real Socket.IO + real
 * handlers + routes/friends.js against the fake Supabase).
 *
 * Regression (Oct 2026, "yeni arkadaşlıklar ve DM'ler canlı gelmiyor"):
 * the REST routes emitted to `presence.socketId` (the last socket to connect,
 * one device) and the socket handlers answered the acting user with
 * `socket.emit` (the tab that clicked). A phone app and a web tab of the same
 * person missed new requests and friendships until a manual reload.
 * REST decline/remove did not touch server memory or notify anyone.
 *
 * Run: node test/friendRealtime.integration.test.cjs
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
    // Two devices each (phone app + web tab). Presence remembers only the last socket.
    const bobPhone = await device("bob");
    const bobWeb = await device("bob");
    const alicePhone = await device("alice");
    const aliceWeb = await device("alice");
    for (const d of [bobPhone, bobWeb, alicePhone, aliceWeb]) d.clear();

    // 1. REST request (profile "add friend"): every recipient device hears it.
    let r = await rest("alice", "request", { username: "bob" });
    assert(r.status === 200, `REST request ok (${r.status} ${JSON.stringify(r.body)})`);
    await settle();
    for (const [name, d] of [["bobPhone", bobPhone], ["bobWeb", bobWeb]]) {
      assert(got(d, "friend:request:incoming", (p) => p?.from?.id === USERS.alice.id).length === 1, `${name} got friend:request:incoming once`);
      assert(got(d, "friend:requests", listHas(USERS.alice.id)).length >= 1, `${name} got a friend:requests list with alice`);
    }

    // 2. Socket accept on bob's web tab: bob's phone gets the new friendship too.
    for (const d of [bobPhone, bobWeb, alicePhone, aliceWeb]) d.clear();
    bobWeb.s.emit("friend:accept", { fromUserId: USERS.alice.id });
    await settle();
    for (const [name, d] of [["bobPhone", bobPhone], ["bobWeb", bobWeb]]) {
      assert(got(d, "friend:list", listHas(USERS.alice.id)).length >= 1, `${name} got friend:list with alice after socket accept`);
      assert(got(d, "friend:requests", listLacks(USERS.alice.id)).length >= 1, `${name} got friend:requests without alice`);
    }
    for (const [name, d] of [["alicePhone", alicePhone], ["aliceWeb", aliceWeb]]) {
      assert(got(d, "friend:list", listHas(USERS.bob.id)).length >= 1, `${name} got friend:list with bob`);
    }

    // 3. REST remove (profile "remove friend"): both people, every device, and server memory.
    for (const d of [bobPhone, bobWeb, alicePhone, aliceWeb]) d.clear();
    r = await rest("alice", "remove", { friendId: USERS.bob.id });
    assert(r.status === 200, "REST remove ok");
    await settle();
    for (const [name, d] of [["bobPhone", bobPhone], ["bobWeb", bobWeb]]) {
      assert(got(d, "friend:list", listLacks(USERS.alice.id)).length >= 1, `${name} got friend:list without alice after REST remove`);
    }
    for (const [name, d] of [["alicePhone", alicePhone], ["aliceWeb", aliceWeb]]) {
      assert(got(d, "friend:list", listLacks(USERS.bob.id)).length >= 1, `${name} got friend:list without bob after REST remove`);
    }
    const { friends } = require("../runtime/sharedState");
    assert(!friends.get(USERS.alice.id)?.has(USERS.bob.id) && !friends.get(USERS.bob.id)?.has(USERS.alice.id), "memory friendship dropped on REST remove");

    // 4. REST request + REST accept: one friend:accepted per device (no double refetch) and lists on all devices.
    r = await rest("bob", "request", { username: "alice" });
    assert(r.status === 200, "REST request 2 ok");
    await settle();
    for (const d of [bobPhone, bobWeb, alicePhone, aliceWeb]) d.clear();
    r = await rest("alice", "accept", { fromUserId: USERS.bob.id });
    assert(r.status === 200, `REST accept ok (${r.status})`);
    await settle();
    for (const [name, d, other] of [["bobPhone", bobPhone, "alice"], ["bobWeb", bobWeb, "alice"], ["alicePhone", alicePhone, "bob"], ["aliceWeb", aliceWeb, "bob"]]) {
      assert(got(d, "friend:accepted").length === 1, `${name} got friend:accepted exactly once (got ${got(d, "friend:accepted").length})`);
      assert(got(d, "friend:list", listHas(USERS[other].id)).length >= 1, `${name} got friend:list with ${other} after REST accept`);
    }
    for (const [name, d] of [["alicePhone", alicePhone], ["aliceWeb", aliceWeb]]) {
      assert(got(d, "friend:requests", listLacks(USERS.bob.id)).length >= 1, `${name} got friend:requests without bob after REST accept`);
    }

    // 5. REST decline: memory pending cleared, every recipient device gets the new list.
    r = await rest("dave", "request", { username: "bob" });
    assert(r.status === 200, "REST request 3 ok");
    await settle();
    for (const d of [bobPhone, bobWeb]) d.clear();
    r = await rest("bob", "decline", { fromUserId: USERS.dave.id });
    assert(r.status === 200, "REST decline ok");
    await settle();
    const { pendingRequests } = require("../runtime/sharedState");
    assert(!pendingRequests.get(USERS.bob.id)?.has(USERS.dave.id), "memory pending dropped on REST decline");
    for (const [name, d] of [["bobPhone", bobPhone], ["bobWeb", bobWeb]]) {
      assert(got(d, "friend:requests", listLacks(USERS.dave.id)).length >= 1, `${name} got friend:requests without dave after REST decline`);
    }

    // 6. Socket remove from bob's phone: bob's web tab drops the friend too.
    for (const d of [bobPhone, bobWeb]) d.clear();
    bobPhone.s.emit("friend:remove", { friendId: USERS.alice.id });
    await settle();
    assert(got(bobWeb, "friend:list", listLacks(USERS.alice.id)).length >= 1, "bobWeb got friend:list without alice after socket remove");

    // 7. Socket decline on bob's phone: bob's web tab sees the request disappear.
    alicePhone.s.emit("friend:request", { toUsername: "bob" });
    await settle();
    assert(got(bobWeb, "friend:request:incoming", (p) => p?.from?.id === USERS.alice.id).length >= 1, "bobWeb got socket friend request");
    for (const d of [bobPhone, bobWeb]) d.clear();
    bobPhone.s.emit("friend:decline", { fromUserId: USERS.alice.id });
    await settle();
    assert(got(bobWeb, "friend:requests", listLacks(USERS.alice.id)).length >= 1, "bobWeb got friend:requests without alice after socket decline");

    // 8. Ordering data: a fresh friendship carries friendsSince = accept time
    //    (newer than an old friendship), REST lists come newest first, and
    //    friend requests come newest first.
    r = await rest("bob", "request", { username: "alice" });
    assert(r.status === 200, "REST request 4 ok");
    await settle();
    for (const d of [alicePhone, aliceWeb]) d.clear();
    const acceptedAt = Date.now();
    r = await rest("alice", "accept", { fromUserId: USERS.bob.id });
    assert(r.status === 200, "REST accept 2 ok");
    await settle();
    const live = got(aliceWeb, "friend:list", listHas(USERS.bob.id)).pop()?.payload || [];
    const liveBob = live.find((u) => u.id === USERS.bob.id);
    const liveCarol = live.find((u) => u.id === USERS.carol.id);
    assert(Date.parse(liveBob.friendsSince) >= acceptedAt - 5, `socket friend:list friendsSince for a new friend is the accept time (${liveBob.friendsSince})`);
    assert(liveCarol.friendsSince === "2026-01-01T00:00:00.000Z", `old friendship keeps its DB time (${liveCarol.friendsSince})`);
    const list = await restGet("alice", "list");
    assert(list.status === 200, "GET list ok");
    assert(list.body.friends.map((u) => u.id).join(",") === `${USERS.bob.id},${USERS.carol.id}`, `GET list newest friendship first (${list.body.friends.map((u) => u.username)})`);

    r = await rest("dave", "request", { username: "carol" });
    assert(r.status === 200, "REST request dave->carol ok");
    await sleep(15);
    r = await rest("bob", "request", { username: "carol" });
    assert(r.status === 200, "REST request bob->carol ok");
    const reqs = await restGet("carol", "requests");
    assert(reqs.status === 200, "GET requests ok");
    assert(reqs.body.requests.map((u) => u.id).join(",") === `${USERS.bob.id},${USERS.dave.id}`, `GET requests newest first (${reqs.body.requests.map((u) => u.username)})`);
    assert(reqs.body.requests.every((u) => typeof u.requestedAt === "string"), "requests carry requestedAt");

    console.log("friendRealtime.integration.test.cjs: ok");
  } finally {
    for (const s of openSockets) s.disconnect();
    io.close();
    server.close();
  }
}

run().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
