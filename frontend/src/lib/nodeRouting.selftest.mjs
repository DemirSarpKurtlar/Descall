// Hybrid server client routing (lib/nodeRouting.js): boot assign with a 1.5 s timeout and
// fallback, per-tab persistence, origin allowlist, node:move handling (jitter, re-assign,
// socket switch), connect_error / server close on the PC -> primary, connect gating.
// Run: node src/lib/nodeRouting.selftest.mjs
import assert from "node:assert/strict";
import { createNodeRouting, ASSIGN_TIMEOUT_MS, apiBase, socketBase } from "./nodeRouting.js";
import { PC_NODE_ORIGIN, NODE_ORIGINS } from "../config/nodeOrigins.js";

const PRIMARY = "https://des-call.onrender.com";
const PC = "https://pc.descall.com";

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

function answerFetch(answer, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    if (answer instanceof Error) throw answer;
    if (answer === "hang") return new Promise(() => {});
    if (typeof answer === "function") return answer(url);
    return { ok: true, status: 200, json: async () => answer };
  };
}

function fakeSocket(uri) {
  const handlers = new Map();
  const s = {
    io: { uri },
    connected: false,
    active: false,
    log: [],
    on(ev, fn) {
      if (!handlers.has(ev)) handlers.set(ev, []);
      handlers.get(ev).push(fn);
      return s;
    },
    fire(ev, ...args) {
      for (const fn of handlers.get(ev) || []) fn(...args);
    },
    connect() {
      s.log.push(`connect ${s.io.uri}`);
      s.connected = true;
      s.active = true;
      return s;
    },
    disconnect() {
      s.log.push("disconnect");
      s.connected = false;
      s.active = false;
      return s;
    },
  };
  return s;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const base = { primaryApi: PRIMARY, primarySocket: PRIMARY, log: () => {} };

// Shared constant and default timeout.
assert.equal(PC_NODE_ORIGIN, PC);
assert.deepEqual([...NODE_ORIGINS], [PC]);
assert.equal(ASSIGN_TIMEOUT_MS, 1500, "boot assign waits at most 1.5 s");
// The module singleton (no window in node) starts on the default base.
assert.equal(apiBase(), PRIMARY);
assert.equal(socketBase(), PRIMARY);

// 1. Timeout: the assign call hangs -> default after timeoutMs.
{
  const storage = memStorage();
  const r = createNodeRouting({ ...base, storage, fetchImpl: answerFetch("hang"), timeoutMs: 30 });
  const t0 = Date.now();
  const cur = await r.init();
  assert.ok(Date.now() - t0 < 1000, "timeout honoured");
  assert.equal(cur.api, PRIMARY, "timeout: the default");
  assert.equal(r.apiBase(), PRIMARY);
  assert.equal(r.isOnSecondary(), false);
}

// 2. Network error / old backend (404) -> default.
{
  const r1 = createNodeRouting({ ...base, storage: memStorage(), fetchImpl: answerFetch(new TypeError("Failed to fetch")) });
  assert.equal((await r1.init()).api, PRIMARY, "network error: default");
  const r2 = createNodeRouting({ ...base, storage: memStorage(), fetchImpl: answerFetch(() => ({ ok: false, status: 404, json: async () => ({}) })) });
  assert.equal((await r2.init()).api, PRIMARY, "404 (backend without /api/node): default");
}

// 3. Assign says the PC: REST + socket move, choice persisted for the tab, sid sent.
{
  const storage = memStorage();
  const calls = [];
  const r = createNodeRouting({ ...base, storage, fetchImpl: answerFetch({ nodeId: "pc-home", url: PC, socketUrl: PC, ttlSec: 600 }, calls) });
  const changes = [];
  r.onChange((next, prev, why) => changes.push([prev.api, next.api, why]));
  await r.init();
  assert.equal(r.apiBase(), PC);
  assert.equal(r.socketBase(), PC);
  assert.equal(r.isOnSecondary(), true);
  assert.deepEqual(changes, [[PRIMARY, PC, "assign"]]);
  assert.match(calls[0].url, /^https:\/\/des-call\.onrender\.com\/api\/node\/assign\?sid=[A-Za-z0-9]{22}$/, "asks the primary with the tab sid");
  const saved = JSON.parse(storage.dump()["descall.node.v1"]);
  assert.equal(saved.api, PC, "persisted for the tab");
  // A reload of the same tab starts on the PC at once and sends it as the prev hint.
  const calls2 = [];
  const again = createNodeRouting({ ...base, storage, fetchImpl: answerFetch({ nodeId: "pc-home", url: PC, socketUrl: PC }, calls2) });
  assert.equal(again.apiBase(), PC, "persisted choice used before the answer");
  await again.init();
  assert.match(calls2[0].url, /prev=pc-home/, "prev hint keeps the session sticky");
  assert.equal(new URL(calls2[0].url).searchParams.get("sid"), new URL(calls[0].url).searchParams.get("sid"), "same sid for the tab");
  // Back to Render: the stored choice is cleared.
  again.apply({ nodeId: "render", url: PRIMARY, socketUrl: PRIMARY }, "assign");
  assert.equal(again.apiBase(), PRIMARY);
  assert.equal(storage.dump()["descall.node.v1"], undefined, "primary choice is not stored");
}

// 4. Expired / foreign persisted entries are ignored.
{
  const old = memStorage({ "descall.node.v1": JSON.stringify({ nodeId: "pc-home", api: PC, socket: PC, at: Date.now() - 3_600_000, ttlSec: 600 }) });
  assert.equal(createNodeRouting({ ...base, storage: old, fetchImpl: answerFetch("hang") }).apiBase(), PRIMARY, "expired choice ignored");
  const evil = memStorage({ "descall.node.v1": JSON.stringify({ nodeId: "x", api: "https://evil.example", socket: "https://evil.example", at: Date.now(), ttlSec: 600 }) });
  assert.equal(createNodeRouting({ ...base, storage: evil, fetchImpl: answerFetch("hang") }).apiBase(), PRIMARY, "unknown stored origin ignored");
}

// 5. Origin allowlist: a bad answer never moves the app; single-node answers keep the default.
{
  const r = createNodeRouting({ ...base, storage: memStorage(), fetchImpl: answerFetch({ nodeId: "x", url: "https://evil.example", socketUrl: "https://evil.example" }) });
  await r.init();
  assert.equal(r.apiBase(), PRIMARY, "unknown origin rejected");
  const single = createNodeRouting({ ...base, storage: memStorage(), fetchImpl: answerFetch({ nodeId: "render", url: "", socketUrl: "", ttlSec: 600 }) });
  await single.init();
  assert.equal(single.apiBase(), PRIMARY, "single-node backend without a public URL: default");
  assert.equal(r.isAllowedNodeUrl("http://pc.descall.com"), false, "http is not the PC origin");
  assert.equal(r.isAllowedNodeUrl(`${PC}/api`), true);
  const local = createNodeRouting({ primaryApi: "http://localhost:3000", primarySocket: "http://localhost:3000", storage: memStorage(), log: () => {} });
  assert.equal(local.isAllowedNodeUrl("http://127.0.0.1:3100"), true, "local dev run may use a second local node");
  assert.equal(r.isAllowedNodeUrl("http://127.0.0.1:3100"), false, "production never accepts localhost");
}

// 6. node:move: jitter, re-assign, switch the same socket object, REST follows.
{
  const storage = memStorage();
  let answer = { nodeId: "pc-home", url: PC, socketUrl: PC };
  const delays = [];
  const r = createNodeRouting({
    ...base,
    storage,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => answer }),
    random: () => 0.25,
    setTimeout: (fn, ms) => {
      if (ms !== 1500) delays.push(ms);
      return setTimeout(fn, 0);
    },
  });
  await r.init();
  const s = fakeSocket(PRIMARY);
  r.attach(s);
  s.connect();
  await tick();
  await tick();
  assert.equal(s.io.uri, PC, "first connect waited for assign and went to the PC");
  assert.deepEqual(s.log, [`connect ${PC}`]);
  answer = { nodeId: "render", url: PRIMARY, socketUrl: PRIMARY };
  s.fire("node:move", { reason: "drain", toUrl: PRIMARY, jitterMs: 3000 });
  await tick();
  await tick();
  await tick();
  assert.deepEqual(delays, [750], "waits random(0..jitterMs) before asking");
  assert.equal(r.apiBase(), PRIMARY, "REST moved to Render");
  assert.equal(s.io.uri, PRIMARY, "socket moved to Render");
  assert.deepEqual(s.log.slice(1), ["disconnect", `connect ${PRIMARY}`], "same socket reconnected, old connection closed");
  assert.equal(s.connected, true);
}

