"use strict";

/**
 * Admin Token MCP endpoint (lib/adminTokens/mcp.js, Streamable HTTP 2025-06-18) over real
 * HTTP and the fake db: auth failures (WWW-Authenticate), initialize + session id,
 * notifications, tools/list, tools/call (api_request, describe_api, a curated read tool
 * and a destructive curated tool through loopback with the same token), usage recorded
 * once with via "mcp" and the tool name, no address alert for the loopback hop, session
 * end, revoked token refused, JSON parse errors.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const OWNER = "00000000-0000-4000-8000-0000000000b1";
const MEMBER = "00000000-0000-4000-8000-0000000000b3";

function user(id, username, extra = {}) {
  return { id, username, display_name: username, is_admin: false, active_sessions: [{ id: `s-${username}` }], created_at: "2026-01-01T00:00:00.000Z", ...extra };
}

const fake = createFakeSupabase({
  users: [user(OWNER, "admin", { is_admin: true, is_super_admin: true, totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" }), user(MEMBER, "elif")],
  admin_audit: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const mcpRoutes = require("../routes/mcp");
const usage = require("../lib/adminTokens/usage");
const mcpLib = require("../lib/adminTokens/mcp");
const tokenAuth = require("../lib/adminTokens/auth");
const store = require("../lib/adminTokens/store");
const state = require("../runtime/sharedState");

usage.__setMailerForTests(async () => ({ sent: true }));

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const io = {
  sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
  in() {
    return { fetchSockets: async () => [] };
  },
  to() {
    return { emit() {}, to() { return this; } };
  },
  emit() {},
};

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/mcp", mcpRoutes);
  app.use("/mcp", mcpRoutes.parseErrorHandler);
  app.use("/api/admin", adminRouter);
  app.use("/api/me", require("../routes/meAppearance"));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

// The bot's address through one Cloudflare hop (173.245.48.5), as the strict token check expects.
const BOT = { "X-Forwarded-For": "203.0.113.40, 173.245.48.5", "CF-IPCountry": "NL" };

async function rpc(base, body, { token, session, headers = {}, raw = null } = {}) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(session ? { "Mcp-Session-Id": session, "MCP-Protocol-Version": "2025-06-18" } : {}),
      ...BOT,
      ...headers,
    },
    body: raw !== null ? raw : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function rest(base, method, path, { body, token, stepUp } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...BOT, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const parseText = (r) => JSON.parse(r.body.result.content[0].text);

(async () => {
  const { server, base } = await startServer();
  const ownerSession = signToken({ id: OWNER, username: "admin", sid: "s-admin" });
  const stepUp = signStepUpToken({ id: OWNER, sid: "s-admin" });
  try {
    let r = await rest(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "Claude Desktop", expiresIn: "7d" } });
    assert(r.status === 201, `create: ${r.status} ${JSON.stringify(r.body)}`);
    const secret = r.body.secret;
    const tokenId = r.body.token.id;

    /* ---------------- auth ---------------- */
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "2.4.1" } } };
    r = await rpc(base, init);
    assert(r.status === 401 && /Bearer realm="descall-mcp"/.test(r.headers.get("www-authenticate") || ""), `no auth: ${r.status} ${r.headers.get("www-authenticate")}`);
    r = await rpc(base, init, { token: ownerSession });
    assert(r.status === 401 && r.body.code === "TOKEN_REQUIRED" && r.headers.get("www-authenticate"), "a session JWT is not enough for MCP");
    r = await rpc(base, init, { token: `dsk_admin_${"A".repeat(43)}` });
    assert(r.status === 401 && r.body.code === "TOKEN_INVALID" && r.headers.get("www-authenticate"), `unknown admin token: ${r.status} ${JSON.stringify(r.body)}`);
    r = await rpc(base, init, { token: secret, headers: { Origin: "https://evil.example" } });
    assert(r.status === 403, "foreign browser Origin refused");

    /* ---------------- initialize ---------------- */
    r = await rpc(base, init, { token: secret });
    assert(r.status === 200 && r.body.jsonrpc === "2.0" && r.body.id === 1, `initialize: ${r.status} ${JSON.stringify(r.body)}`);
    assert(r.body.result.protocolVersion === "2025-06-18" && r.body.result.capabilities.tools && r.body.result.serverInfo.name === "descall-admin" && r.body.result.instructions, "initialize result");
    const session = r.headers.get("mcp-session-id");
    assert(session && session.length >= 16, `session id header: ${session}`);
    r = await rpc(base, { jsonrpc: "2.0", method: "notifications/initialized" }, { token: secret, session });
    assert(r.status === 202 && r.body === null, `initialized notification: ${r.status}`);
    r = await rpc(base, { jsonrpc: "2.0", id: 2, method: "ping" }, { token: secret, session });
    assert(r.status === 200 && r.body.id === 2 && JSON.stringify(r.body.result) === "{}", "ping");
    r = await rpc(base, { jsonrpc: "2.0", id: 3, method: "tools/list" }, { token: secret });
    assert(r.status === 400, "a request without the session id is refused");
    r = await rpc(base, { jsonrpc: "2.0", id: 3, method: "tools/list" }, { token: secret, session: "nope-not-a-session" });
    assert(r.status === 404, "unknown session id: 404");
    r = await rpc(base, { jsonrpc: "2.0", id: 3, method: "tools/list" }, { token: secret, session, headers: { "MCP-Protocol-Version": "1999-01-01" } });
    assert(r.status === 400, "unsupported protocol version header");

    /* ---------------- tools/list ---------------- */
    r = await rpc(base, { jsonrpc: "2.0", id: 4, method: "tools/list" }, { token: secret, session });
    assert(r.status === 200 && Array.isArray(r.body.result.tools), `tools/list: ${r.status}`);
    const names = r.body.result.tools.map((t) => t.name);
    for (const n of ["api_request", "describe_api", "search_users", "user_dossier", "ban_user", "unban_user", "reports", "dm_conversations", "read_dm", "descoin_grant", "shop_items", "shop_gift", "create_announcement", "list_servers", "overview", "admin_audit", "system_health"]) {
      assert(names.includes(n), `tool ${n} listed`);
    }
    const banTool = r.body.result.tools.find((t) => t.name === "ban_user");
    assert(banTool.inputSchema.type === "object" && banTool.inputSchema.required.includes("userId") && banTool.annotations.destructiveHint === true, `ban_user schema: ${JSON.stringify(banTool)}`);
    assert(r.body.result.tools.find((t) => t.name === "overview").annotations.readOnlyHint === true, "read tools are read-only");

    /* ---------------- tools/call ---------------- */
    r = await rpc(base, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "api_request", arguments: { method: "GET", path: "/api/admin/tokens" } } }, { token: secret, session });
    assert(r.status === 200 && r.body.result.isError === false, `api_request: ${JSON.stringify(r.body).slice(0, 300)}`);
    const listed = parseText(r);
    assert(listed.available === true && listed.tokens.some((t) => t.id === tokenId), "api_request returns the endpoint's JSON");
    r = await rpc(base, { jsonrpc: "2.0", id: 51, method: "tools/call", params: { name: "api_request", arguments: { method: "POST", path: "/api/admin/tokens", body: { name: "Bot made", expiresIn: "never" } } } }, { token: secret, session });
    assert(r.body.result.isError === true && /TOKEN_SELF_MANAGEMENT/.test(r.body.result.content[0].text), `a token cannot mint tokens through MCP: ${JSON.stringify(r.body).slice(0, 300)}`);
    r = await rpc(base, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "api_request", arguments: { method: "GET", path: "/api/me/appearance" } } }, { token: secret, session });
    assert(r.status === 200 && r.body.result.isError === false, "api_request reaches app routes too");
    r = await rpc(base, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "api_request", arguments: { method: "GET", path: "/admin/../etc" } } }, { token: secret, session });
    assert(r.status === 200 && r.body.result.isError === true && /\/api\//.test(r.body.result.content[0].text), "api_request path must start with /api/");
    r = await rpc(base, { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "api_request", arguments: { method: "GET", path: "/api/admin/../../health" } } }, { token: secret, session });
    assert(r.body.result.isError === true, "dot segments refused");

    r = await rpc(base, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "describe_api", arguments: { q: "ban" } } }, { token: secret, session });
    const described = parseText(r);
    assert(described.operations.some((o) => o.method === "POST" && o.path === "/api/admin/users/{id}/ban" && o.summary), `describe_api: ${JSON.stringify(described).slice(0, 300)}`);

    r = await rpc(base, { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "search_users", arguments: { q: "elif" } } }, { token: secret, session });
    assert(r.status === 200 && r.body.result.isError === false, `curated read tool: ${JSON.stringify(r.body).slice(0, 300)}`);
    r = await rpc(base, { jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "ban_user", arguments: { userId: MEMBER } } }, { token: secret, session });
    assert(r.body.result.isError === true && /category/.test(r.body.result.content[0].text), "missing required argument is a tool error");
    r = await rpc(base, { jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "ban_user", arguments: { userId: MEMBER, category: "spam", presetId: "7d", message: "Spam" } } }, { token: secret, session });
    assert(r.status === 200 && r.body.result.isError === false, `ban_user: ${JSON.stringify(r.body).slice(0, 300)}`);
    const banEntry = state.auditLog.find((e) => e.action === "ban" && e.target === MEMBER);
    assert(banEntry && banEntry.meta.actor_via === "token" && banEntry.meta.token_id === tokenId && banEntry.meta.token_name === "Claude Desktop", `MCP ban audited with the token: ${JSON.stringify(banEntry?.meta)}`);
    r = await rpc(base, { jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "unban_user", arguments: { userId: MEMBER } } }, { token: secret, session });
    assert(r.body.result.isError === false, "unban_user");
    r = await rpc(base, { jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "no_such_tool", arguments: {} } }, { token: secret, session });
    assert(r.body.error && r.body.error.code === -32602, "unknown tool is a JSON-RPC error");
    r = await rpc(base, { jsonrpc: "2.0", id: 15, method: "nope/nope" }, { token: secret, session });
    assert(r.body.error && r.body.error.code === -32601, "unknown method");
    r = await rpc(base, null, { token: secret, session, raw: "{not json" });
    assert(r.status === 400 && r.body.error.code === -32700, `parse error: ${r.status} ${JSON.stringify(r.body)}`);

    /* ---------------- usage: recorded once, via mcp ---------------- */
    r = await rest(base, "GET", `/api/admin/tokens/${tokenId}`, { token: ownerSession });
    const calls = r.body.usage.recentCalls;
    const mcpBan = calls.find((c) => c.tool === "ban_user" && c.status === 200);
    assert(mcpBan && mcpBan.via === "mcp" && mcpBan.method === "MCP" && mcpBan.path === "tools/call ban_user" && mcpBan.destructive === true && mcpBan.auditId === banEntry.id && mcpBan.ip === "203.0.113.40" && mcpBan.country === "NL", `MCP ban call: ${JSON.stringify(mcpBan)}`);
    assert(!calls.some((c) => c.via === "rest" && c.path.startsWith("/api/admin/users/")), "the loopback hop is not recorded a second time");
    assert(calls.every((c) => c.ip !== "127.0.0.1"), "no loopback address in the usage");
    assert(r.body.usage.topEndpoints.some((e) => e.method === "MCP" && e.path === "tools/call ban_user"), `MCP in top endpoints: ${JSON.stringify(r.body.usage.topEndpoints)}`);
    assert(r.body.usage.mcpShare > 0.5, `mcp share: ${r.body.usage.mcpShare}`);
    assert(r.body.token.lastClient === null || typeof r.body.token.lastClient === "string", "lastClient shape");
    assert(!fake._tables.admin_api_token_alerts || fake._tables.admin_api_token_alerts.rows.length === 0, "no new-IP alert for the loopback hop");
    await usage.flush();
    const row = fake._tables.admin_api_tokens.rows.find((x) => x.id === tokenId);
    assert(row.last_client === "Claude Code 2.4", `client label from clientInfo: ${row.last_client}`);
    r = await rest(base, "GET", "/api/admin/tokens", { token: ownerSession });
    assert(r.body.mcp.openSessions >= 1 && r.body.mcp.tools > 20 && r.body.mcp.p50Ms >= 0, `mcp summary: ${JSON.stringify(r.body.mcp)}`);

    /* ---------------- limits: batch size, streams per session, tools/call budget ---------------- */
    const batch = Array.from({ length: mcpLib.MAX_BATCH + 1 }, (_, n) => ({ jsonrpc: "2.0", id: 100 + n, method: "ping" }));
    r = await rpc(base, batch, { token: secret, session });
    assert(r.status === 400 && r.body.error.code === -32600 && /Batch too large/.test(r.body.error.message), `batch over ${mcpLib.MAX_BATCH}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await rpc(base, batch.slice(0, 2), { token: secret, session });
    assert(r.status === 200 && Array.isArray(r.body) && r.body.length === 2, "a small batch still works");
    const streamCtrls = [];
    const openStream = async () => {
      const c = new AbortController();
      streamCtrls.push(c);
      return fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${secret}`, Accept: "text/event-stream", "Mcp-Session-Id": session, ...BOT }, signal: c.signal });
    };
    const st1 = await openStream();
    const st2 = await openStream();
    const st3 = await openStream();
    assert(st1.status === 200 && st2.status === 200 && st3.status === 429, `streams per session: ${st1.status} ${st2.status} ${st3.status}`);
    for (const c of streamCtrls) c.abort();
    await new Promise((res) => setTimeout(res, 50));

    r = await rest(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "Budget", expiresIn: "1d" } });
    const budgetSecret = r.body.secret;
    r = await rpc(base, init, { token: budgetSecret });
    const budgetSession = r.headers.get("mcp-session-id");
    mcpLib.__setLimitForTests({ windowMs: 60 * 1000, max: 3 });
    const ping = (id) => rpc(base, { jsonrpc: "2.0", id, method: "tools/call", params: { name: "system_health", arguments: {} } }, { token: budgetSecret, session: budgetSession });
    const budget = [];
    for (let n = 0; n < 4; n += 1) budget.push((await ping(200 + n)).status);
    mcpLib.__setLimitForTests(null);
    assert(budget.slice(0, 2).every((x) => x === 200) && budget[3] === 429, `each tools/call counts against the MCP budget: ${budget}`);

    /* ---------------- sessions follow the rotated secret ---------------- */
    r = await rest(base, "POST", "/api/admin/tokens", { token: ownerSession, stepUp, body: { name: "Rotating", expiresIn: "1d" } });
    const rot = r.body;
    r = await rpc(base, init, { token: rot.secret });
    const rotSession = r.headers.get("mcp-session-id");
    r = await rest(base, "POST", `/api/admin/tokens/${rot.token.id}/rotate`, { token: ownerSession, stepUp, body: { graceMinutes: 60 } });
    const rotSecret2 = r.body.secret;
    r = await rpc(base, { jsonrpc: "2.0", id: 300, method: "ping" }, { token: rot.secret, session: rotSession });
    assert(r.status === 200, "the old secret's session lives through the grace window");
    fake._tables.admin_api_tokens.rows.find((x) => x.id === rot.token.id).grace_until = new Date(Date.now() - 1000).toISOString();
    store.invalidate();
    await tokenAuth.sweepNow();
    r = await rpc(base, { jsonrpc: "2.0", id: 301, method: "ping" }, { token: rotSecret2, session: rotSession });
    assert(r.status === 404, `the end of the grace window closes the old secret's session: ${r.status}`);
    r = await rpc(base, init, { token: rotSecret2 });
    const rotSession2 = r.headers.get("mcp-session-id");
    r = await rest(base, "POST", `/api/admin/tokens/${rot.token.id}/rotate`, { token: ownerSession, stepUp, body: { graceMinutes: 0 } });
    const rotSecret3 = r.body.secret;
    r = await rpc(base, { jsonrpc: "2.0", id: 302, method: "ping" }, { token: rotSecret3, session: rotSession2 });
    assert(r.status === 404, "rotate without grace closes the session at once");

    /* ---------------- GET stream, DELETE, revoked ---------------- */
    const ctrl = new AbortController();
    const stream = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${secret}`, Accept: "text/event-stream", "Mcp-Session-Id": session, ...BOT }, signal: ctrl.signal });
    assert(stream.status === 200 && /text\/event-stream/.test(stream.headers.get("content-type") || ""), `GET stream: ${stream.status}`);
    ctrl.abort();
    const del = await fetch(`${base}/mcp`, { method: "DELETE", headers: { Authorization: `Bearer ${secret}`, "Mcp-Session-Id": session, ...BOT } });
    assert(del.status === 204, `DELETE session: ${del.status}`);
    r = await rpc(base, { jsonrpc: "2.0", id: 16, method: "tools/list" }, { token: secret, session });
    assert(r.status === 404, "ended session is gone");

    r = await rpc(base, init, { token: secret });
    const session2 = r.headers.get("mcp-session-id");
    r = await rest(base, "POST", `/api/admin/tokens/${tokenId}/revoke`, { token: ownerSession, stepUp, body: { reason: "replaced", confirmName: "Claude Desktop" } });
    assert(r.status === 200 && r.body.token.status === "revoked", "revoke");
    r = await rpc(base, { jsonrpc: "2.0", id: 17, method: "tools/list" }, { token: secret, session: session2 });
    assert(r.status === 401 && r.body.code === "TOKEN_REVOKED" && r.headers.get("www-authenticate"), `revoked token on MCP: ${r.status} ${JSON.stringify(r.body)}`);

    console.log("adminTokens MCP integration: ok");
  } finally {
    server.close();
  }
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
