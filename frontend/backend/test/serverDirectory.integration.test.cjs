"use strict";

/**
 * Public server directory (item 8): /api/directory over real HTTP, synthetic data in an
 * in-memory fake Supabase (nothing reaches a database).
 *   - anonymous list / card / summary / snapshot, cached and rate limited
 *   - filters (category, language, search), sorts (members, online, newest), paging
 *   - only listed servers with >= 3 members, never moderation-hidden servers, servers of
 *     banned or deleted owners, or servers that only set is_public
 *   - nothing private in any public answer (owner ids, channels, messages, rules, invites)
 *   - join action: reuses the directory invite, replaces an expired one, and the code
 *     joins through the normal invite flow
 *   - owner / ADMINISTRATOR settings, validation, others refused
 *   - migration not applied: empty list, saves answer 503, no 500
 * Run: node frontend/backend/test/serverDirectory.integration.test.cjs
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

const ts = (i) => new Date(Date.UTC(2026, 10, 1, 0, 0, i)).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();
const PEOPLE = ["owner", "owner2", "banned", "gone", "admin", "mod", "m1", "m2", "m3", "m4", "newbie"];
const users = PEOPLE.map((id) => ({
  id,
  username: id,
  display_name: id.toUpperCase(),
  active_sessions: [{ id: `s-${id}` }],
  is_banned: id === "banned",
  deleted_at: id === "gone" ? ts(9) : null,
  email_verified: true,
}));

const listed = (over) => ({
  icon_url: null,
  description: null,
  rules_text: "SECRET-RULES",
  vanity_slug: null,
  is_public: false,
  community_enabled: false,
  verification_level: "none",
  listed_in_directory: true,
  directory_category: "gaming-minecraft",
  directory_language: "tr",
  directory_description: null,
  directory_tags: [],
  directory_listed_at: ts(1),
  directory_invite_code: null,
  directory_hidden_at: null,
  directory_hidden_reason: null,
  created_at: ts(0),
  ...over,
});

const servers = [
  listed({ id: "mc-tr", owner_id: "owner", name: "Blok Diyari", directory_description: "Survival SMP", directory_tags: ["smp", "survival"], directory_listed_at: ts(2) }),
  listed({ id: "mc-en", owner_id: "owner2", name: "Skyblock Crew", directory_language: "en", directory_listed_at: ts(5) }),
  listed({ id: "mc-small", owner_id: "owner", name: "Tiny Two" }),
  listed({ id: "study-hidden", owner_id: "owner", name: "Hidden Study", directory_category: "study", directory_hidden_at: ts(3), directory_hidden_reason: "SECRET-STAFF-NOTE" }),
  listed({ id: "music-banned", owner_id: "banned", name: "Banned Owner Music", directory_category: "music" }),
  listed({ id: "art-gone", owner_id: "gone", name: "Deleted Owner Art", directory_category: "art" }),
  listed({ id: "public-only", owner_id: "owner", name: "Discovery Only", listed_in_directory: false, is_public: true, directory_category: null }),
  listed({ id: "no-cat", owner_id: "owner", name: "No Category", directory_category: null }),
];

const memberRows = [];
const addMembers = (serverId, ids) => ids.forEach((u, i) => memberRows.push({ server_id: serverId, user_id: u, joined_at: ts(10 + i) }));
addMembers("mc-tr", ["owner", "admin", "mod", "m1"]);
addMembers("mc-en", ["owner2", "m2", "m3"]);
addMembers("mc-small", ["owner", "m1"]);
addMembers("study-hidden", ["owner", "m1", "m2", "m3", "m4"]);
addMembers("music-banned", ["banned", "m1", "m2", "m3"]);
addMembers("art-gone", ["gone", "m1", "m2", "m3"]);
addMembers("public-only", ["owner", "m1", "m2", "m3", "m4"]);
addMembers("no-cat", ["owner", "m1", "m2", "m3"]);

const roles = servers.map((s) => ({ id: `${s.id}-everyone`, server_id: s.id, is_everyone: true, position: 0, permissions: P.toPgBigint(P.EVERYONE_DEFAULT), created_at: ts(0) }));
roles.push({ id: "mc-tr-admin", server_id: "mc-tr", is_everyone: false, name: "Admin", position: 2, permissions: P.toPgBigint(P.Permissions.ADMINISTRATOR), created_at: ts(0) });
roles.push({ id: "mc-tr-mod", server_id: "mc-tr", is_everyone: false, name: "Mod", position: 1, permissions: P.toPgBigint(P.Permissions.MANAGE_GUILD), created_at: ts(0) });

function seed(withDirectoryColumns = true) {
  const rows = withDirectoryColumns
    ? servers
    : servers.map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith("directory_") && k !== "listed_in_directory")));
  return {
    users,
    servers: rows,
    server_members: memberRows,
    server_roles: roles,
    server_member_roles: [
      { server_id: "mc-tr", user_id: "admin", role_id: "mc-tr-admin" },
      { server_id: "mc-tr", user_id: "mod", role_id: "mc-tr-mod" },
    ],
    server_channels: [
      { id: "mc-tr-general", server_id: "mc-tr", type: "text", name: "genel", position: 0, created_at: ts(1) },
      { id: "mc-tr-staff", server_id: "mc-tr", type: "text", name: "SECRET-STAFF-ROOM", position: 1, created_at: ts(1) },
    ],
    server_channel_overrides: [],
    server_messages: [{ id: "msg1", server_id: "mc-tr", channel_id: "mc-tr-staff", author_id: "owner", content: "SECRET-MESSAGE", created_at: ts(20) }],
    server_invites: [],
    server_bans: [],
    server_audit_logs: [],
  };
}

/** The same fake, but reading the directory columns fails like an unapplied migration. */
function withoutDirectoryColumns(base) {
  return {
    _tables: base._tables,
    storage: base.storage,
    from(name) {
      const q = base.from(name);
      if (name !== "servers") return q;
      let broken = false;
      const select = q.select.bind(q);
      q.select = (cols, opts) => {
        if (/listed_in_directory|directory_/.test(String(cols || ""))) broken = true;
        return select(cols, opts);
      };
      const eq = q.eq.bind(q);
      q.eq = (col, val) => {
        if (/listed_in_directory|directory_/.test(String(col))) broken = true;
        return eq(col, val);
      };
      const then = q.then.bind(q);
      q.then = (resolve, reject) =>
        broken
          ? resolve({ data: null, error: { code: "42703", message: "column servers.listed_in_directory does not exist" } })
          : then(resolve, reject);
      return q;
    },
  };
}

