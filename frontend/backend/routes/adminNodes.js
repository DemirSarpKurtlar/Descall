"use strict";

/**
 * Yönetici Paneli › Sunucu Ağı (hybrid server: Render + the owner's PC; owner only).
 * Mounted inside routes/admin.js, so the admin chain (auth, admin, rate limit, 2FA, step-up
 * for every POST / PUT) runs first; this router adds the owner check. Admin tokens are
 * allowed (they act as the owner).
 *
 *   GET  /nodes                        overview (contract shape + additive fields)
 *   GET  /nodes/metrics?minutes=60     { series: { <nodeId>: [{ t, rss, cpu, conns, p95, err }] } }
 *   PUT  /nodes/pc-config              partial dc:cfg:pc -> { cfg }
 *   POST /nodes/:id/drain              { reason }        graceful drain of a secondary
 *   POST /nodes/:id/resume                               back to active (clears the emergency)
 *   POST /nodes/all-to-render          { reason, confirm: true }  emergency
 *   POST /nodes/drill                                    drain + resume the PC -> { moved, dropped, ms }
 *   GET  /nodes/keys                   node keys (never the secret)
 *   POST /nodes/keys                   { name } -> { key, secret } (secret once)
 *   POST /nodes/keys/:id/revoke        { reason, confirmName }
 *   POST /nodes/alerts/test            a test alert to the owner's phone
 *
 * Every action writes an admin audit entry (system_node_*) and an event row; watchers of
 * the owner room get the new overview at once (admin:nodes). Node keys need the migration
 * (supabase/migrations/20261122_node_cluster.sql): before it, KEYS_UNAVAILABLE (503); the
 * rest works from the cluster API alone.
 */

const express = require("express");
const M = require("../lib/nodeKeys/model");
const store = require("../lib/nodeKeys/store");
const service = require("../lib/nodeKeys/service");
const monitor = require("../lib/nodeKeys/monitor");
const state = require("../runtime/sharedState");
const { userIsSuperAdmin } = require("../middleware/requireAdmin");
const { apiError } = require("../lib/apiError");

const router = express.Router();
const cluster = () => require("../lib/cluster");
const NODE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG = {
  OWNER_ONLY: "Only the owner can manage the server network.",
  BAD_CFG: "Invalid setting: {field}",
  BAD_REASON: `Write a reason (${M.REASON_MIN}-${M.REASON_MAX} characters).`,
  CONFIRM_REQUIRED: "Confirm the emergency move first.",
  CONFIRM_MISMATCH: "The confirmation does not match.",
  NODE_NOT_FOUND: "This node is not connected.",
  NOT_SECONDARY: "Only the PC node can be drained; Render always serves.",
  NO_ACTIVE_PC: "The PC node is not serving right now.",
  NO_PC: "No PC node is connected.",
  DRILL_BUSY: "A failover drill is already running.",
  KEYS_UNAVAILABLE: "Node keys are not set up yet.",
  KEY_LIMIT: `At most ${M.KEY_ACTIVE_MAX} active node keys. Revoke one first.`,
  NAME_REQUIRED: `Give the key a name (1-${M.KEY_NAME_MAX} characters).`,
  KEY_NOT_FOUND: "Node key not found.",
  KEY_REVOKED: "This node key is already revoked.",
  INTERNAL: "Internal server error.",
};

function fail(res, status, code, vars) {
  return res.status(status).json(apiError(MSG[code] || code, vars || null, { code }));
}

function sendError(res, err, what) {
  if (err?.code && MSG[err.code]) return fail(res, err.status || 500, err.code);
  console.error(`[admin-nodes] ${what}:`, err?.message || err);
  return res.status(500).json(apiError(MSG.INTERNAL, null, { code: "INTERNAL" }));
}

async function ownerOnly(req, res, next) {
  try {
    if (req.apiToken || (await userIsSuperAdmin(req))) return next();
  } catch {
    /* refused below */
  }
  return fail(res, 403, "OWNER_ONLY");
}

router.use("/nodes", ownerOnly);

function actor(req) {
  return { id: req.user?.id || null, username: req.user?.username || null, via: req.apiToken ? "token" : "session" };
}

