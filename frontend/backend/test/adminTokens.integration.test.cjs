"use strict";

/**
 * Admin Token (owner only) end to end over the fake db and real HTTP:
 *  - before the migration: the list says { available: false } and dsk_admin_ bearers get 401
 *  - create: the secret is returned once, only its SHA-256 is stored; step-up is enforced for
 *    an owner session, a token itself acts without one; a non-owner admin gets OWNER_ONLY
 *  - the token works on an admin route and on a normal app route (req.user = the owner),
 *    audit entries written through it carry actor_via / token_id / token_name
 *  - paused, revoked, expired and wrong-IP tokens are refused; rotate with a grace window;
 *    restore only within 10 minutes; revoke-all
 *  - usage (ring buffer, hourly aggregate flush, recent calls, ips) and alerts: new IP,
 *    new country with auto-pause, burst with auto-pause, alert actions, auto-pause settings
 *  - socket.io auth with a token, and the socket is dropped on revoke
 *  - GET /api/admin/openapi.json shape
 * The MCP endpoint has its own file (adminTokensMcp.integration.test.cjs).
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const crypto = require("crypto");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const ADMIN2 = "00000000-0000-4000-8000-0000000000a2";
const MEMBER = "00000000-0000-4000-8000-0000000000a3";

function user(id, username, extra = {}) {
  return { id, username, display_name: username, is_admin: false, active_sessions: [{ id: `s-${username}` }], created_at: "2026-01-01T00:00:00.000Z", ...extra };
}

const seedUsers = () => [
  // TOTP on for the owner: every change of an owner session needs the step-up code.
  user(OWNER, "admin", { is_admin: true, is_super_admin: true, totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc", totp_last_counter: 0, totp_recovery_hashes: [] }),
  user(ADMIN2, "moderator2", { is_admin: true, admin_permissions: null }),
  user(MEMBER, "kaan"),
];

const fake = createFakeSupabase({ users: seedUsers(), admin_audit: [] });
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const { requireAuth } = require("../middleware/auth");
const { socketAuthMiddleware } = require("../middleware/socketAuth");
const store = require("../lib/adminTokens/store");
const usage = require("../lib/adminTokens/usage");
const state = require("../runtime/sharedState");

const mails = [];
usage.__setMailerForTests(async (m) => {
  mails.push(m);
  return { sent: true };
});

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
  app.use("/api/me", require("../routes/meAppearance"));
  // A normal app route guarded by requireAuth only.
  app.get("/api/test/whoami", requireAuth, (req, res) => res.json({ user: req.user, apiToken: req.apiToken || null }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token, stepUp, ip, country, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}),
      ...(ip ? { "X-Forwarded-For": ip } : {}),
      ...(country ? { "CF-IPCountry": country } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, body: json, headers: res.headers };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ownerSession = signToken({ id: OWNER, username: "admin", sid: "s-admin" });
const stepUp = signStepUpToken({ id: OWNER, sid: "s-admin" });
const admin2Session = signToken({ id: ADMIN2, username: "moderator2", sid: "s-moderator2" });
const tokenRow = (id) => fake._tables.admin_api_tokens.rows.find((r) => r.id === id);
const rows = (t) => fake._tables[t]?.rows || [];

(async () => {
  const { server, base } = await startServer();
  try {
    /* ---------------- before the migration ---------------- */
    const TABLES = Object.values(store.TABLES);
    const missing = createFakeSupabase({ users: seedUsers() }, { missingTables: TABLES });
    store.__setDbForTests(missing);
    let r = await call(base, "GET", "/api/admin/tokens", { token: ownerSession });
    assert(r.status === 200 && r.body.available === false, `unavailable list: ${r.status} ${JSON.stringify(r.body)}`);
    const fakeSecret = `dsk_admin_${crypto.randomBytes(32).toString("base64url")}`;
    r = await call(base, "GET", "/api/admin/overview", { token: fakeSecret });
    assert(r.status === 401 && r.body.error === "Admin tokens are not set up yet.", `unavailable admin route: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: fakeSecret });
    assert(r.status === 401 && r.body.code === "TOKENS_UNAVAILABLE", `unavailable app route: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "x", expiresIn: "1d" } });
    assert(r.status === 503 && r.body.code === "TOKENS_UNAVAILABLE", `unavailable create: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: ownerSession });
    assert(r.status === 200 && r.body.user.id === OWNER && !r.body.apiToken, "normal sessions are unchanged");
    store.__setDbForTests(null);

    /* ---------------- owner only, step-up, create ---------------- */
    r = await call(base, "GET", "/api/admin/tokens", { token: admin2Session });
    assert(r.status === 403 && r.body.code === "OWNER_ONLY", `non-owner list: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", "/api/admin/tokens", { token: admin2Session, body: { name: "sneaky", expiresIn: "1d" } });
    assert(r.status === 403 && r.body.code === "OWNER_ONLY", `non-owner create: ${r.status}`);
    r = await call(base, "GET", "/api/admin/openapi.json", { token: admin2Session });
    assert(r.status === 403 && r.body.code === "OWNER_ONLY", `non-owner openapi: ${r.status}`);

    r = await call(base, "POST", "/api/admin/tokens", { token: ownerSession, body: { name: "Claude Code", expiresIn: "30d", ipAllowlist: [] } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", `owner session needs step-up: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "", expiresIn: "30d" } });
    assert(r.status === 400 && r.body.code === "NAME_REQUIRED", `name required: ${r.status}`);
    r = await call(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "x", expiresIn: "2w" } });
    assert(r.status === 400 && r.body.code === "BAD_EXPIRY", `bad expiry: ${r.status}`);
    r = await call(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "x", expiresIn: "1d", ipAllowlist: ["not-an-ip"] } });
    assert(r.status === 400 && r.body.code === "BAD_IP", `bad ip: ${r.status}`);

    r = await call(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "Claude Code", expiresIn: "30d", ipAllowlist: [] } });
    assert(r.status === 201, `create: ${r.status} ${JSON.stringify(r.body)}`);
    const secret = r.body.secret;
    const t1 = r.body.token;
    assert(/^dsk_admin_[A-Za-z0-9_-]{43}$/.test(secret), `secret format: ${secret}`);
    assert(t1.status === "active" && t1.expiresIn === "30d" && t1.prefix === secret.slice(10, 14) && t1.last4 === secret.slice(-4), `token view: ${JSON.stringify(t1)}`);
    assert(Array.isArray(t1.spark24h) && t1.spark24h.length === 24, "spark24h has 24 buckets");
    const stored = tokenRow(t1.id);
    assert(stored.secret_hash === crypto.createHash("sha256").update(secret).digest("hex"), "only the SHA-256 is stored");
    assert(!JSON.stringify(fake._tables).includes(secret), "the secret is nowhere in the database");
    assert(!JSON.stringify(state.auditLog).includes(secret), "the secret is not in the audit log");
    assert(state.auditLog.some((e) => e.action === "security_token_create" && e.target === `token:${t1.id}`), "create is audited");
    r = await call(base, "GET", "/api/admin/tokens", { token: ownerSession });
    assert(r.status === 200 && r.body.available === true && r.body.tokens.length === 1, `list: ${JSON.stringify(r.body).slice(0, 300)}`);
    assert(!JSON.stringify(r.body).includes(secret) && !JSON.stringify(r.body).includes(stored.secret_hash), "list never shows the secret or its hash");
    assert(r.body.summary.active === 1 && r.body.mcp.url.endsWith("/mcp") && r.body.mcp.tools > 10, `summary / mcp: ${JSON.stringify(r.body.summary)} ${JSON.stringify(r.body.mcp)}`);
    assert(r.body.autoPause.enabled === true && r.body.autoPause.rules.newCountry === true, "auto-pause defaults");

    /* ---------------- the token acts as the owner ---------------- */
    const A = { ip: "203.0.113.10", country: "TR" };
    r = await call(base, "GET", "/api/admin/overview", { token: secret, ...A });
    assert(r.status === 200, `token on an admin route: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: secret, ...A, headers: { "User-Agent": "claude-code/2.4.1" } });
    assert(r.status === 200 && r.body.user.id === OWNER && r.body.user.username === "admin" && r.body.apiToken.id === t1.id, `token on an app route: ${JSON.stringify(r.body)}`);
    r = await call(base, "GET", "/api/me/appearance", { token: secret, ...A });
    assert(r.status === 200, `real app route: ${r.status}`);
    // A token acts without a step-up code (owner decision) and may manage tokens.
    r = await call(base, "POST", "/api/admin/tokens", { token: secret, ...A, body: { name: "Made by a bot", expiresIn: "1h" } });
    assert(r.status === 201 && r.body.secret, `token creates a token without step-up: ${r.status} ${JSON.stringify(r.body)}`);
    const botMade = r.body.token;
    const createdViaToken = state.auditLog.find((e) => e.action === "security_token_create" && e.target === `token:${botMade.id}`);
    assert(createdViaToken?.meta?.actor_via === "token" && createdViaToken.meta.token_id === t1.id && createdViaToken.meta.token_name === "Claude Code", `lifecycle entry made through a token is tagged: ${JSON.stringify(createdViaToken?.meta)}`);
    // A destructive call: the ban is audited with the token tag, the call is destructive.
    r = await call(base, "POST", `/api/admin/users/${MEMBER}/ban`, { token: secret, ...A, body: { category: "spam", presetId: "7d" } });
    assert(r.status === 200, `ban through the token: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const banEntry = state.auditLog.find((e) => e.action === "ban" && e.target === MEMBER);
    assert(banEntry?.meta?.actor_via === "token" && banEntry.meta.token_id === t1.id, `ban entry tagged: ${JSON.stringify(banEntry?.meta)}`);
    await sleep(30);
    const durableBan = rows("admin_audit").find((x) => x.action === "ban" && x.target === MEMBER);
    assert(durableBan?.meta?.token_id === t1.id && durableBan.meta.token_name === "Claude Code" && durableBan.meta.actor_via === "token", `durable audit row keeps the tag: ${JSON.stringify(durableBan?.meta)}`);
    r = await call(base, "POST", `/api/admin/users/${MEMBER}/unban`, { token: secret, ...A, body: {} });
    assert(r.status === 200, `unban: ${r.status}`);

    r = await call(base, "GET", `/api/admin/tokens/${t1.id}`, { token: ownerSession });
    assert(r.status === 200, `detail: ${r.status}`);
    const u = r.body.usage;
    assert(u.total24h >= 6 && u.recentCalls.length >= 6 && u.hourly24.length === 24, `usage totals: ${JSON.stringify(u).slice(0, 300)}`);
    const banCall = u.recentCalls.find((c) => c.path === "/api/admin/users/:id/ban");
    assert(banCall && banCall.destructive === true && banCall.via === "rest" && banCall.auditId === banEntry.id && banCall.ip === A.ip && banCall.country === "TR", `ban call recorded: ${JSON.stringify(banCall)}`);
    assert(u.topEndpoints.some((e) => e.method === "GET" && e.path === "/api/admin/overview"), `top endpoints: ${JSON.stringify(u.topEndpoints)}`);
    assert(u.ips7d.some((x) => x.ip === A.ip && x.country === "TR" && x.allowed === true), `ips7d: ${JSON.stringify(u.ips7d)}`);
    assert(r.body.token.lastUsedAt === null || typeof r.body.token.lastUsedAt === "string", "lastUsedAt shape");
    assert(r.body.audit.some((a) => a.action === "security_token_create") && r.body.audit.some((a) => a.action === "ban" && a.auditId === banEntry.id && a.undoable === true), `token audit: ${JSON.stringify(r.body.audit)}`);
    const firstAt = u.recentCalls[u.recentCalls.length - 1].at;
    r = await call(base, "GET", `/api/admin/tokens/${t1.id}/calls?after=${encodeURIComponent(firstAt)}`, { token: ownerSession });
    assert(r.status === 200 && r.body.calls.length >= 1 && r.body.calls.every((c) => c.at > firstAt), `calls after: ${JSON.stringify(r.body).slice(0, 200)}`);

    // Batched writes: hourly aggregate, calls tail, request counter and last-used fields.
    await usage.flush();
    const hourly = rows("admin_api_token_usage_hourly").filter((x) => x.token_id === t1.id);
    assert(hourly.length === 1 && hourly[0].count >= 6 && hourly[0].destructive >= 1 && hourly[0].d_ban >= 1, `hourly row: ${JSON.stringify(hourly)}`);
    assert(rows("admin_api_token_calls").some((x) => x.token_id === t1.id && x.destructive && x.destructive_kind === "ban"), "destructive call in the DB tail");
    assert(Number(tokenRow(t1.id).request_count) >= 6 && tokenRow(t1.id).last_used_ip === A.ip && tokenRow(t1.id).last_used_country === "TR", `token row touched: ${JSON.stringify(tokenRow(t1.id))}`);
    assert(String(tokenRow(t1.id).last_client || "").length > 0, "last client stored");
    r = await call(base, "GET", "/api/admin/tokens", { token: ownerSession });
    const listed = r.body.tokens.find((t) => t.id === t1.id);
    assert(listed.requests24h >= 6 && listed.spark24h[23] >= 6 && r.body.summary.destructive24h.ban >= 1 && r.body.summary.requests24h >= 6, `list usage: ${JSON.stringify(listed)} ${JSON.stringify(r.body.summary)}`);

    /* ---------------- paused / expired / wrong IP ---------------- */
    r = await call(base, "PATCH", `/api/admin/tokens/${t1.id}`, { token: ownerSession, body: { paused: true } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "pause needs step-up for a session");
    r = await call(base, "PATCH", `/api/admin/tokens/${t1.id}`, { token: ownerSession, stepUp, body: { paused: true } });
    assert(r.status === 200 && r.body.token.status === "paused", `pause: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: secret, ...A });
    assert(r.status === 401 && r.body.code === "TOKEN_PAUSED", `paused refused at once: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "PATCH", `/api/admin/tokens/${t1.id}`, { token: ownerSession, stepUp, body: { paused: false, name: "Claude Code (laptop)" } });
    assert(r.status === 200 && r.body.token.status === "active" && r.body.token.name === "Claude Code (laptop)", "resume + rename");
    assert(state.auditLog.some((e) => e.action === "security_token_pause") && state.auditLog.some((e) => e.action === "security_token_resume") && state.auditLog.some((e) => e.action === "security_token_rename"), "pause / resume / rename audited");
    r = await call(base, "GET", "/api/test/whoami", { token: secret, ...A });
    assert(r.status === 200, "resumed token works");

    tokenRow(botMade.id).expires_at = new Date(Date.now() - 1000).toISOString();
    store.invalidate();
    r = await call(base, "GET", "/api/admin/tokens", { token: ownerSession });
    assert(r.body.tokens.find((t) => t.id === botMade.id).status === "expired", "expired status in the list");

    r = await call(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "Office only", expiresIn: "7d", ipAllowlist: ["198.51.100.0/24"] } });
    assert(r.status === 201 && r.body.token.ipAllowlist[0] === "198.51.100.0/24", "allowlisted token");
    const officeSecret = r.body.secret;
    const office = r.body.token;
    r = await call(base, "GET", "/api/test/whoami", { token: officeSecret, ip: "203.0.113.50" });
    assert(r.status === 403 && r.body.code === "TOKEN_IP_NOT_ALLOWED", `wrong IP: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: officeSecret, ip: "198.51.100.7" });
    assert(r.status === 200, `allowed IP: ${r.status}`);

    r = await call(base, "GET", "/api/test/whoami", { token: `dsk_admin_${crypto.randomBytes(32).toString("base64url")}` });
    assert(r.status === 401 && r.body.code === "TOKEN_INVALID", "unknown token");
    r = await call(base, "GET", "/api/test/whoami", { token: "dsk_admin_short" });
    assert(r.status === 401 && r.body.code === "TOKEN_INVALID", "malformed token");

    /* ---------------- rotate with grace ---------------- */
    r = await call(base, "POST", `/api/admin/tokens/${office.id}/rotate`, { token: ownerSession, stepUp, body: { graceMinutes: 30 } });
    assert(r.status === 400 && r.body.code === "BAD_GRACE", "grace options");
    r = await call(base, "POST", `/api/admin/tokens/${office.id}/rotate`, { token: ownerSession, stepUp, body: { graceMinutes: 60 } });
    assert(r.status === 200 && r.body.secret && r.body.secret !== officeSecret && r.body.token.graceUntil, `rotate: ${JSON.stringify(r.body).slice(0, 200)}`);
    const officeSecret2 = r.body.secret;
    r = await call(base, "GET", "/api/test/whoami", { token: officeSecret, ip: "198.51.100.7" });
    assert(r.status === 200, "old secret works during the grace window");
    r = await call(base, "GET", "/api/test/whoami", { token: officeSecret2, ip: "198.51.100.7" });
    assert(r.status === 200, "new secret works");
    tokenRow(office.id).grace_until = new Date(Date.now() - 1000).toISOString();
    store.invalidate();
    r = await call(base, "GET", "/api/test/whoami", { token: officeSecret, ip: "198.51.100.7" });
    assert(r.status === 401 && r.body.code === "TOKEN_ROTATED", `old secret after the grace window: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", `/api/admin/tokens/${office.id}/rotate`, { token: ownerSession, stepUp, body: { graceMinutes: 0 } });
    const officeSecret3 = r.body.secret;
    r = await call(base, "GET", "/api/test/whoami", { token: officeSecret2, ip: "198.51.100.7" });
    assert(r.status === 401 && r.body.code === "TOKEN_INVALID", "rotate without grace: the previous secret stops at once");
    r = await call(base, "GET", "/api/test/whoami", { token: officeSecret3, ip: "198.51.100.7" });
    assert(r.status === 200, "newest secret works");

    /* ---------------- revoke / restore ---------------- */
    r = await call(base, "POST", `/api/admin/tokens/${office.id}/revoke`, { token: ownerSession, stepUp, body: { reason: "leaked", note: "test", confirmName: "Office" } });
    assert(r.status === 400 && r.body.code === "CONFIRM_MISMATCH", "revoke needs the exact name");
    r = await call(base, "POST", `/api/admin/tokens/${office.id}/revoke`, { token: ownerSession, stepUp, body: { reason: "leaked", note: "test", confirmName: "Office only" } });
    assert(r.status === 200 && r.body.token.status === "revoked" && r.body.token.restorableUntil && r.body.token.revokeReason === "leaked", `revoke: ${JSON.stringify(r.body).slice(0, 300)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: officeSecret3, ip: "198.51.100.7" });
    assert(r.status === 401 && r.body.code === "TOKEN_REVOKED", "revoked refused at once");
    r = await call(base, "POST", `/api/admin/tokens/${office.id}/restore`, { token: ownerSession });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "restore needs step-up");
    r = await call(base, "POST", `/api/admin/tokens/${office.id}/restore`, { token: ownerSession, stepUp });
    assert(r.status === 200 && r.body.token.status === "active", `restore: ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: officeSecret3, ip: "198.51.100.7" });
    assert(r.status === 200, "restored token works");
    r = await call(base, "POST", `/api/admin/tokens/${office.id}/revoke`, { token: ownerSession, stepUp, body: { reason: "unused", confirmName: "Office only" } });
    tokenRow(office.id).revoked_at = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    store.invalidate();
    r = await call(base, "POST", `/api/admin/tokens/${office.id}/restore`, { token: ownerSession, stepUp });
    assert(r.status === 400 && r.body.code === "RESTORE_EXPIRED", `restore after 10 minutes: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "GET", "/api/admin/tokens/00000000-0000-4000-8000-00000000ffff", { token: ownerSession });
    assert(r.status === 404 && r.body.code === "TOKEN_NOT_FOUND", "unknown token id");
    assert(["security_token_rotate", "security_token_revoke", "security_token_restore"].every((a) => state.auditLog.some((e) => e.action === a)), "rotate / revoke / restore audited");

    /* ---------------- socket.io ---------------- */
    const sockEvents = [];
    const fakeSocket = {
      handshake: { auth: { token: secret }, headers: { "x-forwarded-for": A.ip, "cf-ipcountry": "TR" }, address: "127.0.0.1" },
      emit: (e, p) => sockEvents.push([e, p]),
      disconnect: () => sockEvents.push(["disconnect"]),
      once: () => {},
    };
    const sockErr = await new Promise((resolve) => socketAuthMiddleware(fakeSocket, resolve));
    assert(!sockErr && fakeSocket.user?.id === OWNER && fakeSocket.apiToken?.id === t1.id && fakeSocket.user.sid === null, `socket auth with a token: ${sockErr?.message} ${JSON.stringify(fakeSocket.user)}`);
    const badSocket = { handshake: { auth: {}, headers: { authorization: `Bearer ${officeSecret3}` }, address: "127.0.0.1" }, once: () => {} };
    const badErr = await new Promise((resolve) => socketAuthMiddleware(badSocket, resolve));
    assert(badErr instanceof Error && /revoked/i.test(badErr.message) && !badSocket.user, `revoked token on a socket: ${badErr?.message}`);

    /* ---------------- alerts: new IP, new country + auto-pause, allow_ip ---------------- */
    r = await call(base, "GET", "/api/test/whoami", { token: secret, ip: "203.0.113.11", country: "TR" });
    assert(r.status === 200, "a second address in the same country still works (newIp rule off)");
    let alerts = rows("admin_api_token_alerts").filter((a) => a.token_id === t1.id);
    assert(alerts.length === 1 && alerts[0].kind === "new_ip" && alerts[0].auto_paused === false && alerts[0].detail.previousIp === A.ip, `new_ip alert: ${JSON.stringify(alerts)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: secret, ip: "192.0.2.77", country: "DE" });
    assert(r.status === 401 && r.body.code === "TOKEN_PAUSED", `new country auto-pauses before the request runs: ${r.status} ${JSON.stringify(r.body)}`);
    alerts = rows("admin_api_token_alerts").filter((a) => a.token_id === t1.id);
    const countryAlert = alerts.find((a) => a.kind === "new_country");
    assert(countryAlert && countryAlert.auto_paused === true && countryAlert.country === "DE" && countryAlert.detail.previousCountry === "TR", `new_country alert: ${JSON.stringify(countryAlert)}`);
    assert(tokenRow(t1.id).paused === true && tokenRow(t1.id).paused_reason === "auto:new_country", "token auto-paused");
    assert(sockEvents.some(([e]) => e === "disconnect"), "the token's socket was dropped on the auto-pause");
    assert(emitted.some((x) => x.room === `user:${OWNER}` && x.event === "admin:token-alert" && x.payload.kind === "new_country"), "owner notified live");
    await sleep(20);
    assert(mails.length >= 1 && /admin token/i.test(mails[0].subject), `owner e-mailed: ${JSON.stringify(mails[0])}`);
    assert(state.auditLog.some((e) => e.action === "security_token_auto_pause" && e.target === `token:${t1.id}`), "auto-pause audited");
    r = await call(base, "GET", "/api/admin/tokens", { token: ownerSession });
    assert(r.body.summary.alerts >= 2 && r.body.alerts[0].status === "open" && r.body.alerts.some((a) => a.kind === "new_country" && a.autoPaused && a.tokenName === "Claude Code (laptop)"), `alerts in the list: ${JSON.stringify(r.body.alerts)}`);
    assert(r.body.tokens.find((t) => t.id === t1.id).hasOpenAlert === true, "hasOpenAlert");
    r = await call(base, "POST", `/api/admin/tokens/alerts/${countryAlert.id}`, { token: ownerSession, stepUp, body: { action: "nope" } });
    assert(r.status === 400, "alert action validated");
    r = await call(base, "POST", `/api/admin/tokens/alerts/${countryAlert.id}`, { token: ownerSession, stepUp, body: { action: "allow_ip" } });
    assert(r.status === 200 && r.body.alert.status === "resolved" && r.body.token.status === "active", `allow_ip lifts the auto-pause: ${JSON.stringify(r.body).slice(0, 300)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: secret, ip: "192.0.2.77", country: "DE" });
    assert(r.status === 200, "the allowed address works");
    const ipAlert = alerts.find((a) => a.kind === "new_ip");
    r = await call(base, "POST", `/api/admin/tokens/alerts/${ipAlert.id}`, { token: ownerSession, stepUp, body: { action: "dismiss" } });
    assert(r.status === 200 && r.body.alert.status === "dismissed", "dismiss");

    // Auto-pause off: an alert, no pause.
    r = await call(base, "PUT", "/api/admin/tokens/auto-pause", { token: ownerSession, stepUp, body: { enabled: false, rules: { newCountry: true, newIp: true, burst: true } } });
    assert(r.status === 200 && r.body.autoPause.enabled === false && r.body.autoPause.rules.newIp === true, `auto-pause settings: ${JSON.stringify(r.body)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: secret, ip: "198.18.0.9", country: "US" });
    assert(r.status === 200, "with auto-pause off a new country only alerts");
    assert(rows("admin_api_token_alerts").some((a) => a.token_id === t1.id && a.country === "US" && a.auto_paused === false), "US alert without pause");

    /* ---------------- burst + auto-pause ---------------- */
    r = await call(base, "PUT", "/api/admin/tokens/auto-pause", { token: ownerSession, stepUp, body: { enabled: true, rules: { newCountry: true, newIp: false, burst: true } } });
    r = await call(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "Loop bot", expiresIn: "1d" } });
    const loopSecret = r.body.secret;
    const loop = r.body.token;
    let last = null;
    for (let n = 0; n < 60; n += 1) {
      last = await call(base, "GET", "/api/test/whoami", { token: loopSecret, ip: "203.0.113.200", country: "TR" });
      if (last.status !== 200) break;
    }
    await sleep(50);
    const burst = rows("admin_api_token_alerts").find((a) => a.token_id === loop.id && a.kind === "burst");
    assert(burst && burst.detail.count >= 50 && burst.detail.windowMin === 5 && burst.auto_paused === true, `burst alert: ${JSON.stringify(burst)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: loopSecret, ip: "203.0.113.200", country: "TR" });
    assert(r.status === 401 && r.body.code === "TOKEN_PAUSED", "burst auto-paused the token");

    /* ---------------- OpenAPI ---------------- */
    r = await call(base, "GET", "/api/admin/openapi.json", { token: ownerSession });
    assert(r.status === 200 && r.body.openapi === "3.1.0" && r.body.paths && r.body.components.securitySchemes.bearerAuth, `openapi: ${r.status}`);
    const banOp = r.body.paths["/api/admin/users/{id}/ban"]?.post;
    assert(banOp && banOp.parameters?.[0]?.name === "id" && banOp.parameters[0].in === "path" && banOp["x-destructive"] === "ban" && /Ban a user/.test(banOp.summary) && banOp.tags[0] === "Admin: Moderation", `ban operation: ${JSON.stringify(banOp)}`);
    assert(r.body.paths["/api/admin/tokens"]?.get && r.body.paths["/api/me/appearance"]?.get, "admin and app paths are listed");
    assert(Object.keys(r.body.paths).every((p) => p.startsWith("/api/")), "only /api paths");
    r = await call(base, "GET", "/api/admin/openapi.json", { token: secret, ip: "192.0.2.77", country: "DE" });
    assert(r.status === 200 && r.body.openapi === "3.1.0", "a token reads openapi.json");

    /* ---------------- revoke-all ---------------- */
    r = await call(base, "POST", "/api/admin/tokens/revoke-all", { token: ownerSession, stepUp, body: { reason: "leaked", confirm: "tumunu iptal et" } });
    assert(r.status === 400 && r.body.code === "CONFIRM_MISMATCH", "revoke-all needs the phrase");
    r = await call(base, "POST", "/api/admin/tokens/revoke-all", { token: ownerSession, body: { reason: "leaked", confirm: "TÜMÜNÜ İPTAL ET" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "revoke-all needs step-up");
    r = await call(base, "POST", "/api/admin/tokens/revoke-all", { token: ownerSession, stepUp, body: { reason: "leaked", confirm: "TÜMÜNÜ İPTAL ET" } });
    assert(r.status === 200 && r.body.revoked === 3, `revoke-all: ${JSON.stringify(r.body)}`);
    r = await call(base, "GET", "/api/test/whoami", { token: secret, ip: "192.0.2.77", country: "DE" });
    assert(r.status === 401 && r.body.code === "TOKEN_REVOKED", "all tokens revoked");
    assert(state.auditLog.some((e) => e.action === "security_token_revoke_all" && e.meta.count === 3), "revoke-all audited");

    console.log("adminTokens integration: ok");
  } finally {
    server.close();
  }
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