let current = createFakeSupabase(seed(), { uniqueKeys: { server_invites: ["code"] } });
const proxy = { from: (name) => current.from(name), get storage() { return current.storage; } };
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: proxy };

// Two members of mc-tr online, one invisible (never counted).
const { presence } = require("../runtime/sharedState");
presence.set("admin", { status: "online" });
presence.set("mod", { status: "idle" });
presence.set("m1", { status: "invisible" });

const express = require("express");
const { signToken } = require("../config/jwt");
const directoryRouter = require("../routes/directory");
const serversRouter = require("../routes/servers");
const io = { to: () => ({ emit() {} }), in: () => ({ emit() {}, fetchSockets: async () => [], socketsJoin() {}, socketsLeave() {} }), emit() {}, of() { return io; }, fetchSockets: async () => [], sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };

const PRIVATE_MARKERS = ["SECRET-RULES", "SECRET-STAFF-ROOM", "SECRET-MESSAGE", "SECRET-STAFF-NOTE", "owner_id", "ownerId", "rulesText", "channels", "members\":[", "inviteCode", "invite_code"];
function assertNothingPrivate(body, label) {
  const text = JSON.stringify(body);
  for (const m of PRIVATE_MARKERS) assert.ok(!text.includes(m), `${label} leaks ${m}`);
  for (const id of ["owner", "owner2", "banned", "gone"]) assert.ok(!text.includes(`"${id}"`), `${label} leaks user id ${id}`);
}

