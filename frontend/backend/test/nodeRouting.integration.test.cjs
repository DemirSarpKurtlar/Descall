"use strict";

/**
 * Hybrid server, two in-process backend nodes sharing one fake KV (the cluster API over an
 * in-memory store + pub/sub), real HTTP, real Socket.IO and the real client module
 * (src/lib/nodeRouting.js + socket.io-client):
 *  - /api/node/health on both nodes; /api/node/register refuses a bad node key, accepts a
 *    good one and returns the PC config
 *  - Render normal -> assign answers Render; Render "high" -> assign answers the PC and the
 *    client's REST + socket go there
 *  - drain on the PC: state draining, node:move to its socket, the client re-assigns and
 *    reconnects to Render, the PC reaches 0 connections, drain-done reaches the primary
 *  - socket connect_error on the PC (its server is gone) -> the client falls back to Render
 */

process.env.NODE_ENV = "test";

const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");
const { EventEmitter } = require("events");
const express = require("express");
const { Server } = require("socket.io");
const { io: ioClient } = require("socket.io-client");
const { createRouter, createNodeRuntime } = require("../lib/cluster/routing");
const { createNodeRoutes, refuseWhileDraining } = require("../routes/node");
const nodeKeys = require("../lib/nodeKeys");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function waitFor(fn, ms = 5000, label = "condition") {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`FAIL: timed out waiting for ${label}`);
}

/** The shared KV: dc:nodes, dc:cfg:pc, dc:events and pub/sub, as agent 1's module exposes them. */
function createSharedKv() {
  return {
    nodes: new Map(),
    cfg: {
      ramMb: 4096,
      loadRule: { renderHighPct: 60, pcHighPct: 85 },
      gameMode: { enabled: true, shareMb: 1024, fullHandover: false },
      schedule: { tz: "Europe/Istanbul", slots: [] },
    },
    events: [],
    bus: new EventEmitter(),
  };
}

