"use strict";

/**
 * 3.7.31: server invite links bounced to the home page. The preview endpoints
 * (GET /servers/invites/:code, GET /servers/vanity/:slug) required a login, so
 * a logged-out visitor could never see the server. They are public now:
 *   - logged out: name, icon, member + online count only (no owner id, rules,
 *     invite creator id / use counts), rate limited per IP
 *   - logged in: full payload with isMember
 *   - a bad Bearer token is still 401 (not silently anonymous)
 *   - expired / used up / unknown codes: 410 / 404 with INVITE_* codes
 *   - join still requires auth
 * Synthetic data in an in-memory fake Supabase; nothing reaches a database.
 * Run: node frontend/backend/test/serverInvitePreview.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.PUBLIC_APP_URL = "https://descall.com";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };
const P = require("../lib/serverPermissions");

const ts = (i) => new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString();
const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
const users = ["owner", "member", "newbie"].map((id) => ({ id, username: id, display_name: id.toUpperCase(), active_sessions: [{ id: `s-${id}` }] }));
const fake = createFakeSupabase({
  users,
  servers: [
    { id: "srv", owner_id: "owner", name: "Oyun Gecesi", icon_url: null, description: "Cuma oyun", rules_text: "kural", community_enabled: true, vanity_slug: "oyungecesi", is_public: false, verification_level: "none", created_at: ts(1) },
  ],
  server_members: [
    { server_id: "srv", user_id: "owner", joined_at: ts(1) },
    { server_id: "srv", user_id: "member", joined_at: ts(2) },
  ],
  server_roles: [{ id: "srv-everyone", server_id: "srv", is_everyone: true, position: 0, permissions: P.toPgBigint(P.EVERYONE_DEFAULT), created_at: ts(0) }],
  server_member_roles: [],
  server_channels: [{ id: "srv-general", server_id: "srv", type: "text", name: "genel", position: 0, created_at: ts(1) }],
  server_channel_overrides: [],
  server_invites: [
    { code: "GOODCODE", server_id: "srv", creator_id: "owner", uses: 0, max_uses: null, expires_at: future, created_at: ts(1) },
    { code: "OLDCODE1", server_id: "srv", creator_id: "owner", uses: 0, max_uses: null, expires_at: past, created_at: ts(1) },
    { code: "USEDUP01", server_id: "srv", creator_id: "owner", uses: 1, max_uses: 1, created_at: ts(1) },
  ],
  server_bans: [],
  server_audit_logs: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const serversRouter = require("../routes/servers");
const io = { to: () => ({ emit() {} }), in: () => ({ emit() {}, fetchSockets: async () => [], socketsJoin() {}, socketsLeave() {} }), emit() {}, of() { return io; }, fetchSockets: async () => [], sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };

async function run() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/servers", serversRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (who, method, p) => {
    const headers = { "Content-Type": "application/json" };
    if (who === "bad") headers.Authorization = "Bearer not.a.token";
    else if (who) headers.Authorization = `Bearer ${signToken({ id: who, username: who, sid: `s-${who}` })}`;
    const res = await fetch(base + p, { method, headers, body: method === "POST" ? "{}" : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  try {
    // Logged out preview works and is minimal.
    let r = await call(null, "GET", "/servers/invites/GOODCODE");
    assert.equal(r.status, 200, "anonymous preview");
    assert.equal(r.body.server.name, "Oyun Gecesi");
    assert.equal(r.body.server.memberCount, 2);
    assert.equal(r.body.server.isMember, false);
    for (const k of ["ownerId", "rulesText", "communityEnabled", "isPublic"]) assert.ok(!(k in r.body.server), `anon leaks ${k}`);
    for (const k of ["creatorId", "uses", "maxUses", "serverId"]) assert.ok(!(k in r.body.invite), `anon invite leaks ${k}`);
    assert.equal(r.body.invite.url, "https://descall.com/servers/join/GOODCODE");

    // Logged in: member flag.
    r = await call("member", "GET", "/servers/invites/GOODCODE");
    assert.equal(r.status, 200);
    assert.equal(r.body.server.isMember, true);
    r = await call("newbie", "GET", "/servers/invites/GOODCODE");
    assert.equal(r.body.server.isMember, false);
    assert.equal(r.body.server.isOwner, false);

    // Bad token is not silently treated as anonymous.
    r = await call("bad", "GET", "/servers/invites/GOODCODE");
    assert.equal(r.status, 401);

    // Invalid / expired / used up.
    r = await call(null, "GET", "/servers/invites/NOPE1234");
    assert.equal(r.status, 404);
    assert.equal(r.body.code, "INVITE_INVALID");
    r = await call(null, "GET", "/servers/invites/OLDCODE1");
    assert.equal(r.status, 410);
    assert.equal(r.body.code, "INVITE_EXPIRED");
    r = await call("newbie", "GET", "/servers/invites/USEDUP01");
    assert.equal(r.status, 410);

    // Join still needs a login, and works for the new user.
    r = await call(null, "POST", "/servers/invites/GOODCODE/join");
    assert.equal(r.status, 401);
    r = await call("newbie", "POST", "/servers/invites/GOODCODE/join");
    assert.ok(r.status === 200 || r.status === 201, `join ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    assert.equal(r.body.server.id, "srv");

    // Vanity preview is public too.
    r = await call(null, "GET", "/servers/vanity/oyungecesi");
    assert.equal(r.status, 200);
    assert.equal(r.body.server.name, "Oyun Gecesi");
    assert.ok(!("ownerId" in r.body.server));

    // Anonymous lookups are rate limited per IP.
    let limited = false;
    for (let i = 0; i < 140 && !limited; i++) limited = (await call(null, "GET", `/servers/invites/GUESS${i}x`)).status === 429;
    assert.ok(limited, "anonymous lookup flood is limited");
  } finally {
    server.close();
  }
  console.log("serverInvitePreview integration OK");
  process.exit(0);
}
run().catch((err) => {
  console.error("serverInvitePreview integration FAIL:", err.message);
  process.exit(1);
});
