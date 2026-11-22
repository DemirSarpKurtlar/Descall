"use strict";

/**
 * Descall hybrid server: multi-node core (HYBRID-CONTRACT "Backend module API").
 *
 * Render (primary, leader by default) and the owner's PC (secondary) run the
 * same backend and share live state through a Render Key Value (Redis).
 *
 *   enabled()           REDIS_URL set and the KV reachable right now
 *   nodeId / role / publicUrl
 *   isLeader(), onLeaderChange(cb)
 *   getNodes(), getCfg(), setCfg(partial, actor)
 *   setNodeState(nodeId, state, reason)     active | draining | paused
 *   pushEvent(kind, detail), getEvents(limit)
 *   getMetrics(minutes), kvStatus()
 *   publish(channel, msg), subscribe(channel, cb)
 *
 * Extras used by server.js, runtime/sharedState wiring and the other agents:
 *   configured(), start({ io, state }), stop(), socketAdapter(),
 *   metricsMiddleware, leaderOnly(name, fn), invalidate(kind, id, extra),
 *   onInvalidate(kind, cb), hasRemoteUser(userId), onSelfStateChange(cb),
 *   getSelfState(), updateSelf(patch), store (async shared-state API).
 *
 * Single node (no REDIS_URL): nothing here opens a socket or loads ioredis;
 * every function answers from memory (getNodes = this node, metrics sampled
 * locally), isLeader() is always true and the shared Maps stay plain Maps.
 * KV unreachable: the node runs single (primary leads, a secondary does not)
 * and rejoins on its own when the KV is back, rewriting its state into it.
 */

const { EventEmitter } = require("events");
const { readClusterConfig } = require("./config");
const { createMetrics } = require("./metrics");
const { createLeader } = require("./leader");

const NODES_KEY = "dc:nodes";
const EVENTS_KEY = "dc:events";
const CFG_KEY = "dc:cfg:pc";
const EPOCH_KEY = "dc:epoch";
const INVAL_CHANNEL = "dc:inval";
const CTL_CHANNEL = "dc:ctl";
const EVENTS_MAX = 200;
const NODE_STATES = new Set(["active", "draining", "paused"]);

/**
 * dc:cfg:pc defaults, the same in the admin panel (lib/nodeKeys/model.js normalizes over
 * this) and in the Descall Node app (desktop/crates/descall-node/src/cfg.rs).
 * loadRule.enabled false = every new user stays on Render; schedule.enabled false or no
 * slots = the PC is always available; slot d 0 = Sunday (Date.getDay()), Europe/Istanbul.
 * emergency.on (admin "all to Render") = /api/node/assign answers Render for everyone and
 * a secondary drains itself until it is cleared.
 */
const DEFAULT_CFG = Object.freeze({
  ramMb: 2048,
  cores: 2,
  loadRule: { enabled: true, renderHighPct: 60, pcHighPct: 85 },
  gameMode: { enabled: true, shareMb: 1024, fullHandover: false },
  schedule: { enabled: true, tz: "Europe/Istanbul", slots: [] },
  alerts: { pcDown: true, kvFull: true, render90: true },
  emergency: { on: false, at: null, by: null, reason: null },
});

