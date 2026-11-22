"use strict";

/**
 * Hybrid server: TWO backend nodes in one process (separate module graphs, so
 * each has its own runtime/sharedState, io and cluster singleton) on different
 * ports, sharing one fake Key Value (test/fakeRedis.cjs) and one fake Supabase.
 * Real Socket.IO + @socket.io/redis-adapter + the real socket handlers.
 *
 *  1. a user on node A receives a DM sent by a user on node B
 *  2. presence on B shows a user online on A (state + the roster events)
 *  3. a group call started on A is visible on B
 *  4. a ban on A disconnects the user's socket on B
 *  5. the leader lock fails over when the leader stops
 *  6. a node with no REDIS_URL behaves as before (single node, DM delivered)
 *
 * Run: node test/clusterTwoNodes.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.NODE_ENV = "test";
for (const [k, v] of Object.entries({
  DESCALL_CLUSTER_BEAT_MS: "80",
  DESCALL_CLUSTER_ALIVE_TTL_MS: "400",
  DESCALL_CLUSTER_LEADER_TTL_MS: "400",
  DESCALL_CLUSTER_METRICS_MS: "200",
  DESCALL_CLUSTER_WATCH_MS: "40",
})) process.env[k] = v;

const path = require("path");
const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const { createFakeRedisServer } = require("./fakeRedis.cjs");

const BACKEND = path.join(__dirname, "..");
const USERS = {
  alice: { id: "u-alice", username: "alice" },
  bob: { id: "u-bob", username: "bob" },
  carol: { id: "u-carol", username: "carol" },
  dave: { id: "u-dave", username: "dave" },
};
const GROUP = "g-team";

const fakeSupabase = createFakeSupabase({
  users: Object.values(USERS).map((u) => ({ ...u, blocked_users: [], active_sessions: [{ id: `s-${u.username}` }], dm_privacy: "everyone" })),
  friendships: [
    { id: "f1", user_id: USERS.alice.id, friend_id: USERS.bob.id, status: "accepted", created_at: "2026-01-01T00:00:00Z" },
    { id: "f2", user_id: USERS.carol.id, friend_id: USERS.dave.id, status: "accepted", created_at: "2026-01-01T00:00:00Z" },
  ],
  message_requests: [],
  dm_messages: [],
  groups: [{ id: GROUP, name: "Team", owner_id: USERS.alice.id }],
  group_members: [
    { group_id: GROUP, user_id: USERS.alice.id, role: "owner" },
    { group_id: GROUP, user_id: USERS.bob.id, role: "member" },
  ],
  group_calls: [],
  group_call_participants: [],
  server_members: [],
});
{
  const probe = fakeSupabase.from("__probe__");
  const proto = Object.getPrototypeOf(probe);
  for (const m of ["lt", "lte", "range", "contains", "filter", "match", "returns", "abortSignal", "like", "overlaps", "textSearch", "ilike", "not", "is", "gt", "gte", "neq"]) {
    if (!proto[m]) proto[m] = function () { return this; };
  }
  const syncThen = proto.then;
  proto.then = function (resolve, reject) {
    return Promise.resolve().then(() => new Promise((res, rej) => syncThen.call(this, res, rej))).then(resolve, reject);
  };
}
fakeSupabase.rpc = async () => ({ data: null, error: null });
fakeSupabase.storage = { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) };

const kvServer = createFakeRedisServer();
const asyncNoop = new Proxy({}, { get: () => async () => ({ ok: true }) });

function stub(rel, exportsObj) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exportsObj };
}

/** Fresh module graph for everything under frontend/backend (not node_modules, not the fakes). */
function freshGraph() {
  for (const k of Object.keys(require.cache)) {
    if (!k.startsWith(BACKEND)) continue;
    if (k.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (k.endsWith("fakeSupabase.cjs") || k.endsWith("fakeRedis.cjs")) continue;
    delete require.cache[k];
  }
  stub("../db/supabase", fakeSupabase);
  stub("../lib/webPush", asyncNoop);
  stub("../lib/voipPush", asyncNoop);
}

const express = require("express");
const { Server } = require("socket.io");
const { io: ioClient } = require(path.join(BACKEND, "../node_modules/socket.io-client"));

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ok -", msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, label) {
  const until = Date.now() + ms;
  for (;;) {
    let ok = false;
    try {
      ok = await fn();
    } catch {
      ok = false;
    }
    if (ok) return true;
    if (Date.now() > until) throw new Error(`FAIL: timed out waiting for ${label}`);
    await sleep(20);
  }
}