async function run() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.set("io", null);
  app.use("/api/directory", directoryRouter);
  app.use("/api/servers", (req, _res, next) => { req.app.set("io", io); next(); }, serversRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let ipSeq = 0;
  const call = async (who, method, p, body, { ip } = {}) => {
    const headers = { "Content-Type": "application/json", "X-Forwarded-For": ip || `10.0.0.${(ipSeq++ % 200) + 1}` };
    if (who) headers.Authorization = `Bearer ${signToken({ id: who, username: who, sid: `s-${who}` })}`;
    const res = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : method === "GET" ? undefined : "{}" });
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
  };

  try {
    // ---- Public list: only visible servers, cached, nothing private.
    let r = await call(null, "GET", "/api/directory/servers");
    assert.equal(r.status, 200);
    assert.equal(r.body.available, true);
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-tr", "mc-en"], "listed, >= 3 members, not hidden, owner ok");
    assert.equal(r.body.total, 2);
    assert.equal(r.body.minMembers, 3);
    assert.match(r.headers.get("cache-control") || "", /public, max-age=60, s-maxage=120/);
    assertNothingPrivate(r.body, "list");
    const mc = r.body.servers[0];
    assert.deepEqual(Object.keys(mc).sort(), ["category", "description", "iconUrl", "id", "language", "listedAt", "memberCount", "name", "onlineCount", "tags"]);
    assert.equal(mc.memberCount, 4);
    assert.equal(mc.onlineCount, 2, "online + idle count, invisible does not");
    assert.equal(mc.description, "Survival SMP");
    assert.deepEqual(mc.tags, ["smp", "survival"]);

    // ---- Filters and sorts.
    r = await call(null, "GET", "/api/directory/servers?category=gaming-minecraft&language=tr");
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-tr"]);
    r = await call(null, "GET", "/api/directory/servers?language=en");
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-en"]);
    r = await call(null, "GET", "/api/directory/servers?category=study");
    assert.equal(r.body.total, 0, "moderation-hidden server is not listed");
    r = await call(null, "GET", "/api/directory/servers?category=music");
    assert.equal(r.body.total, 0, "banned owner's server is not listed");
    r = await call(null, "GET", "/api/directory/servers?category=art");
    assert.equal(r.body.total, 0, "deleted owner's server is not listed");
    r = await call(null, "GET", "/api/directory/servers?category=does-not-exist");
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
    r = await call(null, "GET", "/api/directory/servers?q=skyblock");
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-en"]);
    r = await call(null, "GET", "/api/directory/servers?q=SMP");
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-tr"], "tag search");
    r = await call(null, "GET", "/api/directory/servers?sort=newest");
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-en", "mc-tr"]);
    r = await call(null, "GET", "/api/directory/servers?sort=online");
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-tr", "mc-en"]);
    r = await call(null, "GET", "/api/directory/servers?limit=1");
    assert.equal(r.body.servers.length, 1);
    assert.equal(r.body.nextOffset, 1);
    r = await call(null, "GET", "/api/directory/servers?limit=1&offset=1");
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-en"]);
    assert.equal(r.body.nextOffset, null);

    // ---- Card, summary, snapshot.
    r = await call(null, "GET", "/api/directory/servers/mc-tr");
    assert.equal(r.status, 200);
    assert.equal(r.body.server.name, "Blok Diyari");
    assertNothingPrivate(r.body, "card");
    for (const hidden of ["mc-small", "study-hidden", "music-banned", "art-gone", "public-only", "no-cat", "nope"]) {
      r = await call(null, "GET", `/api/directory/servers/${hidden}`);
      assert.equal(r.status, 404, `${hidden} has no public card`);
      assert.equal(r.body.code, "NOT_LISTED");
    }
    r = await call(null, "GET", "/api/directory/summary");
    assert.equal(r.body.total, 2);
    assert.deepEqual(r.body.categories["gaming-minecraft"], { total: 2, byLanguage: { tr: 1, en: 1 } });
    assert.equal(r.body.categories.study.total, 0);
    r = await call(null, "GET", "/api/directory/snapshot");
    assert.equal(r.body.servers.length, 2);
    assertNothingPrivate(r.body, "snapshot");

    // ---- Join action: create once, reuse, never expose it in the list.
    r = await call(null, "POST", "/api/directory/servers/mc-tr/invite");
    assert.equal(r.status, 200);
    assert.match(r.body.code, /^[A-Za-z0-9]{8}$/);
    assert.equal(r.body.path, `/servers/join/${r.body.code}`);
    const code = r.body.code;
    const inv = current._tables.server_invites.rows.find((i) => i.code === code);
    assert.equal(inv.server_id, "mc-tr");
    assert.equal(inv.creator_id, "owner", "created in the owner's name");
    assert.equal(inv.expires_at, null);
    assert.equal(inv.max_uses, null);
    r = await call(null, "POST", "/api/directory/servers/mc-tr/invite");
    assert.equal(r.body.code, code, "the invite is reused");
    assert.equal(current._tables.server_invites.rows.length, 1);
    r = await call(null, "GET", "/api/directory/servers");
    assert.ok(!JSON.stringify(r.body).includes(code), "the invite code is not in the list");
    for (const hidden of ["mc-small", "study-hidden", "public-only"]) {
      r = await call(null, "POST", `/api/directory/servers/${hidden}/invite`);
      assert.equal(r.status, 404, `no invite for ${hidden}`);
    }
    // Expired directory invite: a fresh one replaces it.
    current._tables.server_invites.rows.find((i) => i.code === code).expires_at = past;
    r = await call(null, "POST", "/api/directory/servers/mc-tr/invite");
    assert.notEqual(r.body.code, code);
    const freshCode = r.body.code;
    assert.equal(current._tables.servers.rows.find((s) => s.id === "mc-tr").directory_invite_code, freshCode);
    // The code joins through the normal invite flow (login required).
    r = await call(null, "POST", `/api/servers/invites/${freshCode}/join`);
    assert.equal(r.status, 401);
    r = await call("newbie", "POST", `/api/servers/invites/${freshCode}/join`);
    assert.ok(r.status === 200 || r.status === 201, `join ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    assert.equal(r.body.server.id, "mc-tr");

    // ---- Owner / administrator settings.
    r = await call(null, "GET", "/api/directory/manage/mc-tr");
    assert.equal(r.status, 401);
    r = await call("m1", "GET", "/api/directory/manage/mc-tr");
    assert.equal(r.status, 403, "plain member");
    assert.equal(r.body.code, "ADMIN_REQUIRED");
    r = await call("mod", "GET", "/api/directory/manage/mc-tr");
    assert.equal(r.status, 403, "MANAGE_GUILD is not enough");
    r = await call("newbie", "GET", "/api/directory/manage/mc-en");
    assert.equal(r.status, 403, "not a member");
    r = await call("admin", "GET", "/api/directory/manage/mc-tr");
    assert.equal(r.status, 200, "ADMINISTRATOR may manage");
    r = await call("owner", "GET", "/api/directory/manage/mc-tr");
    assert.equal(r.status, 200);
    assert.equal(r.body.available, true);
    assert.equal(r.body.visible, true);
    assert.equal(r.body.reason, null);
    assert.equal(r.body.memberCount, 5, "newbie joined");
    assert.deepEqual(r.body.listing.tags, ["smp", "survival"]);
    assert.equal(r.headers.get("cache-control"), "no-store");

    r = await call("owner", "GET", "/api/directory/manage/mc-small");
    assert.equal(r.body.visible, false);
    assert.equal(r.body.reason, "too_few_members");
    r = await call("owner", "GET", "/api/directory/manage/study-hidden");
    assert.equal(r.body.reason, "moderation");
    assert.equal(r.body.hidden, true);

    // Validation (English text + template key for the app to translate).
    r = await call("owner", "PUT", "/api/directory/manage/mc-tr", { listed: true, category: "bogus" });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "DIRECTORY_CATEGORY");
    assert.equal(r.body.error, "Pick a category for the directory.");
    r = await call("owner", "PUT", "/api/directory/manage/mc-tr", { description: "x".repeat(301) });
    assert.equal(r.status, 400);
    assert.equal(r.body.errorKey, "The directory description can be at most {max} characters.");
    r = await call("owner", "PUT", "/api/directory/manage/mc-tr", { tags: "a,b,c,d,e,f" });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "DIRECTORY_TAGS");
    r = await call("mod", "PUT", "/api/directory/manage/mc-tr", { listed: false });
    assert.equal(r.status, 403);
    assert.equal(current._tables.servers.rows.find((s) => s.id === "mc-tr").listed_in_directory, true, "refused save changed nothing");

    // Admin moves the server to study; the public list follows at once.
    r = await call("admin", "PUT", "/api/directory/manage/mc-tr", { listed: true, category: "study", language: "tr", description: "YKS kampi", tags: "#YKS, ders" });
    assert.equal(r.status, 200);
    assert.equal(r.body.listing.category, "study");
    assert.deepEqual(r.body.listing.tags, ["yks", "ders"]);
    assert.ok(current._tables.server_audit_logs.rows.some((a) => a.action === "DIRECTORY_UPDATE" && a.server_id === "mc-tr" && a.actor_id === "admin"));
    r = await call(null, "GET", "/api/directory/servers?category=study");
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-tr"]);
    assert.equal(r.body.servers[0].description, "YKS kampi");
    // Unlisting removes it from every public answer.
    r = await call("owner", "PUT", "/api/directory/manage/mc-tr", { listed: false });
    assert.equal(r.status, 200);
    assert.equal(r.body.visible, false);
    assert.equal(r.body.reason, "not_listed");
    r = await call(null, "GET", "/api/directory/servers");
    assert.deepEqual(r.body.servers.map((s) => s.id), ["mc-en"]);
    r = await call(null, "POST", "/api/directory/servers/mc-tr/invite");
    assert.equal(r.status, 404);

    // ---- Rate limit per IP on the public reads.
    let limited = false;
    for (let i = 0; i < 140 && !limited; i++) limited = (await call(null, "GET", "/api/directory/servers", undefined, { ip: "10.9.9.9" })).status === 429;
    assert.ok(limited, "public reads are rate limited per IP");

    // ---- Migration not applied: empty, never a 500; saves answer 503.
    current = withoutDirectoryColumns(createFakeSupabase(seed(false)));
    directoryRouter.__resetDirectoryCache();
    r = await call(null, "GET", "/api/directory/servers");
    assert.equal(r.status, 200);
    assert.equal(r.body.available, false);
    assert.deepEqual(r.body.servers, []);
    r = await call(null, "GET", "/api/directory/summary");
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
    r = await call(null, "GET", "/api/directory/servers/mc-tr");
    assert.equal(r.status, 404);
    r = await call("owner", "GET", "/api/directory/manage/mc-tr");
    assert.equal(r.status, 200);
    assert.equal(r.body.available, false);
    assert.equal(r.body.reason, "unavailable");
    r = await call("owner", "PUT", "/api/directory/manage/mc-tr", { listed: true, category: "study", language: "tr" });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, "DIRECTORY_UNAVAILABLE");
  } finally {
    server.close();
  }
  console.log("serverDirectory integration OK");
  process.exit(0);
}

run().catch((err) => {
  console.error("serverDirectory integration FAIL:", err);
  process.exit(1);
});