const aliveKey = (id) => `dc:node:${id}:alive`;
const metricsKey = (id) => `dc:metrics:${id}`;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function clampInt(v, min, max, def) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Partial cfg from an admin / tray request -> the full, valid cfg. Unknown keys dropped. */
function mergeCfg(current, partial = {}) {
  const base = clone(current || DEFAULT_CFG);
  const p = partial && typeof partial === "object" ? partial : {};
  if (p.ramMb !== undefined) base.ramMb = clampInt(p.ramMb, 512, 8192, base.ramMb);
  if (p.cores !== undefined) base.cores = clampInt(p.cores, 1, 8, base.cores);
  if (p.loadRule && typeof p.loadRule === "object") {
    if (p.loadRule.enabled !== undefined) base.loadRule.enabled = Boolean(p.loadRule.enabled);
    if (p.loadRule.preferPc !== undefined) base.loadRule.preferPc = Boolean(p.loadRule.preferPc);
    if (p.loadRule.renderHighPct !== undefined) base.loadRule.renderHighPct = clampInt(p.loadRule.renderHighPct, 10, 95, base.loadRule.renderHighPct);
    if (p.loadRule.pcHighPct !== undefined) base.loadRule.pcHighPct = clampInt(p.loadRule.pcHighPct, 10, 99, base.loadRule.pcHighPct);
  }
  if (p.gameMode && typeof p.gameMode === "object") {
    if (p.gameMode.enabled !== undefined) base.gameMode.enabled = Boolean(p.gameMode.enabled);
    if (p.gameMode.fullHandover !== undefined) base.gameMode.fullHandover = Boolean(p.gameMode.fullHandover);
    if (p.gameMode.shareMb !== undefined) base.gameMode.shareMb = clampInt(p.gameMode.shareMb, 256, 8192, base.gameMode.shareMb);
  }
  if (p.schedule && typeof p.schedule === "object") {
    if (p.schedule.enabled !== undefined) base.schedule.enabled = Boolean(p.schedule.enabled);
    if (typeof p.schedule.tz === "string" && /^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/.test(p.schedule.tz)) base.schedule.tz = p.schedule.tz;
    if (Array.isArray(p.schedule.slots)) {
      base.schedule.slots = p.schedule.slots
        .filter((s) => s && Number.isInteger(Number(s.d)) && Number(s.d) >= 0 && Number(s.d) <= 6 && HHMM.test(String(s.from)) && HHMM.test(String(s.to)))
        .slice(0, 28)
        .map((s) => ({ d: Number(s.d), from: String(s.from), to: String(s.to) }));
    }
  }
  if (p.alerts && typeof p.alerts === "object") {
    for (const k of ["pcDown", "kvFull", "render90"]) if (p.alerts[k] !== undefined) base.alerts[k] = Boolean(p.alerts[k]);
  }
  if (p.emergency && typeof p.emergency === "object") {
    const e = p.emergency;
    const str = (v, max) => (v == null ? null : String(v).slice(0, max));
    base.emergency = {
      on: Boolean(e.on),
      at: str(e.at, 40),
      by: str(e.by, 64),
      reason: str(e.reason, 300),
    };
  }
  // Durable-copy stamp (lib/nodeKeys/service.js compares it with node_settings on boot).
  if (typeof p.updatedAt === "string" && !Number.isNaN(Date.parse(p.updatedAt))) base.updatedAt = p.updatedAt.slice(0, 40);
  if (p.updatedBy !== undefined) base.updatedBy = p.updatedBy == null ? null : String(p.updatedBy).slice(0, 64);
  return base;
}

