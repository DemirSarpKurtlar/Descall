"use strict";

/**
 * Async shared-state API (HYBRID-CONTRACT item 4). Same answers on a single
 * node and in a cluster:
 *   - single node / KV away: from runtime/sharedState.js in memory;
 *   - clustered: from the Key Value (the authoritative copy every node writes).
 *
 * New code and admin views read through this; existing hot paths keep the
 * synchronous node-local replicas (lib/cluster/replica.js), which the KV
 * copy mirrors.
 */

function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function decode(v) {
  return require("./replica").decodeValue(v);
}

function createStore(cluster, C) {
  const state = () => require("../../runtime/sharedState");
  const kv = () => (cluster.enabled() ? C.kv : null);
  const localRl = new Map();

  async function presenceByNode() {
    const k = kv();
    if (!k) {
      const out = {};
      for (const [id, v] of state().presence) {
        if (cluster.replicator && !cluster.replicator.ownsLocally("presence", id)) continue;
        out[id] = v;
      }
      return { [cluster.nodeId]: out };
    }
    const nodes = (await cluster.getNodes()).filter((n) => n.state !== "down");
    const res = {};
    for (const n of nodes) {
      const all = await k.call("hgetall", `dc:presence:${n.id}`).catch(() => ({}));
      res[n.id] = {};
      for (const [id, raw] of Object.entries(all || {})) res[n.id][id] = decode(parse(raw));
    }
    return res;
  }

  async function getPresence(userId) {
    const id = String(userId);
    if (!kv()) return state().presence.get(id) || null;
    const byNode = await presenceByNode();
    for (const map of Object.values(byNode)) if (map[id]) return map[id];
    return null;
  }

  async function listOnline() {
    const byNode = await presenceByNode();
    const out = new Map();
    for (const [nodeId, map] of Object.entries(byNode)) {
      for (const [id, v] of Object.entries(map)) {
        if (!out.has(id)) out.set(id, { userId: id, nodes: [], status: v?.status || "online", username: v?.username || null });
        out.get(id).nodes.push(nodeId);
      }
    }
    return [...out.values()];
  }

  async function userSockets(userId) {
    const id = String(userId);
    const k = kv();
    if (k) return (await k.call("smembers", `dc:sockets:${id}`).catch(() => [])) || [];
    const out = [];
    for (const [sid, uid] of state().socketToUser) if (String(uid) === id) out.push(`${cluster.nodeId}:${sid}`);
    return out;
  }

  async function connsByNode() {
    const k = kv();
    if (!k) return { [cluster.nodeId]: state().socketToUser.size };
    const [, keys] = await k.call("scan", "0", "MATCH", "dc:sockets:*", "COUNT", "1000");
    const out = {};
    for (const key of keys || []) {
      for (const m of (await k.call("smembers", key).catch(() => [])) || []) {
        const n = String(m).split(":")[0];
        out[n] = (out[n] || 0) + 1;
      }
    }
    return out;
  }

  async function getKeyed(prefix, local, id) {
    const k = kv();
    if (!k) {
      const v = local.get(String(id));
      return v === undefined ? null : v;
    }
    const raw = await k.call("get", `${prefix}${id}`).catch(() => null);
    const wire = raw ? parse(raw) : null;
    return wire ? decode(wire.v) : null;
  }

  async function listKeyed(prefix, local) {
    const k = kv();
    if (!k) return [...local.entries()].map(([id, v]) => ({ id, value: v }));
    const [, keys] = await k.call("scan", "0", "MATCH", `${prefix}*`, "COUNT", "1000");
    const out = [];
    for (const key of keys || []) {
      const wire = parse(await k.call("get", key).catch(() => null));
      if (wire) out.push({ id: key.slice(prefix.length), value: decode(wire.v) });
    }
    return out;
  }

  async function hashHas(key, localHas, id) {
    const k = kv();
    if (!k) return localHas(String(id));
    if (key === "dc:revoked") return Boolean(await k.call("sismember", key, String(id)).catch(() => localHas(String(id))));
    return Boolean(await k.call("hget", key, String(id)).catch(() => (localHas(String(id)) ? "1" : null)));
  }

  async function hashGet(key, local, id) {
    const k = kv();
    if (!k) return local.get(String(id)) ?? null;
    const wire = parse(await k.call("hget", key, String(id)).catch(() => null));
    return wire ? decode(wire.v) : null;
  }

  /**
   * Cluster-wide fixed-window limiter: INCR + PEXPIRE on dc:rl:<scope>:<id>.
   * Resolves { ok, count, retryAfterMs }. KV away: a node-local window.
   */
  async function rateLimit(scope, id, { max = 10, windowMs = 60000 } = {}) {
    const key = `dc:rl:${String(scope).slice(0, 40)}:${String(id).slice(0, 200)}`;
    const k = kv();
    if (k) {
      try {
        const count = Number(await k.call("incr", key));
        if (count === 1) await k.call("pexpire", key, windowMs);
        const ttl = count > max ? Number(await k.call("pttl", key)) : 0;
        return { ok: count <= max, count, retryAfterMs: count > max ? Math.max(0, ttl) : 0 };
      } catch {
        /* local window */
      }
    }
    const now = Date.now();
    let row = localRl.get(key);
    if (!row || row.until <= now) {
      row = { count: 0, until: now + windowMs };
      localRl.set(key, row);
      if (localRl.size > 20000) for (const [rk, r] of localRl) if (r.until <= now) localRl.delete(rk);
    }
    row.count += 1;
    return { ok: row.count <= max, count: row.count, retryAfterMs: row.count > max ? row.until - now : 0 };
  }

  return {
    getPresence,
    listOnline,
    presenceByNode,
    isOnline: async (userId) => Boolean(await getPresence(userId)),
    userSockets,
    connsByNode,
    getGroupCall: (id) => getKeyed("dc:groupcall:", state().activeGroupCalls, id),
    listGroupCalls: () => listKeyed("dc:groupcall:", state().activeGroupCalls),
    getServerCall: (id) => getKeyed("dc:servercall:", state().activeServerVoiceCalls, id),
    listServerCalls: () => listKeyed("dc:servercall:", state().activeServerVoiceCalls),
    getScreenShare: (key) => getKeyed("dc:screenshare:", state().screenShareSessions, key),
    isRevoked: (sid) => hashHas("dc:revoked", (x) => state().revokedSessionIds.has(x), sid),
    isBanned: (id) => hashHas("dc:bans", (x) => state().bannedUserIds.has(x), id),
    getBan: (id) => hashGet("dc:bandetail", state().banDetailsByUser, id),
    getTimeout: (id) => hashGet("dc:timeouts", state().timedOutUsers, id),
    rateLimit,
  };
}

module.exports = { createStore };
