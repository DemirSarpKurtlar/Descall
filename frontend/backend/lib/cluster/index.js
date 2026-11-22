"use strict";

/**
 * placeholder: agent 1 owns this file.
 *
 * Minimal in-memory cluster API with exactly the shape of the hybrid contract
 * (HYBRID-CONTRACT.md, "Backend module API"). It always runs in single-node mode:
 * enabled() is false, getNodes() returns just this node, metrics are sampled locally.
 * routes/node.js and lib/cluster/routing.js consume it; the integrator keeps agent 1's
 * Redis-backed version of this file.
 */

const os = require("os");
const { EventEmitter } = require("events");

const nodeId = String(process.env.DESCALL_NODE_ID || "render").trim() || "render";
const role = process.env.DESCALL_NODE_ROLE === "secondary" ? "secondary" : "primary";
const publicUrl = String(process.env.DESCALL_NODE_PUBLIC_URL || "").trim().replace(/\/+$/, "");
const startedAt = Date.now();

const bus = new EventEmitter();
bus.setMaxListeners(100);
const leaderCbs = new Set();
const events = [];
const metrics = [];
let state = "active";
let cfg = {
  ramMb: 2048,
  cores: 2,
  loadRule: { renderHighPct: 60, pcHighPct: 85 },
  gameMode: { enabled: true, shareMb: 1024, fullHandover: false },
  schedule: { tz: "Europe/Istanbul", slots: [] },
  alerts: { pcDown: true, kvFull: true, render90: true },
};

function memLimitMb() {
  const n = Number(process.env.DESCALL_NODE_MEMORY_MB);
  return Number.isFinite(n) && n > 0 ? n : 512;
}

function selfEntry() {
  const mem = process.memoryUsage();
  return {
    id: nodeId,
    role,
    url: publicUrl,
    version: process.env.npm_package_version || "",
    startedAt,
    memRss: Math.round(mem.rss / (1024 * 1024)),
    memLimit: memLimitMb(),
    cpu: 0,
    cores: os.cpus().length,
    conns: 0,
    p95ms: 0,
    errRate: 0,
    state,
    gameMode: false,
    lastBeat: Date.now(),
  };
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function merge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

module.exports = {
  enabled: () => false,
  nodeId,
  role,
  publicUrl,
  isLeader: () => true,
  onLeaderChange(cb) {
    if (typeof cb === "function") leaderCbs.add(cb);
    return () => leaderCbs.delete(cb);
  },
  async getNodes() {
    return [selfEntry()];
  },
  async getCfg() {
    return JSON.parse(JSON.stringify(cfg));
  },
  async setCfg(partial) {
    cfg = merge(cfg, partial || {});
    return JSON.parse(JSON.stringify(cfg));
  },
  async setNodeState(id, next) {
    if (id === nodeId && ["active", "draining", "paused", "down"].includes(next)) state = next;
  },
  async pushEvent(kind, detail) {
    events.unshift({ at: Date.now(), kind, nodeId, detail: detail || null });
    if (events.length > 200) events.length = 200;
  },
  async getEvents(limit = 50) {
    return events.slice(0, Math.max(0, Number(limit) || 0));
  },
  async getMetrics() {
    const e = selfEntry();
    metrics.push({ t: Date.now(), rss: e.memRss, cpu: 0, conns: 0, p95: 0 });
    if (metrics.length > 360) metrics.shift();
    return { [nodeId]: metrics.slice() };
  },
  async kvStatus() {
    return { ok: false, usedMb: 0, maxMb: 25 };
  },
  publish(channel, msg) {
    bus.emit(String(channel), msg);
  },
  subscribe(channel, cb) {
    bus.on(String(channel), cb);
    return () => bus.off(String(channel), cb);
  },
};