/** One backend node. `clustered: false` = no REDIS_URL, today's single node. */
async function startNode({ id, role, clustered = true }) {
  freshGraph();
  process.env.DESCALL_NODE_ID = id;
  process.env.DESCALL_NODE_ROLE = role;
  process.env.DESCALL_NODE_PUBLIC_URL = `http://${id}.test`;
  const cluster = require("../lib/cluster");
  if (clustered) cluster.useRedisFactory((_url, opts) => kvServer.createClient(opts));
  const state = require("../runtime/sharedState");
  const { registerSocketHandlers } = require("../socket/handlers");
  const app = express();
  app.use(cluster.metricsMiddleware);
  app.use(express.json());
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });
  const adapter = cluster.socketAdapter();
  if (adapter) io.adapter(adapter);
  app.set("io", io);
  io.use((socket, next) => {
    const u = USERS[socket.handshake.auth?.as];
    if (!u) return next(new Error("unknown test user"));
    if (state.bannedUserIds.has(u.id)) return next(new Error("Authentication failed: banned"));
    socket.user = { ...u, sid: `s-${u.username}` };
    next();
  });
  registerSocketHandlers(io);
  cluster.start({ io, state });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const mods = {
    moderation: require("../lib/moderation"),
    rateLimit: require("../lib/rateLimit"),
    adminHandlers: require("../socket/adminHandlers"),
  };
  return {
    id,
    cluster,
    state,
    io,
    port,
    mods,
    async close({ graceful = true } = {}) {
      await cluster.stop({ graceful });
      io.close();
      await new Promise((r) => server.close(() => r()));
    },
  };
}