function createCluster(kv, { nodeId, role, publicUrl, memLimit, getIo }) {
  kv.nodes.set(nodeId, { id: nodeId, role, url: publicUrl, memRss: 100, memLimit, state: "active", gameMode: false, alive: true });
  return {
    enabled: () => true,
    nodeId,
    role,
    publicUrl,
    isLeader: () => role === "primary",
    onLeaderChange() {},
    async getNodes() {
      // Heartbeat: every live node's entry is fresh; a dead one keeps its last beat.
      return [...kv.nodes.values()].map((n) => {
        const io = n.id === nodeId ? getIo() : null;
        if (n.alive) n.lastBeat = Date.now();
        return { ...n, conns: io ? io.engine.clientsCount : n.conns || 0 };
      });
    },
    async getCfg() {
      return JSON.parse(JSON.stringify(kv.cfg));
    },
    async setCfg(p) {
      Object.assign(kv.cfg, p);
      return kv.cfg;
    },
    async setNodeState(id, state) {
      const n = kv.nodes.get(id);
      if (n) n.state = state;
    },
    async pushEvent(kind, detail) {
      kv.events.push({ at: Date.now(), kind, nodeId, detail });
    },
    async getEvents() {
      return kv.events.slice();
    },
    async getMetrics() {
      return {};
    },
    async kvStatus() {
      return { ok: true, usedMb: 1, maxMb: 25 };
    },
    publish(ch, msg) {
      setImmediate(() => kv.bus.emit(ch, JSON.stringify(msg)));
    },
    subscribe(ch, cb) {
      kv.bus.on(ch, cb);
      return () => kv.bus.off(ch, cb);
    },
  };
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

async function startNode(kv, { nodeId, role, memLimit, env }) {
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const io = new Server(server, { path: "/socket.io", transports: ["websocket", "polling"] });
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}`;
  const cluster = createCluster(kv, { nodeId, role, publicUrl: url, memLimit, getIo: () => io });
  const router = createRouter({ cluster, env: env(url), dwellMs: 0 });
  const runtime = createNodeRuntime({ cluster, io, router, env: env(url), pollMs: 50, log: () => {} });
  runtime.start({ intervalMs: 3_600_000 });
  app.use("/api/node", createNodeRoutes({ cluster, router, runtime, env: env(url) }));
  refuseWhileDraining(io, runtime, cluster);
  return { app, server, io, port, url, cluster, router, runtime };
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.json() };
}

(async () => {
  const kv = createSharedKv();
  const NODE_KEY = "dsk_node_" + "Q".repeat(43);
  nodeKeys.__addForTests(NODE_KEY, "nk_pc");

  const render = await startNode(kv, { nodeId: "render", role: "primary", memLimit: 512, env: () => ({ NODE_ENV: "test" }) });
  const pc = await startNode(kv, {
    nodeId: "pc-home",
    role: "secondary",
    memLimit: 4096,
    env: () => ({ NODE_ENV: "test", DESCALL_PRIMARY_URL: render.url, DESCALL_NODE_KEY: NODE_KEY }),
  });

  const { createNodeRouting } = await import(pathToFileURL(path.join(__dirname, "../../src/lib/nodeRouting.js")).href);
  const storage = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  };
  const client = (tab) => createNodeRouting({ primaryApi: render.url, primarySocket: render.url, nodeOrigins: [pc.url], storage: tab, random: () => 0.1, log: () => {} });

  try {
    /* health + register */
    const h1 = await getJson(`${render.url}/api/node/health`);
    assert(h1.status === 200 && h1.body.ok && h1.body.nodeId === "render" && h1.body.role === "primary" && h1.body.state === "active", "primary health");
    const h2 = await getJson(`${pc.url}/api/node/health`);
    assert(h2.body.nodeId === "pc-home" && h2.body.role === "secondary", "PC health");

    const bad = await getJson(`${render.url}/api/node/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer dsk_node_" + "x".repeat(43) },
      body: JSON.stringify({ id: "pc-home", url: pc.url }),
    });
    assert(bad.status === 401 && bad.body.code === "NODE_KEY_INVALID", "unknown node key refused");
    const noKey = await getJson(`${render.url}/api/node/drain-done`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert(noKey.status === 401, "drain-done needs the node key");
    const reg = await pc.runtime.register();
    assert(reg.ok && reg.json.ok === true && reg.json.cfg && reg.json.cfg.loadRule.renderHighPct === 60, "PC registered with its key and got the config");
    assert(kv.events.some((e) => e.kind === "node:register" && e.detail.id === "pc-home" && e.detail.keyId === "nk_pc"), "register event");
    const local = await getJson(`${pc.url}/api/node/drain-self`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${NODE_KEY}`, "CF-Connecting-IP": "203.0.113.9" }, body: "{}" });
    assert(local.status === 403, "drain-self through the tunnel (Cloudflare headers) refused");

    /* Render normal -> Render */
    kv.nodes.get("render").memRss = 200; // 39 %
    const a1 = await getJson(`${render.url}/api/node/assign?sid=tab-normal-0001`);
    assert(a1.body.nodeId === "render" && a1.body.url === render.url && a1.body.socketUrl === render.url && a1.body.ttlSec > 0, "Render normal: Render");

    /* Render high -> PC; the client goes there */
    kv.nodes.get("render").memRss = 400; // 78 % > 60 %
    const a2 = await getJson(`${render.url}/api/node/assign?sid=tab-high-00001`);
    assert(a2.body.nodeId === "pc-home" && a2.body.url === pc.url, "Render high: the PC");

    const tab = storage();
    const routing = client(tab);
    await routing.init();
    assert(routing.apiBase() === pc.url && routing.socketBase() === pc.url, "client REST + socket base = PC");
    const viaPc = await getJson(`${routing.apiBase()}/api/node/health`);
    assert(viaPc.body.nodeId === "pc-home", "REST reaches the PC");

    const socket = ioClient(routing.socketBase(), { autoConnect: false, transports: ["websocket"], reconnectionDelay: 100, reconnectionDelayMax: 200, path: "/socket.io" });
    routing.attach(socket);
    socket.connect();
    await waitFor(() => socket.connected, 5000, "socket on the PC");
    await waitFor(() => pc.io.engine.clientsCount === 1, 2000, "PC has the client");
    assert(render.io.engine.clientsCount === 0, "Render has none yet");

    /* drain the PC -> node:move -> client re-assigns and reconnects to Render */
    let moveSeen = null;
    socket.on("node:move", (p) => (moveSeen = p));
    const drainAck = render.runtime.waitForDrainDone("pc-home", 15_000);
    const result = await pc.runtime.drainSelf({ reason: "drain", jitterMs: 300, timeoutMs: 10_000 });
    assert(moveSeen && moveSeen.reason === "drain" && moveSeen.toUrl === render.url && moveSeen.jitterMs === 300, "client got node:move");
    assert(result.moved === 1 && result.dropped === 0, `drain moved the client (moved ${result.moved}, dropped ${result.dropped})`);
    assert(result.ms < 10_000, "drain finished before the 10 s limit");
    await waitFor(() => socket.connected && render.io.engine.clientsCount === 1, 5000, "socket on Render");
    assert(pc.io.engine.clientsCount === 0, "PC has no connection left");
    assert(routing.apiBase() === render.url && routing.isOnSecondary() === false, "REST follows to Render");
    assert(kv.nodes.get("pc-home").state === "paused", "PC paused after the drain");
    const ack = await drainAck;
    assert(ack && ack.id === "pc-home" && ack.moved === 1, "drain-done reached the primary");
    assert(kv.events.some((e) => e.kind === "node:drain-start") && kv.events.some((e) => e.kind === "node:drain-done"), "drain events");
    const a3 = await getJson(`${render.url}/api/node/assign?sid=tab-new-000001`);
    assert(a3.body.nodeId === "render", "paused PC: new users to Render");
    socket.disconnect();

    /* A tab sent to the paused PC anyway (stale / racing answer): the PC refuses the socket,
       the client falls back to Render at once. */
    const stale = createNodeRouting({
      primaryApi: render.url,
      primarySocket: render.url,
      nodeOrigins: [pc.url],
      storage: storage(),
      log: () => {},
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ nodeId: "pc-home", url: pc.url, socketUrl: pc.url }) }),
    });
    await stale.init();
    assert(stale.apiBase() === pc.url, "racing answer: the paused PC");
    const s1 = ioClient(stale.socketBase(), { autoConnect: false, transports: ["websocket"], reconnectionDelay: 100, reconnectionDelayMax: 200, path: "/socket.io" });
    let refused = "";
    s1.on("connect_error", (e) => (refused = e.message));
    stale.attach(s1);
    s1.connect();
    await waitFor(() => s1.connected && render.io.engine.clientsCount === 1, 5000, "refused tab lands on Render");
    assert(refused === "node draining", "the paused PC refused the socket");
    assert(stale.apiBase() === render.url && s1.io.uri === render.url, "refused on the PC: REST + socket on Render");
    assert(pc.io.engine.clientsCount === 0, "nothing stayed on the PC");
    s1.disconnect();

    /* PC back; its server dies: connect_error -> Render */
    await pc.runtime.resumeSelf("test");
    assert(kv.nodes.get("pc-home").state === "active", "PC resumed");
    const tab2 = storage();
    const routing2 = client(tab2);
    await routing2.init();
    assert(routing2.apiBase() === pc.url, "second tab assigned to the PC");
    pc.io.close();
    await new Promise((r) => pc.server.close(() => r()));
    const s2 = ioClient(routing2.socketBase(), { autoConnect: false, transports: ["websocket"], reconnectionDelay: 100, reconnectionDelayMax: 200, path: "/socket.io" });
    routing2.attach(s2);
    const started = Date.now();
    s2.connect();
    await waitFor(() => s2.connected, 5000, "fallback socket on Render");
    assert(Date.now() - started < 5000, "fallback within seconds");
    assert(routing2.apiBase() === render.url && s2.io.uri === render.url, "connect_error on the PC: REST + socket on Render");
    s2.disconnect();

    console.log("nodeRouting.integration.test: ok");
  } finally {
    render.runtime.stop();
    pc.runtime.stop();
    render.io.close();
    try {
      pc.io.close();
    } catch {
      /* already closed */
    }
    await new Promise((r) => render.server.close(() => r()));
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
