"use strict";

/**
 * Replicated node-local Maps / Sets (the cross-node half of runtime/sharedState.js).
 *
 * Hot paths keep reading a plain, synchronous, node-local Map or Set. When the
 * node is clustered the instance's set / delete / add / clear are wrapped
 * (own properties on that one instance; the prototype is untouched), so every
 * write also:
 *   1. is published on `dc:state` to the other nodes, which apply it to their
 *      local copy (in place, so references held across an `await` stay valid);
 *   2. is written through to the Key Value (hash / keys / set), so a node that
 *      starts later, or every node after a KV restart, can rebuild the state.
 * Reads never touch the network. A single node (no REDIS_URL) never installs
 * any of this: the Maps stay plain Maps.
 *
 * Kinds:
 *  - "shared": one cluster-wide value per key, last writer wins by a hybrid
 *    logical clock (calls, bans, timeouts, revoked sessions, DM call state).
 *    In-place mutations (`call.participants.add(x)`) are caught by a cheap
 *    dirty check every `watchMs` for structures registered with `watch`.
 *  - "owned": every node owns its own contribution per key and the local Map
 *    is the merge (presence: a user online on two nodes). A node only removes
 *    its own contribution; a dead node's contributions are dropped.
 *  - "volatile": published only, never stored (short rate-limit stamps).
 */

const MapSet = Map.prototype.set;
const MapDelete = Map.prototype.delete;
const MapClear = Map.prototype.clear;
const MapGet = Map.prototype.get;
const MapHas = Map.prototype.has;
const SetAdd = Set.prototype.add;
const SetDelete = Set.prototype.delete;
const SetClear = Set.prototype.clear;
const SetHas = Set.prototype.has;

const STATE_CHANNEL = "dc:state";
const TOMBSTONE_MS = 120000;

function isTimer(v) {
  return Boolean(v) && typeof v === "object" && typeof v.refresh === "function" && typeof v.hasRef === "function";
}

/** JSON-able form: Sets / Maps / Dates tagged, timers and functions dropped. */
function encodeValue(v, skip = null) {
  if (v === null || v === undefined) return v === undefined ? null : v;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return v;
  if (t === "function" || t === "symbol" || t === "bigint") return undefined;
  if (isTimer(v)) return undefined;
  if (v instanceof Set) return { $S: [...v].map((x) => encodeValue(x)).filter((x) => x !== undefined) };
  if (v instanceof Map) {
    const out = [];
    for (const [k, x] of v) {
      const e = encodeValue(x);
      if (e !== undefined) out.push([k, e]);
    }
    return { $M: out };
  }
  if (v instanceof Date) return { $D: v.toISOString() };
  if (Array.isArray(v)) return v.map((x) => {
    const e = encodeValue(x);
    return e === undefined ? null : e;
  });
  const out = {};
  for (const key of Object.keys(v)) {
    if (skip && skip.has(key)) continue;
    const e = encodeValue(v[key]);
    if (e !== undefined) out[key] = e;
  }
  return out;
}

function decodeValue(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(decodeValue);
  if (Array.isArray(v.$S) && Object.keys(v).length === 1) return new Set(v.$S.map(decodeValue));
  if (Array.isArray(v.$M) && Object.keys(v).length === 1) return new Map(v.$M.map(([k, x]) => [k, decodeValue(x)]));
  if (typeof v.$D === "string" && Object.keys(v).length === 1) return new Date(v.$D);
  const out = {};
  for (const key of Object.keys(v)) out[key] = decodeValue(v[key]);
  return out;
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && !(v instanceof Set) && !(v instanceof Date);
}

/**
 * Apply a decoded remote value onto the local object in place. Top-level Sets /
 * Maps are refilled (same instance); `localFields` (timers, node-only data)
 * are kept, or created by `localDefaults`.
 */
