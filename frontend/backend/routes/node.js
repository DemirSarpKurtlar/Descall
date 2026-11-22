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
 *   POST /bootstrap  { id?, version? } -> { ok, env: { NAME: value }, count, windowUntil }
 *        The environment a secondary needs, from the primary's own process env filtered by
 *        lib/nodeKeys/bootstrapEnv.js (SHARED names that are set; never REDIS_URL, PORT,
 *        NODE_ENV, DESCALL_NODE_*, RENDER*, OS variables). It hands out the service role
 *        key, so: primary only (404 elsewhere); only inside the key's enrollment window
 *        (30 min after it was created or reopened in Admin > Sunucu Ağı, else 403
 *        BOOTSTRAP_WINDOW_CLOSED); refused when the request came through the PC tunnel
 *        (cf-warp-tag-id, the PC hostname, loopback with proxy headers); failures count on
 *        the same per-IP limit as register; every answer writes a node event, an admin audit
 *        entry and the owner's phone alert; no-store, never logged, never rewritten.
 * Local control (the Descall Node app on the PC talking to the backend it runs; never
 * through the tunnel). Request straight from 127.0.0.1 / ::1, Host 127.0.0.1 / localhost,
 * no Origin and no Cloudflare / proxy headers (tunnel traffic also arrives from loopback,
 * always with them), header `x-descall-node-control` equal (constant time) to
 * DESCALL_NODE_CONTROL_TOKEN, the per-launch random token the app put in this process env:
 *   GET  /local/status -> { ok, nodeId, role, state, conns, remaining, p95ms, memRss, memLimit,
 *                          cpu, cores, gameMode, draining, cfg, kv: { ok } }
 *   POST /local/drain  { reason?, timeoutMs? } -> { ok, remaining }   starts the graceful
 *                      drain (node:move, then paused) and answers at once; the app follows
 *                      `remaining` in /local/status
 *   POST /local/state  { state?: active|paused|draining, gameMode?, memoryMb? } -> { ok, state }
 *   PUT  /local/cfg    partial dc:cfg:pc (same validation as the admin panel) -> { cfg }
  */

const crypto = require("crypto");
const express = require("express");
const { createRouter, createNodeRuntime, localConnCount } = require("../lib/cluster/routing");
const { ipOfRequest } = require("../lib/clientIp");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const { apiError } = require("../lib/apiError");
const { pick: pickBootstrapEnv } = require("../lib/nodeKeys/bootstrapEnv");

