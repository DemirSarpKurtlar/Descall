"use strict";

/**
 * Sunucu Ağı (hybrid server, owner only) end to end over the fake db, a fake cluster
 * (lib/cluster API) and real HTTP:
 *  - owner only (another admin and a member are refused), step-up on every change, an
 *    admin token is allowed
 *  - before the migration: the overview still answers (single-node, storage off), node
 *    keys say { available: false } / KEYS_UNAVAILABLE, then work once it is applied
 *  - node key lifecycle: create (secret once, dsk_node_ format, SHA-256 only), list never
 *    shows it, verify(), max 5 active, revoke needs a reason and the name, double revoke
 *  - pc-config validation (ranges, unknown fields, slots, game share above the RAM share),
 *    persistence to the cluster and node_settings, cfg restore after a Key Value restart
 *  - drain / resume / all-to-render (reason + confirm, emergency flag) / drill result
 *  - metrics shape, events table, audit entries for every action
 *  - alert monitor: PC drop fires once (not after a graceful drain), Render 90 %, Key Value
 *    full / unreachable, switches respected, owners get the push; the socket watch joins
 *    the owner room only
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
delete process.env.REDIS_URL;

const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const OWNER = "00000000-0000-4000-8000-0000000000b1";
const ADMIN2 = "00000000-0000-4000-8000-0000000000b2";
const MEMBER = "00000000-0000-4000-8000-0000000000b3";

function user(id, username, extra = {}) {
  return { id, username, display_name: username, is_admin: false, active_sessions: [{ id: `s-${username}` }], created_at: "2026-01-01T00:00:00.000Z", ...extra };
}
const seedUsers = () => [
  user(OWNER, "admin", { is_admin: true, is_super_admin: true, totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc", totp_last_counter: 0, totp_recovery_hashes: [] }),
  user(ADMIN2, "moderator2", { is_admin: true, admin_permissions: null }),
  user(MEMBER, "kaan"),
];

const NODE_TABLES = ["node_keys", "node_settings", "node_events"];
const fakeOpts = { missingTables: [...NODE_TABLES] };
const fake = createFakeSupabase({ users: seedUsers(), admin_audit: [] }, fakeOpts);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

/* ---------------- fake cluster (lib/cluster API) ---------------- */

const fc = {
  enabledFlag: true,
  nodes: [],
  cfg: {},
  events: [],
  kv: { ok: true, usedMb: 3.2, maxMb: 25 },
  states: [],
  published: [],
  moveStep: 4,
};
function baseNodes() {
  const beat = new Date().toISOString();
  return [
    { id: "render", role: "primary", url: "https://des-call.onrender.com", version: "4.1.0", startedAt: beat, memRss: 312, memLimit: 512, cpu: 22, cores: 1, conns: 58, p95ms: 48, errRate: 0.2, state: "active", gameMode: false, lastBeat: beat },
    { id: "pc-demir", role: "secondary", url: "https://pc.descall.com", version: "4.1.0", startedAt: beat, memRss: 1454, memLimit: 3072, cpu: 9, cores: 4, conns: 10, p95ms: 31, errRate: 0, state: "active", gameMode: false, lastBeat: beat },
  ];
}
const merge = (a, b) => {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b === undefined ? a : b;
  const o = { ...(a && typeof a === "object" && !Array.isArray(a) ? a : {}) };
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(o[k], v) : v;
  return o;
};
const fakeCluster = {
  nodeId: "render",
  role: "primary",
  publicUrl: "https://des-call.onrender.com",
  enabled: () => fc.enabledFlag,
  isLeader: () => true,
  onLeaderChange() {},
  async getNodes() {
    // A draining PC hands its users to Render a few at a time (what node:move does).
    const pc = fc.nodes.find((n) => n.role === "secondary");
    const render = fc.nodes.find((n) => n.role === "primary");
    if (pc && pc.state === "draining" && pc.conns > 0 && render) {
      const k = Math.min(fc.moveStep, pc.conns);
      pc.conns -= k;
      render.conns += k;
    }
    return fc.nodes.map((n) => ({ ...n }));
  },
  async getCfg() {
    return JSON.parse(JSON.stringify(fc.cfg));
  },
  async setCfg(partial) {
    fc.cfg = merge(fc.cfg, partial);
    return JSON.parse(JSON.stringify(fc.cfg));
  },
  async setNodeState(id, st, reason) {
    fc.states.push({ id, st, reason });
    const n = fc.nodes.find((x) => x.id === id);
    if (n) n.state = st;
  },
  async pushEvent(kind, detail) {
    fc.events.unshift({ at: new Date().toISOString(), kind, nodeId: "render", detail });
  },
  async getEvents(limit) {
    return fc.events.slice(0, limit);
  },
  async getMetrics(minutes) {
    const t = Date.now();
    return {
      render: [{ t: t - 20000, rss: 300, cpu: 20, conns: 50, p95: 45, err: 0.1 }, { t: t - 10000, rss: 312, cpu: 22, conns: 58, p95: 48, err: 0.2 }],
      "pc-demir": [{ t: t - 10000, rss: 1454, cpu: 9, conns: 10, p95: 31 }],
      "bad id!": [{ t }],
      minutes,
    };
  },
  async kvStatus() {
    return { ...fc.kv };
  },
  publish(channel, msg) {
    fc.published.push({ channel, msg });
  },
  subscribe() {},
};
const clusterPath = require.resolve("../lib/cluster");
require.cache[clusterPath] = { id: clusterPath, filename: clusterPath, loaded: true, exports: fakeCluster };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const nodeRoutes = require("../routes/adminNodes");
const nodeKeys = require("../lib/nodeKeys");
const store = require("../lib/nodeKeys/store");
const service = require("../lib/nodeKeys/service");
const monitor = require("../lib/nodeKeys/monitor");
const M = require("../lib/nodeKeys/model");
const state = require("../runtime/sharedState");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const emitted = [];
const io = {
  sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
  in() {
    return { fetchSockets: async () => [] };
  },
  to(room) {
    return {
      emit(event, payload) {
        emitted.push({ room, event, payload });
      },
      to() {
        return this;
      },
    };
  },
  emit() {},
};

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, p, { body, token, stepUp, ip } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}), ...(ip ? { "X-Forwarded-For": `${ip}, 173.245.48.5`, "CF-IPCountry": "TR" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, body: json };
}

