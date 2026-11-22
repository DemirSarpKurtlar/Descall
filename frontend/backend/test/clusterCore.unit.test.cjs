"use strict";

/**
 * Hybrid server core (lib/cluster) against the in-memory fake Key Value:
 * replicated Maps / Sets, owned (merged) presence, KV loss and restart, leader
 * lock with primary preference, node registry, cfg, events, metrics, pub/sub,
 * the async store and single-node mode.
 *
 * Run: node test/clusterCore.unit.test.cjs
 */

process.env.NODE_ENV = "test";
const assert = require("assert");
const { createFakeRedisServer } = require("./fakeRedis.cjs");
const { createCluster } = require("../lib/cluster");
const { createReplicator, encodeValue, decodeValue, applyInPlace } = require("../lib/cluster/replica");
const { createKv } = require("../lib/cluster/kv");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3000, label = "condition") {
  const until = Date.now() + ms;
  for (;;) {
    let ok = false;
    try {
      ok = await fn();
    } catch {
      ok = false;
    }
    if (ok) return;
    if (Date.now() > until) throw new Error(`timed out waiting for ${label}`);
    await sleep(15);
  }
}

const quiet = { warn() {}, log() {}, info() {}, error() {} };
const FAST = {
  DESCALL_CLUSTER_BEAT_MS: "60",
  DESCALL_CLUSTER_ALIVE_TTL_MS: "300",
  DESCALL_CLUSTER_LEADER_TTL_MS: "300",
  DESCALL_CLUSTER_METRICS_MS: "80",
  DESCALL_CLUSTER_WATCH_MS: "30",
  DESCALL_CLUSTER_REMOTE_GRACE_MS: "150",
};

function node(server, id, role, extra = {}) {
  const env = { ...FAST, DESCALL_NODE_ID: id, DESCALL_NODE_ROLE: role, DESCALL_NODE_PUBLIC_URL: `https://${id}.test`, DESCALL_NODE_MEMORY_MB: role === "primary" ? "512" : "2048", ...extra };
  const c = createCluster({ env, log: quiet });
  c.start({ redisFactory: (_url, opts) => server.createClient(opts) });
  return c;
}

