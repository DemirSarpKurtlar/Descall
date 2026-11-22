"use strict";

/**
 * Hot-path overhead of the hybrid layer (not a test; run by hand):
 *   node lib/cluster/bench.cjs
 * Prints ns per operation for: plain Map vs replicated Map writes, the
 * single-node helpers that hot paths now call (hasRemoteUser, invalidate,
 * leaderOnly) and the Express timing middleware.
 */

const { performance } = require("perf_hooks");
const path = require("path");
const { createFakeRedisServer } = require(path.join(__dirname, "../../test/fakeRedis.cjs"));
const { createCluster } = require("./index");
const { createReplicator } = require("./replica");
const { createKv } = require("./kv");
const { createMetrics } = require("./metrics");

function bench(label, n, fn) {
  for (let i = 0; i < Math.min(n, 20000); i++) fn(i); // warm up
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  const ns = ((performance.now() - t0) * 1e6) / n;
  console.log(`${label.padEnd(58)} ${ns.toFixed(1).padStart(9)} ns/op`);
  return ns;
}

(async () => {
  const quiet = { warn() {}, log() {} };
  const single = createCluster({ env: {}, log: quiet });
  const N = 1_000_000;
  console.log("single node (no REDIS_URL): what every hot path pays");
  const plain = new Map();
  bench("Map.get (baseline)", N, (i) => plain.get(`u${i & 1023}`));
  bench("cluster.hasRemoteUser(id)", N, (i) => single.hasRemoteUser(`u${i & 1023}`));
  bench("cluster.invalidate(kind, id) (no-op)", N, (i) => single.invalidate("friends", `u${i & 1023}`));
  const job = single.leaderOnly("x", () => 1);
  bench("leaderOnly(job)()", N, () => job());
  bench("plain presence.set (unchanged on a single node)", N, (i) => plain.set(`u${i & 1023}`, { status: "online", socketId: "s" }));

  const m = createMetrics({ cores: 1 });
  const res = { statusCode: 200, once(_e, cb) { this.cb = cb; } };
  bench("metrics middleware per request (hrtime + finish)", 200000, () => {
    m.middleware({}, res, () => {});
    res.cb();
  });
  m.sample();

  console.log("\nclustered (fake KV in-process; a real KV adds network, not CPU):");
  const server = createFakeRedisServer();
  const kv = createKv({ url: "redis://fake", factory: (_u, o) => server.createClient(o), log: quiet });
  await new Promise((r) => kv.events.once("up", r));
  const rep = createReplicator({ nodeId: "a", kv, log: quiet, watchMs: 1e9 });
  rep.setActive(true);
  rep.start();
  const shared = new Map();
  rep.register("calls", shared, { storage: { type: "keys", prefix: "dc:b:" }, watch: true });
  const owned = new Map();
  rep.register("presence", owned, { kind: "owned", storage: { key: "dc:b:presence" }, isLocal: () => true });
  const reads = new Map([["u1", { status: "online" }]]);
  rep.register("reads", reads, { kind: "owned", storage: { key: "dc:b:r" } });
  bench("replicated Map.get (reads stay local)", N, () => reads.get("u1"));
  bench("replicated owned set (presence write + publish + HSET)", 100000, (i) => owned.set(`u${i & 1023}`, { status: "online", socketId: "s", username: "x" }));
  bench("replicated shared set (call write + publish + SET)", 100000, (i) => shared.set(`g${i & 63}`, { participants: new Set(["a", "b"]), startTime: 1 }));
  for (let i = 0; i < 50; i++) shared.set(`g${i}`, { participants: new Set(["a", "b", "c"]), startTime: i });
  bench("watch tick over 50 live calls (unchanged)", 2000, () => rep.flushWatch());
  rep.stop();
  await kv.close();
  process.exit(0);
})();