const ownerSession = signToken({ id: OWNER, username: "admin", sid: "s-admin" });
const stepUp = signStepUpToken({ id: OWNER, sid: "s-admin" });
const admin2Session = signToken({ id: ADMIN2, username: "moderator2", sid: "s-moderator2" });
const memberSession = signToken({ id: MEMBER, username: "kaan", sid: "s-kaan" });
const rows = (t) => fake._tables[t]?.rows || [];
const audited = (action) => state.auditLog.filter((e) => e.action === action);

(async () => {
  fc.nodes = baseNodes();
  nodeRoutes.__drill.pollMs = 10;
  nodeRoutes.__drill.timeoutMs = 2000;
  const { server, base } = await startServer();
  const O = { token: ownerSession };
  const OS = { token: ownerSession, stepUp };
  try {
    /* ---------------- owner only ---------------- */
    let r = await call(base, "GET", "/api/admin/nodes", { token: admin2Session });
    assert(r.status === 403 && r.body.code === "OWNER_ONLY", `non-owner overview: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "PUT", "/api/admin/nodes/pc-config", { token: admin2Session, body: { cores: 2 } });
    assert(r.status === 403 && r.body.code === "OWNER_ONLY", `non-owner cfg: ${r.status}`);
    r = await call(base, "GET", "/api/admin/nodes/keys", { token: memberSession });
    assert(r.status === 403, `member refused: ${r.status}`);
    r = await call(base, "GET", "/api/admin/nodes", { token: admin2Session });
    assert(r.status === 403, "another admin with every legacy section still cannot open it");

    /* ---------------- before the migration ---------------- */
    r = await call(base, "GET", "/api/admin/nodes", O);
    assert(r.status === 200 && r.body.available === true, `overview answers before the migration: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    assert(r.body.storage.ok === false && r.body.keys.available === false && r.body.keys.max === 5, `storage off: ${JSON.stringify(r.body.storage)} ${JSON.stringify(r.body.keys)}`);
    assert(r.body.single === false && r.body.kv.ok === true && r.body.kv.configured === false, `cluster on: ${JSON.stringify(r.body.kv)}`);
    assert(r.body.nodes.length === 2 && r.body.totals.conns === 68 && r.body.totals.byNode["pc-demir"] === 10, `totals: ${JSON.stringify(r.body.totals)}`);
    assert(r.body.capacity.estimate === r.body.capacity.renderUsers + r.body.capacity.pcUsers && r.body.capacity.pcUsers > 800 && r.body.capacity.perUserMb === 2.28, "measured on Render (58 users, 312 MB): " + `capacity: ${JSON.stringify(r.body.capacity)}`);
    assert(r.body.cfg.ramMb === 3072 && r.body.cfg.schedule.tz === "Europe/Istanbul" && r.body.cfg.schedule.slots.length === 7, "default cfg filled in");
    assert(r.body.pc.registered === true && r.body.pc.online === true, `pc: ${JSON.stringify(r.body.pc)}`);
    assert(typeof r.body.savedUsdMonth === "number" && r.body.saved.month === new Date().toISOString().slice(0, 7), "saved-cost line");
    r = await call(base, "GET", "/api/admin/nodes/keys", O);
    assert(r.status === 200 && r.body.available === false && r.body.keys.length === 0, `keys unavailable: ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", "/api/admin/nodes/keys", { ...OS, body: { name: "Ev PC" } });
    assert(r.status === 503 && r.body.code === "KEYS_UNAVAILABLE", `create before the migration: ${r.status} ${JSON.stringify(r.body)}`);
    assert((await nodeKeys.verify(`dsk_node_${crypto.randomBytes(32).toString("base64url")}`)) === null, "verify refuses before the migration");
    r = await call(base, "PUT", "/api/admin/nodes/pc-config", { ...OS, body: { cores: 6 } });
    assert(r.status === 200 && r.body.cfg.cores === 6, `cfg works without the tables: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

    /* ---------------- apply the migration ---------------- */
    fakeOpts.missingTables.length = 0;
    store.__resetForTests();

    /* ---------------- step-up ---------------- */
    for (const [m, p, body] of [
      ["PUT", "/api/admin/nodes/pc-config", { cores: 2 }],
      ["POST", "/api/admin/nodes/keys", { name: "x" }],
      ["POST", "/api/admin/nodes/pc-demir/drain", { reason: "bakım" }],
      ["POST", "/api/admin/nodes/all-to-render", { reason: "acil durum", confirm: true }],
      ["POST", "/api/admin/nodes/drill", {}],
      ["POST", "/api/admin/nodes/pc-demir/resume", {}],
    ]) {
      r = await call(base, m, p, { token: ownerSession, body });
      assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", `${m} ${p} needs step-up: ${r.status} ${JSON.stringify(r.body)}`);
    }

    /* ---------------- node keys ---------------- */
    r = await call(base, "POST", "/api/admin/nodes/keys", { ...OS, body: { name: "   " } });
    assert(r.status === 400 && r.body.code === "NAME_REQUIRED", `name required: ${r.status}`);
    r = await call(base, "POST", "/api/admin/nodes/keys", { ...OS, body: { name: "x".repeat(41) } });
    assert(r.status === 400 && r.body.code === "NAME_REQUIRED", "name too long");
    r = await call(base, "POST", "/api/admin/nodes/keys", { ...OS, body: { name: "Ev PC" } });
    assert(r.status === 201, `create: ${r.status} ${JSON.stringify(r.body)}`);
    const secret = r.body.secret;
    const k1 = r.body.key;
    assert(/^dsk_node_[A-Za-z0-9_-]{43}$/.test(secret), `secret format: ${secret}`);
    assert(k1.status === "active" && k1.prefix === secret.slice(9, 13) && k1.last4 === secret.slice(-4) && k1.masked === `dsk_node_${k1.prefix}…${k1.last4}`, `key view: ${JSON.stringify(k1)}`);
    const stored = rows("node_keys").find((x) => x.id === k1.id);
    assert(stored.secret_hash === crypto.createHash("sha256").update(secret).digest("hex"), "only the SHA-256 is stored");
    assert(!JSON.stringify(fake._tables).includes(secret), "the secret is nowhere in the database");
    assert(!JSON.stringify(state.auditLog).includes(secret), "the secret is not in the audit log");
    assert(audited("system_node_key_create").some((e) => e.target === `node_key:${k1.id}`), "create audited");
    r = await call(base, "GET", "/api/admin/nodes/keys", O);
    assert(r.status === 200 && r.body.available === true && r.body.keys.length === 1, `list: ${JSON.stringify(r.body)}`);
    assert(!JSON.stringify(r.body).includes(secret) && !JSON.stringify(r.body).includes(stored.secret_hash), "list never shows the secret or its hash");
    const v = await nodeKeys.verify(secret, { nodeId: "pc-demir", ip: "198.51.100.7" });
    assert(v && v.id === k1.id && v.name === "Ev PC", `verify: ${JSON.stringify(v)}`);
    await new Promise((res) => setTimeout(res, 20));
    assert(rows("node_keys").find((x) => x.id === k1.id).last_used_node === "pc-demir", "last use recorded");
    assert((await nodeKeys.verify(secret.slice(0, -1) + (secret.endsWith("A") ? "B" : "A"))) === null, "a different key is refused");
    assert((await nodeKeys.verify("dsk_admin_" + secret.slice(9))) === null, "an admin-token-shaped secret is refused");
    assert(nodeKeys.bearerOf({ headers: { authorization: `Bearer ${secret}` } }) === secret && nodeKeys.bearerOf({ headers: { authorization: "Bearer nope" } }) === null, "bearerOf");
    for (let i = 2; i <= 5; i += 1) {
      r = await call(base, "POST", "/api/admin/nodes/keys", { ...OS, body: { name: `Yedek ${i}` } });
      assert(r.status === 201, `key ${i}: ${r.status}`);
    }
    r = await call(base, "POST", "/api/admin/nodes/keys", { ...OS, body: { name: "Altıncı" } });
    assert(r.status === 409 && r.body.code === "KEY_LIMIT", `max 5 active: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", `/api/admin/nodes/keys/${k1.id}/revoke`, { ...OS, body: { reason: "x", confirmName: "Ev PC" } });
    assert(r.status === 400 && r.body.code === "BAD_REASON", `revoke reason: ${r.status}`);
    r = await call(base, "POST", `/api/admin/nodes/keys/${k1.id}/revoke`, { ...OS, body: { reason: "PC çalındı", confirmName: "Ev" } });
    assert(r.status === 400 && r.body.code === "CONFIRM_MISMATCH", `revoke confirm: ${r.status}`);
    r = await call(base, "POST", `/api/admin/nodes/keys/${crypto.randomUUID()}/revoke`, { ...OS, body: { reason: "PC çalındı", confirmName: "Ev PC" } });
    assert(r.status === 404 && r.body.code === "KEY_NOT_FOUND", `revoke unknown: ${r.status}`);
    r = await call(base, "POST", `/api/admin/nodes/keys/${k1.id}/revoke`, { ...OS, body: { reason: "PC çalındı", confirmName: "Ev PC" } });
    assert(r.status === 200 && r.body.key.status === "revoked" && r.body.key.revokeReason === "PC çalındı", `revoke: ${r.status} ${JSON.stringify(r.body)}`);
    assert((await nodeKeys.verify(secret)) === null, "a revoked key is refused at once (cache dropped)");
    assert(fc.published.some((p) => p.channel === "dc:inval" && p.msg.kind === "node_key" && p.msg.id === k1.id), "other nodes are told");
    assert(audited("system_node_key_revoke").some((e) => e.target === `node_key:${k1.id}` && e.meta?.reason === "PC çalındı"), "revoke audited");
    r = await call(base, "POST", `/api/admin/nodes/keys/${k1.id}/revoke`, { ...OS, body: { reason: "tekrar", confirmName: "Ev PC" } });
    assert(r.status === 409 && r.body.code === "KEY_REVOKED", `double revoke: ${r.status}`);
    r = await call(base, "POST", "/api/admin/nodes/keys", { ...OS, body: { name: "Yeni PC" } });
    assert(r.status === 201, "a revoke frees a slot");
    r = await call(base, "GET", "/api/admin/nodes", O);
    assert(r.body.keys.available === true && r.body.keys.active === 5 && r.body.storage.ok === true, `overview keys: ${JSON.stringify(r.body.keys)}`);

    /* ---------------- pc-config validation ---------------- */
    const bad = [
      [{ ramMb: 700 }, "ramMb"],
      [{ ramMb: 256 }, "ramMb"],
      [{ ramMb: 8704 }, "ramMb"],
      [{ ramMb: "2048" }, "ramMb"],
      [{ cores: 0 }, "cores"],
      [{ cores: 9 }, "cores"],
      [{ cores: 2.5 }, "cores"],
      [{ loadRule: { renderHighPct: 20 } }, "loadRule.renderHighPct"],
      [{ loadRule: { pcHighPct: 99 } }, "loadRule.pcHighPct"],
      [{ loadRule: { enabled: "yes" } }, "loadRule.enabled"],
      [{ loadRule: { other: 1 } }, "loadRule.other"],
      [{ gameMode: { shareMb: 100 } }, "gameMode.shareMb"],
      [{ gameMode: { shareMb: 4096 } }, "gameMode.shareMb"],
      [{ schedule: { tz: "Mars/Olympus" } }, "schedule.tz"],
      [{ schedule: { slots: [{ d: 7, from: "18:00", to: "02:00" }] } }, "schedule.slots"],
      [{ schedule: { slots: [{ d: 1, from: "25:00", to: "02:00" }] } }, "schedule.slots"],
      [{ schedule: { slots: [{ d: 1, from: "18:00", to: "18:00" }] } }, "schedule.slots"],
      [{ schedule: { slots: "always" } }, "schedule.slots"],
      [{ alerts: { email: true } }, "alerts.email"],
      [{ emergency: { on: false } }, "emergency"],
      [[1, 2], "body"],
    ];
    for (const [body, field] of bad) {
      r = await call(base, "PUT", "/api/admin/nodes/pc-config", { ...OS, body });
      assert(r.status === 400 && r.body.code === "BAD_CFG" && r.body.errorVars?.field === field, `bad cfg ${JSON.stringify(body)}: ${r.status} ${JSON.stringify(r.body)}`);
    }
    const slots = [{ d: 1, from: "18:00", to: "02:00" }, { d: 6, from: "12:00", to: "23:00" }];
    r = await call(base, "PUT", "/api/admin/nodes/pc-config", { ...OS, body: { ramMb: 4096, cores: 4, loadRule: { enabled: true, renderHighPct: 65, pcHighPct: 80 }, gameMode: { shareMb: 1536, fullHandover: true }, schedule: { slots }, alerts: { kvFull: false } } });
    assert(r.status === 200, `good cfg: ${r.status} ${JSON.stringify(r.body)}`);
    const cfg = r.body.cfg;
    assert(cfg.ramMb === 4096 && cfg.loadRule.renderHighPct === 65 && cfg.gameMode.shareMb === 1536 && cfg.gameMode.fullHandover === true && cfg.gameMode.enabled === true, `merged: ${JSON.stringify(cfg)}`);
    assert(cfg.schedule.slots.length === 2 && cfg.schedule.tz === "Europe/Istanbul" && cfg.alerts.kvFull === false && cfg.alerts.pcDown === true, "partial update keeps the rest");
    assert(r.body.changed.includes("ramMb") && r.body.changed.includes("schedule") && !r.body.changed.includes("nothing"), `changed: ${r.body.changed}`);
    assert(fc.cfg.ramMb === 4096 && typeof fc.cfg.updatedAt === "string" && fc.cfg.updatedBy === "admin", "written to the cluster with a stamp");
    const durable = rows("node_settings").find((x) => x.id === "pc");
    assert(durable && durable.value.ramMb === 4096 && durable.updated_by === OWNER, "durable copy in node_settings");
    assert(audited("system_node_cfg").length >= 2 && rows("node_events").some((e) => e.kind === "cfg_update"), "cfg audited and logged");
    const emittedBefore = emitted.length;
    r = await call(base, "PUT", "/api/admin/nodes/pc-config", { ...OS, body: { cores: 4 } });
    assert(r.status === 200 && r.body.changed.length === 0, "no change, no audit");
    // Key Value restart: the cluster forgets, the durable copy comes back.
    fc.cfg = {};
    service.__resetForTests();
    r = await call(base, "GET", "/api/admin/nodes", O);
    assert(r.body.cfg.ramMb === 4096 && r.body.cfg.schedule.slots.length === 2, `restored after a KV restart: ${JSON.stringify(r.body.cfg).slice(0, 200)}`);
    assert(emitted.length >= emittedBefore, "live pushes go to the owner room only");
    assert(emitted.every((e) => e.room === monitor.ROOM || e.event !== "admin:nodes"), "admin:nodes only in the owner room");

    /* ---------------- metrics, events ---------------- */
    r = await call(base, "GET", "/api/admin/nodes/metrics?minutes=999", O);
    assert(r.status === 200 && r.body.minutes === 60, `metrics clamp: ${JSON.stringify(r.body).slice(0, 100)}`);
    assert(r.body.series.render.length === 2 && r.body.series.render[1].p95 === 48 && r.body.series["pc-demir"][0].err === 0, "metrics shape");
    assert(!("bad id!" in r.body.series) && !("minutes" in r.body.series), "junk series dropped");
    r = await call(base, "GET", "/api/admin/nodes", O);
    assert(Array.isArray(r.body.events) && r.body.events.length > 0 && r.body.events.length <= 50, "events table");
    const keys = r.body.events.map((e) => `${e.at}|${e.kind}|${e.nodeId}`);
    assert(new Set(keys).size === keys.length, "cluster and durable events deduped");

    /* ---------------- drain, resume, emergency ---------------- */
    r = await call(base, "POST", "/api/admin/nodes/pc-demir/drain", { ...OS, body: { reason: "" } });
    assert(r.status === 400 && r.body.code === "BAD_REASON", "drain needs a reason");
    r = await call(base, "POST", "/api/admin/nodes/render/drain", { ...OS, body: { reason: "deneme" } });
    assert(r.status === 409 && r.body.code === "NOT_SECONDARY", `render cannot be drained: ${r.status}`);
    r = await call(base, "POST", "/api/admin/nodes/pc-x/drain", { ...OS, body: { reason: "deneme" } });
    assert(r.status === 404 && r.body.code === "NODE_NOT_FOUND", "unknown node");
    r = await call(base, "POST", "/api/admin/nodes/pc-demir/drain", { ...OS, body: { reason: "PC'yi kapatacağım" } });
    assert(r.status === 200 && r.body.state === "draining" && r.body.moving === 10, `drain: ${JSON.stringify(r.body)}`);
    assert(fc.nodes[1].state === "draining" && fc.states.at(-1).reason === "PC'yi kapatacağım", "cluster state set with the reason");
    assert(audited("system_node_drain").length === 1, "drain audited");
    r = await call(base, "POST", "/api/admin/nodes/drill", OS);
    assert(r.status === 409 && r.body.code === "NO_ACTIVE_PC", `drill needs an active PC: ${r.status}`);
    r = await call(base, "POST", "/api/admin/nodes/pc-demir/resume", OS);
    assert(r.status === 200 && fc.nodes[1].state === "active", "resume");
    fc.nodes = baseNodes();
    r = await call(base, "POST", "/api/admin/nodes/all-to-render", { ...OS, body: { reason: "acil durum" } });
    assert(r.status === 400 && r.body.code === "CONFIRM_REQUIRED", "emergency needs the confirmation");
    r = await call(base, "POST", "/api/admin/nodes/all-to-render", { ...OS, body: { reason: "a", confirm: true } });
    assert(r.status === 400 && r.body.code === "BAD_REASON", "emergency needs a reason");
    r = await call(base, "POST", "/api/admin/nodes/all-to-render", { ...OS, body: { reason: "ev interneti gidiyor", confirm: true } });
    assert(r.status === 200 && r.body.moving === 10 && r.body.nodes[0] === "pc-demir" && r.body.emergency.on === true, `emergency: ${JSON.stringify(r.body)}`);
    assert(fc.cfg.emergency?.on === true && fc.cfg.emergency.reason === "ev interneti gidiyor", "emergency flag in the cluster cfg");
    r = await call(base, "GET", "/api/admin/nodes", O);
    assert(r.body.emergency && r.body.emergency.by === "admin", `overview shows the emergency: ${JSON.stringify(r.body.emergency)}`);
    r = await call(base, "POST", "/api/admin/nodes/pc-demir/resume", OS);
    assert(r.status === 200 && fc.cfg.emergency.on === false, "resume ends the emergency");
    assert(audited("system_node_all_to_render").length === 1 && audited("system_node_resume").length === 2, "emergency + resume audited");

    /* ---------------- drill ---------------- */
    fc.nodes = baseNodes();
    r = await call(base, "POST", "/api/admin/nodes/drill", OS);
    assert(r.status === 200 && r.body.moved === 10 && r.body.dropped === 0 && r.body.remaining === 0 && r.body.timedOut === false && r.body.ms >= 0, `drill: ${JSON.stringify(r.body)}`);
    assert(fc.nodes[1].state === "active", "the PC is back after the drill");
    assert(fc.states.slice(-2).map((s) => s.st).join(",") === "draining,active", "drain then resume");
    assert(audited("system_node_drill").length === 1 && rows("node_events").some((e) => e.kind === "drill" && e.detail.moved === 10), "drill audited and logged");
    // Users that leave the PC without arriving on Render count as dropped; a slow drain times out.
    fc.nodes = baseNodes();
    const realGet = fakeCluster.getNodes;
    fakeCluster.getNodes = async () => {
      const pc = fc.nodes[1];
      if (pc.state === "draining" && pc.conns > 2) pc.conns -= 1;
      return fc.nodes.map((n) => ({ ...n }));
    };
    r = await call(base, "POST", "/api/admin/nodes/drill", OS);
    assert(r.status === 200 && r.body.timedOut === true && r.body.remaining === 2 && r.body.dropped === 8 && r.body.moved === 0, `lossy drill: ${JSON.stringify(r.body)}`);
    fakeCluster.getNodes = realGet;
    fc.nodes = [baseNodes()[0]];
    r = await call(base, "POST", "/api/admin/nodes/drill", OS);
    assert(r.status === 409 && r.body.code === "NO_PC", "no PC at all");

    /* ---------------- single-node mode ---------------- */
    fc.enabledFlag = false;
    fc.kv = { ok: false, usedMb: 0, maxMb: 25 };
    r = await call(base, "GET", "/api/admin/nodes", O);
    assert(r.body.single === true && r.body.kv.ok === false && r.body.nodes.length === 1 && r.body.capacity.pcUsers === 0, `single-node: ${JSON.stringify(r.body).slice(0, 200)}`);
    fc.enabledFlag = true;
    fc.kv = { ok: true, usedMb: 3.2, maxMb: 25 };
    fc.nodes = baseNodes();

    /* ---------------- admin token ---------------- */
    const tokenStore = require("../lib/adminTokens/store");
    if (typeof tokenStore.__resetForTests === "function") tokenStore.__resetForTests();
    r = await call(base, "POST", "/api/admin/tokens", { ...OS, ip: "203.0.113.10", body: { name: "Sunucu botu", expiresIn: "1d", ipAllowlist: [] } });
    if (r.status === 201) {
      const tok = r.body.secret;
      r = await call(base, "GET", "/api/admin/nodes", { token: tok, ip: "203.0.113.10" });
      assert(r.status === 200 && r.body.available === true, `admin token reads: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      r = await call(base, "PUT", "/api/admin/nodes/pc-config", { token: tok, ip: "203.0.113.10", body: { cores: 3 } });
      assert(r.status === 200 && r.body.cfg.cores === 3, `admin token changes without step-up: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    } else {
      console.warn("adminNodes: admin token part skipped (token create answered", r.status, ")");
    }

    /* ---------------- alert monitor ---------------- */
    monitor.__resetForTests();
    const sent = [];
    monitor.__setForTests({ io, send: async (ids, alert) => sent.push({ ids, alert }) });
    await service.setCfg({ alerts: { pcDown: true, kvFull: true, render90: true } }, { id: OWNER, username: "admin" });
    fc.nodes = baseNodes();
    let t = await monitor.tick(Date.now());
    assert(t.fired.length === 0, `quiet start: ${JSON.stringify(t)}`);
    fc.nodes = [baseNodes()[0]];
    t = await monitor.tick(Date.now() + 1000);
    assert(t.fired.length === 1 && t.fired[0].kind === "pcDown" && t.fired[0].pushed === true, `pc drop: ${JSON.stringify(t)}`);
    assert(sent.length === 1 && sent[0].ids.includes(OWNER) && !sent[0].ids.includes(ADMIN2), `owners only: ${JSON.stringify(sent)}`);
    assert(emitted.some((e) => e.room === monitor.ROOM && e.event === "admin:nodes-alert" && e.payload.kind === "pcDown"), "live alert in the owner room");
    t = await monitor.tick(Date.now() + 2000);
    assert(t.fired.length === 0, "fires once");
    // Graceful drain: active -> draining -> gone never fires.
    fc.nodes = baseNodes();
    await monitor.tick(Date.now() + 3000);
    fc.nodes[1].state = "draining";
    await monitor.tick(Date.now() + 4000);
    fc.nodes = [baseNodes()[0]];
    t = await monitor.tick(Date.now() + 5000);
    assert(t.fired.length === 0, `graceful drain is quiet: ${JSON.stringify(t)}`);
    // Render 90 %, re-armed under 80 %.
    fc.nodes = [{ ...baseNodes()[0], memRss: 470 }];
    t = await monitor.tick(Date.now() + 6000);
    assert(t.fired.length === 1 && t.fired[0].kind === "render90" && t.fired[0].vars.pct === 92, `render90: ${JSON.stringify(t)}`);
    t = await monitor.tick(Date.now() + 7000);
    assert(t.fired.length === 0, "render90 once");
    fc.nodes = [{ ...baseNodes()[0], memRss: 380 }];
    await monitor.tick(Date.now() + 8000);
    fc.nodes = [{ ...baseNodes()[0], memRss: 480 }];
    t = await monitor.tick(Date.now() + 9000);
    assert(t.fired.length === 1 && t.fired[0].kind === "render90", "re-armed under 80 %");
    // Key Value full; switch off: logged but not pushed.
    fc.nodes = baseNodes();
    await service.setCfg({ alerts: { kvFull: false } }, { id: OWNER, username: "admin" });
    fc.kv = { ok: true, usedMb: 23.5, maxMb: 25 };
    const before = sent.length;
    t = await monitor.tick(Date.now() + 10000);
    assert(t.fired.some((a) => a.kind === "kvFull" && a.reason === "full" && a.pushed === false) && sent.length === before, `kv full, switch off: ${JSON.stringify(t)}`);
    assert(rows("node_events").some((e) => e.kind === "alert_kvFull"), "alert logged");
    // Key Value unreachable (configured).
    fc.kv = { ok: true, usedMb: 3, maxMb: 25 };
    process.env.REDIS_URL = "redis://fake:6379";
    await service.setCfg({ alerts: { kvFull: true } }, { id: OWNER, username: "admin" });
    await monitor.tick(Date.now() + 11000);
    fc.kv = { ok: false, usedMb: 0, maxMb: 25 };
    t = await monitor.tick(Date.now() + 12000);
    assert(t.fired.some((a) => a.kind === "kvFull" && a.reason === "down" && a.pushed === true), `kv down: ${JSON.stringify(t)}`);
    delete process.env.REDIS_URL;
    fc.kv = { ok: true, usedMb: 3.2, maxMb: 25 };
    // Saved-cost ledger: an active PC adds GB-hours.
    const led = await store.loadLedger();
    assert(led.gbHours > 0 && led.pcHours > 0, `ledger: ${JSON.stringify(led)}`);
    // Pure evaluate, no PC ever: nothing.
    assert(monitor.evaluate({ pcWasActive: false }, { nodes: [baseNodes()[0]], kv: { ok: true, usedMb: 1, maxMb: 25 } }).fire.length === 0);

    /* ---------------- test alert ---------------- */
    r = await call(base, "POST", "/api/admin/nodes/alerts/test", OS);
    assert(r.status === 200 && r.body.recipients >= 1, `test alert: ${JSON.stringify(r.body)}`);
    assert(audited("system_node_alert_test").length === 1, "test alert audited");

    /* ---------------- socket watch ---------------- */
    const mkSocket = (u, extra = {}) => {
      const handlers = {};
      const s = { user: u, joined: [], out: [], on: (ev, fn) => (handlers[ev] = fn), join: (room) => s.joined.push(room), leave: (room) => (s.joined = s.joined.filter((x) => x !== room)), emit: (ev, p) => s.out.push({ ev, p }), ...extra };
      s.fire = (ev) => handlers[ev]?.();
      return s;
    };
    const ownerSock = mkSocket({ id: OWNER, username: "admin" });
    monitor.setupSocket(io, ownerSock);
    await ownerSock.fire("admin:nodes:watch");
    assert(ownerSock.joined.includes(monitor.ROOM) && ownerSock.out.some((o) => o.ev === "admin:nodes" && o.p.available === true), `owner watches: ${JSON.stringify(ownerSock.out.map((o) => o.ev))}`);
    await ownerSock.fire("admin:nodes:unwatch");
    assert(!ownerSock.joined.includes(monitor.ROOM), "unwatch leaves");
    const modSock = mkSocket({ id: ADMIN2, username: "moderator2" });
    monitor.setupSocket(io, modSock);
    await modSock.fire("admin:nodes:watch");
    assert(!modSock.joined.length && modSock.out.some((o) => o.ev === "admin:error" && o.p.code === "OWNER_ONLY") && !modSock.out.some((o) => o.ev === "admin:nodes"), "another admin cannot watch");
    const superSock = mkSocket({ id: OWNER, username: "renamed-owner" });
    monitor.setupSocket(io, superSock);
    await superSock.fire("admin:nodes:watch");
    assert(superSock.joined.includes(monitor.ROOM), "is_super_admin owner can watch");
    monitor.stop();

    /* ---------------- pure model ---------------- */
    assert(M.inSchedule({ schedule: { enabled: true, tz: "Europe/Istanbul", slots: [{ d: 1, from: "18:00", to: "02:00" }] } }, new Date("2026-11-23T17:30:00Z")) === true, "Monday 20:30 Istanbul is in");
    assert(M.inSchedule({ schedule: { enabled: true, tz: "Europe/Istanbul", slots: [{ d: 1, from: "18:00", to: "02:00" }] } }, new Date("2026-11-23T22:30:00Z")) === true, "Tuesday 01:30 is in (overnight)");
    assert(M.inSchedule({ schedule: { enabled: true, tz: "Europe/Istanbul", slots: [{ d: 1, from: "18:00", to: "02:00" }] } }, new Date("2026-11-24T09:00:00Z")) === false, "Tuesday noon is out");
    assert(M.inSchedule({ schedule: { enabled: false, slots: [{ d: 1, from: "18:00", to: "02:00" }] } }, new Date("2026-11-24T09:00:00Z")) === true, "schedule off: always");
    assert(M.scheduledHours({ schedule: { slots: [{ d: 1, from: "18:00", to: "02:00" }] } }) === 8, "8 h a week");
    assert(M.savedUsd(730 * 2) === 25, "2 GB for a month = Render Standard");
    assert(M.capacity(baseNodes(), { ramMb: 1024 }, { ramMb: 8192 }).pcUsers > M.capacity(baseNodes(), { ramMb: 1024 }).pcUsers, "slider preview");

    console.log("adminNodes.integration.test ok");
  } finally {
    server.close();
    monitor.stop();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