function audit(req, action, target, meta = {}) {
  try {
    state.appendAudit(req.user.id, req.user.username, action, target, meta);
  } catch {
    /* audit optional */
  }
}

/** Watchers of the owner room see the change at once. */
function pushLive(req) {
  const io = req.app?.get?.("io");
  if (!io) return;
  monitor.pushNow(io).catch(() => {});
}

/**
 * The node routing of this process (routes/node.js attachNodeRouting(): runtime.requestNode(id,
 * "drain" | "resume", { reason, detail }) and router.revokeKey(keyId)); null before it is
 * attached (tests, a build without it): then the cluster node state alone is set.
 */
function routing() {
  try {
    const m = require("./node");
    return typeof m?.getNodeRouting === "function" ? m.getNodeRouting() || null : null;
  } catch {
    return null;
  }
}

/**
 * Drain / resume a node. The routing runtime of the target node moves its users (node:move,
 * then paused) or resumes it; the state is also set here so every node and the panel see it
 * at once, even when the target missed the command (it drains itself on its next tick when
 * the emergency switch is on).
 */
async function moveNode(id, action, reason) {
  const r = routing();
  const runtime = r?.runtime;
  if (runtime && typeof runtime.requestNode === "function") {
    try {
      const extra = action === "drain" ? { reason: "drain", detail: String(reason || "").slice(0, 300) || null } : { reason: String(reason || "resume").slice(0, 300) };
      // Not awaited for a drain of this very node: it takes up to 10 s; the panel follows it live.
      const p = runtime.requestNode(id, action === "drain" ? "drain" : "resume", extra);
      if (action !== "drain") await p;
      else Promise.resolve(p).catch(() => {});
    } catch (err) {
      console.warn("[admin-nodes] routing requestNode failed:", err?.message || err);
    }
  }
  await cluster().setNodeState(id, action === "drain" ? "draining" : "active", reason);
}

async function findNode(req, res, { secondary = true } = {}) {
  const id = String(req.params.id || "");
  if (!NODE_ID_RE.test(id)) {
    fail(res, 404, "NODE_NOT_FOUND");
    return null;
  }
  const nodes = await cluster().getNodes();
  const node = nodes.find((n) => n.id === id);
  if (!node) {
    fail(res, 404, "NODE_NOT_FOUND");
    return null;
  }
  if (secondary && !M.isPc(node)) {
    fail(res, 409, "NOT_SECONDARY");
    return null;
  }
  return node;
}

/* ---------------- overview, metrics ---------------- */

router.get("/nodes", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await service.buildOverview());
  } catch (e) {
    sendError(res, e, "overview");
  }
});

router.get("/nodes/metrics", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const minutes = Math.max(5, Math.min(60, Math.floor(Number(req.query.minutes) || 60)));
    const raw = (await cluster().getMetrics(minutes)) || {};
    const series = {};
    for (const [id, list] of Object.entries(raw)) {
      if (!NODE_ID_RE.test(id) || !Array.isArray(list)) continue;
      series[id] = list
        .filter((s) => s && Number.isFinite(Number(s.t)))
        .map((s) => ({ t: Number(s.t), rss: Number(s.rss) || 0, cpu: Number(s.cpu) || 0, conns: Number(s.conns) || 0, p95: Number(s.p95) || 0, err: Number(s.err) || 0 }))
        .sort((a, b) => a.t - b.t);
    }
    res.json({ minutes, series });
  } catch (e) {
    sendError(res, e, "metrics");
  }
});

/* ---------------- PC config ---------------- */

router.put("/nodes/pc-config", async (req, res) => {
  try {
    const before = await service.getCfg();
    const v = M.validateCfgPatch(req.body, before);
    if (!v.ok) return fail(res, 400, "BAD_CFG", { field: v.field });
    const cfg = await service.setCfg(v.patch, actor(req));
    const parts = M.changedParts(before, cfg);
    if (parts.length) {
      audit(req, "system_node_cfg", "node:pc", { parts, ramMb: cfg.ramMb, cores: cfg.cores, loadRule: cfg.loadRule.enabled, gameMode: cfg.gameMode.enabled, schedule: cfg.schedule.enabled, slots: cfg.schedule.slots.length });
      await service.logEvent("cfg_update", { parts, ramMb: cfg.ramMb, cores: cfg.cores, prevRamMb: before.ramMb }, actor(req));
      pushLive(req);
    }
    res.json({ cfg, changed: parts });
  } catch (e) {
    sendError(res, e, "pc-config");
  }
});

