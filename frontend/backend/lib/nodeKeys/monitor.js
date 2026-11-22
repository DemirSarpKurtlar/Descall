"use strict";

/**
 * Sunucu Ağı background work, leader only (the cluster lock; always true in single-node):
 *   - phone alerts to the owner: the PC dropped without a graceful drain (pcDown), the Key
 *     Value store is 90 % full or unreachable (kvFull), Render memory at 90 % (render90);
 *     each one fires once and re-arms when the condition clears (memory under 80 %), and
 *     only when its switch in cfg.alerts is on. Every alert is also an event row and a
 *     live `admin:nodes-alert` in the owner's room.
 *   - the saved-cost ledger: minutes the PC served this month times its RAM share.
 * And the live push: an owner socket sends `admin:nodes:watch`, joins the owner-only room
 * "admin:nodes" and gets the overview as `admin:nodes` every 5 s while anyone watches.
 */

const M = require("./model");
const service = require("./service");
const store = require("./store");

const TICK_MS = 30 * 1000;
const PUSH_MS = 5 * 1000;
const ROOM = "admin:nodes";
const STALE_MS = 30 * 1000;

const cluster = () => require("../cluster");

let ioRef = null;
let timer = null;
let pushTimer = null;
let lastTick = 0;
let armed = { pcDown: null, kvFull: null, render90: null, pcWasActive: false, kvWasOk: null };
let sender = null;

/**
 * Pure: which alerts fire for this snapshot, and the next state.
 * @returns {{ next: object, fire: { kind: string, reason: string, vars: object }[] }}
 */
function evaluate(prev, { nodes = [], kv = {}, kvConfigured = false, now = Date.now() } = {}) {
  const next = { ...prev };
  const fire = [];
  const pc = nodes.find(M.isPc);
  const primary = nodes.find((n) => !M.isPc(n));
  const pcFresh = pc && pc.state !== "down" && (!pc.lastBeat || now - Date.parse(pc.lastBeat) < STALE_MS);
  const pcActive = Boolean(pcFresh && pc.state === "active");
  if (prev.pcWasActive && !pcFresh) {
    fire.push({ kind: "pcDown", reason: "lost", vars: { node: prev.pcId || "pc" } });
  }
  // A graceful drain or a pause passes through a non-active state first, so it never fires.
  next.pcWasActive = pcActive;
  if (pc) next.pcId = pc.id;

  if (primary && Number(primary.memLimit) > 0) {
    const pct = (Number(primary.memRss) || 0) / Number(primary.memLimit);
    if (pct >= 0.9 && !prev.render90) {
      fire.push({ kind: "render90", reason: "high", vars: { pct: Math.round(pct * 100) } });
      next.render90 = now;
    } else if (pct < 0.8) next.render90 = null;
  }

  const kvPct = kv?.ok && Number(kv.maxMb) > 0 ? (Number(kv.usedMb) || 0) / Number(kv.maxMb) : 0;
  if (kv?.ok && kvPct >= 0.9 && !prev.kvFull) {
    fire.push({ kind: "kvFull", reason: "full", vars: { pct: Math.round(kvPct * 100) } });
    next.kvFull = now;
  } else if (kvConfigured && !kv?.ok && prev.kvWasOk === true && !prev.kvFull) {
    fire.push({ kind: "kvFull", reason: "down", vars: {} });
    next.kvFull = now;
  } else if (kv?.ok && kvPct < 0.8) next.kvFull = null;
  if (kvConfigured) next.kvWasOk = Boolean(kv?.ok);
  return { next, fire };
}

async function defaultSend(userIds, alert) {
  const push = require("../webPush");
  if (typeof push.sendAdminNodesPush === "function") await push.sendAdminNodesPush(userIds, alert);
}

async function fireAlert(alert, cfg) {
  await service.logEvent(`alert_${alert.kind}`, { reason: alert.reason, ...alert.vars });
  try {
    ioRef?.to?.(ROOM)?.emit?.("admin:nodes-alert", { ...alert, at: new Date().toISOString() });
  } catch {
    /* live optional */
  }
  if (!M.normalizeCfg(cfg).alerts[alert.kind]) return false;
  try {
    const ids = await service.ownerIds();
    if (ids.length) await (sender || defaultSend)(ids, alert);
    return true;
  } catch (err) {
    console.warn("[nodes] alert push failed:", String(err?.message || err).slice(0, 200));
    return false;
  }
}