function createCluster({ env = process.env, log = console } = {}) {
  const C = {
    cfg: readClusterConfig(env),
    started: false,
    kv: null,
    factory: null,
    replicator: null,
    leader: null,
    io: null,
    selfState: "active",
    selfReason: null,
    selfExtra: { gameMode: false },
    startedAt: Date.now(),
    localEvents: [],
    pendingEvents: [],
    localCfg: clone(DEFAULT_CFG),
    cfgStore: null,
    timers: [],
    known: new Map(), // nodeId -> last seen state ("up" | "down")
    downTimer: null,
    stopped: false,
    store: null,
    shared: null,
  };
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  const localBus = new EventEmitter();
  localBus.setMaxListeners(200);

  const metrics = createMetrics({
    cores: C.cfg.cores,
    getConns: () => {
      const io = C.io;
      if (!io) return 0;
      return io.engine?.clientsCount ?? io.sockets?.sockets?.size ?? 0;
    },
  });

  const api = {};

  function configured() {
    return Boolean(C.cfg.redisUrl) || Boolean(C.factory);
  }

  function enabled() {
    return Boolean(C.kv && C.kv.isUp());
  }

  function isLeader() {
    if (!configured() || !C.leader) return !configured() || C.cfg.role === "primary";
    return C.leader.isLeader();
  }

  function ensureKv() {
    if (C.kv || !configured()) return C.kv;
    const { createKv } = require("./kv");
    C.kv = createKv({ url: C.cfg.redisUrl || "redis://fake", factory: C.factory || undefined, log });
    return C.kv;
  }

  // ---- self entry / registry --------------------------------------------
  function selfEntry() {
    const m = metrics.latest();
    const mem = process.memoryUsage();
    return {
      id: C.cfg.nodeId,
      role: C.cfg.role,
      url: C.cfg.publicUrl,
      version: C.cfg.version,
      startedAt: C.startedAt,
      memRss: Math.round(mem.rss / 1048576),
      memLimit: C.cfg.memoryMb,
      cpu: m ? m.cpu : 0,
      cores: C.cfg.cores,
      conns: m ? m.conns : 0,
      p95ms: m ? m.p95 : 0,
      errRate: m ? m.err : 0,
      state: C.selfState,
      gameMode: Boolean(C.selfExtra.gameMode),
      lastBeat: Date.now(),
    };
  }

  async function beat() {
    const kv = C.kv;
    if (!kv || !kv.isUp()) {
      C.leader?.offline();
      return;
    }
    try {
      const entry = selfEntry();
      entry.conns = Number(metrics.latest()?.conns ?? 0);
      await kv.call("hset", NODES_KEY, entry.id, JSON.stringify(entry));
      await kv.call("set", aliveKey(entry.id), String(entry.lastBeat), "PX", C.cfg.aliveTtlMs);
      await C.leader.tick();
      await watchPeers();
    } catch {
      /* next beat */
    }
  }

  async function readNodes() {
    const all = await C.kv.call("hgetall", NODES_KEY);
    const ids = Object.keys(all || {});
    const alive = await Promise.all(ids.map((id) => C.kv.call("exists", aliveKey(id)).catch(() => 0)));
    const out = [];
    ids.forEach((id, i) => {
      let n;
      try {
        n = JSON.parse(all[id]);
      } catch {
        return;
      }
      if (!alive[i]) n.state = "down";
      out.push(n);
    });
    return out;
  }

  async function peerIds() {
    if (!enabled()) return [];
    const nodes = await readNodes();
    return nodes.filter((n) => n.state !== "down").map((n) => n.id);
  }

  async function primaryAlive() {
    if (!enabled()) return false;
    const nodes = await readNodes();
    return nodes.some((n) => n.role === "primary" && n.id !== C.cfg.nodeId && n.state !== "down");
  }

  /** Notice nodes that went away / came back; the leader tidies up after a dead one. */
  async function watchPeers() {
    const nodes = await readNodes();
    for (const n of nodes) {
      if (n.id === C.cfg.nodeId) continue;
      const prev = C.known.get(n.id);
      const now = n.state === "down" ? "down" : "up";
      C.known.set(n.id, now);
      if (now === "down" && prev === "up") {
        C.replicator?.dropNode(n.id);
        emitter.emit("nodeDown", n);
        if (isLeader()) {
          void pushEvent("node-down", { id: n.id, role: n.role });
          await cleanupDeadNode(n).catch(() => {});
        }
      } else if (now === "up" && prev !== "up") {
        emitter.emit("nodeUp", n);
      }
    }
    // A node whose entry vanished entirely.
    const seen = new Set(nodes.map((n) => n.id));
    for (const [id, st] of C.known) {
      if (!seen.has(id) && st === "up") {
        C.known.set(id, "down");
        C.replicator?.dropNode(id);
        emitter.emit("nodeDown", { id });
      }
    }
  }

  async function cleanupDeadNode(n) {
    const kv = C.kv;
    await kv.call("hset", NODES_KEY, n.id, JSON.stringify({ ...n, state: "down", downAt: Date.now() }));
    await kv.call("del", `dc:presence:${n.id}`);
    const keys = await kv.scanAll("dc:sockets:*");
    for (const key of keys || []) {
      const members = await kv.call("smembers", key).catch(() => []);
      const dead = (members || []).filter((m) => String(m).startsWith(`${n.id}:`));
      if (dead.length) await kv.call("srem", key, ...dead).catch(() => {});
    }
  }

  // ---- events -------------------------------------------------------------
  async function pushEvent(kind, detail = null) {
    const e = { at: new Date().toISOString(), kind: String(kind || "event").slice(0, 40), nodeId: C.cfg.nodeId, detail: detail ?? null };
    C.localEvents.unshift(e);
    if (C.localEvents.length > EVENTS_MAX) C.localEvents.length = EVENTS_MAX;
    if (enabled()) {
      try {
        await C.kv.call("lpush", EVENTS_KEY, JSON.stringify(e));
        await C.kv.call("ltrim", EVENTS_KEY, 0, EVENTS_MAX - 1);
      } catch {
        C.pendingEvents.push(e);
      }
    } else if (configured()) {
      C.pendingEvents.push(e);
      if (C.pendingEvents.length > 50) C.pendingEvents.shift();
    }
  }

  async function flushPendingEvents() {
    const list = C.pendingEvents.splice(0).reverse();
    for (const e of list) {
      try {
        await C.kv.call("lpush", EVENTS_KEY, JSON.stringify(e));
      } catch {
        return;
      }
    }
    if (list.length) await C.kv.call("ltrim", EVENTS_KEY, 0, EVENTS_MAX - 1).catch(() => {});
  }

  async function getEvents(limit = 50) {
    const n = Math.max(1, Math.min(EVENTS_MAX, Number(limit) || 50));
    if (enabled()) {
      try {
        const rows = await C.kv.call("lrange", EVENTS_KEY, 0, n - 1);
        return rows.map((r) => {
          try {
            return JSON.parse(r);
          } catch {
            return null;
          }
        }).filter(Boolean);
      } catch {
        /* fall back to the local list */
      }
    }
    return C.localEvents.slice(0, n);
  }

  // ---- nodes / state --------------------------------------------------------
  async function getNodes() {
    if (enabled()) {
      try {
        const nodes = await readNodes();
        if (!nodes.some((n) => n.id === C.cfg.nodeId)) nodes.push(selfEntry());
        return nodes.map((n) => (n.id === C.cfg.nodeId ? { ...n, ...selfEntry() } : n));
      } catch {
        /* single view */
      }
    }
    return [selfEntry()];
  }

  function applySelfState(state, reason) {
    if (!NODE_STATES.has(state)) return;
    const prev = C.selfState;
    C.selfState = state;
    C.selfReason = reason || null;
    if (prev !== state) emitter.emit("selfState", state, prev, reason || null);
  }

  async function setNodeState(nodeId, state, reason = null) {
    const st = String(state || "");
    if (!NODE_STATES.has(st)) throw Object.assign(new Error("invalid node state"), { status: 400 });
    const id = String(nodeId || "");
    const why = reason == null ? null : String(reason).slice(0, 300);
    if (id === C.cfg.nodeId) {
      applySelfState(st, why);
      await beat();
    } else if (enabled()) {
      C.kv.publish(CTL_CHANNEL, { n: C.cfg.nodeId, kind: "state", id, state: st, reason: why });
      try {
        const raw = await C.kv.call("hget", NODES_KEY, id);
        if (raw) {
          const entry = JSON.parse(raw);
          await C.kv.call("hset", NODES_KEY, id, JSON.stringify({ ...entry, state: st }));
        }
      } catch {
        /* the node writes its own state on its next beat */
      }
    } else {
      throw Object.assign(new Error("node not reachable"), { status: 409 });
    }
    await pushEvent("node-state", { id, state: st, reason: why });
  }

  function onCtl(raw) {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || m.id !== C.cfg.nodeId) return;
    if (m.kind === "state") {
      applySelfState(m.state, m.reason);
      void beat();
    }
  }

  // ---- cfg ------------------------------------------------------------------
  async function getCfg() {
    if (enabled()) {
      try {
        const all = await C.kv.call("hgetall", CFG_KEY);
        if (all && Object.keys(all).length) {
          const parsed = {};
          for (const [k, v] of Object.entries(all)) {
            try {
              parsed[k] = JSON.parse(v);
            } catch {
              /* skip */
            }
          }
          C.localCfg = mergeCfg(DEFAULT_CFG, parsed);
        }
      } catch {
        /* local copy */
      }
    }
    return clone(C.localCfg);
  }

  async function setCfg(partial, actor = null) {
    const current = await getCfg();
    const next = mergeCfg(current, partial);
    C.localCfg = next;
    if (enabled()) {
      const flat = [];
      for (const [k, v] of Object.entries(next)) flat.push(k, JSON.stringify(v));
      await C.kv.call("hset", CFG_KEY, ...flat).catch(() => {});
      C.kv.publish(INVAL_CHANNEL, { n: C.cfg.nodeId, m: { kind: "cfg", id: "pc" } });
    }
    if (C.cfgStore?.save) {
      try {
        await C.cfgStore.save(next, actor);
      } catch (err) {
        log.warn?.("[cluster] cfg persist failed:", err?.message || err);
      }
    }
    const changed = Object.keys(partial && typeof partial === "object" ? partial : {}).filter((k) => k in DEFAULT_CFG);
    await pushEvent("cfg", { actor: actor && typeof actor === "object" ? actor.username || actor.id || null : actor, keys: changed });
    emitter.emit("cfg", clone(next));
    return clone(next);
  }

  /** Durable copy of dc:cfg:pc (Supabase node_settings), plugged in by the admin routes. */
  async function setCfgStore(store) {
    C.cfgStore = store || null;
    if (store?.load) {
      try {
        const saved = await store.load();
        if (saved && typeof saved === "object") {
          C.localCfg = mergeCfg(DEFAULT_CFG, saved);
          if (enabled()) {
            const exists = await C.kv.call("exists", CFG_KEY).catch(() => 1);
            if (!exists) {
              const flat = [];
              for (const [k, v] of Object.entries(C.localCfg)) flat.push(k, JSON.stringify(v));
              await C.kv.call("hset", CFG_KEY, ...flat).catch(() => {});
            }
          }
        }
      } catch {
        /* keep defaults */
      }
    }
  }

  // ---- metrics --------------------------------------------------------------
  async function sampleMetrics() {
    const s = metrics.sample();
    if (enabled()) {
      const row = JSON.stringify({ t: s.t, rss: s.rss, cpu: s.cpu, conns: s.conns, p95: s.p95, err: s.err });
      C.kv.fire("lpush", metricsKey(C.cfg.nodeId), row);
      C.kv.fire("ltrim", metricsKey(C.cfg.nodeId), 0, 359);
    }
    return s;
  }

  async function getMetrics(minutes = 60) {
    const mins = Math.max(1, Math.min(60, Number(minutes) || 60));
    const since = Date.now() - mins * 60000;
    const pick = (s) => ({ t: s.t, rss: s.rss, cpu: s.cpu, conns: s.conns, p95: s.p95, err: s.err });
    if (enabled()) {
      try {
        const nodes = await readNodes();
        const count = Math.ceil((mins * 60000) / C.cfg.metricsMs) + 1;
        const out = {};
        for (const n of nodes) {
          const rows = await C.kv.call("lrange", metricsKey(n.id), 0, count - 1);
          out[n.id] = rows
            .map((r) => {
              try {
                return JSON.parse(r);
              } catch {
                return null;
              }
            })
            .filter((s) => s && s.t >= since)
            .reverse();
        }
        if (!out[C.cfg.nodeId]) out[C.cfg.nodeId] = metrics.series(mins).map(pick);
        return out;
      } catch {
        /* local only */
      }
    }
    return { [C.cfg.nodeId]: metrics.series(mins).map(pick) };
  }

  async function kvStatus() {
    if (!configured()) return { ok: false, single: true, usedMb: 0, maxMb: 0 };
    if (!enabled()) return { ok: false, single: true, usedMb: null, maxMb: C.cfg.kvMaxMb };
    try {
      const info = String(await C.kv.call("info", "memory"));
      const used = Number((/used_memory:(\d+)/.exec(info) || [])[1] || 0);
      const max = Number((/maxmemory:(\d+)/.exec(info) || [])[1] || 0);
      return {
        ok: true,
        single: false,
        usedMb: Math.round((used / 1048576) * 1000) / 1000,
        maxMb: max ? Math.round((max / 1048576) * 100) / 100 : C.cfg.kvMaxMb,
      };
    } catch {
      return { ok: false, single: true, usedMb: null, maxMb: C.cfg.kvMaxMb };
    }
  }

  // ---- pub/sub ----------------------------------------------------------------
  const kvListening = new Set();
  function publish(channel, msg) {
    const ch = String(channel);
    if (enabled()) {
      if (C.kv.publish(ch, { n: C.cfg.nodeId, m: msg })) return true;
    }
    setImmediate(() => localBus.emit(ch, msg, { from: C.cfg.nodeId }));
    return true;
  }

  const wantedChannels = new Set();
  function listenKv(ch) {
    if (kvListening.has(ch) || !C.kv) return;
    kvListening.add(ch);
    C.kv.listen(ch, (raw) => {
      let env;
      try {
        env = JSON.parse(raw);
      } catch {
        return;
      }
      if (!env || typeof env !== "object" || !("m" in env)) return;
      localBus.emit(ch, env.m, { from: env.n });
    });
  }

  /** cb(msg, { from }) for every message on `channel`, this node's own included. */
  function subscribe(channel, cb) {
    const ch = String(channel);
    localBus.on(ch, cb);
    // Before start() the KV is not open yet: listen once it is.
    if (C.kv) listenKv(ch);
    else wantedChannels.add(ch);
    return () => localBus.off(ch, cb);
  }

  /** Node-local cache is stale on the other nodes: { kind, id, ...extra } on dc:inval. */
  function invalidate(kind, id, extra = null) {
    if (!enabled()) return false;
    return C.kv.publish(INVAL_CHANNEL, { n: C.cfg.nodeId, m: { kind, id: id == null ? null : String(id), ...(extra || {}) } });
  }

  /**
   * Wrap a module's cache invalidator so a call on this node also clears the
   * same cache on the other nodes: `module.exports.invalidate = linkInvalidate("adminPerms", invalidate)`.
   * The first argument (an id, or nothing = everything) travels as `id`.
   */
  const pendingLinks = [];
  function linkInvalidate(kind, localFn) {
    const k = String(kind);
    const hook = () => onInvalidate(k, (m) => (m.id == null ? localFn() : localFn(m.id)));
    if (C.started && configured()) hook();
    else pendingLinks.push(hook);
    return function linkedInvalidate(...args) {
      const out = localFn.apply(this, args);
      if (configured()) invalidate(k, args[0] == null ? null : args[0]);
      return out;
    };
  }

  function onInvalidate(kind, cb) {
    return subscribe(INVAL_CHANNEL, (m, meta) => {
      if (!m || m.kind !== kind || meta?.from === C.cfg.nodeId) return;
      try {
        cb(m);
      } catch (err) {
        log.warn?.(`[cluster] inval ${kind} failed:`, err?.message || err);
      }
    });
  }

  // ---- lifecycle ----------------------------------------------------------------
  function every(ms, fn) {
    const t = setInterval(() => {
      Promise.resolve()
        .then(fn)
        .catch(() => {});
    }, ms);
    t.unref?.();
    C.timers.push(t);
    return t;
  }

  async function onKvUp({ first }) {
    if (C.stopped) return;
    if (C.downTimer) clearTimeout(C.downTimer);
    C.downTimer = null;
    let rebuilt = false;
    try {
      const epoch = await C.kv.call("get", EPOCH_KEY);
      if (!epoch) {
        // No epoch: the KV is new or restarted empty. Every node rewrites its state below.
        await C.kv.call("set", EPOCH_KEY, String(Date.now()), "NX");
        rebuilt = !first;
      }
    } catch {
      /* best effort */
    }
    C.replicator?.setActive(true);
    await beat();
    await C.replicator?.resync();
    await flushPendingEvents().catch(() => {});
    if (first) await pushEvent("node-up", { id: C.cfg.nodeId, role: C.cfg.role, url: C.cfg.publicUrl, version: C.cfg.version });
    else await pushEvent(rebuilt ? "kv-rebuilt" : "kv-back", { id: C.cfg.nodeId });
    emitter.emit("kvUp", { first, rebuilt });
  }

  function onKvDown() {
    if (C.stopped) return;
    C.replicator?.setActive(false);
    C.leader?.offline();
    void pushEvent("kv-lost", { id: C.cfg.nodeId });
    emitter.emit("kvDown");
    if (C.downTimer) clearTimeout(C.downTimer);
    C.downTimer = setTimeout(() => {
      C.downTimer = null;
      if (!enabled()) {
        C.replicator?.dropAllRemote();
        for (const id of C.known.keys()) C.known.set(id, "down");
      }
    }, C.cfg.remoteGraceMs);
    C.downTimer.unref?.();
  }

  /** @socket.io/redis-adapter factory for io.adapter(); null on a single node. */
  function socketAdapter() {
    if (!configured()) return null;
    const kv = ensureKv();
    const { createAdapter } = require("@socket.io/redis-adapter");
    const { pub, sub } = kv.adapterClients();
    return createAdapter(pub, sub, { key: "dc:sio", requestsTimeout: 3000 });
  }

  /**
   * Start the node. Safe to call on a single node (metrics only).
   * opts: { io, state, redisFactory, config }
   */
  function start(opts = {}) {
    if (C.started) return api;
    C.started = true;
    C.stopped = false;
    if (opts.config) C.cfg = { ...C.cfg, ...opts.config };
    if (opts.redisFactory) C.factory = opts.redisFactory;
    if (opts.io) C.io = opts.io;
    every(C.cfg.metricsMs, sampleMetrics);
    const { createStore } = require("./store");
    C.store = createStore(api, C);
    if (!configured()) return api;

    const kv = ensureKv();
    const { createReplicator } = require("./replica");
    C.replicator = createReplicator({
      nodeId: C.cfg.nodeId,
      kv,
      log,
      watchMs: C.cfg.watchMs,
      getPeers: peerIds,
    });
    C.leader = createLeader({
      kv,
      nodeId: C.cfg.nodeId,
      role: C.cfg.role,
      ttlMs: C.cfg.leaderTtlMs,
      primaryAlive,
      onChange: (lead, id) => {
        emitter.emit("leader", lead, id);
        if (lead) void pushEvent("leader", { id: C.cfg.nodeId });
      },
    });
    if (opts.state) {
      const { attachSharedState } = require("./sharedStore");
      C.shared = attachSharedState({ cluster: api, replicator: C.replicator, state: opts.state, getIo: () => C.io, log });
    }
    kv.listen(CTL_CHANNEL, onCtl);
    for (const ch of wantedChannels) listenKv(ch);
    wantedChannels.clear();
    for (const hook of pendingLinks.splice(0)) hook();
    onInvalidate("cfg", () => {
      void getCfg().then((c) => emitter.emit("cfg", c));
    });
    kv.events.on("up", (e) => void onKvUp(e));
    kv.events.on("down", onKvDown);
    if (kv.isUp()) void onKvUp({ first: true });
    C.replicator.start();
    every(C.cfg.beatMs, beat);
    return api;
  }

  function attachIo(io) {
    C.io = io;
  }

  /** Graceful stop: hand over the leader lock, remove this node's live entries. */
  async function stop({ graceful = true } = {}) {
    if (C.stopped) return;
    C.stopped = true;
    for (const t of C.timers) clearInterval(t);
    C.timers = [];
    if (C.downTimer) clearTimeout(C.downTimer);
    if (graceful && enabled()) {
      await pushEvent("node-stop", { id: C.cfg.nodeId });
      await C.leader?.release();
      try {
        await C.kv.call("del", aliveKey(C.cfg.nodeId));
        await C.kv.call("del", `dc:presence:${C.cfg.nodeId}`);
        const entry = selfEntry();
        await C.kv.call("hset", NODES_KEY, entry.id, JSON.stringify({ ...entry, state: "down", downAt: Date.now() }));
      } catch {
        /* TTLs clean up */
      }
    }
    C.replicator?.stop();
    if (C.kv) await C.kv.close();
    C.started = false;
  }

  function leaderOnly(name, fn) {
    const wrapped = function leaderOnlyJob(...args) {
      if (!isLeader()) return undefined;
      return fn.apply(this, args);
    };
    Object.defineProperty(wrapped, "name", { value: `leaderOnly(${name})` });
    return wrapped;
  }

  function hasRemoteUser(userId) {
    const r = C.replicator;
    if (!r || userId == null) return false;
    return r.hasRemote("presence", String(userId));
  }

  function onLeaderChange(cb) {
    emitter.on("leader", cb);
    return () => emitter.off("leader", cb);
  }

  function onSelfStateChange(cb) {
    emitter.on("selfState", cb);
    return () => emitter.off("selfState", cb);
  }

  Object.assign(api, {
    enabled,
    configured,
    isLeader,
    onLeaderChange,
    getNodes,
    getCfg,
    setCfg,
    setCfgStore,
    setNodeState,
    pushEvent,
    getEvents,
    getMetrics,
    kvStatus,
    publish,
    subscribe,
    invalidate,
    onInvalidate,
    linkInvalidate,
    start,
    stop,
    attachIo,
    socketAdapter,
    leaderOnly,
    hasRemoteUser,
    onSelfStateChange,
    getSelfState: () => ({ state: C.selfState, reason: C.selfReason }),
    /** Tests: fake Key Value clients (test/fakeRedis.cjs) before socketAdapter() / start(). */
    useRedisFactory: (fn) => {
      if (!C.kv) C.factory = fn;
    },
    /** The node's own entry follows its supervisor: game mode, a smaller memory share. */
    updateSelf: (patch = {}) => {
      if (!patch || typeof patch !== "object") return;
      if ("gameMode" in patch) C.selfExtra.gameMode = Boolean(patch.gameMode);
      if ("memoryMb" in patch) {
        const mb = Math.round(Number(patch.memoryMb));
        if (Number.isFinite(mb) && mb >= 64) C.cfg.memoryMb = Math.min(65536, mb);
      }
    },
    /** Node id holding dc:leader (this node on a single node). */
    leaderId: () => (configured() && C.leader ? C.leader.leaderId() || null : C.cfg.nodeId),
    on: (ev, cb) => emitter.on(ev, cb),
    off: (ev, cb) => emitter.off(ev, cb),
    metricsMiddleware: metrics.middleware,
    sampleMetricsNow: sampleMetrics,
    beatNow: beat,
    withoutReplication: (fn) => (C.replicator ? C.replicator.withoutReplication(fn) : fn()),
    DEFAULT_CFG,
    mergeCfg,
    _internals: C,
  });
  Object.defineProperties(api, {
    nodeId: { get: () => C.cfg.nodeId, enumerable: true },
    role: { get: () => C.cfg.role, enumerable: true },
    publicUrl: { get: () => C.cfg.publicUrl, enumerable: true },
    primaryUrl: { get: () => C.cfg.primaryUrl, enumerable: true },
    cores: { get: () => C.cfg.cores, enumerable: true },
    store: { get: () => C.store, enumerable: true },
    replicator: { get: () => C.replicator, enumerable: false },
  });
  return api;
}

const singleton = createCluster();
singleton.createCluster = createCluster;
module.exports = singleton;