/* ---------------- emergency, drill (before /:id routes) ---------------- */

router.post("/nodes/all-to-render", async (req, res) => {
  try {
    const reason = M.cleanReason(req.body?.reason);
    if (!reason) return fail(res, 400, "BAD_REASON");
    if (req.body?.confirm !== true) return fail(res, 400, "CONFIRM_REQUIRED");
    const nodes = await cluster().getNodes();
    const pcs = nodes.filter((n) => M.isPc(n) && n.state !== "down");
    const moving = pcs.reduce((a, n) => a + (Number(n.conns) || 0), 0);
    for (const n of pcs) await moveNode(n.id, "drain", `emergency: ${reason}`);
    const emergency = { on: true, at: new Date().toISOString(), by: req.user?.username || null, reason };
    await service.setCfg({ emergency }, actor(req));
    audit(req, "system_node_all_to_render", "nodes", { reason, nodes: pcs.map((n) => n.id), conns: moving });
    await service.logEvent("all_to_render", { reason, nodes: pcs.map((n) => n.id), conns: moving }, actor(req));
    pushLive(req);
    res.json({ ok: true, nodes: pcs.map((n) => n.id), moving, emergency });
  } catch (e) {
    sendError(res, e, "all-to-render");
  }
});

const drill = { busy: false, timeoutMs: 12000, pollMs: 400 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sumConns = (list) => list.reduce((a, n) => a + (Number(n.conns) || 0), 0);

router.post("/nodes/drill", async (req, res) => {
  if (drill.busy) return fail(res, 409, "DRILL_BUSY");
  drill.busy = true;
  try {
    const c = cluster();
    const nodes = await c.getNodes();
    const pc = nodes.find((n) => M.isPc(n) && n.state === "active");
    if (!pc) return fail(res, 409, nodes.some(M.isPc) ? "NO_ACTIVE_PC" : "NO_PC");
    const before = Number(pc.conns) || 0;
    const renderBefore = sumConns(nodes.filter((n) => !M.isPc(n)));
    const t0 = Date.now();
    await moveNode(pc.id, "drain", "drill");
    let remaining = before;
    let renderAfter = renderBefore;
    let timedOut = true;
    while (Date.now() - t0 < drill.timeoutMs) {
      const now = await c.getNodes();
      const cur = now.find((n) => n.id === pc.id);
      remaining = cur ? Number(cur.conns) || 0 : 0;
      renderAfter = sumConns(now.filter((n) => !M.isPc(n)));
      if (!remaining) {
        timedOut = false;
        break;
      }
      await sleep(drill.pollMs);
    }
    const ms = Date.now() - t0;
    await moveNode(pc.id, "resume", "drill");
    const left = Math.max(0, before - remaining);
    const gained = Math.max(0, renderAfter - renderBefore);
    const result = { nodeId: pc.id, before, moved: Math.min(left, gained), dropped: Math.max(0, left - gained), remaining, ms, timedOut };
    audit(req, "system_node_drill", `node:${pc.id}`, result);
    await service.logEvent("drill", result, actor(req));
    pushLive(req);
    res.json(result);
  } catch (e) {
    sendError(res, e, "drill");
  } finally {
    drill.busy = false;
  }
});

router.post("/nodes/alerts/test", async (req, res) => {
  try {
    const ids = await service.ownerIds();
    const own = req.user?.id ? [...new Set([req.user.id, ...ids])] : ids;
    const push = require("../lib/webPush");
    if (typeof push.sendAdminNodesPush === "function") await push.sendAdminNodesPush(own, { kind: "test", reason: "test", vars: {} });
    audit(req, "system_node_alert_test", "nodes", { recipients: own.length });
    res.json({ ok: true, recipients: own.length });
  } catch (e) {
    sendError(res, e, "alert-test");
  }
});

/* ---------------- node keys ---------------- */

router.get("/nodes/keys", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    if (!(await store.available())) return res.json({ available: false, keys: [], max: M.KEY_ACTIVE_MAX });
    res.json({ available: true, keys: await store.listKeys(), max: M.KEY_ACTIVE_MAX });
  } catch (e) {
    sendError(res, e, "keys");
  }
});

