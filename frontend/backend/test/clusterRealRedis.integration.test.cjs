"use strict";

/**
 * Hybrid server core against a REAL local redis-server (the real ioredis and
 * @socket.io/redis-adapter code paths). Skips (exit 0) when redis-server is not
 * installed. Never touches a remote Key Value: the server is spawned here on a
 * free localhost port with persistence off, and killed at the end.
 *
 *  - two nodes join, the primary leads, cfg / events / metrics go through Redis
 *  - replicated Map writes reach the other node
 *  - Socket.IO room emit, fetchSockets and disconnectSockets across nodes
 *  - Redis killed: both nodes run single (primary leads, secondary does not)
 *  - Redis back EMPTY: nodes rejoin and rewrite registry, leader and state
 *
 * Run: node test/clusterRealRedis.integration.test.cjs
 */

process.env.NODE_ENV = "test";
const { spawn, spawnSync } = require("child_process");
const net = require("net");
const os = require("os");
const path = require("path");
const http = require("http");

const probe = spawnSync("redis-server", ["--version"], { encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  console.log("clusterRealRedis: redis-server not installed, skipped");
  process.exit(0);
}

const { createCluster } = require("../lib/cluster");
const { Server } = require("socket.io");
const { io: ioClient } = require(path.join(__dirname, "../../node_modules/socket.io-client"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  ok -", msg);
}
async function waitFor(fn, ms, label) {
  const until = Date.now() + ms;
  for (;;) {
    let ok = false;
    try {
      ok = await fn();
    } catch {
      ok = false;
    }
    if (ok) return;
    if (Date.now() > until) throw new Error(`FAIL: timed out waiting for ${label}`);
    await sleep(25);
  }
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

let redisProc = null;
async function startRedis(port) {
  redisProc = spawn("redis-server", ["--port", String(port), "--bind", "127.0.0.1", "--save", "", "--appendonly", "no", "--dir", os.tmpdir()], { stdio: "ignore" });
  await waitFor(
    () =>
      new Promise((resolve) => {
        const c = net.connect(port, "127.0.0.1", () => {
          c.end();
          resolve(true);
        });
        c.on("error", () => resolve(false));
      }),
    5000,
    "redis-server up"
  );
}
function stopRedis() {
  if (redisProc) redisProc.kill("SIGKILL");
  redisProc = null;
}

const quiet = { warn() {}, log() {}, info() {} };
const FAST = {
  DESCALL_CLUSTER_BEAT_MS: "100",
  DESCALL_CLUSTER_ALIVE_TTL_MS: "500",
  DESCALL_CLUSTER_LEADER_TTL_MS: "500",
  DESCALL_CLUSTER_METRICS_MS: "150",
  DESCALL_CLUSTER_WATCH_MS: "40",
  DESCALL_CLUSTER_REMOTE_GRACE_MS: "300",
};

async function startNode(url, id, role) {
  const c = createCluster({ env: { ...FAST, REDIS_URL: url, DESCALL_NODE_ID: id, DESCALL_NODE_ROLE: role }, log: quiet });
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: "*" } });
  io.adapter(c.socketAdapter());
  io.on("connection", (s) => s.join(`user:${s.handshake.auth.uid}`));
  c.start({ io });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { c, io, server, port: server.address().port };
}

