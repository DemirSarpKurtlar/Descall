"use strict";

/**
 * Hybrid server node endpoints (HYBRID-CONTRACT.md "REST"), mounted at /api/node.
 *
 * Public (no auth, cheap):
 *   GET  /assign   -> { nodeId, url, socketUrl, ttlSec }   which node a new client uses
 *   GET  /health   -> { ok, nodeId, role, state }         tunnel / supervisor checks
 * Node to node (Authorization: Bearer dsk_node_..., secondary -> primary):
 *   POST /register   { id, url, version, memoryMb, cores } -> { ok, cfg }
 *   POST /drain-done { id, moved?, dropped?, ms? }        -> { ok }
 * Local supervisor only (the Descall Node service on the PC, never through the tunnel):
 *   POST /drain-self  { reason?, timeoutMs? } -> { ok, moved, dropped, ms }
 *   POST /resume-self                         -> { ok }
 *   Bearer must be this node's own DESCALL_NODE_KEY and the request must come straight
 *   from loopback without Cloudflare headers (tunnel traffic also arrives from loopback).
 */

const crypto = require("crypto");
const express = require("express");
const { createRouter, createNodeRuntime } = require("../lib/cluster/routing");
const { ipOfRequest } = require("../lib/clientIp");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const { apiError } = require("../lib/apiError");

const NODE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const BEARER_RE = /^Bearer\s+(\S+)$/i;
const FAIL_LIMIT = { windowMs: 10 * 60 * 1000, max: 20 };

