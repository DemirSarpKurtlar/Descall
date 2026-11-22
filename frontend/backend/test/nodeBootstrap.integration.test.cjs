"use strict";

/**
 * POST /api/node/bootstrap (Descall Node automatic setup) over the fake db, the real node
 * keys store and real HTTP:
 *  - auth: no key / a wrong key / a revoked key -> 401 NODE_KEY_INVALID, failures count on
 *    the per-IP limit (429 after 20), no-store on every answer
 *  - allow-list: only SHARED names that are set on the primary; never REDIS_URL, PORT,
 *    NODE_ENV, DESCALL_NODE_*, RENDER*, OS variables or an unclassified name; multi-line
 *    values intact; LiveKit only when the primary has it
 *  - enrollment window: created_at + 30 min before the migration (reopen answers
 *    BOOTSTRAP_UNAVAILABLE), then the owner opens / closes it from Admin > Sunucu Ağı
 *    (owner + step-up, audited, event row), bootstrapped_at recorded
 *  - only the primary answers (secondary 404), never through the PC tunnel (cf-warp-tag-id,
 *    the PC hostname, loopback with Cloudflare headers)
 *  - every answer: node event, admin audit entry (names only), the owner's phone alert
 *  - no secret value in any log line, the audit log or the events
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
delete process.env.REDIS_URL;

const http = require("http");
const crypto = require("crypto");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

/* ---- every console line of this process, to prove no secret is ever logged ---- */
const logged = [];
for (const m of ["log", "info", "warn", "error", "debug"]) {
  const orig = console[m].bind(console);
  console[m] = (...a) => {
    logged.push(a.map((x) => (typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(" "));
    if (m === "error" || process.env.TEST_VERBOSE) orig(...a);
  };
}

const OWNER = "00000000-0000-4000-8000-0000000000c1";
const user = (id, username, extra = {}) => ({ id, username, display_name: username, is_admin: false, active_sessions: [{ id: `s-${username}` }], created_at: "2026-01-01T00:00:00.000Z", ...extra });
const fakeOpts = { missingColumns: { node_keys: ["bootstrap_until", "bootstrapped_at"] } };
const fake = createFakeSupabase(
  { users: [user(OWNER, "admin", { is_admin: true, is_super_admin: true, totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc", totp_last_counter: 0, totp_recovery_hashes: [] })], admin_audit: [], node_keys: [], node_settings: [], node_events: [] },
  fakeOpts
);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

/* ---- the lib/cluster singleton (event ring) as the services see it ---- */
const ring = [];
const fakeCluster = {
  nodeId: "render",
  role: "primary",
  publicUrl: "https://des-call.onrender.com",
  enabled: () => true,
  isLeader: () => true,
  onLeaderChange() {},
  nodes: [],
  async getNodes() {
    return this.nodes.map((n) => ({ ...n }));
  },
  async getCfg() {
    return {};
  },
  async setCfg(p) {
    return p;
  },
  async setNodeState() {},
  async pushEvent(kind, detail) {
    ring.unshift({ at: new Date().toISOString(), kind, detail });
  },
  async getEvents(limit) {
    return ring.slice(0, limit);
  },
  async getMetrics() {
    return {};
  },
  async kvStatus() {
    return { ok: true, usedMb: 1, maxMb: 25 };
  },
  publish() {},
  subscribe() {},
  configured: () => false,
  linkInvalidate: (_kind, fn) => fn,
  invalidate: () => false,
  onInvalidate: () => () => {},
  hasRemoteUser: () => false,
  leaderOnly: (_name, fn) => fn,
  withoutReplication: (fn) => fn(),
  leaderId: () => "render",
  updateSelf() {},
};
const clusterPath = require.resolve("../lib/cluster");
require.cache[clusterPath] = { id: clusterPath, filename: clusterPath, loaded: true, exports: fakeCluster };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const { createNodeRoutes, viaPcTunnel } = require("../routes/node");
const adminRouter = require("../routes/admin");
const store = require("../lib/nodeKeys/store");
const B = require("../lib/nodeKeys/bootstrapEnv");
const state = require("../runtime/sharedState");
const { resetLimits } = require("../lib/rateLimit");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

/** The primary's process env as Render has it (no LiveKit at all). */
const PEM = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----";
const PRIMARY_ENV = {
  SUPABASE_URL: "https://abcd.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_SERVICEROLEvalue0123456789",
  JWT_SECRET: "jwt-SECRET-value-0123456789abcdef",
  TOTP_ENC_KEY: "totp-ENC-value-0123456789",
  WEB_PUSH_PRIVATE_KEY: "webpush-PRIVATE-value-0123",
  APNS_PRIVATE_KEY: PEM,
  MEDIA_URL_SECRET: "",
  PUBLIC_APP_URL: "https://descall.com",
  REDIS_URL: "redis://red-internal-PASSWORD:6379",
  PORT: "10000",
  NODE_ENV: "production",
  DESCALL_NODE_ROLE: "primary",
  DESCALL_NODE_ID: "render",
  DESCALL_NODE_PUBLIC_URL: "https://des-call.onrender.com",
  DESCALL_NODE_MEMORY_MB: "512",
  RENDER: "true",
  RENDER_EXTERNAL_URL: "https://des-call.onrender.com",
  RENDER_GIT_COMMIT: "abc123",
  HOME: "/opt/render",
  PATH: "/usr/local/bin:/usr/bin",
  HOSTNAME: "srv-render-1",
  EDGE_BRIDGE_SECRET: "edge-BRIDGE-secret-0123",
  NOT_A_BACKEND_VAR: "unclassified-VALUE-0123",
};
const SECRET_VALUES = Object.entries(PRIMARY_ENV)
  .filter(([k, v]) => v && !["PORT", "NODE_ENV", "RENDER", "DESCALL_NODE_ROLE", "DESCALL_NODE_ID", "DESCALL_NODE_MEMORY_MB"].includes(k) && !/^https:\/\//.test(v))
  .map(([, v]) => v);

const alerts = [];
const stub = {
  router: { decide: async () => ({ nodeId: "render", url: "", socketUrl: "", ttlSec: 60 }), recordRegistration: () => true },
  runtime: { isDraining: () => false, notifyDrained() {}, acceptsConnections: () => true },
};

async function startApp(routes, { admin = false } = {}) {
  const app = express();
  app.use(express.json());
  app.set("io", { to: () => ({ emit() {} }), sockets: { adapter: { rooms: new Map() } } });
  app.use("/api/node", routes);
  if (admin) app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, p, { key, body, headers = {}, token, stepUp } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

/** fetch() cannot set Host; node:http can (a tunnelled request carries the PC hostname). */
function postWithHost(base, host, key) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + "/api/node/bootstrap");
    const body = JSON.stringify({ id: "pc-a1b2c3" });
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { Host: host, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let text = "";
      res.on("data", (d) => (text += d));
      res.on("end", () => {
        let json = {};
        try {
          json = JSON.parse(text);
        } catch {
          json = {};
        }
        resolve({ status: res.statusCode, body: json, text });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

const boot = (base, key, extra = {}) => call(base, "POST", "/api/node/bootstrap", { key, body: { id: "pc-a1b2c3", version: "1.0.0" }, ...extra });
const rows = (t) => fake._tables[t]?.rows || [];
const audited = (action) => state.auditLog.filter((e) => e.action === action);
const noStore = (r) => /no-store/.test(String(r.headers.get("cache-control") || ""));

(async () => {
  const primaryRoutes = createNodeRoutes({ cluster: fakeCluster, ...stub, env: PRIMARY_ENV, bootstrapAlert: async (a) => alerts.push(a) });
  const secondaryCluster = { ...fakeCluster, nodeId: "pc-a1b2c3", role: "secondary" };
  const secondaryRoutes = createNodeRoutes({ cluster: secondaryCluster, ...stub, env: { ...PRIMARY_ENV, DESCALL_NODE_ROLE: "secondary" }, bootstrapAlert: async (a) => alerts.push(a) });
  const primary = await startApp(primaryRoutes, { admin: true });
  const secondary = await startApp(secondaryRoutes);
  const ownerSession = signToken({ id: OWNER, username: "admin", sid: "s-admin" });
  const stepUp = signStepUpToken({ id: OWNER, sid: "s-admin" });
  const OS = { token: ownerSession, stepUp };
  try {
    const { key: k1, secret } = await store.createKey({ name: "Ev PC", actorId: OWNER });
    assert(k1 && /^dsk_node_/.test(secret), "key created before the bootstrap migration");
    assert(k1.bootstrapUntil && Math.abs(Date.parse(k1.bootstrapUntil) - (Date.parse(k1.createdAt) + 30 * 60 * 1000)) < 1000, `a new key opens its window for 30 min: ${k1.bootstrapUntil}`);

    /* ---------------- auth ---------------- */
    let r = await boot(primary.base, null);
    assert(r.status === 401 && r.body.code === "NODE_KEY_INVALID" && noStore(r), `no key: ${r.status} ${r.text}`);
    r = await boot(primary.base, secret.slice(0, -1) + (secret.endsWith("A") ? "B" : "A"));
    assert(r.status === 401 && r.body.code === "NODE_KEY_INVALID", `wrong key: ${r.status}`);
    r = await boot(primary.base, "dsk_admin_" + secret.slice(9));
    assert(r.status === 401, "an admin token shape is refused");
    assert(alerts.length === 0 && !audited("system_node_bootstrap").length, "a refused call hands out nothing");

    /* ---------------- answered (before the migration: created_at + 30 min) ---------------- */
    r = await boot(primary.base, secret);
    assert(r.status === 200 && r.body.ok === true, `bootstrap: ${r.status} ${r.body.code || ""}`);
    assert(noStore(r) && r.headers.get("pragma") === "no-cache", "no-store / no-cache headers");
    assert(!r.headers.get("etag"), "no ETag (never cached, never revalidated)");
    const env = r.body.env;
    const names = Object.keys(env).sort();
    assert(JSON.stringify(names) === JSON.stringify(["APNS_PRIVATE_KEY", "JWT_SECRET", "PUBLIC_APP_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL", "TOTP_ENC_KEY", "WEB_PUSH_PRIVATE_KEY"]), `returned names: ${names.join(", ")}`);
    for (const n of names) assert(B.isShared(n) && env[n] === PRIMARY_ENV[n], `${n} is shared and its value is the primary's`);
    for (const n of ["REDIS_URL", "PORT", "NODE_ENV", "DESCALL_NODE_ROLE", "DESCALL_NODE_ID", "DESCALL_NODE_PUBLIC_URL", "DESCALL_NODE_MEMORY_MB", "RENDER", "RENDER_EXTERNAL_URL", "RENDER_GIT_COMMIT", "HOME", "PATH", "HOSTNAME", "EDGE_BRIDGE_SECRET", "NOT_A_BACKEND_VAR", "MEDIA_URL_SECRET", "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) {
      assert(!(n in env), `${n} is never returned`);
    }
    assert(env.APNS_PRIVATE_KEY.split("\n").length === 3, "a multi-line value arrives intact");
    assert(r.body.count === names.length && r.body.nodeId === "render" && Date.parse(r.body.windowUntil) > Date.now(), "count, node, window end");

    /* side effects: event, audit (names only), alert */
    assert(ring.some((e) => e.kind === "node_bootstrap" && e.detail.count === names.length && e.detail.nodeId === "pc-a1b2c3" && e.detail.name === "Ev PC"), "node event in the cluster ring");
    assert(rows("node_events").some((e) => e.kind === "node_bootstrap" && e.node_id === "pc-a1b2c3"), "durable event row");
    const a = audited("system_node_bootstrap");
    assert(a.length === 1 && a[0].target === `node_key:${k1.id}` && a[0].actorUsername === "system", `audit entry: ${JSON.stringify(a)}`);
    assert(JSON.stringify(a[0].meta.names) === JSON.stringify(names) && a[0].meta.count === names.length, "audit lists the names");
    assert(alerts.length === 1 && alerts[0].kind === "bootstrap", `owner alert: ${JSON.stringify(alerts)}`);

    /* the push text exists in every language */
    for (const lang of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
      const pack = require(`../i18n/${lang}.js`);
      const p = pack.push || pack.default?.push || (pack[Object.keys(pack)[0]] || {}).push;
      assert(p && typeof p.nodesBootstrap === "string" && p.nodesBootstrap.length > 10, `push.nodesBootstrap in ${lang}`);
    }
    const ios = require("../lib/iosAlertPush.js");
    const built = ios.describeEvent({ type: "admin-nodes", kind: "bootstrap", pct: 0 }, "tr");
    assert(built && /gizli ayarlar/.test(built.body || "") && built.data.kind === "bootstrap", `iOS alert body: ${JSON.stringify(built)}`);

    /* ---------------- tunnel, secondary ---------------- */
    r = await postWithHost(primary.base, "pc.descall.com", secret);
    assert(r.status === 403 && r.body.code === "NODE_BOOTSTRAP_TUNNEL", `Host pc.descall.com: ${r.status} ${r.text.slice(0, 80)}`);
    for (const headers of [{ "cf-warp-tag-id": "x" }, { "X-Forwarded-Host": "pc.descall.com" }, { "CF-Connecting-IP": "203.0.113.9", "CF-Ray": "abc" }]) {
      r = await boot(primary.base, secret, { headers });
      assert(r.status === 403 && r.body.code === "NODE_BOOTSTRAP_TUNNEL" && noStore(r), `via the tunnel ${JSON.stringify(headers)}: ${r.status} ${r.text}`);
    }
    fakeCluster.nodes = [{ id: "pc-a1b2c3", role: "secondary", url: "https://my-pc.example.com" }];
    r = await postWithHost(primary.base, "my-pc.example.com:443", secret);
    assert(r.status === 403 && r.body.code === "NODE_BOOTSTRAP_TUNNEL", "a registered secondary's own hostname counts as the tunnel");
    fakeCluster.nodes = [];
    assert((await viaPcTunnel({ headers: { host: "des-call.onrender.com", "x-forwarded-for": "203.0.113.9", "cf-ray": "1" }, socket: { remoteAddress: "10.0.0.5" } }, fakeCluster)) === false, "Render's own proxy headers are fine");
    r = await boot(secondary.base, secret);
    assert(r.status === 404 && noStore(r), `a secondary never answers: ${r.status}`);
    assert(alerts.length === 1, "no extra alert for refused calls");

    /* ---------------- window ---------------- */
    rows("node_keys").find((x) => x.id === k1.id).created_at = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    r = await boot(primary.base, secret);
    assert(r.status === 403 && r.body.code === "BOOTSTRAP_WINDOW_CLOSED" && r.body.windowUntil, `window closed after 30 min: ${r.status} ${r.text}`);
    assert(!r.text.includes(PRIMARY_ENV.SUPABASE_SERVICE_ROLE_KEY), "nothing handed out");
    assert(ring.some((e) => e.kind === "node_bootstrap_refused"), "refusal is an event");

    r = await call(primary.base, "POST", `/api/admin/nodes/keys/${k1.id}/bootstrap-window`, { token: ownerSession, body: { open: true } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", `reopen needs step-up: ${r.status} ${r.text}`);
    r = await call(primary.base, "POST", `/api/admin/nodes/keys/${k1.id}/bootstrap-window`, { ...OS, body: { open: "yes" } });
    assert(r.status === 400 && r.body.code === "BAD_OPEN", `open must be a boolean: ${r.status}`);
    r = await call(primary.base, "POST", `/api/admin/nodes/keys/${k1.id}/bootstrap-window`, { ...OS, body: { open: true } });
    assert(r.status === 503 && r.body.code === "BOOTSTRAP_UNAVAILABLE", `reopen before the migration: ${r.status} ${r.text}`);
    r = await call(primary.base, "GET", "/api/admin/nodes/keys", { token: ownerSession });
    assert(r.status === 200 && r.body.available === true && r.body.keys.length === 1, `keys still list before the migration: ${r.status} ${r.text}`);

    /* apply 20261122b_node_bootstrap.sql */
    fakeOpts.missingColumns = {};
    store.__resetForTests();
    r = await call(primary.base, "POST", `/api/admin/nodes/keys/${k1.id}/bootstrap-window`, { ...OS, body: { open: true } });
    assert(r.status === 200 && Math.abs(Date.parse(r.body.key.bootstrapUntil) - (Date.now() + 30 * 60 * 1000)) < 5000, `reopen: ${r.status} ${r.text}`);
    assert(audited("system_node_key_bootstrap_open").some((e) => e.target === `node_key:${k1.id}`), "reopen audited");
    assert(ring.some((e) => e.kind === "key_bootstrap_open" && e.detail.name === "Ev PC"), "reopen event");
    r = await boot(primary.base, secret);
    assert(r.status === 200 && r.body.env.SUPABASE_URL === PRIMARY_ENV.SUPABASE_URL, `bootstrap after reopen: ${r.status}`);
    await new Promise((res) => setTimeout(res, 10));
    assert(rows("node_keys").find((x) => x.id === k1.id).bootstrapped_at, "bootstrapped_at recorded");
    r = await call(primary.base, "GET", "/api/admin/nodes/keys", { token: ownerSession });
    const listed = r.body.keys.find((k) => k.id === k1.id);
    assert(listed.bootstrappedAt && listed.bootstrapUntil, `list shows the window: ${JSON.stringify(listed)}`);
    assert(!r.text.includes(secret), "the list never shows the secret");
    r = await call(primary.base, "POST", `/api/admin/nodes/keys/${k1.id}/bootstrap-window`, { ...OS, body: { open: false } });
    assert(r.status === 200 && Date.parse(r.body.key.bootstrapUntil) <= Date.now(), `close: ${r.status} ${r.text}`);
    assert(audited("system_node_key_bootstrap_close").length === 1, "close audited");
    r = await boot(primary.base, secret);
    assert(r.status === 403 && r.body.code === "BOOTSTRAP_WINDOW_CLOSED", `closed early: ${r.status}`);

    /* a fresh key is open by itself even after the migration */
    resetLimits();
    const { secret: s2, key: k2 } = await store.createKey({ name: "Yeni PC", actorId: OWNER });
    r = await boot(primary.base, s2);
    assert(r.status === 200, `a new key bootstraps at once: ${r.status}`);

    /* revoked */
    await store.revokeKey(k2.id, { reason: "PC değişti", actorId: OWNER });
    r = await boot(primary.base, s2);
    assert(r.status === 401 && r.body.code === "NODE_KEY_INVALID", `revoked key: ${r.status}`);
    r = await call(primary.base, "POST", `/api/admin/nodes/keys/${k2.id}/bootstrap-window`, { ...OS, body: { open: true } });
    assert(r.status === 409 && r.body.code === "KEY_REVOKED", `a revoked key has no window: ${r.status}`);

    /* ---------------- per-IP limit ---------------- */
    resetLimits();
    let limited = null;
    for (let i = 0; i < 25 && !limited; i += 1) {
      r = await boot(primary.base, "dsk_node_" + crypto.randomBytes(32).toString("base64url"));
      if (r.status === 429) limited = i;
    }
    assert(limited !== null && limited >= 20, `failures are rate limited per IP (429 after ${limited})`);
    r = await boot(primary.base, s2);
    assert(r.status === 429, "even a good key waits once the IP is limited");
    resetLimits();

    /* ---------------- nothing secret anywhere ---------------- */
    const haystacks = { logs: logged.join("\n"), audit: JSON.stringify(state.auditLog), events: JSON.stringify(ring) + JSON.stringify(rows("node_events")), alerts: JSON.stringify(alerts) };
    for (const [where, text] of Object.entries(haystacks)) {
      for (const v of SECRET_VALUES) assert(!text.includes(v), `a secret value appears in ${where}`);
      assert(!text.includes(secret) && !text.includes(s2), `a node key appears in ${where}`);
    }
    process.stdout.write(`nodeBootstrap.integration.test: ok (${names.length} names handed out, ${logged.length} log lines checked)\n`);
  } finally {
    primary.server.close();
    secondary.server.close();
  }
  process.exit(0);
})().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + "\n");
  process.exit(1);
});