async function run() {
  const port = await freePort();
  const url = `redis://127.0.0.1:${port}`;
  await startRedis(port);
  const A = await startNode(url, "render", "primary");
  const B = await startNode(url, "pc-real", "secondary");
  const clients = [];
  try {
    await waitFor(() => A.c.enabled() && B.c.enabled(), 5000, "both connected");
    await waitFor(() => A.c.isLeader() && !B.c.isLeader(), 5000, "primary leads");
    assert(true, "two nodes on a real Redis, render leads");
    await waitFor(async () => (await B.c.getNodes()).length === 2, 3000, "registry");
    await A.c.setCfg({ cores: 6 }, "owner");
    assert((await B.c.getCfg()).cores === 6, "cfg written on A is read on B");
    await waitFor(async () => ((await B.c.getMetrics(5)).render || []).length > 0, 3000, "metrics ring");
    assert(true, "A's metrics ring is readable on B");
    const kv = await A.c.kvStatus();
    assert(kv.ok && kv.usedMb > 0, `kv status reports memory (${kv.usedMb} MB)`);

    // Replicated map through the real client.
    const ma = new Map();
    const mb = new Map();
    A.c.replicator.register("realtest", ma, { storage: { type: "keys", prefix: "dc:realtest:" }, watch: true });
    B.c.replicator.register("realtest", mb, { storage: { type: "keys", prefix: "dc:realtest:" }, watch: true });
    ma.set("k1", { members: new Set(["x"]) });
    await waitFor(() => mb.get("k1")?.members?.has("x"), 2000, "replicated write");
    ma.get("k1").members.add("y");
    await waitFor(() => mb.get("k1").members.has("y"), 2000, "replicated in-place change");
    assert(true, "replicated Map writes and in-place changes reach the other node");

    // Socket.IO across nodes.
    const cli = ioClient(`http://127.0.0.1:${A.port}`, { auth: { uid: "u1" }, transports: ["websocket"], reconnection: false, forceNew: true });
    clients.push(cli);
    await new Promise((r, j) => {
      cli.once("connect", r);
      cli.once("connect_error", j);
    });
    await sleep(100);
    const got = new Promise((r) => cli.once("hello", r));
    B.io.to("user:u1").emit("hello", { from: "pc" });
    assert((await Promise.race([got, sleep(2000).then(() => null)]))?.from === "pc", "B's room emit reached a socket on A");
    const socks = await B.io.in("user:u1").fetchSockets();
    assert(socks.length === 1 && socks[0].id === cli.id, "fetchSockets on B finds the socket on A");

    // Redis killed: single-node fallback.
    stopRedis();
    await waitFor(() => !A.c.enabled() && !B.c.enabled(), 5000, "both notice");
    assert(A.c.isLeader() && !B.c.isLeader(), "KV away: primary leads alone, secondary waits");
    const local = new Promise((r) => cli.once("local", r));
    A.io.to("user:u1").emit("local", 1);
    assert((await Promise.race([local, sleep(1000).then(() => null)])) === 1, "local emit still works without the KV");
    ma.set("k2", { members: new Set(["offline"]) });

    // Redis back, empty.
    await startRedis(port);
    await waitFor(() => A.c.enabled() && B.c.enabled(), 15000, "both rejoined");
    await waitFor(async () => (await B.c.getNodes()).length === 2, 5000, "registry rebuilt");
    await waitFor(() => A.c.isLeader() && !B.c.isLeader(), 5000, "leader again");
    await waitFor(() => mb.get("k2")?.members?.has("offline"), 5000, "offline write replicated after rejoin");
    assert(true, "after an empty Redis restart: registry, leader and state are rebuilt");
    const kinds = (await A.c.getEvents(50)).map((e) => e.kind);
    assert(kinds.includes("kv-rebuilt"), "kv-rebuilt event logged");
    const got2 = new Promise((r) => cli.once("hello2", r));
    B.io.to("user:u1").emit("hello2", 2);
    assert((await Promise.race([got2, sleep(3000).then(() => null)])) === 2, "cross-node emit works again");
    const gone = new Promise((r) => cli.once("disconnect", r));
    B.io.in("user:u1").disconnectSockets(true);
    assert(Boolean(await Promise.race([gone.then(() => true), sleep(2000).then(() => false)])), "disconnectSockets on B closed the socket on A");
  } finally {
    for (const c of clients) c.close();
    await A.c.stop().catch(() => {});
    await B.c.stop().catch(() => {});
    A.io.close();
    B.io.close();
    stopRedis();
  }
}

run()
  .then(() => {
    console.log("clusterRealRedis: all passed");
    process.exit(0);
  })
  .catch((err) => {
    stopRedis();
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
