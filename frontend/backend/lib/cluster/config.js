"use strict";

/**
 * Hybrid server env (HYBRID-CONTRACT "Env (backend)"). Pure: read once per
 * process by lib/cluster/index.js, and by the tests with a fake env.
 *
 * With no REDIS_URL the node is a single node: nothing here opens a socket.
 */

const os = require("os");
const path = require("path");
const fs = require("fs");

function readVersion() {
  if (process.env.DESCALL_VERSION) return String(process.env.DESCALL_VERSION);
  for (const rel of ["../../../package.json", "../../package.json"]) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(__dirname, rel), "utf8")).version;
      if (v) return String(v);
    } catch {
      /* try the next one */
    }
  }
  return "0.0.0";
}

function cleanId(raw, fallback) {
  const s = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return s || fallback;
}

/**
 * The primary's public URL as a secondary sees it. DESCALL_NODE_PRIMARY_URL is the name the
 * Descall Node app sets; DESCALL_PRIMARY_URL is accepted as an alias.
 */
function readPrimaryUrl(env = process.env) {
  return String(env.DESCALL_NODE_PRIMARY_URL || env.DESCALL_PRIMARY_URL || "").trim().replace(/\/+$/, "");
}

/** CPU cores this node may use: DESCALL_NODE_CORES (the PC share) capped by the machine. */
function readCores(env = process.env) {
  const machine = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  const want = Math.floor(Number(env.DESCALL_NODE_CORES));
  return Number.isFinite(want) && want >= 1 ? Math.min(machine, want) : machine;
}

/**
 * Interface the HTTP server binds to. A secondary (the owner's PC) is reached only through
 * the Cloudflare Tunnel and its local supervisor, so it listens on loopback alone.
 */
function readListenHost(env = process.env) {
  const role = String(env.DESCALL_NODE_ROLE || "").trim().toLowerCase();
  return role === "secondary" ? "127.0.0.1" : undefined;
}

function readClusterConfig(env = process.env) {
  const role = String(env.DESCALL_NODE_ROLE || "").trim().toLowerCase() === "secondary" ? "secondary" : "primary";
  const nodeId = cleanId(env.DESCALL_NODE_ID, role === "primary" ? "render" : `pc-${cleanId(os.hostname(), "node").slice(0, 8)}`);
  const memoryMb = Math.max(64, Number(env.DESCALL_NODE_MEMORY_MB) || (role === "primary" ? 512 : 2048));
  const publicUrl = String(env.DESCALL_NODE_PUBLIC_URL || env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  const redisUrl = String(env.REDIS_URL || "").trim();
  // Test / ops knobs (ms). Defaults are the contract numbers.
  const num = (name, def) => {
    const v = Number(env[name]);
    return Number.isFinite(v) && v > 0 ? v : def;
  };
  return {
    redisUrl,
    configured: Boolean(redisUrl),
    nodeId,
    role,
    publicUrl,
    memoryMb,
    cores: readCores(env),
    primaryUrl: readPrimaryUrl(env),
    version: readVersion(),
    kvMaxMb: num("DESCALL_KV_MAX_MB", 25),
    beatMs: num("DESCALL_CLUSTER_BEAT_MS", 5000),
    aliveTtlMs: num("DESCALL_CLUSTER_ALIVE_TTL_MS", 15000),
    leaderTtlMs: num("DESCALL_CLUSTER_LEADER_TTL_MS", 15000),
    metricsMs: num("DESCALL_CLUSTER_METRICS_MS", 10000),
    watchMs: num("DESCALL_CLUSTER_WATCH_MS", 250),
    // After the KV is lost, other nodes' replicated entries are kept this long
    // (a short blip must not show every remote user offline).
    remoteGraceMs: num("DESCALL_CLUSTER_REMOTE_GRACE_MS", 20000),
  };
}

module.exports = { readClusterConfig, readPrimaryUrl, readCores, readListenHost, cleanId };
