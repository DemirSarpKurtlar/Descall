"use strict";

/**
 * Mesaj araması (3.7.7): GET /api/search/messages over the whole history, with
 * the same access rules as the history endpoints. Run:
 *   node frontend/backend/test/messageSearch.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const { Permissions, EVERYONE_DEFAULT, toPgBigint } = require("../lib/serverPermissions");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1), B = id(2), C = id(3);
const G = id(10), S = id(20), CH = id(21), SECRET = id(22);
const t = (d) => `2026-10-${String(d).padStart(2, "0")}T10:00:00.000Z`;
const users = [
  { id: A, username: "alice", display_name: "Alice", active_sessions: [{ id: "s-a" }] },
  { id: B, username: "bora", display_name: "Bora", active_sessions: [{ id: "s-b" }] },
  { id: C, username: "ceren", display_name: "Ceren", active_sessions: [{ id: "s-c" }] },
];
const fake = createFakeSupabase({
  users,
  friendships: [{ user_id: A, friend_id: B, status: "accepted" }],
  dm_messages: [
    { id: "d1", from_user_id: A, to_user_id: B, content: "İstanbul'a ne zaman gidiyoruz?", created_at: t(1) },
    { id: "d2", from_user_id: B, to_user_id: A, content: "istanbul cumartesi olur", created_at: t(2) },
    { id: "d3", from_user_id: B, to_user_id: A, content: "__voice__:istanbul.m4a", created_at: t(3) },
    { id: "d4", from_user_id: A, to_user_id: C, content: "istanbul gizli", created_at: t(4) },
    { id: "d5", from_user_id: B, to_user_id: A, content: '{"type":"call_summary","note":"istanbul"}', created_at: t(5) },
  ],
  groups: [{ id: G, name: "Ekip" }],
  group_members: [{ group_id: G, user_id: A }, { group_id: G, user_id: B }],
  group_removals: [],
  group_messages: [
    { id: "g1", group_id: G, sender_id: B, content: "Toplantı saat 20:00", created_at: t(6) },
    { id: "g2", group_id: G, sender_id: A, content: "toplantıya geliyorum", created_at: t(7) },
  ],
  servers: [{ id: S, name: "Sunucu", owner_id: C }],
  server_members: [{ server_id: S, user_id: A }, { server_id: S, user_id: C }],
  server_roles: [{ id: id(30), server_id: S, name: "@everyone", is_everyone: true, position: 0, permissions: toPgBigint(EVERYONE_DEFAULT) }],
  server_member_roles: [],
  server_channels: [
    { id: CH, server_id: S, name: "genel", type: "text", position: 0 },
    { id: SECRET, server_id: S, name: "yetkili", type: "text", position: 1 },
  ],
  server_channel_overrides: [
    { id: id(40), channel_id: SECRET, target_type: "role", target_id: id(30), allow_permissions: "0", deny_permissions: toPgBigint(Permissions.VIEW_CHANNEL) },
  ],
  server_messages: [
    { id: "s1", server_id: S, channel_id: CH, sender_id: C, content: "Duyuru: bakım var", created_at: t(8), message_type: "text" },
    { id: "s2", server_id: S, channel_id: SECRET, sender_id: C, content: "bakım şifresi 1234", created_at: t(9), message_type: "text" },
  ],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const searchRouter = require("../routes/search");

(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/search", searchRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const as = (u, sid) => ({ Authorization: `Bearer ${signToken({ id: u.id, username: u.username, sid })}` });
  const get = async (who, sid, qs) => {
    const res = await fetch(`${base}/api/search/messages?${new URLSearchParams(qs)}`, { headers: as(who, sid) });
    return { status: res.status, body: await res.json() };
  };
  try {
    // DM: whole history, Turkish İ/i, voice notes and call cards skipped, newest first.
    let r = await get(users[0], "s-a", { kind: "dm", peerId: B, q: "istanbul" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.results.map((x) => x.id), ["d2", "d1"]);
    assert.equal(r.body.results[1].snippet.text.slice(r.body.results[1].snippet.start, r.body.results[1].snippet.end), "İstanbul");
    assert.equal(r.body.results[0].author.username, "bora");
    // From one person only.
    r = await get(users[0], "s-a", { kind: "dm", peerId: B, q: "istanbul", from: A });
    assert.deepEqual(r.body.results.map((x) => x.id), ["d1"]);
    // Not friends: nothing (C's conversation with A is never searchable by B).
    r = await get(users[1], "s-b", { kind: "dm", peerId: C, q: "istanbul" });
    assert.deepEqual(r.body.results, []);
    // Too short.
    r = await get(users[0], "s-a", { kind: "dm", peerId: B, q: "i" });
    assert.equal(r.status, 400);
    // Group: member yes, outsider no.
    r = await get(users[0], "s-a", { kind: "group", groupId: G, q: "toplantı" });
    assert.deepEqual(r.body.results.map((x) => x.id), ["g2", "g1"]);
    r = await get(users[2], "s-c", { kind: "group", groupId: G, q: "toplantı" });
    assert.equal(r.status, 403);
    // Server: visible channel yes; hidden channel is 404 even though the text matches.
    r = await get(users[0], "s-a", { kind: "channel", serverId: S, channelId: CH, q: "bakım" });
    assert.deepEqual(r.body.results.map((x) => x.id), ["s1"]);
    r = await get(users[0], "s-a", { kind: "channel", serverId: S, channelId: SECRET, q: "bakım" });
    assert.equal(r.status, 404);
    assert.ok(!JSON.stringify(r.body).includes("1234"));
    // Not a server member.
    r = await get(users[1], "s-b", { kind: "channel", serverId: S, channelId: CH, q: "bakım" });
    assert.equal(r.status, 404);
    // Paging cursor.
    r = await get(users[0], "s-a", { kind: "dm", peerId: B, q: "istanbul", limit: "5", before: t(2) });
    assert.deepEqual(r.body.results.map((x) => x.id), ["d1"]);
    // Wildcards in the query are literal.
    r = await get(users[0], "s-a", { kind: "dm", peerId: B, q: "%%" });
    assert.deepEqual(r.body.results, []);
    // Context: the hit with its neighbours, same access rules.
    const ctx = async (who, sid, qs) => {
      const res = await fetch(`${base}/api/search/context?${new URLSearchParams(qs)}`, { headers: as(who, sid) });
      return { status: res.status, body: await res.json() };
    };
    r = await ctx(users[0], "s-a", { kind: "dm", peerId: B, id: "d2" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.messages.map((m) => m.id), ["d1", "d2", "d3", "d5"]);
    assert.deepEqual(r.body.messages.map((m) => m.kind), ["text", "text", "voice", "call"]);
    assert.equal(r.body.messages.find((m) => m.hit).id, "d2");
    assert.equal(r.body.messages[2].text, "", "voice note text never sent");
    // A message of another conversation through this one is 404 (no cross-conversation reads).
    r = await ctx(users[0], "s-a", { kind: "dm", peerId: B, id: "d4" });
    assert.equal(r.status, 404);
    r = await ctx(users[0], "s-a", { kind: "channel", serverId: S, channelId: CH, id: "s2" });
    assert.equal(r.status, 404, "a hidden channel's message through a visible channel");
    r = await ctx(users[0], "s-a", { kind: "channel", serverId: S, channelId: SECRET, id: "s2" });
    assert.equal(r.status, 404);
    r = await ctx(users[2], "s-c", { kind: "group", groupId: G, id: "g1" });
    assert.equal(r.status, 403);
    console.log("messageSearch.integration: ok");
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
})();