// 7. node:move when assign is unreachable: toUrl (if allowed), else the primary.
{
  const storage = memStorage();
  let fail = false;
  const fetchImpl = async () => {
    if (fail) throw new TypeError("Failed to fetch");
    return { ok: true, status: 200, json: async () => ({ nodeId: "pc-home", url: PC, socketUrl: PC }) };
  };
  const r = createNodeRouting({ ...base, storage, fetchImpl, setTimeout: (fn) => setTimeout(fn, 0) });
  await r.init();
  fail = true;
  const res = await r.handleMove({ reason: "schedule", toUrl: PRIMARY, jitterMs: 0 });
  assert.equal(res.api, PRIMARY, "assign down: toUrl (the primary)");
  await r.apply({ nodeId: "pc-home", url: PC, socketUrl: PC }, "assign");
  const res2 = await r.handleMove({ reason: "drain", toUrl: "https://evil.example", jitterMs: 0 });
  assert.equal(res2.api, PRIMARY, "unknown toUrl ignored: primary");
}

// 8. connect_error on the PC -> primary at once (REST too); a server close does the same.
{
  const r = createNodeRouting({ ...base, storage: memStorage(), fetchImpl: answerFetch({ nodeId: "pc-home", url: PC, socketUrl: PC }) });
  await r.init();
  const s = fakeSocket(PC);
  r.attach(s);
  s.fire("connect_error", new Error("xhr poll error"));
  assert.equal(s.io.uri, PRIMARY, "next reconnect attempt goes to Render");
  assert.equal(r.apiBase(), PRIMARY, "REST follows");
  assert.equal(r.isOnSecondary(), false);

  const r2 = createNodeRouting({ ...base, storage: memStorage(), fetchImpl: answerFetch({ nodeId: "pc-home", url: PC, socketUrl: PC }) });
  await r2.init();
  const s2 = fakeSocket(PC);
  r2.attach(s2);
  s2.fire("disconnect", "transport close");
  assert.equal(r2.apiBase(), PC, "a plain transport close keeps the node (reconnect may still work)");
  s2.fire("disconnect", "io server disconnect");
  assert.equal(r2.apiBase(), PRIMARY, "the PC closed us: Render");
  assert.equal(s2.io.uri, PRIMARY);

  // On the primary a connect_error changes nothing.
  const r3 = createNodeRouting({ ...base, storage: memStorage(), fetchImpl: answerFetch("hang"), timeoutMs: 10 });
  await r3.init();
  const s3 = fakeSocket(PRIMARY);
  r3.attach(s3);
  s3.fire("connect_error", new Error("timeout"));
  assert.equal(s3.io.uri, PRIMARY);
  assert.equal(r3.apiBase(), PRIMARY);
}

// 9. Edge sockets (Cloudflare hub) are never routed.
{
  const r = createNodeRouting({ ...base, storage: memStorage(), fetchImpl: answerFetch({ nodeId: "pc-home", url: PC, socketUrl: PC }) });
  await r.init();
  const s = fakeSocket("https://rt.descall.com");
  s.edge = true;
  const origConnect = s.connect;
  r.attach(s);
  assert.equal(s.connect, origConnect, "edge socket untouched");
  assert.equal(s.__nodeRouting, undefined);
}

console.log("nodeRouting.selftest: ok");