function applyInPlace(existing, next, localFields, localDefaults) {
  if (!isPlainObject(existing) || !isPlainObject(next)) return next;
  for (const key of Object.keys(next)) {
    if (localFields && localFields.has(key)) continue;
    const ev = existing[key];
    const nv = next[key];
    if (ev instanceof Set && nv instanceof Set) {
      SetClear.call(ev);
      for (const x of nv) SetAdd.call(ev, x);
    } else if (ev instanceof Map && nv instanceof Map) {
      MapClear.call(ev);
      for (const [k, x] of nv) MapSet.call(ev, k, x);
    } else {
      existing[key] = nv;
    }
  }
  for (const key of Object.keys(existing)) {
    if (key in next) continue;
    if (localFields && localFields.has(key)) continue;
    const ev = existing[key];
    if (typeof ev === "function" || isTimer(ev)) continue;
    delete existing[key];
  }
  if (localDefaults) {
    for (const [key, make] of Object.entries(localDefaults)) if (existing[key] === undefined) existing[key] = make();
  }
  return existing;
}

function withDefaults(obj, localDefaults) {
  if (isPlainObject(obj) && localDefaults) {
    for (const [key, make] of Object.entries(localDefaults)) if (obj[key] === undefined) obj[key] = make();
  }
  return obj;
}

function createClock(now = () => Date.now()) {
  let last = 0;
  return {
    tick() {
      last = Math.max(now(), last + 1);
      return last;
    },
    observe(t) {
      if (Number(t) > last) last = Number(t);
    },
  };
}

function newer(a, b) {
  // true when version a beats version b
  if (!b) return true;
  if (a.t !== b.t) return a.t > b.t;
  return String(a.n) > String(b.n);
}