const NODE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Hostname of the PC node's Cloudflare tunnel (desktop/crates/descall-node DEFAULT_PUBLIC_URL). */
const DEFAULT_PC_HOST = "pc.descall.com";
const BEARER_RE = /^Bearer\s+(\S+)$/i;
const FAIL_LIMIT = { windowMs: 10 * 60 * 1000, max: 20 };
const CONTROL_HEADER = "x-descall-node-control";
const CONTROL_TOKEN_MIN = 16;
/** Present on every request that came through Cloudflare (tunnel) or another proxy. */
const PROXY_HEADERS = ["cf-connecting-ip", "cf-ray", "cf-ipcountry", "cf-visitor", "cf-warp-tag-id", "cdn-loop", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded", "true-client-ip"];
const LOCAL_HOST_RE = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i;
const LOCAL_STATES = new Set(["active", "paused", "draining"]);

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

/** The local control guard; pure so the tests can drive it without a socket. */
function isLocalControlRequest(req, token) {
  const want = String(token || "");
  if (want.length < CONTROL_TOKEN_MIN) return false;
  if (!isLoopback(req.socket && req.socket.remoteAddress)) return false;
  const h = req.headers || {};
  if (PROXY_HEADERS.some((k) => h[k] != null)) return false;
  if (h.origin != null) return false;
  if (!LOCAL_HOST_RE.test(String(h.host || ""))) return false;
  const got = h[CONTROL_HEADER];
  return typeof got === "string" && safeEqual(got, want);
}

/** H3 nodeKeys.verify() answers { id, name } | null; older stubs { ok, keyId }. */
function keyResult(r) {
  if (!r || typeof r !== "object") return { ok: false, keyId: null };
  if (r.ok === true) return { ok: true, keyId: r.keyId || r.id || null };
  if (r.ok === undefined && r.id) return { ok: true, keyId: r.id };
  return { ok: false, keyId: null };
}

/** Capacity + saved cost for the register answer (lib/nodeKeys/model.js formula). */
async function registerExtras(cluster, cfg) {
  try {
    const M = require("../lib/nodeKeys/model");
    const store = require("../lib/nodeKeys/store");
    const nodes = await cluster.getNodes();
    const cap = M.capacity(nodes, cfg, { assumePc: true });
    let savedUsdMonth = null;
    try {
      const ledger = await store.loadLedger(Date.now());
      savedUsdMonth = M.savedUsd(Number(ledger && ledger.gbHours) || 0);
    } catch {
      savedUsdMonth = null;
    }
    return {
      capacity: { estimate: cap.estimate, pcUsers: cap.pcUsers, renderUsers: cap.renderUsers, perUserMb: cap.perUserMb, baseMb: M.BASE_MB, headroom: M.HEADROOM },
      ...(savedUsdMonth == null ? {} : { savedUsdMonth }),
    };
  } catch {
    return {};
  }
}

function hostOf(u) {
  try {
    return new URL(String(u || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Did this request come through the PC node's own tunnel? cloudflared adds cf-warp-tag-id to
 * every request it forwards; tunnel traffic reaches its origin from loopback with Cloudflare
 * headers; and the Host of a tunnelled request is the PC hostname (or a registered
 * secondary's). Requests to Render come through Render's proxy, never from loopback.
 */
async function viaPcTunnel(req, cluster) {
  const h = req.headers || {};
  if (h["cf-warp-tag-id"] != null) return true;
  if (isLoopback(req.socket && req.socket.remoteAddress) && PROXY_HEADERS.some((k) => h[k] != null)) return true;
  const hosts = new Set([DEFAULT_PC_HOST]);
  try {
    for (const n of (await cluster.getNodes()) || []) if (n && n.role === "secondary" && n.url && hostOf(n.url)) hosts.add(hostOf(n.url));
  } catch {
    /* KV down: the fixed hostname still counts */
  }
  const seen = [h.host, h["x-forwarded-host"], h["x-original-host"]]
    .flatMap((v) => String(v || "").split(","))
    .map((v) => v.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean);
  return seen.some((x) => hosts.has(x));
}

/** no-store, and the body bypasses res.json (no media rewrite, no ETag, nothing cached). */
function sendPrivateJson(res, status, body) {
  res.status(status);
  res.set("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function setNoStore(res) {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("X-Content-Type-Options", "nosniff");
}

/**
 * Side effects of an answered bootstrap: bootstrapped_at, a node event, an admin audit entry
 * and the owner's phone alert. Names and counts only, never a value. Never throws.
 */
async function recordBootstrap({ keys, keyId, keyName, nodeId, ip, names, alert }) {
  const detail = { nodeId: nodeId || null, keyId: keyId || null, name: keyName || null, count: names.length, ip: ip || null };
  try {
    if (typeof keys.markBootstrapped === "function") await keys.markBootstrapped(keyId);
  } catch {
    /* best effort */
  }
  try {
    await require("../lib/nodeKeys/service").logEvent("node_bootstrap", detail, null);
  } catch {
    /* events optional */
  }
  try {
    require("../runtime/sharedState").appendAudit(null, "system", "system_node_bootstrap", `node_key:${keyId || "?"}`, { ...detail, names });
  } catch {
    /* audit optional */
  }
  try {
    await alert({ kind: "bootstrap", reason: "bootstrap", vars: {} });
  } catch (err) {
    console.warn("[node] bootstrap alert failed:", String((err && err.message) || err).slice(0, 120));
  }
}

async function defaultBootstrapAlert(alert) {
  const service = require("../lib/nodeKeys/service");
  const push = require("../lib/webPush");
  const ids = await service.ownerIds();
  if (ids.length && typeof push.sendAdminNodesPush === "function") await push.sendAdminNodesPush(ids, alert);
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
function createNodeRoutes({ cluster, router, runtime, nodeKeys, env = process.env, bootstrapAlert = defaultBootstrapAlert } = {}) {
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
      const nodeId = req.body && typeof req.body.id === "string" ? req.body.id.slice(0, 40) : null;
      if (secret) result = keyResult(await keys.verify(secret, { nodeId, ip: ipOfRequest(req) }));
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
    // The tray popover shows the same capacity / saved-cost numbers as the admin panel.
    const extra = await registerExtras(cluster, cfg);
    res.json({ ok: true, cfg, ...extra });
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

  r.post("/bootstrap", async (req, res) => {
    setNoStore(res);
    if (cluster.role !== "primary") return sendPrivateJson(res, 404, apiError("Not found", null, { code: "NOT_FOUND" }));
    if (await viaPcTunnel(req, cluster)) return sendPrivateJson(res, 403, apiError("Use the primary's own address", null, { code: "NODE_BOOTSTRAP_TUNNEL" }));
    const ip = ipOfRequest(req);
    const ipKey = `node-key:${ip}`;
    if (rejectIfLimited(res, [peek(ipKey, FAIL_LIMIT)])) return;
    const b = req.body || {};
    const nodeId = typeof b.id === "string" && NODE_ID_RE.test(b.id) ? b.id : null;
    const secret = bearerOf(req);
    let key = { ok: false, keyId: null };
    try {
      if (secret) key = keyResult(await keys.verify(secret, { nodeId, ip }));
    } catch {
      key = { ok: false, keyId: null };
    }
    let win = null;
    if (key.ok) {
      try {
        win = typeof keys.bootstrapWindow === "function" ? await keys.bootstrapWindow(key.keyId) : null;
      } catch {
        win = null;
      }
    }
    if (!key.ok || !win) {
      recordFailure(ipKey, FAIL_LIMIT);
      return sendPrivateJson(res, 401, apiError("Invalid node key", null, { code: "NODE_KEY_INVALID" }));
    }
    if (!win.open) {
      recordFailure(ipKey, FAIL_LIMIT);
      try {
        await require("../lib/nodeKeys/service").logEvent("node_bootstrap_refused", { nodeId, keyId: key.keyId, name: win.name || null, reason: "window", ip }, null);
      } catch {
        /* events optional */
      }
      return sendPrivateJson(res, 403, apiError("The setup window of this node key is closed", null, { code: "BOOTSTRAP_WINDOW_CLOSED", windowUntil: new Date(win.until).toISOString() }));
    }
    const out = pickBootstrapEnv(env);
    const names = Object.keys(out);
    await recordBootstrap({ keys, keyId: key.keyId, keyName: win.name, nodeId, ip, names, alert: bootstrapAlert });
    return sendPrivateJson(res, 200, { ok: true, nodeId: cluster.nodeId, env: out, count: names.length, windowUntil: new Date(win.until).toISOString() });
  });

  function requireLocalControl(req, res, next) {
    if (!isLocalControlRequest(req, env.DESCALL_NODE_CONTROL_TOKEN)) return res.status(403).json(apiError("Forbidden", null, { code: "NODE_LOCAL_ONLY" }));
    res.set("Cache-Control", "no-store");
    next();
  }

  async function selfNode() {
    try {
      return (await cluster.getNodes()).find((n) => n && n.id === cluster.nodeId) || null;
    } catch {
      return null;
    }
  }

  function localConns() {
    return runtime && runtime.io ? localConnCount(runtime.io) : null;
  }

  r.get("/local/status", requireLocalControl, async (_req, res) => {
    const self = await selfNode();
    let cfg = null;
    let kv = { ok: false };
    try {
      cfg = await cluster.getCfg();
    } catch {
      cfg = null;
    }
    try {
      const st = await cluster.kvStatus();
      kv = { ok: Boolean(st && st.ok) };
    } catch {
      kv = { ok: false };
    }
    const draining = Boolean(runtime && runtime.isDraining());
    const live = localConns();
    const conns = live != null ? live : Number(self && self.conns) || 0;
    res.json({
      ok: true,
      nodeId: cluster.nodeId,
      role: cluster.role,
      state: draining ? "draining" : (self && self.state) || "active",
      conns,
      remaining: draining ? conns : 0,
      p95ms: Number(self && self.p95ms) || 0,
      memRss: Number(self && self.memRss) || Math.round(process.memoryUsage().rss / 1048576),
      memLimit: Number(self && self.memLimit) || null,
      cpu: Number(self && self.cpu) || 0,
      cores: Number(self && self.cores) || null,
      gameMode: Boolean(self && self.gameMode),
      draining,
      cfg,
      kv,
    });
  });

  r.post("/local/drain", requireLocalControl, async (req, res) => {
    const b = req.body || {};
    const why = typeof b.reason === "string" ? b.reason.slice(0, 40) : "drain";
    const timeoutMs = Math.min(30_000, Math.max(0, Number(b.timeoutMs) || 10_000));
    const remaining = localConns() || 0;
    // Answer at once: the app polls /local/status (`remaining`) and stops the process after 10 s.
    runtime.drainSelf({ reason: why, detail: `local:${why}`, timeoutMs }).catch(() => {});
    res.json({ ok: true, remaining });
  });

  r.post("/local/state", requireLocalControl, async (req, res) => {
    const b = req.body || {};
    if (b.state !== undefined && !LOCAL_STATES.has(b.state)) return res.status(400).json(apiError("Invalid node state", null, { code: "NODE_STATE_INVALID" }));
    const patch = {};
    if (typeof b.gameMode === "boolean") patch.gameMode = b.gameMode;
    if (Number.isFinite(Number(b.memoryMb)) && Number(b.memoryMb) > 0) patch.memoryMb = Number(b.memoryMb);
    if (Object.keys(patch).length && typeof cluster.updateSelf === "function") cluster.updateSelf(patch);
    const self = await selfNode();
    const cur = runtime.isDraining() ? "draining" : (self && self.state) || "active";
    if (b.state && b.state !== cur) {
      if (b.state === "active") await runtime.resumeSelf("tray");
      else if (b.state === "paused") {
        if ((localConns() || 0) > 0) runtime.drainSelf({ reason: "drain", detail: "local:pause" }).catch(() => {});
        else await runtime.pauseSelf("tray");
      } else if (b.state === "draining") runtime.drainSelf({ reason: "drain", detail: "local:state" }).catch(() => {});
    }
    if (typeof cluster.beatNow === "function") await Promise.resolve(cluster.beatNow()).catch(() => {});
    res.json({ ok: true, state: b.state || cur });
  });

  r.put("/local/cfg", requireLocalControl, async (req, res) => {
    try {
      const M = require("../lib/nodeKeys/model");
      const service = require("../lib/nodeKeys/service");
      const before = await service.getCfg();
      const v = M.validateCfgPatch(req.body, before);
      if (!v.ok) return res.status(400).json(apiError("Invalid setting: {field}", { field: v.field }, { code: "BAD_CFG" }));
      const actor = { id: null, username: "pc-tray", via: "tray" };
      const cfg = await service.setCfg(v.patch, actor);
      const parts = M.changedParts(before, cfg);
      if (parts.length) await service.logEvent("cfg_update", { parts, ramMb: cfg.ramMb, cores: cfg.cores, prevRamMb: before.ramMb, via: "pc-tray", nodeId: cluster.nodeId }, actor).catch(() => {});
      res.json({ cfg, changed: parts });
    } catch (err) {
      console.warn("[node] local cfg failed:", err && err.message);
      res.status(500).json(apiError("Internal server error.", null, { code: "INTERNAL" }));
    }
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

module.exports = { createNodeRoutes, attachNodeRouting, getNodeRouting, refuseWhileDraining, isLocalControlRequest, viaPcTunnel, keyResult, NODE_ID_RE, CONTROL_HEADER };
