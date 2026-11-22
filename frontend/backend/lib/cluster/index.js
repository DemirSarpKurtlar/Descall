"use strict";

/**
 * placeholder: agent 1 owns this file
 *
 * Minimal in-memory cluster API (hybrid server contract, "Backend module API"), so the
 * admin "Sunucu Ağı" tab and its routes work on a branch without agent 1's Redis version.
 * The integrator keeps agent 1's file. Single-node mode only: getNodes() returns this
 * node, metrics are sampled locally every 10 s (lazily started, unref'd timer), cfg and
 * events live in memory.
 */

const os = require("os");
const { EventEmitter } = require("events");

const SAMPLE_MS = 10 * 1000;
const RING = 360; // 1 h of 10 s samples
const EVENTS_MAX = 200;

const DEFAULT_CFG = Object.freeze({
  ramMb: 3072,
  cores: 4,
  loadRule: { enabled: true, renderHighPct: 60, pcHighPct: 85 },
  gameMode: { enabled: true, shareMb: 1024, fullHandover: false },
  schedule: { enabled: true, tz: "Europe/Istanbul", slots: [] },
  alerts: { pcDown: true, kvFull: true, render90: true },
});

const nodeId = process.env.DESCALL_NODE_ID || "render";
const role = process.env.DESCALL_NODE_ROLE === "secondary" ? "secondary" : "primary";
const publicUrl = String(process.env.DESCALL_NODE_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
const startedAt = new Date().toISOString();

const bus = new EventEmitter();
let cfg = clone(DEFAULT_CFG);
let localState = "active";
const events = [];
const samples = [];
let sampler = null;
let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();
let connCounter = () => 0;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function merge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch === undefined ? base : patch;
  const out = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(patch)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(out[k], v) : v;
  return out;
}

function cpuPct() {
  const now = Date.now();
  const cur = process.cpuUsage(lastCpu);
  const ms = Math.max(1, now - lastCpuAt);
  lastCpu = process.cpuUsage();
  lastCpuAt = now;
  return Math.max(0, Math.min(100, Math.round(((cur.user + cur.system) / 1000 / ms / Math.max(1, os.cpus().length)) * 1000) / 10));
}

function sample() {
  const s = { t: Date.now(), rss: Math.round(process.memoryUsage().rss / 1048576), cpu: cpuPct(), conns: Number(connCounter()) || 0, p95: 0, err: 0 };
  samples.push(s);
  if (samples.length > RING) samples.splice(0, samples.length - RING);
  return s;
}

function ensureSampler() {
  if (sampler) return;
  sample();
  sampler = setInterval(sample, SAMPLE_MS);
  sampler.unref?.();
}

function selfNode() {
  ensureSampler();
  const last = samples[samples.length - 1] || sample();
  return {
    id: nodeId,
    role,
    url: publicUrl,
    version: process.env.npm_package_version || "",
    startedAt,
    memRss: last.rss,
    memLimit: Number(process.env.DESCALL_NODE_MEMORY_MB) || 512,
    cpu: last.cpu,
    cores: os.cpus().length,
    conns: last.conns,
    p95ms: last.p95,
    errRate: last.err,
    state: localState,
    gameMode: false,
    lastBeat: new Date(last.t).toISOString(),
  };
}

module.exports = {
  nodeId,
  role,
  publicUrl,
  enabled: () => false,
  isLeader: () => true,
  onLeaderChange(cb) {
    bus.on("leader", cb);
  },
  async getNodes() {
    return [selfNode()];
  },
  async getCfg() {
    return clone(cfg);
  },
  async setCfg(partial, actor) {
    cfg = merge(cfg, partial || {});
    bus.emit("cfg", cfg, actor);
    return clone(cfg);
  },
  async setNodeState(id, state, reason) {
    if (id === nodeId) localState = state;
    await module.exports.pushEvent(`node_${state}`, { nodeId: id, reason: reason || null });
  },
  async pushEvent(kind, detail) {
    events.unshift({ at: new Date().toISOString(), kind, nodeId, detail: detail || null });
    if (events.length > EVENTS_MAX) events.length = EVENTS_MAX;
  },
  async getEvents(limit = 50) {
    return events.slice(0, Math.max(0, limit));
  },
  async getMetrics(minutes = 60) {
    ensureSampler();
    const since = Date.now() - Math.max(1, minutes) * 60 * 1000;
    return { [nodeId]: samples.filter((s) => s.t >= since) };
  },
  async kvStatus() {
    return { ok: false, usedMb: 0, maxMb: 25 };
  },
  publish(channel, msg) {
    bus.emit(`ch:${channel}`, msg);
  },
  subscribe(channel, cb) {
    bus.on(`ch:${channel}`, cb);
  },
  /** Placeholder only: where the local connection count comes from (server wiring). */
  setConnectionCounter(fn) {
    if (typeof fn === "function") connCounter = fn;
  },
  DEFAULT_CFG,
};