const openSockets = new Set();
async function device(node, as) {
  const s = ioClient(`http://127.0.0.1:${node.port}`, { auth: { as, presence: 2 }, transports: ["websocket"], reconnection: false, forceNew: true });
  openSockets.add(s);
  const log = [];
  s.onAny((event, payload) => log.push({ event, payload }));
  await new Promise((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  await sleep(150);
  return { s, log, clear: () => (log.length = 0) };
}
const got = (d, event, pred = () => true) => d.log.filter((e) => e.event === event && pred(e.payload));

async function run() {
  const A = await startNode({ id: "render", role: "primary" });
  const B = await startNode({ id: "pc-test", role: "secondary" });
  try {
    assert(A.cluster !== B.cluster && A.state !== B.state, "two separate module graphs");
    await waitFor(() => A.cluster.enabled() && B.cluster.enabled(), 8000, "both nodes on the KV");
    await waitFor(() => A.cluster.isLeader() && !B.cluster.isLeader(), 8000, "render leads");
    assert(true, "both nodes joined the cluster; render is the leader");

    console.log("2. presence across nodes");
    const bob = await device(B, "bob"); // bob is on the PC node
    const alice = await device(A, "alice"); // alice is on Render
    await waitFor(() => B.state.presence.has(USERS.alice.id), 8000, "B sees alice");
    assert(B.cluster.hasRemoteUser(USERS.alice.id), "B knows alice is on another node");
    assert(!B.cluster.replicator.ownsLocally("presence", USERS.alice.id), "B does not own alice's entry");
    await waitFor(
      () =>
        got(bob, "presence:delta", (p) => (p?.up || []).some((u) => u.id === USERS.alice.id)).length > 0 ||
        got(bob, "users:update", (l) => Array.isArray(l) && l.some((u) => u.id === USERS.alice.id)).length > 0,
      3000,
      "bob's roster shows alice online"
    );
    assert(true, "bob (on B) got alice (on A) in his roster");
    const online = await B.cluster.store.listOnline();
    assert(online.some((u) => u.userId === USERS.alice.id && u.nodes.includes("render")), "async store lists alice on render");
    const socketsOfAlice = await B.cluster.store.userSockets(USERS.alice.id);
    assert(socketsOfAlice.length === 1 && socketsOfAlice[0].startsWith("render:"), "dc:sockets index has alice's socket on render");

    console.log("1. DM from B to A");
    alice.clear();
    bob.s.emit("dm:send", { toUserId: USERS.alice.id, text: "hello from the PC", tempId: "t1" });
    await waitFor(() => got(alice, "dm:message", (m) => m?.text === "hello from the PC").length === 1, 8000, "alice receives the DM");
    assert(true, "alice (on A) received bob's DM (sent on B)");
    await waitFor(() => got(alice, "dm:unread:sync", (p) => p?.peerId === USERS.bob.id).length > 0, 8000, "unread sync");
    assert(true, "the unread badge update reached A too");
    // B's cached copy of a DM thread is dropped when the thread changes on A.
    B.state.dmHistory.set("probe::thread", [{ id: "x" }]);
    A.cluster.invalidate("dmConv", "probe::thread");
    await waitFor(() => !B.state.dmHistory.has("probe::thread"), 8000, "dm thread cache invalidated on B");
    assert(true, "a DM thread change on A drops B's cached copy (dc:inval)");

    console.log("3. group call started on A, visible on B");
    alice.s.emit("group:call:start", { groupId: GROUP, callType: "voice" });
    await waitFor(() => B.state.activeGroupCalls.has(GROUP), 8000, "B has the call");
    const callB = B.state.activeGroupCalls.get(GROUP);
    assert(callB.participants instanceof Set && callB.participants.has(USERS.alice.id), "B's copy has alice as participant (a Set)");
    assert(callB.disconnectGraceByUser instanceof Map, "B keeps its own grace timers map");
    bob.clear();
    bob.s.emit("group:call:check", { groupId: GROUP });
    await waitFor(() => got(bob, "group:call:banner-update", (p) => p?.groupId === GROUP && p?.banner).length > 0, 8000, "bob sees the banner");
    const banner = got(bob, "group:call:banner-update", (p) => p?.banner)[0].payload.banner;
    assert(banner.initiatorId === USERS.alice.id, "bob's banner (from B's state) names alice as the caller");
    assert(Boolean(kvServer.dump()[`dc:groupcall:${GROUP}`]), "the call is stored in the KV (dc:groupcall:<id>)");

    console.log("3b. Key Value restart (empty): the nodes rebuild the shared state");
    kvServer.restart({ flush: true });
    await waitFor(() => {
      const d = kvServer.dump();
      return Boolean(d[`dc:groupcall:${GROUP}`] && d["dc:presence:render"]?.[USERS.alice.id] && d["dc:presence:pc-test"]?.[USERS.bob.id] && d["dc:leader"]);
    }, 8000, "state rewritten into the KV");
    assert(true, "calls, presence of both nodes and the leader lock are back in the KV");
    assert((kvServer.dump()[`dc:sockets:${USERS.alice.id}`] || []).length === 1, "the user -> sockets index is rebuilt");
    assert(B.state.presence.has(USERS.alice.id) && B.state.activeGroupCalls.has(GROUP), "B kept its view through the restart");
    alice.clear();
    await sleep(250); // the 200 ms DM rate limit since the first DM
    bob.s.emit("dm:send", { toUserId: USERS.alice.id, text: "after the restart", tempId: "t3" });
    await waitFor(() => got(alice, "dm:message", (m) => m?.text === "after the restart").length === 1, 8000, "DM after KV restart");
    assert(true, "cross-node DM works again after the restart");

    console.log("3c. session revoked on A closes that session's socket on B; auth limits count on both");
    const carol = await device(B, "carol");
    const revoked = new Promise((resolve) => carol.s.once("session:revoked", resolve));
    A.state.revokedSessionIds.add("s-carol");
    const rv = await Promise.race([revoked, sleep(6000).then(() => null)]);
    assert(rv && rv.sessionId === "s-carol", "carol's socket on B got session:revoked");
    await waitFor(() => !carol.s.connected, 8000, "carol disconnected");
    assert(B.state.revokedSessionIds.has("s-carol"), "revoked session id replicated to B");
    for (let i = 0; i < 3; i++) A.mods.rateLimit.recordFailure("login:ip-1", { max: 3 });
    await sleep(80);
    const peekB = B.mods.rateLimit.peek("login:ip-1", { max: 3 });
    assert(peekB.ok === false, "3 login failures on A lock the same key on B");

    console.log("4. ban on A disconnects the user's socket on B");
    const kicked = new Promise((resolve) => bob.s.once("system:kick", resolve));
    const gone = new Promise((resolve) => bob.s.once("disconnect", resolve));
    await A.mods.moderation.applyBan({ targetUserId: USERS.bob.id, actorUserId: USERS.alice.id, category: "spam", message: "test ban", presetId: "permanent" });
    const n = await A.mods.adminHandlers.kickUser(A.io, { actorId: USERS.alice.id, actorUsername: "alice", targetUserId: USERS.bob.id, reason: "test", action: "ban", category: "spam" });
    const kickPayload = await Promise.race([kicked, sleep(6000).then(() => null)]);
    assert(kickPayload && kickPayload.action === "ban", "bob's socket on B got system:kick from A");
    await Promise.race([gone, sleep(3000)]);
    assert(!bob.s.connected, "bob's socket on B was disconnected");
    assert(n >= 1, "kickUser counted the remote socket");
    await waitFor(() => B.state.bannedUserIds.has(USERS.bob.id), 8000, "ban replicated");
    assert(Boolean(B.state.banDetailsByUser.get(USERS.bob.id)), "ban details replicated to B");
    let rejected = false;
    try {
      await device(B, "bob");
    } catch {
      rejected = true;
    }
    assert(rejected, "bob cannot reconnect to B");
    await waitFor(() => !A.state.presence.has(USERS.bob.id), 8000, "bob offline on A");
    assert(true, "bob's presence is gone on A too");

    console.log("5. leader failover");
    await A.close({ graceful: true });
    await waitFor(() => B.cluster.isLeader(), 8000, "B takes the lock");
    assert(true, "the PC node took the leader lock when render stopped");
    await waitFor(() => !B.state.presence.has(USERS.alice.id), 8000, "alice dropped with her node");
    assert(true, "users of the stopped node are no longer shown online on B");
    const nodes = await B.cluster.getNodes();
    assert(nodes.find((x) => x.id === "render")?.state === "down", "render is listed as down");
  } finally {
    for (const s of openSockets) s.close();
    await B.close().catch(() => {});
    await A.close().catch(() => {});
  }

  console.log("6. single node (no REDIS_URL) behaves as before");
  delete process.env.DESCALL_NODE_ID;
  delete process.env.DESCALL_NODE_ROLE;
  const S = await startNode({ id: "render", role: "primary", clustered: false });
  try {
    assert(!S.cluster.configured() && !S.cluster.enabled() && S.cluster.isLeader(), "single node: not clustered, always leader");
    assert(!Object.prototype.hasOwnProperty.call(S.state.presence, "set"), "shared Maps stay plain Maps");
    const carol = await device(S, "carol");
    const dave = await device(S, "dave");
    carol.clear();
    dave.s.emit("dm:send", { toUserId: USERS.carol.id, text: "single node", tempId: "t2" });
    await waitFor(() => got(carol, "dm:message", (m) => m?.text === "single node").length === 1, 8000, "single-node DM");
    assert(true, "DM delivered on a single node");
    assert(S.state.presence.has(USERS.carol.id) && S.state.presence.has(USERS.dave.id), "presence as before");
    assert(Object.keys(kvServer.dump()).every((k) => !k.includes("u-carol")), "the single node wrote nothing to the KV");
  } finally {
    for (const s of openSockets) s.close();
    await S.close().catch(() => {});
  }
}

run()
  .then(() => {
    console.log("clusterTwoNodes: all passed");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