function createReplicator({ nodeId, kv, log = console, watchMs = 250, now = () => Date.now(), getPeers = async () => [] } = {}) {
  const structs = new Map();
  const clock = createClock(now);
  let active = false;
  let suppress = 0;
  let watchTimer = null;
  const stats = { published: 0, applied: 0, stale: 0, watchFlushes: 0, persisted: 0 };

  function publish(S, msg) {
    if (!active) return;
    msg.s = S.name;
    msg.n = nodeId;
    stats.published += 1;
    kv.publish(STATE_CHANNEL, msg);
  }

  // ---- storage -----------------------------------------------------------
  function ownHashKey(S, n = nodeId) {
    return `${S.storage.key}:${n}`;
  }

  function persistSet(S, k, wire) {
    if (!active || !S.storage) return;
    stats.persisted += 1;
    const st = S.storage;
    if (S.kind === "owned") return kv.fire("hset", ownHashKey(S), String(k), JSON.stringify(wire.v));
    if (st.type === "hash") return kv.fire("hset", st.key, String(k), JSON.stringify(wire));
    if (st.type === "keys") return kv.fire("set", st.prefix + k, JSON.stringify(wire), "PX", st.ttlMs || 12 * 3600 * 1000);
    if (st.type === "set") {
      kv.fire("sadd", st.key, String(k));
      // A sliding TTL keeps an add-only set from filling the 25 MB KV.
      if (st.ttlMs) kv.fire("pexpire", st.key, st.ttlMs);
      return undefined;
    }
    return undefined;
  }

  function persistDelete(S, k) {
    if (!active || !S.storage) return;
    const st = S.storage;
    if (S.kind === "owned") return kv.fire("hdel", ownHashKey(S), String(k));
    if (st.type === "hash") return kv.fire("hdel", st.key, String(k));
    if (st.type === "keys") return kv.fire("del", st.prefix + k);
    if (st.type === "set") return kv.fire("srem", st.key, String(k));
    return undefined;
  }

  function encode(S, v) {
    return S.isSet ? 1 : encodeValue(v, S.localFields);
  }

  // ---- local writes ------------------------------------------------------
  function localSharedSet(S, k, v) {
    const t = clock.tick();
    S.meta.set(k, { t, n: nodeId });
    const enc = encode(S, v);
    if (S.watch) S.lastSent.set(k, JSON.stringify(enc));
    if (S.kind === "volatile") return publish(S, { op: "set", k, v: enc });
    publish(S, { op: "set", k, t, v: enc });
    persistSet(S, k, { t, n: nodeId, v: enc });
  }

  function localSharedDelete(S, k) {
    const t = clock.tick();
    S.meta.set(k, { t, n: nodeId, del: true, at: now() });
    S.lastSent.delete(k);
    if (S.kind === "volatile") return publish(S, { op: "del", k });
    publish(S, { op: "del", k, t });
    persistDelete(S, k);
  }

  function emitChange(S, change) {
    if (!S.onChange) return;
    try {
      S.onChange(change);
    } catch (err) {
      log.warn?.(`[cluster] ${S.name} change hook failed:`, err?.message || err);
    }
  }

  // ---- owned (merged) maps ----------------------------------------------
  function pickRemote(S, k) {
    const per = S.remote.get(k);
    if (!per || !per.size) return undefined;
    return per.values().next().value;
  }

  function isLocalContribution(S, k, v) {
    if (S.own.has(k)) return true;
    if (!S.remote.has(k)) return true;
    return S.isLocal ? Boolean(S.isLocal(k, v)) : false;
  }

  function ownedSet(S, k, v) {
    const target = S.target;
    if (!isLocalContribution(S, k, v)) {
      // Update to a value another node owns (e.g. a profile change served
      // here): keep our copy, ask the owner(s) to take it.
      const per = S.remote.get(k);
      if (per) for (const n of per.keys()) per.set(n, v);
      MapSet.call(target, k, v);
      publish(S, { op: "opatch", k, v: encode(S, v) });
      return;
    }
    const had = MapHas.call(target, k);
    S.own.set(k, v);
    MapSet.call(target, k, v);
    const enc = encode(S, v);
    publish(S, { op: "oset", k, v: enc });
    persistSet(S, k, { v: enc });
    if (!had) emitChange(S, { op: "online", k, remote: false });
  }

  function ownedDelete(S, k) {
    if (!S.own.has(k)) {
      // Never remove another node's user (local pruning, stale sweeps).
      return false;
    }
    S.own.delete(k);
    publish(S, { op: "odel", k });
    persistDelete(S, k);
    const fallback = pickRemote(S, k);
    if (fallback !== undefined) {
      MapSet.call(S.target, k, fallback);
      return true;
    }
    return MapDelete.call(S.target, k);
  }

  function applyOwnedRemote(S, n, op, k, v) {
    const target = S.target;
    if (op === "opatch") {
      if (!S.own.has(k)) {
        const per = S.remote.get(k);
        if (per) {
          for (const m of per.keys()) per.set(m, v);
          if (!S.own.has(k)) MapSet.call(target, k, v);
        }
        return;
      }
      // We own it: take the update and republish it as ours.
      const mine = S.own.get(k);
      const next = isPlainObject(mine) && isPlainObject(v) ? Object.assign(mine, v) : v;
      S.own.set(k, next);
      MapSet.call(target, k, next);
      const enc = encode(S, next);
      publish(S, { op: "oset", k, v: enc });
      persistSet(S, k, { v: enc });
      emitChange(S, { op: "update", k, remote: true });
      return;
    }
    const before = MapHas.call(target, k);
    if (op === "oset") {
      let per = S.remote.get(k);
      if (!per) {
        per = new Map();
        S.remote.set(k, per);
      }
      per.set(n, v);
      if (!S.own.has(k)) MapSet.call(target, k, v);
      emitChange(S, { op: before ? "update" : "online", k, remote: true, node: n });
      return;
    }
    if (op === "odel") {
      const per = S.remote.get(k);
      if (!per || !per.has(n)) return;
      per.delete(n);
      if (!per.size) S.remote.delete(k);
      if (S.own.has(k)) return;
      const fallback = pickRemote(S, k);
      if (fallback !== undefined) {
        MapSet.call(target, k, fallback);
        emitChange(S, { op: "update", k, remote: true, node: n });
      } else {
        MapDelete.call(target, k);
        emitChange(S, { op: "offline", k, remote: true, node: n });
      }
    }
  }

  function dropNode(n) {
    for (const S of structs.values()) {
      if (S.kind !== "owned") continue;
      for (const [k, per] of [...S.remote]) if (per.has(n)) applyOwnedRemote(S, n, "odel", k);
    }
  }

  function dropAllRemote() {
    for (const S of structs.values()) {
      if (S.kind !== "owned") continue;
      const nodes = new Set();
      for (const per of S.remote.values()) for (const n of per.keys()) nodes.add(n);
      for (const n of nodes) dropNode(n);
    }
  }

  // ---- remote apply (shared / volatile) ---------------------------------
  function applySharedRemote(S, msg) {
    const { op, k } = msg;
    const target = S.target;
    if (S.kind !== "volatile") {
      const ver = { t: Number(msg.t) || 0, n: msg.vn || msg.n };
      const known = S.meta.get(k);
      if (known && !newer(ver, known)) {
        stats.stale += 1;
        return;
      }
      clock.observe(ver.t);
      S.meta.set(k, op === "del" ? { ...ver, del: true, at: now() } : ver);
    }
    stats.applied += 1;
    if (S.isSet) {
      const had = SetHas.call(target, k);
      if (op === "set") {
        SetAdd.call(target, k);
        if (!had) emitChange(S, { op: "set", k, remote: true });
      } else if (had) {
        SetDelete.call(target, k);
        emitChange(S, { op: "del", k, remote: true });
      }
      return;
    }
    const existing = MapGet.call(target, k);
    if (op === "set") {
      const decoded = decodeValue(msg.v);
      let next;
      if (existing !== undefined && isPlainObject(existing) && isPlainObject(decoded)) {
        next = applyInPlace(existing, decoded, S.localFields, S.localDefaults);
      } else {
        next = withDefaults(decoded, S.localDefaults);
        MapSet.call(target, k, next);
      }
      if (S.watch) S.lastSent.set(k, JSON.stringify(msg.v));
      emitChange(S, { op: "set", k, prev: existing !== undefined, remote: true, value: next });
    } else if (op === "del") {
      S.lastSent.delete(k);
      if (existing !== undefined) {
        MapDelete.call(target, k);
        emitChange(S, { op: "del", k, remote: true, value: existing });
      }
    }
  }

  function onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || msg.n === nodeId) return;
    const S = structs.get(msg.s);
    if (!S) return;
    try {
      if (S.kind === "owned") {
        if (msg.op === "oreload") {
          void reloadOwnedFrom(S, msg.n);
          return;
        }
        applyOwnedRemote(S, msg.n, msg.op, msg.k, decodeValue(msg.v));
      } else {
        applySharedRemote(S, msg);
      }
    } catch (err) {
      log.warn?.(`[cluster] apply ${S.name} failed:`, err?.message || err);
    }
  }

  // ---- install -------------------------------------------------------------
  function install(S) {
    const target = S.target;
    if (S.isSet) {
      target.add = function add(k) {
        const had = SetHas.call(this, k);
        SetAdd.call(this, k);
        if (!suppress && !had) localSharedSet(S, k, 1);
        return this;
      };
      target.delete = function del(k) {
        const had = SetDelete.call(this, k);
        if (!suppress && had) localSharedDelete(S, k);
        return had;
      };
      target.clear = function clear() {
        if (!suppress) for (const k of this) localSharedDelete(S, k);
        SetClear.call(this);
      };
      return;
    }
    if (S.kind === "owned") {
      target.set = function set(k, v) {
        if (suppress) {
          MapSet.call(this, k, v);
          return this;
        }
        ownedSet(S, k, v);
        return this;
      };
      target.delete = function del(k) {
        if (suppress) return MapDelete.call(this, k);
        return ownedDelete(S, k);
      };
      target.clear = function clear() {
        for (const k of [...S.own.keys()]) ownedDelete(S, k);
      };
      return;
    }
    target.set = function set(k, v) {
      MapSet.call(this, k, v);
      if (!suppress) localSharedSet(S, k, v);
      return this;
    };
    target.delete = function del(k) {
      const had = MapDelete.call(this, k);
      if (!suppress && had) localSharedDelete(S, k);
      return had;
    };
    target.clear = function clear() {
      if (!suppress) for (const k of this.keys()) localSharedDelete(S, k);
      MapClear.call(this);
    };
  }

  function uninstall(S) {
    for (const m of ["set", "add", "delete", "clear"]) {
      if (Object.prototype.hasOwnProperty.call(S.target, m)) delete S.target[m];
    }
  }

  /**
   * @param {string} name   stable id shared by every node
   * @param {Map|Set} target the node-local structure (kept as is)
   * @param {object} opts   { kind, storage, watch, localFields, localDefaults, onChange, isLocal }
   */
  function register(name, target, opts = {}) {
    if (structs.has(name)) throw new Error(`replica ${name} registered twice`);
    const isSet = target instanceof Set;
    const S = {
      name,
      target,
      isSet,
      kind: opts.kind || "shared",
      storage: opts.storage || null,
      watch: Boolean(opts.watch) && !isSet,
      localFields: opts.localFields ? new Set(opts.localFields) : null,
      localDefaults: opts.localDefaults || null,
      onChange: opts.onChange || null,
      isLocal: opts.isLocal || null,
      meta: new Map(),
      lastSent: new Map(),
      own: new Map(),
      remote: new Map(),
    };
    if (S.kind === "owned") {
      // Whatever is already in the map belongs to this node.
      for (const [k, v] of target) S.own.set(k, v);
    } else if (S.kind === "shared") {
      const t = clock.tick();
      for (const k of isSet ? target : target.keys()) S.meta.set(k, { t, n: nodeId });
    }
    structs.set(name, S);
    install(S);
    return S;
  }

  function watchTick() {
    if (!active) return;
    for (const S of structs.values()) {
      if (!S.watch) continue;
      for (const [k, v] of S.target) {
        let str;
        try {
          str = JSON.stringify(encode(S, v));
        } catch {
          continue;
        }
        if (S.lastSent.get(k) === str) continue;
        stats.watchFlushes += 1;
        const t = clock.tick();
        S.meta.set(k, { t, n: nodeId });
        S.lastSent.set(k, str);
        const enc = JSON.parse(str);
        publish(S, { op: "set", k, t, v: enc });
        persistSet(S, k, { t, n: nodeId, v: enc });
      }
    }
    // Tombstones only need to outlive in-flight messages.
    const cutoff = now() - TOMBSTONE_MS;
    for (const S of structs.values()) {
      for (const [k, m] of S.meta) if (m.del && m.at < cutoff) S.meta.delete(k);
    }
  }

  // ---- resync (KV up / back) -----------------------------------------------
  async function loadStorage(S) {
    const st = S.storage;
    const out = new Map();
    if (st.type === "hash") {
      const all = await kv.call("hgetall", st.key);
      for (const [k, raw] of Object.entries(all || {})) {
        try {
          out.set(k, JSON.parse(raw));
        } catch {
          /* skip */
        }
      }
    } else if (st.type === "keys") {
      const keys = await kv.scanAll(`${st.prefix}*`);
      const vals = await Promise.all((keys || []).map((key) => kv.call("get", key).catch(() => null)));
      (keys || []).forEach((key, i) => {
        if (!vals[i]) return;
        try {
          out.set(key.slice(st.prefix.length), JSON.parse(vals[i]));
        } catch {
          /* skip */
        }
      });
    } else if (st.type === "set") {
      for (const k of (await kv.call("smembers", st.key)) || []) out.set(k, { t: 0, n: "", v: 1 });
    }
    return out;
  }

  async function resyncShared(S) {
    const stored = await loadStorage(S);
    for (const [k, wire] of stored) {
      const local = S.meta.get(k);
      const ver = { t: Number(wire.t) || 0, n: wire.n || "" };
      if (S.storage.type === "set") {
        if (local?.del) continue;
        if (!SetHas.call(S.target, k)) applySharedRemote(S, { op: "set", k, t: ver.t, n: ver.n || "kv", v: 1 });
        continue;
      }
      if (local && !newer(ver, local)) continue;
      applySharedRemote(S, { op: "set", k, t: ver.t, n: ver.n, v: wire.v });
    }
    // Write back what the KV lacks or holds older (a KV restart starts empty).
    for (const k of S.isSet ? [...S.target] : [...S.target.keys()]) {
      const local = S.meta.get(k) || { t: clock.tick(), n: nodeId };
      if (!S.meta.has(k)) S.meta.set(k, local);
      const wire = stored.get(k);
      if (wire && S.storage.type === "set") continue;
      if (wire && !newer(local, { t: Number(wire.t) || 0, n: wire.n || "" })) continue;
      const v = S.isSet ? 1 : encode(S, MapGet.call(S.target, k));
      if (S.watch) S.lastSent.set(k, JSON.stringify(v));
      persistSet(S, k, { t: local.t, n: local.n, v });
      // Peers that resynced before us learn it too (versions decide).
      publish(S, { op: "set", k, t: local.t, vn: local.n, v });
    }
    // Deletes we made while the KV was away.
    for (const [k, m] of S.meta) {
      if (m.del && stored.has(k)) {
        const wire = stored.get(k);
        if (S.storage.type === "set" || newer(m, { t: Number(wire.t) || 0, n: wire.n || "" })) {
          persistDelete(S, k);
          publish(S, { op: "del", k, t: m.t, vn: m.n });
        }
      }
    }
  }

  /** Replace node n's contributions with what its KV hash holds now. */
  async function reloadOwnedFrom(S, n) {
    if (n === nodeId) return;
    const all = await kv.call("hgetall", ownHashKey(S, n)).catch(() => null);
    if (!all) return;
    const seen = new Set();
    for (const [k, raw] of Object.entries(all)) {
      let v;
      try {
        v = decodeValue(JSON.parse(raw));
      } catch {
        continue;
      }
      seen.add(k);
      applyOwnedRemote(S, n, "oset", k, v);
    }
    for (const [k, per] of [...S.remote]) if (per.has(n) && !seen.has(k)) applyOwnedRemote(S, n, "odel", k);
  }

  async function resyncOwned(S, peers) {
    const key = ownHashKey(S);
    await kv.call("del", key);
    const flat = [];
    for (const [k, v] of S.own) flat.push(String(k), JSON.stringify(encode(S, v)));
    if (flat.length) await kv.call("hset", key, ...flat);
    // Peers that came back before us reload our hash (the registry may still be empty).
    publish(S, { op: "oreload" });
    for (const n of peers) await reloadOwnedFrom(S, n);
    // Nodes missing from `peers` are not dropped here: right after a KV restart the
    // registry is still filling up. Dead nodes are dropped by the registry watch.
  }

  async function resync() {
    if (!active) return;
    const peers = await getPeers().catch(() => []);
    for (const S of structs.values()) {
      if (!S.storage) continue;
      try {
        if (S.kind === "owned") await resyncOwned(S, peers);
        else await resyncShared(S);
      } catch (err) {
        log.warn?.(`[cluster] resync ${S.name} failed:`, err?.message || err);
      }
    }
  }

  let unlisten = null;
  function start() {
    if (!unlisten) unlisten = kv.listen(STATE_CHANNEL, onMessage);
    if (!watchTimer) {
      watchTimer = setInterval(watchTick, watchMs);
      watchTimer.unref?.();
    }
  }

  function setActive(on) {
    active = Boolean(on);
  }

  function stop() {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
    if (unlisten) unlisten();
    unlisten = null;
    active = false;
  }

  /** Run `fn` with replication off (bulk reloads from the database). */
  function withoutReplication(fn) {
    suppress += 1;
    try {
      return fn();
    } finally {
      suppress -= 1;
    }
  }

  function hasRemote(name, k) {
    const S = structs.get(name);
    if (!S || S.kind !== "owned") return false;
    const per = S.remote.get(k);
    return Boolean(per && per.size);
  }

  function ownsLocally(name, k) {
    const S = structs.get(name);
    return Boolean(S && S.own.has(k));
  }

  function remoteNodesOf(name, k) {
    const S = structs.get(name);
    const per = S?.remote.get(k);
    return per ? [...per.keys()] : [];
  }

  return {
    register,
    uninstall: () => structs.forEach(uninstall),
    start,
    stop,
    setActive,
    resync,
    dropNode,
    dropAllRemote,
    withoutReplication,
    hasRemote,
    ownsLocally,
    remoteNodesOf,
    flushWatch: watchTick,
    structs,
    stats,
    clock,
  };
}

module.exports = {
  createReplicator,
  encodeValue,
  decodeValue,
  applyInPlace,
  STATE_CHANNEL,
};