function replicaPair(server) {
  const mk = (id) => {
    const kv = createKv({ url: "redis://fake", factory: (_u, o) => server.createClient(o), log: quiet });
    const r = createReplicator({ nodeId: id, kv, log: quiet, watchMs: 20, getPeers: async () => ["a", "b"] });
    kv.events.on("up", () => {
      r.setActive(true);
      void r.resync();
    });
    kv.events.on("down", () => r.setActive(false));
    r.start();
    return { kv, r };
  };
  return { A: mk("a"), B: mk("b") };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("codec: Sets, Maps, Dates round-trip; timers and functions dropped", () => {
  const timer = setTimeout(() => {}, 1000);
  clearTimeout(timer);
  const v = { a: new Set(["x", "y"]), m: new Map([["k", { n: 1 }], ["t", timer]]), d: new Date("2026-01-01T00:00:00Z"), f: () => 1, t: timer, keep: [1, "2"] };
  const enc = encodeValue(v);
  const json = JSON.parse(JSON.stringify(enc));
  const dec = decodeValue(json);
  assert.ok(dec.a instanceof Set && dec.a.has("y"));
  assert.ok(dec.m instanceof Map && dec.m.get("k").n === 1 && !dec.m.has("t"));
  assert.ok(dec.d instanceof Date);
  assert.ok(!("f" in dec) && !("t" in dec));
  assert.deepStrictEqual(dec.keep, [1, "2"]);
  const local = { a: new Set(["old"]), grace: new Map([["u", 1]]), gone: 1 };
  const same = local.a;
  const out = applyInPlace(local, { a: new Set(["new"]), extra: 2 }, new Set(["grace"]));
  assert.strictEqual(out, local);
  assert.strictEqual(local.a, same, "Set refilled in place");
  assert.ok(local.a.has("new") && !local.a.has("old"));
  assert.ok(local.grace.has("u"), "local field kept");
  assert.ok(!("gone" in local) && local.extra === 2);
});

test("shared map: set, in-place mutation (watch), delete, stale message ignored", async () => {
  const server = createFakeRedisServer();
  const { A, B } = replicaPair(server);
  const ma = new Map();
  const mb = new Map();
  A.r.register("calls", ma, { storage: { type: "keys", prefix: "dc:t:call:" }, watch: true, localFields: ["grace"], localDefaults: { grace: () => new Map() } });
  B.r.register("calls", mb, { storage: { type: "keys", prefix: "dc:t:call:" }, watch: true, localFields: ["grace"], localDefaults: { grace: () => new Map() } });
  await waitFor(() => A.kv.isUp() && B.kv.isUp(), 2000, "kv up");
  await sleep(30);
  ma.set("g1", { initiatorId: "u1", participants: new Set(["u1"]), grace: new Map([["u1", setTimeout(() => {}, 1)]]) });
  await waitFor(() => mb.has("g1"), 1000, "B sees call");
  const held = mb.get("g1");
  assert.ok(held.participants instanceof Set && held.participants.has("u1"));
  assert.ok(held.grace instanceof Map && held.grace.size === 0, "timers never travel");
  ma.get("g1").participants.add("u2");
  await waitFor(() => held.participants.has("u2"), 1000, "in-place mutation replicated");
  assert.strictEqual(mb.get("g1"), held, "B kept the same object");
  // B mutates, A sees.
  mb.get("g1").participants.add("u3");
  await waitFor(() => ma.get("g1").participants.has("u3"), 1000, "B -> A");
  // Persisted with a version.
  const stored = JSON.parse(server.dump()["dc:t:call:g1"]);
  assert.ok(stored.t > 0 && stored.v.participants.$S.includes("u3"));
  // Stale message (older clock) is ignored.
  const before = B.r.stats.stale;
  server.publish("dc:state", JSON.stringify({ s: "calls", n: "zz", op: "set", k: "g1", t: 1, v: { participants: { $S: [] } } }));
  await sleep(40);
  assert.ok(mb.get("g1").participants.has("u3"));
  assert.strictEqual(B.r.stats.stale, before + 1);
  ma.delete("g1");
  await waitFor(() => !mb.has("g1"), 1000, "delete replicated");
  assert.ok(!server.dump()["dc:t:call:g1"]);
  await A.kv.close();
  await B.kv.close();
});

test("owned map: merged presence, own contribution only, patch goes to the owner", async () => {
  const server = createFakeRedisServer();
  const { A, B } = replicaPair(server);
  const pa = new Map();
  const pb = new Map();
  const changesB = [];
  const localA = new Set();
  const localB = new Set();
  A.r.register("presence", pa, { kind: "owned", storage: { key: "dc:t:presence" }, isLocal: (_k, v) => localA.has(v?.socketId) });
  B.r.register("presence", pb, { kind: "owned", storage: { key: "dc:t:presence" }, isLocal: (_k, v) => localB.has(v?.socketId), onChange: (c) => changesB.push(c) });
  await waitFor(() => A.kv.isUp() && B.kv.isUp());
  await sleep(30);
  localA.add("sa1");
  pa.set("u1", { username: "u1", status: "online", socketId: "sa1" });
  await waitFor(() => pb.has("u1"), 1000, "B sees u1");
  assert.ok(B.r.hasRemote("presence", "u1"));
  assert.ok(changesB.some((c) => c.op === "online" && c.k === "u1" && c.remote));
  assert.strictEqual(pb.delete("u1"), false, "B never removes a user it does not own");
  assert.ok(pb.has("u1"));
  // Same user also on B.
  localB.add("sb1");
  pb.set("u1", { username: "u1", status: "online", socketId: "sb1" });
  assert.ok(B.r.ownsLocally("presence", "u1"));
  pa.delete("u1");
  await sleep(60);
  assert.ok(pb.has("u1"), "still online through B");
  assert.ok(pa.has("u1"), "A shows B's contribution");
  assert.strictEqual(pa.get("u1").socketId, "sb1");
  // A patches B's entry (profile change served by A): B takes it and republishes.
  const p = pa.get("u1");
  p.avatar_url = "https://x/a.png";
  pa.set("u1", p);
  await waitFor(() => pb.get("u1").avatar_url === "https://x/a.png", 1000, "patch reached owner");
  assert.ok(!A.r.ownsLocally("presence", "u1"), "A did not take ownership");
  pb.delete("u1");
  await waitFor(() => !pa.has("u1"), 1000, "gone everywhere");
  // Persisted per node.
  localA.add("sa2");
  pa.set("u2", { username: "u2", status: "idle", socketId: "sa2" });
  await sleep(40);
  assert.ok(JSON.parse(server.dump()["dc:t:presence:a"].u2).status === "idle");
  // Node b's contributions disappear when it is declared dead.
  localB.add("sb3");
  pb.set("u3", { username: "u3", socketId: "sb3" });
  await waitFor(() => pa.has("u3"));
  A.r.dropNode("b");
  assert.ok(!pa.has("u3"));
  await A.kv.close();
  await B.kv.close();
});

test("sets, suppression and KV restart rebuild", async () => {
  const server = createFakeRedisServer();
  const { A, B } = replicaPair(server);
  const ra = new Set();
  const rb = new Set();
  const ba = new Set();
  const bb = new Set();
  A.r.register("revoked", ra, { storage: { type: "set", key: "dc:t:revoked" } });
  B.r.register("revoked", rb, { storage: { type: "set", key: "dc:t:revoked" } });
  A.r.register("bans", ba, { storage: { type: "hash", key: "dc:t:bans" } });
  B.r.register("bans", bb, { storage: { type: "hash", key: "dc:t:bans" } });
  await waitFor(() => A.kv.isUp() && B.kv.isUp());
  await sleep(30);
  ra.add("sess-1");
  ba.add("user-9");
  await waitFor(() => rb.has("sess-1") && bb.has("user-9"));
  A.r.withoutReplication(() => ba.add("db-reload-only"));
  await sleep(50);
  assert.ok(!bb.has("db-reload-only"), "bulk reloads stay local");
  ba.delete("user-9");
  await waitFor(() => !bb.has("user-9"));
  // KV restarts empty: both nodes write their state back.
  server.restart({ flush: true });
  await waitFor(() => (server.dump()["dc:t:revoked"] || []).includes("sess-1"), 2000, "revoked rebuilt");
  // A change while the KV is away is written on return.
  server.stop();
  await sleep(20);
  ra.add("sess-offline");
  server.start();
  await waitFor(() => (server.dump()["dc:t:revoked"] || []).includes("sess-offline"), 2000, "offline write flushed");
  await A.kv.close();
  await B.kv.close();
});

test("cluster: registry, leader with primary preference, failover, events, cfg, metrics, kv status", async () => {
  const server = createFakeRedisServer();
  const render = node(server, "render", "primary");
  const pc = node(server, "pc-test", "secondary");
  await waitFor(() => render.enabled() && pc.enabled(), 2000, "both enabled");
  await waitFor(() => render.isLeader(), 2000, "render leads");
  await sleep(200);
  assert.ok(!pc.isLeader(), "secondary does not lead while the primary is alive");
  const nodes = await pc.getNodes();
  assert.deepStrictEqual(nodes.map((n) => n.id).sort(), ["pc-test", "render"]);
  const r = nodes.find((n) => n.id === "render");
  assert.strictEqual(r.role, "primary");
  assert.strictEqual(r.memLimit, 512);
  assert.strictEqual(r.state, "active");
  for (const k of ["url", "version", "startedAt", "memRss", "cpu", "cores", "conns", "p95ms", "errRate", "gameMode", "lastBeat"]) assert.ok(k in r, `node field ${k}`);

  // cfg written on one node, read on the other; validated.
  const cfg = await pc.setCfg({ ramMb: 999999, cores: 4, loadRule: { renderHighPct: 70 }, schedule: { slots: [{ d: 1, from: "18:00", to: "02:00" }, { d: 9, from: "x", to: "y" }] }, junk: 1 }, { username: "owner" });
  assert.strictEqual(cfg.ramMb, 8192);
  assert.strictEqual(cfg.cores, 4);
  assert.strictEqual(cfg.loadRule.pcHighPct, 85);
  assert.strictEqual(cfg.schedule.slots.length, 1);
  assert.ok(!("junk" in cfg));
  const seen = await render.getCfg();
  assert.strictEqual(seen.loadRule.renderHighPct, 70);

  // node state: render tells the PC to drain; the PC applies it itself.
  const states = [];
  pc.onSelfStateChange((s, prev, reason) => states.push([s, prev, reason]));
  await render.setNodeState("pc-test", "draining", "test drain");
  await waitFor(() => states.length === 1, 1000, "pc got drain");
  assert.deepStrictEqual(states[0], ["draining", "active", "test drain"]);
  await waitFor(async () => (await render.getNodes()).find((n) => n.id === "pc-test").state === "draining");
  await pc.setNodeState("pc-test", "active", null);

  // events
  const events = await render.getEvents(50);
  const kinds = events.map((e) => e.kind);
  assert.ok(kinds.includes("node-up") && kinds.includes("cfg") && kinds.includes("node-state"), kinds.join(","));

  // metrics ring in the KV, for both nodes
  await waitFor(async () => {
    const m = await render.getMetrics(60);
    return (m.render || []).length > 0 && (m["pc-test"] || []).length > 0;
  }, 2000, "metrics for both");
  const m = await render.getMetrics(60);
  for (const k of ["t", "rss", "cpu", "conns", "p95", "err"]) assert.ok(k in m.render[0], `sample field ${k}`);
  const kvs = await render.kvStatus();
  assert.ok(kvs.ok && kvs.usedMb > 0 && kvs.maxMb === 25);

  // pub/sub + invalidation (not delivered to the sender)
  const got = [];
  pc.subscribe("dc:test", (msg, meta) => got.push([msg, meta.from]));
  const inv = [];
  pc.onInvalidate("demo", (msg) => inv.push(msg));
  render.onInvalidate("demo", () => inv.push("self"));
  await sleep(20);
  render.publish("dc:test", { hello: 1 });
  render.invalidate("demo", "x1", { extra: true });
  await waitFor(() => got.length === 1 && inv.length === 1);
  assert.deepStrictEqual(got[0], [{ hello: 1 }, "render"]);
  assert.deepStrictEqual(inv[0], { kind: "demo", id: "x1", extra: true });

  // leaderOnly
  let runs = 0;
  render.leaderOnly("t", () => (runs += 1))();
  pc.leaderOnly("t", () => (runs += 10))();
  assert.strictEqual(runs, 1);

  // Graceful stop of the leader: the PC takes over at once.
  const t0 = Date.now();
  await render.stop({ graceful: true });
  await waitFor(() => pc.isLeader(), 2000, "pc takes the lock");
  assert.ok(Date.now() - t0 < 1500);
  const after = await pc.getNodes();
  assert.strictEqual(after.find((n) => n.id === "render").state, "down");

  // Render comes back: the PC hands the lock back.
  const render2 = node(server, "render", "primary");
  await waitFor(() => render2.isLeader() && !pc.isLeader(), 3000, "primary preferred again");

  // Crash of the leader (no cleanup): the lock expires after its TTL.
  await render2.stop({ graceful: false });
  await waitFor(() => pc.isLeader(), 3000, "failover after TTL");
  await pc.stop();
});

test("cluster: KV loss = single node (primary leads, secondary waits), rejoins when back", async () => {
  const server = createFakeRedisServer();
  const render = node(server, "render", "primary");
  const pc = node(server, "pc-x", "secondary");
  await waitFor(() => render.enabled() && pc.enabled() && render.isLeader());
  server.stop();
  await waitFor(() => !render.enabled() && !pc.enabled(), 1000, "both single");
  assert.ok(render.isLeader(), "primary keeps leading");
  assert.ok(!pc.isLeader(), "secondary never runs leader jobs while the KV is away");
  const nodes = await pc.getNodes();
  assert.strictEqual(nodes.length, 1);
  const st = await pc.kvStatus();
  assert.strictEqual(st.ok, false);
  await pc.pushEvent("while-away", { x: 1 });
  server.start({ flush: true });
  await waitFor(() => render.enabled() && pc.enabled(), 2000, "back");
  await waitFor(async () => (await pc.getNodes()).length === 2, 2000, "registry rebuilt");
  const kinds = (await render.getEvents(50)).map((e) => e.kind);
  assert.ok(kinds.includes("while-away"), "queued event flushed");
  assert.ok(kinds.includes("kv-rebuilt") || kinds.includes("kv-back"), kinds.join(","));
  await waitFor(() => render.isLeader());
  await render.stop();
  await pc.stop();
});

test("store: rate limit, presence and sockets through the KV", async () => {
  const server = createFakeRedisServer();
  const a = node(server, "render", "primary");
  await waitFor(() => a.enabled());
  const r1 = await a.store.rateLimit("dm", "u1", { max: 2, windowMs: 1000 });
  const r2 = await a.store.rateLimit("dm", "u1", { max: 2, windowMs: 1000 });
  const r3 = await a.store.rateLimit("dm", "u1", { max: 2, windowMs: 1000 });
  assert.ok(r1.ok && r2.ok && !r3.ok && r3.retryAfterMs > 0);
  assert.ok(server.dump()["dc:rl:dm:u1"] === "3");
  await a.stop();
  // Same API on a single node.
  const single = createCluster({ env: {}, log: quiet });
  single.start({});
  const s1 = await single.store.rateLimit("dm", "u1", { max: 1, windowMs: 1000 });
  const s2 = await single.store.rateLimit("dm", "u1", { max: 1, windowMs: 1000 });
  assert.ok(s1.ok && !s2.ok);
  await single.stop();
});

test("single node (no REDIS_URL): same API in memory, leader, no KV", async () => {
  const c = createCluster({ env: { DESCALL_CLUSTER_METRICS_MS: "50" }, log: quiet });
  c.start({});
  assert.strictEqual(c.configured(), false);
  assert.strictEqual(c.enabled(), false);
  assert.strictEqual(c.isLeader(), true);
  assert.strictEqual(c.nodeId, "render");
  assert.strictEqual(c.role, "primary");
  assert.strictEqual(c.socketAdapter(), null);
  assert.strictEqual(c.hasRemoteUser("u1"), false);
  const nodes = await c.getNodes();
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].id, "render");
  const cfg = await c.setCfg({ gameMode: { enabled: true, shareMb: 100 } }, "owner");
  assert.strictEqual(cfg.gameMode.shareMb, 256);
  assert.strictEqual((await c.getCfg()).gameMode.enabled, true);
  await c.pushEvent("hello", { a: 1 });
  assert.strictEqual((await c.getEvents(5))[0].kind, "hello");
  const got = [];
  c.subscribe("dc:x", (m) => got.push(m));
  c.publish("dc:x", 5);
  await waitFor(() => got.length === 1);
  assert.strictEqual(c.invalidate("friends", "u1"), false);
  await waitFor(async () => ((await c.getMetrics(60)).render || []).length > 0, 2000, "local metrics");
  assert.deepStrictEqual(await c.kvStatus(), { ok: false, single: true, usedMb: 0, maxMb: 0 });
  let ran = 0;
  c.leaderOnly("x", () => (ran += 1))();
  assert.strictEqual(ran, 1);
  // Plain Maps stay plain: nothing is patched without a KV.
  const state = require("../runtime/sharedState");
  assert.ok(!Object.prototype.hasOwnProperty.call(state.presence, "set"));
  await c.stop();
});

test("metrics middleware: p95 and error rate", async () => {
  const { createMetrics } = require("../lib/cluster/metrics");
  const m = createMetrics({ cores: 2, getConns: () => 7 });
  for (let i = 1; i <= 100; i++) m.record(i, i <= 5 ? 500 : 200);
  const s = m.sample();
  assert.strictEqual(s.p95, 95);
  assert.strictEqual(s.err, 0.05);
  assert.strictEqual(s.conns, 7);
  assert.strictEqual(m.sample().p95, 0, "window resets");
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok - ${t.name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL - ${t.name}\n${err && err.stack ? err.stack : err}`);
    }
  }
  console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
