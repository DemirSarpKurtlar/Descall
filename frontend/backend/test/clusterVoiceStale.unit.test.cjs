"use strict";
// Feedback 2026-11-22 ("2 sesli sohbet birden katılıyo"): a server voice call deleted while
// the Key Value was away must not come back with its old seats when the KV returns.
// The delete tombstone used to be pruned by the watch tick that runs between
// setActive(true) and resync(), so resync() restored the stale call from the KV.
// Run from frontend/: node backend/test/clusterVoiceStale.unit.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createReplicator } = require("../lib/cluster/replica");

/** In-memory KV double with the calls replica.js makes. */
function fakeKv() {
  const store = new Map();
  let up = true;
  const run = (name, args) => {
    if (name === "set") store.set(args[0], args[1]);
    else if (name === "del") store.delete(args[0]);
    else if (name === "get") return store.get(args[0]) ?? null;
    return null;
  };
  return {
    store,
    setUp(v) {
      up = v;
    },
    publish() {},
    listen() {
      return () => {};
    },
    fire(name, ...args) {
      if (up) run(name, args);
    },
    async call(name, ...args) {
      if (!up) throw Object.assign(new Error("kv down"), { code: "KV_DOWN" });
      return run(name, args);
    },
    async scanAll(pattern) {
      if (!up) throw new Error("kv down");
      const prefix = pattern.replace(/\*$/, "");
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

(async () => {
  let t = 1_000_000;
  const now = () => t;
  const kv = fakeKv();
  const r = createReplicator({ nodeId: "render", kv, log: { warn() {} }, watchMs: 1_000_000, now });
  const calls = new Map();
  r.register("serverCalls", calls, { storage: { type: "keys", prefix: "dc:servercall:" }, watch: true });
  r.setActive(true);
  await r.resync();

  // Alice sits in channel A; the call is written through to the KV.
  calls.set("ch-a", { serverId: "srv", participants: new Map([["u-alice", { id: "u-alice" }]]) });
  r.flushWatch();
  assert.ok(kv.store.has("dc:servercall:ch-a"), "call persisted");

  // The KV goes away. Alice moves to channel B: A empties and is deleted (the KV delete is lost).
  kv.setUp(false);
  r.setActive(false);
  calls.delete("ch-a");
  calls.set("ch-b", { serverId: "srv", participants: new Map([["u-alice", { id: "u-alice" }]]) });
  assert.ok(kv.store.has("dc:servercall:ch-a"), "stale A still in the KV");

  // Three minutes later the KV is back. The node activates, the watch tick runs (it does
  // every 250 ms in production) before the resync finishes.
  t += 180_000;
  kv.setUp(true);
  r.setActive(true);
  r.flushWatch();
  await r.resync();

  assert.equal(calls.has("ch-a"), false, "the deleted call A did not come back from the KV");
  assert.equal(kv.store.has("dc:servercall:ch-a"), false, "the stale A is removed from the KV");
  const seated = [...calls.entries()].filter(([, c]) => c.participants.has("u-alice")).map(([k]) => k);
  assert.deepEqual(seated, ["ch-b"], "alice sits in exactly one voice channel");

  // After the resync tombstones expire as before.
  t += 180_000;
  r.flushWatch();
  const S = r.structs.get("serverCalls");
  assert.equal([...S.meta.values()].some((m) => m.del), false, "old tombstones are pruned once synced");

  // Restored seats of people who never came back are swept on KV up too.
  const shared = fs.readFileSync(path.join(__dirname, "../lib/cluster/sharedStore.js"), "utf8");
  assert.match(shared, /cluster\.on\("kvUp", \(\) => \{\s*const t = setTimeout\(sweepGhosts, GHOST_CHECK_MS\);/);

  console.log("clusterVoiceStale ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
