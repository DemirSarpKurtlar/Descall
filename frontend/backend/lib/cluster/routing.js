"use strict";

/**
 * Hybrid server routing (Render primary + the owner's PC as a secondary node).
 *
 *  - decide(): which node a NEW client should use (GET /api/node/assign).
 *      single-node mode (no Redis)                  -> this node
 *      PC eligible only when: its node entry is alive (beat < 15 s), state "active", it
 *      registered with a valid node key, it is inside the schedule (Europe/Istanbul) and
 *      it is not in full-handover game mode.
 *      Load rule (dc:cfg:pc loadRule): new users go to the PC when Render memory % >
 *      renderHighPct, back to Render when the PC memory % of its share > pcHighPct.
 *      Hysteresis (bandPct + minimum dwell) keeps the target from flapping, and a user
 *      stays on the node they got for the session (sticky by tab session id / prev hint).
 *  - createNodeRuntime(): the graceful drain of THIS node (state draining -> node:move to
 *    its own sockets with jitter -> wait until ~0 connections or 10 s -> drain-done event),
 *    the drain/resume command channel and the secondary's rebalance tick (out of schedule,
 *    game mode, revoked key, over its share).
 *
 * Everything here is opt-in: with no REDIS_URL / DESCALL_NODE_* the cluster API is in
 * single-node mode and decide() simply answers this node.
 */

const DEFAULT_PRIMARY_URL = "https://des-call.onrender.com";
const ALIVE_MS = 15_000;
const DEFAULT_BAND_PCT = 10;
const DEFAULT_DWELL_MS = 30_000;
const DEFAULT_STICKY_MS = 12 * 60 * 60 * 1000;
const DEFAULT_TTL_SEC = 600;
const REGISTRATION_FRESH_MS = 3 * 60 * 1000;
const DRAIN_TIMEOUT_MS = 10_000;
const DRAIN_JITTER_MS = 3_000;
const CMD_CHANNEL = "dc:node:cmd";
const DRAINED_CHANNEL = "dc:node:drained";
const MOVE_REASONS = new Set(["drain", "rebalance", "schedule", "game"]);
const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function cleanUrl(u) {
  return String(u || "").trim().replace(/\/+$/, "");
}

/* ---------------------------------------------------------------- schedule */

const fmtCache = new Map();
function formatterFor(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Local weekday (0 = Sunday) and minute of the day in `tz`. Pure. */
function zonedParts(nowMs, tz = "Europe/Istanbul") {
  let parts;
  try {
    parts = formatterFor(tz).formatToParts(new Date(nowMs));
  } catch {
    parts = formatterFor("Europe/Istanbul").formatToParts(new Date(nowMs));
  }
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  const day = DAY_INDEX[get("weekday")] ?? 0;
  const hour = num(get("hour"), 0) % 24;
  const minute = num(get("minute"), 0);
  return { day, minutes: hour * 60 + minute };
}

function hhmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59 || (h === 24 && mm !== 0)) return null;
  return h * 60 + mm;
}

/**
 * Is `nowMs` inside one of the schedule slots? A slot { d, from, to } starts on weekday d
 * (0 = Sunday, Europe/Istanbul by default) and may run past midnight (to < from means it
 * ends on the next day). No schedule, schedule.enabled === false or no slots = always on.
 */