async function tick(now = Date.now()) {
  const c = cluster();
  let leader = true;
  try {
    leader = Boolean(c.isLeader());
  } catch {
    leader = true;
  }
  if (!leader) return { skipped: true };
  const [nodes, kv, cfg] = await Promise.all([c.getNodes().catch(() => []), c.kvStatus().catch(() => ({ ok: false })), service.getCfg().catch(() => M.normalizeCfg(null))]);
  const minutes = lastTick ? Math.min(2 * TICK_MS, Math.max(0, now - lastTick)) / 60000 : 0;
  lastTick = now;
  const pc = nodes.find(M.isPc);
  if (pc && pc.state === "active" && minutes > 0) {
    const ramMb = Number(pc.memLimit) || M.normalizeCfg(cfg).ramMb;
    await store.addLedger({ minutes, ramMb, now });
  }
  const { next, fire } = evaluate(armed, { nodes, kv, kvConfigured: Boolean(process.env.REDIS_URL), now });
  armed = next;
  const sent = [];
  for (const a of fire) sent.push({ ...a, pushed: await fireAlert(a, cfg) });
  return { fired: sent };
}

/* ---------------- live push ---------------- */

function roomSize(io) {
  try {
    return io?.sockets?.adapter?.rooms?.get(ROOM)?.size || 0;
  } catch {
    return 0;
  }
}

async function pushNow(io = ioRef) {
  if (!io) return null;
  const payload = await service.buildOverview();
  io.to(ROOM).emit("admin:nodes", payload);
  return payload;
}

function ensurePushLoop(io) {
  if (pushTimer) return;
  pushTimer = setInterval(() => {
    if (!roomSize(io)) {
      clearInterval(pushTimer);
      pushTimer = null;
      return;
    }
    pushNow(io).catch(() => {});
  }, PUSH_MS);
  pushTimer.unref?.();
}

async function isOwnerSocket(socket) {
  const u = socket?.user;
  if (!u?.id) return false;
  if (u.username === "admin" || socket.apiToken) return true;
  try {
    const { data } = await require("../../db/supabase").from("users").select("is_super_admin").eq("id", u.id).maybeSingle();
    return Boolean(data?.is_super_admin);
  } catch {
    return false;
  }
}

/** socket/handlers.js: register the watch events on every socket (owner check inside). */
function setupSocket(io, socket) {
  ioRef = ioRef || io;
  socket.on("admin:nodes:watch", async () => {
    if (!(await isOwnerSocket(socket))) return socket.emit("admin:error", { code: "OWNER_ONLY" });
    socket.join(ROOM);
    ensurePushLoop(io);
    try {
      socket.emit("admin:nodes", await service.buildOverview());
    } catch {
      /* the loop retries */
    }
  });
  socket.on("admin:nodes:unwatch", () => {
    try {
      socket.leave(ROOM);
    } catch {
      /* gone */
    }
  });
}

/** server.js boot: the leader-only alert / ledger tick (unref'd, off in tests). */
function start(io, { tickMs = TICK_MS } = {}) {
  ioRef = io || ioRef;
  if (timer || process.env.NODE_ENV === "test") return;
  timer = setInterval(() => tick().catch((e) => console.warn("[nodes] tick failed:", e?.message || e)), tickMs);
  timer.unref?.();
}

function stop() {
  clearInterval(timer);
  clearInterval(pushTimer);
  timer = null;
  pushTimer = null;
}

function __setForTests({ io, send } = {}) {
  if (io !== undefined) ioRef = io;
  if (send !== undefined) sender = send;
}

function __resetForTests() {
  stop();
  lastTick = 0;
  armed = { pcDown: null, kvFull: null, render90: null, pcWasActive: false, kvWasOk: null };
}

module.exports = { ROOM, PUSH_MS, evaluate, tick, pushNow, setupSocket, start, stop, isOwnerSocket, __setForTests, __resetForTests };