function bearerOf(req) {
  const m = BEARER_RE.exec(String(req.get("authorization") || ""));
  return m ? m[1] : "";
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (!x.length || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function isLoopback(addr) {
  const s = String(addr || "").replace(/^::ffff:/, "");
  return s === "127.0.0.1" || s === "::1";
}

function validNodeUrl(u, env) {
  try {
    const url = new URL(String(u || ""));
    if (url.protocol === "https:") return true;
    return env.NODE_ENV !== "production" && url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

/**
 * @param {object} deps
 * @param {object} deps.cluster   lib/cluster API
 * @param {object} deps.router    lib/cluster/routing createRouter()
 * @param {object} deps.runtime   lib/cluster/routing createNodeRuntime()
 * @param {object} [deps.nodeKeys] { verify(secret) -> {ok, keyId} | Promise }
 */
function createNodeRoutes({ cluster, router, runtime, nodeKeys, env = process.env } = {}) {
  const keys = nodeKeys || require("../lib/nodeKeys");
  const r = express.Router();

  r.get("/assign", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const out = await router.decide({ sid: req.query.sid, prev: req.query.prev });
      res.json({ nodeId: out.nodeId, url: out.url, socketUrl: out.socketUrl, ttlSec: out.ttlSec });
    } catch {
      const url = String(cluster.publicUrl || "");
      res.json({ nodeId: cluster.nodeId, url, socketUrl: url, ttlSec: 60 });
    }
  });

  r.get("/health", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    let state = "active";
    try {
      const self = (await cluster.getNodes()).find((n) => n && n.id === cluster.nodeId);
      if (self && self.state) state = self.state;
    } catch {
      /* KV down: this node still answers */
    }
    if (runtime && runtime.isDraining()) state = "draining";
    res.json({ ok: true, nodeId: cluster.nodeId, role: cluster.role, state });
  });

  async function requireNodeKey(req, res, next) {
    const ipKey = `node-key:${ipOfRequest(req)}`;
    if (rejectIfLimited(res, [peek(ipKey, FAIL_LIMIT)])) return;
    const secret = bearerOf(req);
    let result = { ok: false, keyId: null };
    try {
      if (secret) result = (await keys.verify(secret)) || result;
    } catch {
      result = { ok: false, keyId: null };
    }
    if (!result.ok) {
      recordFailure(ipKey, FAIL_LIMIT);
      return res.status(401).json(apiError("Invalid node key", null, { code: "NODE_KEY_INVALID" }));
    }
    req.nodeKeyId = result.keyId || null;
    next();
  }

  r.post("/register", requireNodeKey, async (req, res) => {
    if (cluster.role !== "primary") return res.status(409).json(apiError("Not the primary node", null, { code: "NOT_PRIMARY" }));
    const b = req.body || {};
    const id = String(b.id || "").trim();
    if (!NODE_ID_RE.test(id) || id === cluster.nodeId) return res.status(400).json(apiError("Invalid node id", null, { code: "NODE_ID_INVALID" }));
    if (!validNodeUrl(b.url, env)) return res.status(400).json(apiError("Invalid node url", null, { code: "NODE_URL_INVALID" }));
    const info = {
      url: String(b.url).replace(/\/+$/, ""),
      version: String(b.version || "").slice(0, 40),
      memoryMb: Number.isFinite(Number(b.memoryMb)) ? Math.max(0, Math.round(Number(b.memoryMb))) : null,
      cores: Number.isFinite(Number(b.cores)) ? Math.max(0, Math.round(Number(b.cores))) : null,
    };
    const fresh = router.recordRegistration(id, req.nodeKeyId, info);
    if (fresh) await cluster.pushEvent("node:register", { id, keyId: req.nodeKeyId, ...info }).catch(() => {});
    let cfg = null;
    try {
      cfg = await cluster.getCfg();
    } catch {
      cfg = null;
    }
    res.json({ ok: true, cfg });
  });

  r.post("/drain-done", requireNodeKey, async (req, res) => {
    const b = req.body || {};
    const id = String(b.id || "").trim();
    if (!NODE_ID_RE.test(id)) return res.status(400).json(apiError("Invalid node id", null, { code: "NODE_ID_INVALID" }));
    const result = {
      id,
      moved: Math.max(0, Number(b.moved) || 0),
      dropped: Math.max(0, Number(b.dropped) || 0),
      ms: Math.max(0, Number(b.ms) || 0),
    };
    if (runtime) runtime.notifyDrained(id, result);
    await cluster.pushEvent("node:drain-done-ack", result).catch(() => {});
    res.json({ ok: true });
  });

  function requireLocalSupervisor(req, res, next) {
    const own = String(env.DESCALL_NODE_KEY || "");
    const direct = isLoopback(req.socket && req.socket.remoteAddress) && !req.get("cf-connecting-ip") && !req.get("x-forwarded-for") && !req.get("cf-ray");
    if (!own || !direct || !safeEqual(bearerOf(req), own)) return res.status(403).json(apiError("Forbidden", null, { code: "NODE_LOCAL_ONLY" }));
    next();
  }

  r.post("/drain-self", requireLocalSupervisor, async (req, res) => {
    const b = req.body || {};
    const timeoutMs = Math.min(30_000, Math.max(0, Number(b.timeoutMs) || 10_000));
    const result = await runtime.drainSelf({ reason: typeof b.reason === "string" ? b.reason : "drain", timeoutMs });
    res.json({ ok: true, ...result });
  });

  r.post("/resume-self", requireLocalSupervisor, async (_req, res) => {
    await runtime.resumeSelf("supervisor");
    res.json({ ok: true });
  });

  return r;
}

/**
 * A draining / paused secondary refuses new sockets: the client's connect_error handler
 * (src/lib/nodeRouting.js) sends it to the primary at once. The primary never refuses.
 */
function refuseWhileDraining(io, runtime, cluster) {
  if (!io || typeof io.use !== "function" || cluster.role !== "secondary") return;
  io.use((_socket, next) => (runtime.acceptsConnections() ? next() : next(new Error("node draining"))));
}

let singleton = null;

/**
 * server.js wiring: one router + runtime per process, mounted at /api/node.
 * Agent 3's admin routes reach the same objects through getNodeRouting()
 * (runtime.requestNode(id, "drain" | "resume", { reason }), runtime.waitForDrainDone(id),
 * router.revokeKey(keyId), router.snapshot()).
 */
function attachNodeRouting({ app, io, cluster: clusterArg, env = process.env } = {}) {
  if (singleton) return singleton;
  const cluster = clusterArg || require("../lib/cluster");
  const router = createRouter({ cluster, env });
  const runtime = createNodeRuntime({ cluster, io, router, env });
  const routes = createNodeRoutes({ cluster, router, runtime, env });
  if (app) app.use("/api/node", routes);
  refuseWhileDraining(io, runtime, cluster);
  if (env.NODE_ENV !== "test") runtime.start();
  singleton = { cluster, router, runtime, routes };
  return singleton;
}

function getNodeRouting() {
  return singleton;
}

module.exports = { createNodeRoutes, attachNodeRouting, getNodeRouting, refuseWhileDraining, NODE_ID_RE };