router.post("/nodes/keys", async (req, res) => {
  try {
    const name = M.cleanName(req.body?.name);
    if (!name) return fail(res, 400, "NAME_REQUIRED");
    if (!(await store.available())) return fail(res, 503, "KEYS_UNAVAILABLE");
    const { key, secret } = await store.createKey({ name, actorId: req.user?.id });
    audit(req, "system_node_key_create", `node_key:${key.id}`, { name, prefix: key.prefix, last4: key.last4 });
    await service.logEvent("key_create", { name, masked: key.masked }, actor(req));
    res.set("Cache-Control", "no-store");
    res.status(201).json({ key, secret });
  } catch (e) {
    sendError(res, e, "key-create");
  }
});

router.post("/nodes/keys/:id/revoke", async (req, res) => {
  try {
    if (!UUID_RE.test(String(req.params.id))) return fail(res, 404, "KEY_NOT_FOUND");
    const reason = M.cleanReason(req.body?.reason);
    if (!reason) return fail(res, 400, "BAD_REASON");
    if (!(await store.available())) return fail(res, 503, "KEYS_UNAVAILABLE");
    const row = await store.getKey(req.params.id);
    if (!row) return fail(res, 404, "KEY_NOT_FOUND");
    if (String(req.body?.confirmName ?? "").trim() !== row.name) return fail(res, 400, "CONFIRM_MISMATCH");
    const key = await store.revokeKey(row.id, { reason, actorId: req.user?.id });
    audit(req, "system_node_key_revoke", `node_key:${row.id}`, { name: row.name, reason });
    await service.logEvent("key_revoke", { name: row.name, masked: key.masked, reason }, actor(req));
    try {
      cluster().publish("dc:inval", { kind: "node_key", id: row.id });
    } catch {
      /* other nodes recheck within seconds anyway */
    }
    // The routing layer drops the PC registered with this key at once (its users move to Render).
    try {
      const r = routing();
      const revokeKey = r?.router?.revokeKey || r?.revokeKey;
      if (typeof revokeKey === "function") await revokeKey.call(r.router || r, row.id);
    } catch (err) {
      console.warn("[admin-nodes] routing revokeKey failed:", err?.message || err);
    }
    pushLive(req);
    res.json({ key });
  } catch (e) {
    sendError(res, e, "key-revoke");
  }
});

/* ---------------- one node ---------------- */

router.post("/nodes/:id/drain", async (req, res) => {
  try {
    const reason = M.cleanReason(req.body?.reason);
    if (!reason) return fail(res, 400, "BAD_REASON");
    const node = await findNode(req, res);
    if (!node) return;
    await moveNode(node.id, "drain", reason);
    audit(req, "system_node_drain", `node:${node.id}`, { reason, conns: Number(node.conns) || 0 });
    await service.logEvent("node_drain", { nodeId: node.id, reason, conns: Number(node.conns) || 0 }, actor(req));
    pushLive(req);
    res.json({ ok: true, nodeId: node.id, state: "draining", moving: Number(node.conns) || 0 });
  } catch (e) {
    sendError(res, e, "drain");
  }
});

router.post("/nodes/:id/resume", async (req, res) => {
  try {
    const node = await findNode(req, res);
    if (!node) return;
    await moveNode(node.id, "resume", "resume");
    const cfg = await service.getCfg();
    if (cfg.emergency?.on) await service.setCfg({ emergency: { on: false, at: new Date().toISOString(), by: req.user?.username || null, reason: null } }, actor(req));
    audit(req, "system_node_resume", `node:${node.id}`, { prev: node.state, emergency: Boolean(cfg.emergency?.on) });
    await service.logEvent("node_resume", { nodeId: node.id, prev: node.state }, actor(req));
    pushLive(req);
    res.json({ ok: true, nodeId: node.id, state: "active" });
  } catch (e) {
    sendError(res, e, "resume");
  }
});

router.__drill = drill;

module.exports = router;
