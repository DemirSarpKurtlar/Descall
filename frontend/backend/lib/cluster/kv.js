"use strict";

/**
 * Key Value (Redis) connections of one node.
 *
 *  - `cmd`: commands. enableOfflineQueue is off, so a command while the KV is
 *    away fails at once instead of piling up in memory (512 MB Render box).
 *  - `sub`: our own pub/sub bus (dc:state, dc:inval, dc:ctl, subscribe()).
 *  - `adapterPub` / `adapterSub`: @socket.io/redis-adapter. The pub side is
 *    wrapped so a broadcast while the KV is away is dropped (local delivery
 *    still happens in the adapter) and PUBSUB NUMSUB answers "only me".
 *
 * ioredis is required lazily: a single node never loads it. Tests pass a
 * `factory(url, opts)` that returns fake clients (test/fakeRedis.cjs).
 */

const { EventEmitter } = require("events");

function defaultFactory(url, opts) {
  // eslint-disable-next-line global-require
  const Redis = require("ioredis");
  return new Redis(url, opts);
}

const BASE_OPTS = {
  // Reconnect forever, backing off to 5 s; the node runs single meanwhile.
  retryStrategy: (times) => Math.min(250 * times, 5000),
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  enableReadyCheck: true,
  lazyConnect: false,
};

function createKv({ url, factory = defaultFactory, log = console } = {}) {
  const events = new EventEmitter();
  events.setMaxListeners(50);
  const cmd = factory(url, { ...BASE_OPTS, enableOfflineQueue: false, connectionName: "dc-cmd" });
  // Subscriber connections keep their (few) SUBSCRIBE commands queued until the KV
  // is back instead of failing them (an unhandled rejection inside the adapter).
  const SUB_OPTS = { ...BASE_OPTS, enableOfflineQueue: true, maxRetriesPerRequest: null };
  const sub = factory(url, { ...SUB_OPTS, connectionName: "dc-sub" });
  let adapterPubRaw = null;
  let adapterSubRaw = null;
  let up = false;
  let everUp = false;
  let closed = false;

  function onReady() {
    if (closed || up) return;
    if (cmd.status !== "ready") return;
    up = true;
    const first = !everUp;
    everUp = true;
    events.emit("up", { first });
  }
  function onDown() {
    if (!up) return;
    up = false;
    events.emit("down");
  }
  cmd.on("ready", onReady);
  cmd.on("close", onDown);
  cmd.on("end", onDown);
  let lastErrLog = 0;
  const onError = (err) => {
    const t = Date.now();
    if (t - lastErrLog > 30000) {
      lastErrLog = t;
      log.warn?.("[cluster] key value error:", err?.message || err);
    }
  };
  cmd.on("error", onError);
  sub.on("error", onError);

  /** One command; rejects at once while the KV is away. */
  function call(name, ...args) {
    if (!up || cmd.status !== "ready") return Promise.reject(Object.assign(new Error("kv down"), { code: "KV_DOWN" }));
    return cmd[name](...args);
  }

  /** Fire-and-forget command: never throws, never rejects. */
  function fire(name, ...args) {
    if (!up) return;
    try {
      const p = cmd[name](...args);
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* dropped */
    }
  }

  // --- our bus ---------------------------------------------------------
  const handlers = new Map(); // channel -> Set<fn(raw)>
  sub.on("message", (channel, raw) => {
    const set = handlers.get(channel);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(raw);
      } catch (err) {
        log.warn?.("[cluster] bus handler failed:", err?.message || err);
      }
    }
  });
  function listen(channel, fn) {
    let set = handlers.get(channel);
    if (!set) {
      set = new Set();
      handlers.set(channel, set);
      const p = sub.subscribe(channel);
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
    set.add(fn);
    return () => set.delete(fn);
  }
  function publish(channel, payload) {
    if (!up) return false;
    try {
      const p = cmd.publish(channel, typeof payload === "string" ? payload : JSON.stringify(payload));
      if (p && typeof p.catch === "function") p.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  // --- Socket.IO adapter clients ----------------------------------------
  function adapterClients() {
    if (!adapterPubRaw) {
      adapterPubRaw = factory(url, { ...BASE_OPTS, enableOfflineQueue: false, connectionName: "dc-sio-pub" });
      adapterSubRaw = factory(url, { ...SUB_OPTS, connectionName: "dc-sio-sub" });
      adapterPubRaw.on("error", onError);
      adapterSubRaw.on("error", onError);
    }
    const raw = adapterPubRaw;
    // Only what the adapter calls; everything else passes through.
    const pub = new Proxy(raw, {
      get(target, prop) {
        if (prop === "publish") {
          return (channel, msg) => {
            if (target.status !== "ready") return Promise.resolve(0);
            try {
              return Promise.resolve(target.publish(channel, msg)).catch(() => 0);
            } catch {
              return Promise.resolve(0);
            }
          };
        }
        if (prop === "send_command") {
          return (name, args, cb) => {
            if (target.status !== "ready") {
              // NUMSUB while away: just this node, so fetchSockets() etc. answer locally.
              const answer = [args?.[1], 1];
              if (typeof cb === "function") cb(null, answer);
              return Promise.resolve(answer);
            }
            return target.send_command(name, args, cb);
          };
        }
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    return { pub, sub: adapterSubRaw };
  }

  /** Every key matching `pattern` (SCAN until the cursor wraps; KEYS would block the KV). */
  async function scanAll(pattern, max = 50000) {
    const out = [];
    let cursor = "0";
    do {
      const [next, keys] = await call("scan", cursor, "MATCH", pattern, "COUNT", "500");
      cursor = String(next);
      for (const k of keys || []) out.push(k);
    } while (cursor !== "0" && out.length < max);
    return [...new Set(out)];
  }

  async function close() {
    closed = true;
    up = false;
    for (const c of [cmd, sub, adapterPubRaw, adapterSubRaw]) {
      if (!c) continue;
      try {
        c.disconnect();
      } catch {
        /* gone */
      }
    }
  }

  return {
    events,
    call,
    fire,
    scanAll,
    listen,
    publish,
    adapterClients,
    close,
    isUp: () => up,
    raw: { cmd, sub },
  };
}

module.exports = { createKv };