function inSchedule(schedule, nowMs) {
  if (!schedule || schedule.enabled === false) return true;
  const slots = Array.isArray(schedule.slots) ? schedule.slots : [];
  if (!slots.length) return true;
  const { day, minutes } = zonedParts(nowMs, schedule.tz || "Europe/Istanbul");
  for (const slot of slots) {
    const d = Number(slot && slot.d);
    const from = hhmm(slot && slot.from);
    const to = hhmm(slot && slot.to);
    if (!Number.isInteger(d) || d < 0 || d > 6 || from == null || to == null) continue;
    if (from === to) {
      if (day === d) return true; // whole day
      continue;
    }
    if (from < to) {
      if (day === d && minutes >= from && minutes < to) return true;
    } else {
      if (day === d && minutes >= from) return true;
      if (day === (d + 1) % 7 && minutes < to) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------- eligibility */

function isAlive(node, nowMs) {
  if (!node || node.alive === false) return false;
  const beat = num(node.lastBeat, 0);
  return beat > 0 && nowMs - beat <= ALIVE_MS;
}

/** Game detected on the PC (node entry) and the feature is on in the config. */
function gameActive(node, cfg) {
  const g = node && node.gameMode;
  const on = g === true || (g && typeof g === "object" && g.active === true);
  return Boolean(on) && !(cfg && cfg.gameMode && cfg.gameMode.enabled === false);
}

/** The PC's RAM share in MB (game mode share when a game is running and not handing over). */
function pcShareMb(node, cfg) {
  const base = num(cfg && cfg.ramMb, 0) || num(node && node.memLimit, 0) || 2048;
  if (gameActive(node, cfg) && !(cfg.gameMode && cfg.gameMode.fullHandover)) {
    const share = num(cfg.gameMode && cfg.gameMode.shareMb, 0);
    if (share > 0) return Math.min(base, share);
  }
  return base;
}

function memPct(rssMb, capMb) {
  const cap = num(capMb, 0);
  if (cap <= 0) return 0;
  return Math.max(0, (num(rssMb, 0) / cap) * 100);
}

/**
 * Why the PC can or cannot take users right now. Pure.
 * @returns {{ ok: boolean, reason: string }}
 */
function pcEligibility(node, cfg, nowMs, { registered = true } = {}) {
  if (!node) return { ok: false, reason: "missing" };
  if (!isAlive(node, nowMs)) return { ok: false, reason: "down" };
  if (node.state !== "active") return { ok: false, reason: `state:${node.state || "unknown"}` };
  if (!registered) return { ok: false, reason: "unregistered" };
  if (!cleanUrl(node.url)) return { ok: false, reason: "no-url" };
  if (!inSchedule(cfg && cfg.schedule, nowMs)) return { ok: false, reason: "schedule" };
  if (gameActive(node, cfg) && cfg.gameMode && cfg.gameMode.fullHandover) return { ok: false, reason: "game" };
  return { ok: true, reason: "ok" };
}

function loadRule(cfg) {
  const r = (cfg && cfg.loadRule) || {};
  return {
    enabled: r.enabled !== false,
    preferPc: r.preferPc === true,
    renderHighPct: Math.min(99, Math.max(1, num(r.renderHighPct, 60))),
    pcHighPct: Math.min(99, Math.max(1, num(r.pcHighPct, 85))),
  };
}

/**
 * Next target for new users. Pure; `mode` is "primary" or "pc".
 *  primary -> pc      Render above renderHighPct and the PC below pcHighPct - band
 *  pc      -> primary the PC at/above pcHighPct (at once), or Render back below
 *                     renderHighPct - band (after the dwell time)
 * preferPc: the PC takes new users whenever it is under its cap (Render is the overflow).
 */
function nextMode(mode, { renderPct, pcPct, rule, bandPct = DEFAULT_BAND_PCT, sinceMs = Infinity, dwellMs = DEFAULT_DWELL_MS }) {
  const band = Math.max(0, num(bandPct, DEFAULT_BAND_PCT));
  const settled = sinceMs >= dwellMs;
  if (!rule.enabled) return "primary";
  if (rule.preferPc) {
    if (mode === "pc") return pcPct >= rule.pcHighPct ? "primary" : "pc";
    return pcPct < rule.pcHighPct - band && settled ? "pc" : "primary";
  }
  if (mode === "pc") {
    if (pcPct >= rule.pcHighPct) return "primary";
    if (renderPct < rule.renderHighPct - band && settled) return "primary";
    return "pc";
  }
  if (renderPct > rule.renderHighPct && pcPct < rule.pcHighPct - band && settled) return "pc";
  return "primary";
}

/* ------------------------------------------------------------------ router */

/**
 * @param {object} opts
 * @param {object} opts.cluster  lib/cluster API
 * @param {() => number} [opts.now]
 */
function createRouter(opts = {}) {
  const cluster = opts.cluster || require("./index");
  const now = opts.now || (() => Date.now());
  const env = opts.env || process.env;
  const bandPct = num(opts.bandPct, DEFAULT_BAND_PCT);
  const dwellMs = num(opts.dwellMs, DEFAULT_DWELL_MS);
  const stickyMs = num(opts.stickyMs, DEFAULT_STICKY_MS);
  const ttlSec = num(opts.ttlSec, DEFAULT_TTL_SEC);
  const requireRegistration = opts.requireRegistration !== false;

  let mode = "primary";
  let modeSince = now() - dwellMs; // the first switch needs no wait
  const sticky = new Map(); // sid -> { nodeId, until }
  const registry = new Map(); // nodeId -> { keyId, at, revoked }
  const bootAt = now();

  function primaryFallbackUrl() {
    return cleanUrl(env.DESCALL_PRIMARY_URL) || DEFAULT_PRIMARY_URL;
  }

  function selfAnswer(reason) {
    const url = cleanUrl(cluster.publicUrl);
    return { nodeId: cluster.nodeId, url, socketUrl: url, ttlSec, reason };
  }

  function isRegistered(nodeId) {
    if (!requireRegistration) return true;
    const row = registry.get(nodeId);
    if (row && row.revoked) return false;
    if (row && now() - row.at <= REGISTRATION_FRESH_MS) return true;
    // Just after this process started (a Render restart forgets the registry): trust the
    // node entry until the secondary's next register call (every 60 s) has had time to land.
    return !row && now() - bootAt <= REGISTRATION_FRESH_MS;
  }

  /** Returns true for a first (or changed-key, or post-revocation) registration. */
  function recordRegistration(nodeId, keyId, info = {}) {
    const prev = registry.get(nodeId);
    registry.set(nodeId, { keyId: keyId || null, at: now(), revoked: false, info });
    return !prev || prev.revoked || prev.keyId !== (keyId || null);
  }

  /** Node key revoked (admin): every node that registered with it stops getting users. */
  function revokeKey(keyId) {
    let n = 0;
    for (const row of registry.values()) {
      if (keyId && row.keyId === keyId) {
        row.revoked = true;
        n += 1;
      }
    }
    return n;
  }

  function forgetNode(nodeId) {
    const row = registry.get(nodeId);
    if (row) row.revoked = true;
  }

  function pruneSticky() {
    if (sticky.size < 5000) return;
    const t = now();
    for (const [k, v] of sticky) if (v.until <= t) sticky.delete(k);
  }

  /** Current topology: primary node, the best PC candidate, both memory figures. */
  async function snapshot() {
    const [nodes, cfg] = await Promise.all([cluster.getNodes(), cluster.getCfg()]);
    const list = Array.isArray(nodes) ? nodes : [];
    const t = now();
    const primary = list.find((n) => n && n.role === "primary") || (cluster.role === "primary" ? list.find((n) => n && n.id === cluster.nodeId) : null) || null;
    const pcs = list.filter((n) => n && n.role === "secondary");
    let pc = null;
    let pcWhy = { ok: false, reason: "missing" };
    for (const cand of pcs) {
      const why = pcEligibility(cand, cfg, t, { registered: isRegistered(cand.id) });
      if (why.ok) {
        pc = cand;
        pcWhy = why;
        break;
      }
      if (!pc && pcWhy.reason === "missing") pcWhy = why;
    }
    const renderPct = primary ? memPct(primary.memRss, primary.memLimit) : 0;
    const pcPct = pc ? memPct(pc.memRss, pcShareMb(pc, cfg)) : 100;
    return { cfg, primary, pc, pcWhy, renderPct, pcPct, rule: loadRule(cfg), nodes: list };
  }

  function primaryAnswer(snap, reason) {
    const url = cleanUrl(snap.primary && snap.primary.url) || (cluster.role === "primary" ? cleanUrl(cluster.publicUrl) : "") || primaryFallbackUrl();
    const nodeId = (snap.primary && snap.primary.id) || (cluster.role === "primary" ? cluster.nodeId : "render");
    return { nodeId, url, socketUrl: url, ttlSec, reason };
  }

  function pcAnswer(snap, reason) {
    const url = cleanUrl(snap.pc.url);
    return { nodeId: snap.pc.id, url, socketUrl: url, ttlSec, reason };
  }

  /**
   * @param {{ sid?: string, prev?: string }} [hint] sid = the tab's session id, prev = the
   *   node the client used before (sticky across a primary restart).
   */
  async function decide(hint = {}) {
    if (!cluster.enabled()) return selfAnswer("single");
    let snap;
    try {
      snap = await snapshot();
    } catch {
      return selfAnswer("kv-error");
    }
    const t = now();
    if (!snap.pc) {
      if (mode !== "primary") {
        mode = "primary";
        modeSince = t;
      }
      return primaryAnswer(snap, `pc-${snap.pcWhy.reason}`);
    }

    const next = nextMode(mode, { renderPct: snap.renderPct, pcPct: snap.pcPct, rule: snap.rule, bandPct, sinceMs: t - modeSince, dwellMs });
    if (next !== mode) {
      mode = next;
      modeSince = t;
    }

    // Sticky: the node this tab already uses keeps it while that node can take it.
    const sid = typeof hint.sid === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(hint.sid) ? hint.sid : "";
    const stuck = sid ? sticky.get(sid) : null;
    const prevId = stuck && stuck.until > t ? stuck.nodeId : typeof hint.prev === "string" ? hint.prev : "";
    let answer = null;
    if (prevId && prevId === snap.pc.id && snap.pcPct < snap.rule.pcHighPct) answer = pcAnswer(snap, "sticky");
    else if (prevId && snap.primary && prevId === snap.primary.id) answer = primaryAnswer(snap, "sticky");
    if (!answer) answer = mode === "pc" ? pcAnswer(snap, "load") : primaryAnswer(snap, "load");

    if (sid) {
      pruneSticky();
      sticky.set(sid, { nodeId: answer.nodeId, until: t + stickyMs });
    }
    return answer;
  }

  return {
    decide,
    snapshot,
    recordRegistration,
    revokeKey,
    forgetNode,
    isRegistered,
    get mode() {
      return mode;
    },
    primaryUrl: async () => primaryAnswer(await snapshot().catch(() => ({ primary: null })), "primary").url,
    primaryFallbackUrl,
  };
}

/* ----------------------------------------------------------------- runtime */

function localConnCount(io) {
  if (!io) return 0;
  const engine = io.engine;
  if (engine && Number.isFinite(engine.clientsCount)) return engine.clientsCount;
  const ns = typeof io.of === "function" ? io.of("/") : null;
  return ns && ns.sockets ? ns.sockets.size : 0;
}

/**
 * This node's drain / resume / rebalance.
 * @param {object} opts
 * @param {object} opts.cluster
 * @param {object} opts.io           socket.io Server of THIS node
 * @param {object} [opts.router]     createRouter() result (primary URL lookup)
 * @param {Function} [opts.fetchImpl] for the secondary -> primary calls
 */
function createNodeRuntime(opts = {}) {
  const cluster = opts.cluster || require("./index");
  const io = opts.io || null;
  const router = opts.router || createRouter({ cluster, env: opts.env });
  const env = opts.env || process.env;
  const now = opts.now || (() => Date.now());
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const pollMs = num(opts.pollMs, 200);
  const log = opts.log || ((...a) => console.info("[node]", ...a));

  let draining = null; // in-flight drain promise
  let pausedLocal = false; // this runtime drained the node and has not resumed it yet
  let autoPaused = null; // "schedule" | "game" | "revoked" when this runtime paused itself
  let lastRegisterAt = 0;
  let timer = null;
  let unsub = null;
  let unsubDrained = null;
  const drainWaiters = new Map(); // nodeId -> Set<fn>

  async function primaryUrl() {
    if (cluster.role === "secondary") return cleanUrl(env.DESCALL_PRIMARY_URL) || (await router.primaryUrl());
    return router.primaryUrl();
  }

  async function callPrimary(path, body) {
    const key = String(env.DESCALL_NODE_KEY || "");
    if (!fetchImpl || !key) return { ok: false, status: 0 };
    try {
      const res = await fetchImpl(`${await primaryUrl()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body || {}),
      });
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { ok: res.ok, status: res.status, json };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  function moveReason(r) {
    return MOVE_REASONS.has(r) ? r : "drain";
  }

  /**
   * Graceful drain of this node. Resolves { moved, dropped, ms }.
   * state draining -> node:move to this node's sockets (clients wait 0..jitterMs) ->
   * wait until no connection is left or timeoutMs -> close the rest -> state `after`.
   */
  function drainSelf({ reason = "drain", detail = null, timeoutMs = DRAIN_TIMEOUT_MS, jitterMs = DRAIN_JITTER_MS, after = "paused" } = {}) {
    if (draining) return draining;
    const started = now();
    draining = (async () => {
      const why = moveReason(reason);
      const startConns = localConnCount(io);
      await cluster.setNodeState(cluster.nodeId, "draining", why);
      await cluster.pushEvent("node:drain-start", { reason: why, detail, conns: startConns });
      const toUrl = await primaryUrl();
      if (io && io.local) io.local.emit("node:move", { reason: why, toUrl, jitterMs });
      const limit = Math.max(0, num(timeoutMs, DRAIN_TIMEOUT_MS));
      while (localConnCount(io) > 0 && now() - started < limit) await sleep(pollMs);
      const left = localConnCount(io);
      if (left > 0 && io && io.local) io.local.disconnectSockets(true);
      const result = { moved: Math.max(0, startConns - left), dropped: left, ms: now() - started };
      await cluster.setNodeState(cluster.nodeId, after, why);
      pausedLocal = after !== "active";
      await cluster.pushEvent("node:drain-done", { reason: why, detail, ...result });
      try {
        cluster.publish(DRAINED_CHANNEL, { id: cluster.nodeId, ...result });
      } catch {
        /* pub/sub is best effort */
      }
      if (cluster.role === "secondary") await callPrimary("/api/node/drain-done", { id: cluster.nodeId, ...result });
      log(`drained (${why}): moved ${result.moved}, dropped ${result.dropped}, ${result.ms} ms`);
      return result;
    })().finally(() => {
      draining = null;
    });
    return draining;
  }

  async function resumeSelf(reason = "resume") {
    autoPaused = null;
    pausedLocal = false;
    await cluster.setNodeState(cluster.nodeId, "active", reason);
    await cluster.pushEvent("node:resume", { reason });
  }

  /** Move `count` of this node's sockets (rebalance / game share), newest first. */
  async function moveSome(count, reason, jitterMs = DRAIN_JITTER_MS) {
    if (!io || count <= 0) return 0;
    const toUrl = await primaryUrl();
    const sockets = [...((io.of("/").sockets && io.of("/").sockets.values()) || [])].reverse();
    let n = 0;
    for (const s of sockets) {
      if (n >= count) break;
      s.emit("node:move", { reason: moveReason(reason), toUrl, jitterMs });
      n += 1;
    }
    if (n) await cluster.pushEvent("node:rebalance", { reason: moveReason(reason), moved: n });
    return n;
  }

  /** A drain finished somewhere (drain-done POST or pub/sub). */
  function notifyDrained(id, result) {
    const set = drainWaiters.get(id);
    if (!set) return;
    drainWaiters.delete(id);
    for (const fn of set) fn(result || {});
  }

  function waitForDrainDone(id, timeoutMs = DRAIN_TIMEOUT_MS + 5000) {
    return new Promise((resolve) => {
      let set = drainWaiters.get(id);
      if (!set) drainWaiters.set(id, (set = new Set()));
      const t = setTimeout(() => {
        set.delete(fn);
        resolve(null);
      }, timeoutMs);
      const fn = (r) => {
        clearTimeout(t);
        resolve(r);
      };
      set.add(fn);
    });
  }

  /** Ask a node (possibly this one) to drain or resume (admin actions, drill). */
  async function requestNode(id, cmd, extra = {}) {
    if (id === cluster.nodeId) {
      if (cmd === "drain") return drainSelf(extra);
      if (cmd === "resume") return resumeSelf(extra.reason || "resume");
      return null;
    }
    cluster.publish(CMD_CHANNEL, { to: id, cmd, ...extra });
    return null;
  }

  async function register() {
    const cores = require("os").cpus().length;
    const res = await callPrimary("/api/node/register", {
      id: cluster.nodeId,
      url: cluster.publicUrl,
      version: env.npm_package_version || "",
      memoryMb: num(env.DESCALL_NODE_MEMORY_MB, 0) || null,
      cores,
    });
    lastRegisterAt = now();
    return res;
  }

  /**
   * One rebalance step of a secondary: leave when out of schedule, on a full-handover game,
   * when the node key was revoked; come back when that clears; shed sockets above the share.
   */
  async function tick() {
    if (cluster.role !== "secondary" || !cluster.enabled() || draining) return;
    if (!lastRegisterAt || now() - lastRegisterAt >= 60_000) {
      const reg = await register();
      if (reg.status === 401 || reg.status === 403) {
        const self = (await cluster.getNodes()).find((n) => n && n.id === cluster.nodeId);
        if (self && self.state === "active") {
          autoPaused = "revoked";
          await drainSelf({ reason: "drain", detail: "revoked" });
        }
        return;
      }
      if (reg.ok && autoPaused === "revoked") autoPaused = null;
    }
    const [nodes, cfg] = await Promise.all([cluster.getNodes(), cluster.getCfg()]);
    const self = (nodes || []).find((n) => n && n.id === cluster.nodeId);
    if (!self) return;
    const t = now();
    const outOfSchedule = !inSchedule(cfg && cfg.schedule, t);
    const handover = gameActive(self, cfg) && Boolean(cfg.gameMode && cfg.gameMode.fullHandover);
    if (self.state === "active") {
      if (outOfSchedule) {
        autoPaused = "schedule";
        await drainSelf({ reason: "schedule" });
        return;
      }
      if (handover) {
        autoPaused = "game";
        await drainSelf({ reason: "game" });
        return;
      }
      const rule = loadRule(cfg);
      const pct = memPct(self.memRss, pcShareMb(self, cfg));
      if (pct > rule.pcHighPct && io) {
        // Shed enough sockets to get back under the cap minus the band.
        const conns = localConnCount(io);
        const target = Math.max(0, rule.pcHighPct - DEFAULT_BAND_PCT);
        const share = Math.min(0.5, Math.max(0.05, (pct - target) / pct));
        await moveSome(Math.ceil(conns * share), gameActive(self, cfg) ? "game" : "rebalance");
      }
      return;
    }
    if (self.state === "paused" && autoPaused && autoPaused !== "revoked") {
      // Only a pause this runtime made itself is lifted; an admin pause stays.
      if (!outOfSchedule && !handover) await resumeSelf(`auto:${autoPaused}`);
    }
  }

  function start({ intervalMs = 5000 } = {}) {
    if (!unsub) {
      unsub = cluster.subscribe(CMD_CHANNEL, (msg) => {
        const m = typeof msg === "string" ? safeJson(msg) : msg;
        if (!m || m.to !== cluster.nodeId) return;
        if (m.cmd === "drain") drainSelf({ reason: m.reason, detail: m.detail || null, jitterMs: num(m.jitterMs, DRAIN_JITTER_MS), timeoutMs: num(m.timeoutMs, DRAIN_TIMEOUT_MS) }).catch(() => {});
        else if (m.cmd === "resume") resumeSelf(m.reason || "resume").catch(() => {});
      });
      unsubDrained = cluster.subscribe(DRAINED_CHANNEL, (msg) => {
        const m = typeof msg === "string" ? safeJson(msg) : msg;
        if (m && m.id) notifyDrained(m.id, m);
      });
    }
    if (!timer && cluster.role === "secondary") {
      timer = setInterval(() => {
        tick().catch((e) => log("tick failed:", e && e.message));
      }, intervalMs);
      if (timer.unref) timer.unref();
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (typeof unsub === "function") unsub();
    if (typeof unsubDrained === "function") unsubDrained();
    unsub = null;
    unsubDrained = null;
  }

  return {
    drainSelf,
    resumeSelf,
    moveSome,
    requestNode,
    waitForDrainDone,
    notifyDrained,
    register,
    tick,
    start,
    stop,
    isDraining: () => Boolean(draining),
    /** False while this node drains or stays paused after its own drain (new sockets refused). */
    acceptsConnections: () => !draining && !pausedLocal,
    get autoPaused() {
      return autoPaused;
    },
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

module.exports = {
  createRouter,
  createNodeRuntime,
  zonedParts,
  inSchedule,
  isAlive,
  gameActive,
  pcShareMb,
  memPct,
  pcEligibility,
  loadRule,
  nextMode,
  localConnCount,
  CMD_CHANNEL,
  DRAINED_CHANNEL,
  ALIVE_MS,
  DEFAULT_PRIMARY_URL,
};
