"use strict";

/**
 * Sunucu Ağı service: the overview payload (GET /api/admin/nodes and the admin:nodes push),
 * config persistence (cluster dc:cfg:pc first, node_settings as the durable copy that also
 * survives a Key Value restart), event logging to both, and the owner account list for
 * phone alerts. Consumes the cluster API of lib/cluster/index.js only.
 */

const M = require("./model");
const store = require("./store");

const cluster = () => require("../cluster");

let hydrated = false;

const stamp = (cfg) => Date.parse(cfg?.updatedAt || "") || 0;

/**
 * Once per process: when the durable copy is newer than what the cluster holds (a Key
 * Value restart, a fresh single-node boot), put it back.
 */
async function hydrateCfg() {
  if (hydrated) return;
  hydrated = true;
  try {
    const saved = await store.loadCfg();
    if (!saved) return;
    const cur = await cluster().getCfg();
    if (stamp(saved) > stamp(cur)) await cluster().setCfg(saved, { id: "system", via: "restore" });
  } catch {
    hydrated = false;
  }
}

async function getCfg() {
  await hydrateCfg();
  return M.normalizeCfg(await cluster().getCfg());
}

async function setCfg(patch, actor) {
  const updated = { ...patch, updatedAt: new Date().toISOString(), updatedBy: actor?.username || null };
  const cfg = M.normalizeCfg(await cluster().setCfg(updated, actor));
  await store.saveCfg(cfg, actor?.id || null);
  return cfg;
}

/** Event in the cluster ring (everyone sees it at once) and the durable table. */
async function logEvent(kind, detail = {}, actor = null) {
  const at = new Date().toISOString();
  try {
    await cluster().pushEvent(kind, detail);
  } catch {
    /* ring optional */
  }
  await store.addEvent({ kind, nodeId: detail?.nodeId || null, detail, actorId: actor?.id || null, at });
}

const settle = async (p, fallback) => {
  try {
    return await p;
  } catch {
    return fallback;
  }
};

async function buildOverview({ now = Date.now() } = {}) {
  const c = cluster();
  const [nodes, cfg, kv, clusterEvents, dbEvents, keys, ledger, storage] = await Promise.all([
    settle(c.getNodes(), []),
    settle(getCfg(), M.normalizeCfg(null)),
    settle(c.kvStatus(), { ok: false, usedMb: 0, maxMb: 25 }),
    settle(c.getEvents(50), []),
    store.listEvents(50),
    store.keySummary(),
    store.loadLedger(now),
    store.available(),
  ]);
  let enabled = false;
  try {
    enabled = Boolean(c.enabled());
  } catch {
    enabled = false;
  }
  const leader = nodes.find((n) => n?.isLeader)?.id || (typeof c.leaderId === "function" ? safe(() => c.leaderId()) || null : null) || (safe(() => c.isLeader()) ? c.nodeId : null);
  return M.overview({
    enabled,
    kv,
    kvConfigured: Boolean(process.env.REDIS_URL),
    nodes,
    leader,
    cfg,
    events: M.mergeEvents(clusterEvents, dbEvents, 50),
    ledger,
    keys,
    storage,
    now,
  });
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return false;
  }
}

/** Owner accounts (username "admin" or is_super_admin) for the phone alerts. */
async function ownerIds() {
  try {
    const db = require("../../db/supabase");
    const ids = new Set();
    const a = await db.from("users").select("id").eq("username", "admin");
    for (const r of a?.data || []) ids.add(r.id);
    const b = await db.from("users").select("id").eq("is_super_admin", true);
    for (const r of b?.data || []) ids.add(r.id);
    return [...ids];
  } catch {
    return [];
  }
}

function __resetForTests() {
  hydrated = false;
}

module.exports = { hydrateCfg, getCfg, setCfg, logEvent, buildOverview, ownerIds, __resetForTests };
