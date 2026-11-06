"use strict";

/**
 * Performance review fixes (2026-11-09):
 *   P2  channel message fan-out: bulk channel permissions (parity with the per-member
 *       resolveChannelPermissions) and the unread bump (bump_channel_unread RPC, the
 *       per-row fallback before the migration, no last_read_at null, no lost increments)
 *   P3  groups:rejoin: one membership query for all groups
 *   P4  notifyPrefs.filterRecipients / readReceipts.groupReads: one .in() query;
 *       group history selects reply_to in the main query, fallback when it is missing
 * Run: node frontend/backend/test/channelFanoutPerf.unit.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const P = require("../lib/serverPermissions");
const { Permissions: F } = P;
const big = (b) => P.toPgBigint(b);

const S = "srv-1";
const OTHER = "srv-2";
const members = ["owner", "admin", "plain", "muted", "vip", "both", "banned1", "allowed1", "evadm", "norole"];
const seed = () => ({
  users: members.map((id) => ({ id, username: id })),
  servers: [
    { id: S, owner_id: "owner", name: "S" },
    { id: OTHER, owner_id: "someone", name: "O" },
  ],
  server_members: members.map((u) => ({ server_id: S, user_id: u })),
  server_roles: [
    // @everyone carries ADMINISTRATOR by mistake: it must be stripped, not grant all.
    { id: "everyone", server_id: S, is_everyone: true, position: 0, permissions: big(P.EVERYONE_DEFAULT | F.ADMINISTRATOR) },
    { id: "adminrole", server_id: S, is_everyone: false, position: 5, permissions: big(F.ADMINISTRATOR) },
    { id: "mutedrole", server_id: S, is_everyone: false, position: 1, permissions: "0" },
    { id: "viprole", server_id: S, is_everyone: false, position: 2, permissions: big(F.SEND_MESSAGES) },
    { id: "otherrole", server_id: OTHER, is_everyone: false, position: 1, permissions: big(F.ADMINISTRATOR) },
  ],
  server_member_roles: [
    { server_id: S, user_id: "admin", role_id: "adminrole" },
    { server_id: S, user_id: "muted", role_id: "mutedrole" },
    { server_id: S, user_id: "vip", role_id: "viprole" },
    { server_id: S, user_id: "both", role_id: "mutedrole" },
    { server_id: S, user_id: "both", role_id: "viprole" },
    { server_id: S, user_id: "banned1", role_id: "viprole" },
    // A role assignment in another server must not leak in.
    { server_id: OTHER, user_id: "plain", role_id: "otherrole" },
  ],
  server_channels: [
    { id: "public", server_id: S, type: "text", parent_id: null },
    { id: "private", server_id: S, type: "text", parent_id: null },
    { id: "cat", server_id: S, type: "category", parent_id: null },
    { id: "synced", server_id: S, type: "text", parent_id: "cat" },
    { id: "own", server_id: S, type: "text", parent_id: "cat" },
    { id: "foreign", server_id: OTHER, type: "text", parent_id: null },
  ],
  server_channel_overrides: [
    // public: role deny for muted, a member deny and the vip allow beats the muted deny.
    { id: "o1", channel_id: "public", target_type: "role", target_id: "mutedrole", allow_permissions: "0", deny_permissions: big(F.VIEW_CHANNEL) },
    { id: "o2", channel_id: "public", target_type: "role", target_id: "viprole", allow_permissions: big(F.VIEW_CHANNEL), deny_permissions: "0" },
    { id: "o3", channel_id: "public", target_type: "member", target_id: "banned1", allow_permissions: "0", deny_permissions: big(F.VIEW_CHANNEL) },
    // private: @everyone deny, vip role allow, one member allow.
    { id: "o4", channel_id: "private", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: big(F.VIEW_CHANNEL) },
    { id: "o5", channel_id: "private", target_type: "role", target_id: "viprole", allow_permissions: big(F.VIEW_CHANNEL), deny_permissions: "0" },
    { id: "o6", channel_id: "private", target_type: "member", target_id: "allowed1", allow_permissions: big(F.VIEW_CHANNEL), deny_permissions: "0" },
    // category: @everyone deny (synced child inherits), vip allow.
    { id: "o7", channel_id: "cat", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: big(F.VIEW_CHANNEL) },
    { id: "o8", channel_id: "cat", target_type: "role", target_id: "viprole", allow_permissions: big(F.VIEW_CHANNEL), deny_permissions: "0" },
    // own: has its own rows, so the category's are ignored (members can view, muted cannot).
    { id: "o9", channel_id: "own", target_type: "role", target_id: "mutedrole", allow_permissions: "0", deny_permissions: big(F.VIEW_CHANNEL | F.SEND_MESSAGES) },
    { id: "o10", channel_id: "own", target_type: "member", target_id: "evadm", allow_permissions: big(F.MANAGE_MESSAGES), deny_permissions: "0" },
  ],
});

/** Wraps a fake client: counts .from(table) and .rpc calls, records write payloads. */
function instrument(fake) {
  const calls = { from: {}, rpc: 0, writes: [] };
  const from = fake.from.bind(fake);
  fake.from = (name) => {
    calls.from[name] = (calls.from[name] || 0) + 1;
    const q = from(name);
    for (const m of ["insert", "upsert", "update"]) {
      const orig = q[m].bind(q);
      q[m] = (payload, opts) => {
        calls.writes.push({ table: name, op: m, payload });
        // Production: last_read_at is NOT NULL (default now()).
        if (name === "server_channel_reads" && payload && "last_read_at" in payload && payload.last_read_at == null) {
          const res = { data: null, error: { code: "23502", message: 'null value in column "last_read_at"' } };
          const failed = { select: () => failed, then: (resolve) => resolve(res) };
          return failed;
        }
        return orig(payload, opts);
      };
    }
    return q;
  };
  return calls;
}

const db = createFakeSupabase(seed());
const calls = instrument(db);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: db };
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };

const channelHandlers = require("../socket/serverChannelHandlers");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label) {
  for (let i = 0; i < 200; i += 1) {
    if (fn()) return;
    await sleep(5);
  }
  assert.fail(`timed out: ${label}`);
}
const reads = () => db._tables.server_channel_reads?.rows || [];
const unread = (uid, ch) => reads().find((r) => r.user_id === uid && r.channel_id === ch)?.unread_count;

(async () => {
  // ── P2a: bulk permissions == per-member resolveChannelPermissions ──────────
  const channels = ["public", "private", "synced", "own", "cat", "foreign", "missing"];
  for (const ch of channels) {
    const bulk = await P.resolveChannelPermissionsBulk(db, S, ch, members);
    assert.equal(bulk.size, members.length);
    for (const uid of members) {
      const one = await P.resolveChannelPermissions(db, S, uid, ch);
      assert.equal(bulk.get(uid), one.bits, `bits parity ${ch}/${uid}`);
      assert.equal(
        P.hasPermission(bulk.get(uid), F.VIEW_CHANNEL),
        Boolean(one.isMember && P.hasPermission(one.bits, F.VIEW_CHANNEL)),
        `view parity ${ch}/${uid}`
      );
    }
  }
  const view = async (ch) => {
    const m = await P.resolveChannelPermissionsBulk(db, S, ch, members);
    return members.filter((u) => P.hasPermission(m.get(u), F.VIEW_CHANNEL));
  };
  // Spot checks so the parity above is not vacuous.
  assert.deepEqual(await view("public"), ["owner", "admin", "plain", "vip", "both", "allowed1", "evadm", "norole"], "muted denied, vip allow beats muted deny, member deny");
  assert.deepEqual(await view("private"), ["owner", "admin", "vip", "both", "banned1", "allowed1"]);
  assert.deepEqual(await view("synced"), ["owner", "admin", "vip", "both", "banned1"], "category rules apply to a synced channel");
  assert.deepEqual(await view("own"), ["owner", "admin", "plain", "vip", "banned1", "allowed1", "evadm", "norole"], "own rows replace the category's");
  assert.deepEqual(await view("foreign"), [], "a channel of another server grants nothing, not even to the owner");
  assert.equal((await P.resolveChannelPermissionsBulk(db, S, "public", ["admin"])).get("admin"), P.ALL_PERMISSIONS);
  assert.equal(P.hasPermission((await P.resolveChannelPermissionsBulk(db, S, "public", ["evadm"])).get("evadm"), F.ADMINISTRATOR), false, "@everyone ADMINISTRATOR is stripped");

  // Query count: 5 queries for the whole member list.
  for (const k of Object.keys(calls.from)) delete calls.from[k];
  await P.resolveChannelPermissionsBulk(db, S, "public", members);
  const bulkQueries = Object.values(calls.from).reduce((a, b) => a + b, 0);
  assert.equal(bulkQueries, 5, `bulk resolve uses 5 queries (got ${bulkQueries})`);
  assert.equal(calls.from.server_member_roles, 1);

  // Member roles are chunked (.in of 100 ids) and paged past the row cap.
  const many = Array.from({ length: 250 }, (_, i) => `m${i}`);
  const db2 = createFakeSupabase({
    servers: [{ id: S, owner_id: "owner" }],
    server_channels: [{ id: "c", server_id: S, parent_id: null }],
    server_roles: [
      { id: "everyone", server_id: S, is_everyone: true, position: 0, permissions: big(P.EVERYONE_DEFAULT) },
      { id: "deny", server_id: S, is_everyone: false, position: 1, permissions: "0" },
    ],
    server_member_roles: many.filter((_, i) => i % 2).map((u) => ({ server_id: S, user_id: u, role_id: "deny" })),
    server_channel_overrides: [{ channel_id: "c", target_type: "role", target_id: "deny", allow_permissions: "0", deny_permissions: big(F.VIEW_CHANNEL) }],
  });
  const res2 = await P.resolveChannelPermissionsBulk(db2, S, "c", many);
  many.forEach((u, i) => assert.equal(P.hasPermission(res2.get(u), F.VIEW_CHANNEL), i % 2 === 0, `chunked ${u}`));

  // ── P2b: unread bump ───────────────────────────────────────────────────────
  // RPC present: one call, no table access.
  let rpcCalls = [];
  db.rpc = async (fn, args) => {
    rpcCalls.push({ fn, args });
    return { data: args.p_user_ids.length, error: null };
  };
  for (const k of Object.keys(calls.from)) delete calls.from[k];
  await channelHandlers.bumpChannelUnreadCounts(db, "public", ["plain", "vip", "plain"]);
  assert.deepEqual(rpcCalls, [{ fn: "bump_channel_unread", args: { p_channel_id: "public", p_user_ids: ["plain", "vip"] } }]);
  assert.equal(calls.from.server_channel_reads, undefined, "RPC path does not touch the table from the backend");

  // Another RPC error is not mistaken for a missing function.
  db.rpc = async () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
  await assert.rejects(channelHandlers.bumpChannelUnreadCounts(db, "public", ["plain"]), { code: "57014" });

  // RPC missing (migration not applied): detected once, then per-row writes.
  rpcCalls = [];
  db.rpc = async (fn) => {
    rpcCalls.push(fn);
    return { data: null, error: { code: "PGRST202", message: "Could not find the function public.bump_channel_unread(p_channel_id, p_user_ids) in the schema cache" } };
  };
  calls.writes.length = 0;
  await channelHandlers.bumpChannelUnreadCounts(db, "public", ["plain", "vip"]);
  assert.equal(unread("plain", "public"), 1, "new row created with 1");
  assert.equal(unread("vip", "public"), 1);
  const inserts = calls.writes.filter((w) => w.table === "server_channel_reads" && (w.op === "insert" || w.op === "upsert"));
  assert.equal(inserts.length, 2);
  for (const w of inserts) {
    assert.deepEqual(Object.keys(w.payload).sort(), ["channel_id", "unread_count", "user_id"], "insert payload: no last_read_at (NOT NULL default applies)");
    assert.equal(w.payload.unread_count, 1);
  }
  await channelHandlers.bumpChannelUnreadCounts(db, "public", ["plain"]);
  assert.equal(unread("plain", "public"), 2, "existing row incremented");
  assert.equal(rpcCalls.length, 1, "missing function remembered: RPC not retried");

  // Concurrent bumps on the fallback path do not lose increments.
  await Promise.all([1, 2, 3, 4].map(() => channelHandlers.bumpChannelUnreadCounts(db, "public", ["plain", "norole"])));
  assert.equal(unread("plain", "public"), 6, "4 concurrent bumps on an existing row");
  assert.equal(unread("norole", "public"), 4, "4 concurrent bumps starting without a row");

  // End to end: bumpChannelUnreadForMembers bumps exactly the members who can view.
  channelHandlers.__resetUnreadRpcState();
  const bumped = [];
  db.rpc = async (fn, args) => {
    bumped.push(...args.p_user_ids);
    return { data: args.p_user_ids.length, error: null };
  };
  channelHandlers.bumpChannelUnreadForMembers(S, "private", "vip");
  await waitFor(() => bumped.length > 0, "rpc bump");
  assert.deepEqual(bumped.sort(), ["admin", "allowed1", "banned1", "both", "owner"], "viewers of private minus the sender");

  // End to end on the fallback path (missing function).
  channelHandlers.__resetUnreadRpcState();
  db.rpc = async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.bump_channel_unread" } });
  channelHandlers.bumpChannelUnreadForMembers(S, "synced", "owner");
  await waitFor(() => unread("banned1", "synced") === 1, "fallback bump");
  assert.deepEqual(
    reads().filter((r) => r.channel_id === "synced").map((r) => r.user_id).sort(),
    ["admin", "banned1", "both", "vip"]
  );

  // Source guard: the old per-member resolve loop and the null last_read_at are gone.
  const src = fs.readFileSync(path.join(__dirname, "..", "socket", "serverChannelHandlers.js"), "utf8");
  const bumpFn = src.slice(src.indexOf("function bumpChannelUnreadForMembers"), src.indexOf("function mapPinnedServerMessage"));
  assert.ok(!/resolveChannelPermissions\(/.test(bumpFn), "no per-member resolve in the bump");
  assert.ok(!/last_read_at:\s*null/.test(bumpFn), "no null last_read_at");

  // ── P3: groups:rejoin membership in one query ──────────────────────────────
  const { groupsUserBelongsTo } = require("../socket/groupHandlers");
  const gdb = createFakeSupabase({
    group_members: [
      { group_id: "g1", user_id: "u" },
      { group_id: "g2", user_id: "other" },
      { group_id: "g3", user_id: "u" },
    ],
  });
  const gcalls = instrument(gdb);
  assert.deepEqual([...(await groupsUserBelongsTo(["g1", "g2", "g3", "g4", "g1"], "u", gdb))].sort(), ["g1", "g3"]);
  assert.equal(gcalls.from.group_members, 1, "one membership query");
  // A failing .in() (e.g. one malformed uuid) falls back to the per-group check.
  const badDb = {
    from: () => {
      const q = gdb.from("group_members");
      const origIn = q.in.bind(q);
      q.in = () => ({ eq: async () => ({ data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } }) });
      void origIn;
      return q;
    },
  };
  assert.deepEqual([...(await groupsUserBelongsTo(["g1", "g2", "g3"], "u", badDb))].sort(), ["g1", "g3"]);
  const gsrc = fs.readFileSync(path.join(__dirname, "..", "socket", "groupHandlers.js"), "utf8");
  const rejoin = gsrc.slice(gsrc.indexOf('socket.on("groups:rejoin"'), gsrc.indexOf("// Leave group room"));
  assert.ok(rejoin.includes("groupsUserBelongsTo(") && !rejoin.includes(".maybeSingle()"), "rejoin uses the bulk lookup");

  // ── P4: notifyPrefs / readReceipts bulk, group history reply_to ────────────
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const G = id(100);
  const ids = Array.from({ length: 30 }, (_, i) => id(i + 1));
  db._tables.conversation_notify_prefs = {
    rows: [
      { user_id: ids[0], conv_type: "group", conv_id: G, level: "none", muted_until: null },
      { user_id: ids[1], conv_type: "group", conv_id: G, level: "mentions", muted_until: null },
      { user_id: ids[2], conv_type: "group", conv_id: G, level: "all", muted_until: "2999-01-01T00:00:00.000Z" },
      { user_id: ids[3], conv_type: "dm", conv_id: G, level: "none", muted_until: null },
    ],
  };
  const np = require("../lib/notifyPrefs");
  np.__resetNotifyPrefs();
  for (const k of Object.keys(calls.from)) delete calls.from[k];
  const plain = await np.filterRecipients(ids, "group", G, { mention: false });
  assert.deepEqual(plain, ids.slice(3), "none / mentions / muted filtered out; a dm pref does not apply");
  assert.deepEqual(await np.filterRecipients(ids, "group", G, { mention: true }), [ids[1], ...ids.slice(3)]);
  assert.equal(calls.from.conversation_notify_prefs, 1, "one query for 30 recipients, then the cache");
  for (const uid of ids.slice(0, 4)) {
    assert.equal(await np.levelFor(uid, "group", G), np.effectiveLevel(db._tables.conversation_notify_prefs.rows.find((r) => r.user_id === uid && r.conv_type === "group") || null), `levelFor parity ${uid}`);
  }
  assert.equal(calls.from.conversation_notify_prefs, 1, "levelFor reads the cache filled by the bulk query");

  const rr = require("../lib/readReceipts");
  rr.__resetReadReceipts();
  db._tables.users.rows.push(...ids.map((u, i) => ({ id: u, username: `u${i}`, read_receipts: i !== 4 })));
  db._tables.group_read_state = { rows: ids.map((u) => ({ group_id: G, user_id: u, last_read_at: "2026-11-06T10:00:00.000Z" })) };
  for (const k of Object.keys(calls.from)) delete calls.from[k];
  const readsList = await rr.groupReads(G, ids[0]);
  assert.deepEqual(readsList.map((r) => r.userId), ids.slice(1).filter((u) => u !== ids[4]), "member with receipts off skipped");
  assert.equal(calls.from.users, 2, "viewer check + one bulk query (was one per member)");

  const groupsSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "groups.js"), "utf8");
  const start = groupsSrc.indexOf("let groupReplyColumn = true;");
  const end = groupsSrc.indexOf('router.get("/:groupId/messages"');
  const { isMissingColumn } = require("../lib/forwardedMessage");
  const make = (supabase) =>
    new Function("supabase", "isMissingColumn", `${groupsSrc.slice(start, end)}; return { withGroupReplyMeta, selectGroupHistory };`)(supabase, isMissingColumn);
  let extra = 0;
  const h = make({ from: () => ({ select: () => ({ in: async () => { extra += 1; return { data: [], error: null }; } }) }) });
  const withCol = await h.withGroupReplyMeta([{ id: "a", reply_to: null }, { id: "b", reply_to: { id: "a" } }]);
  assert.deepEqual(withCol, [{ id: "a" }, { id: "b", reply_to: { id: "a" } }], "selected reply_to kept, empty ones dropped");
  assert.equal(extra, 0, "no second query when the page already has reply_to");
  const seen = [];
  const r1 = await h.selectGroupHistory(async (cols) => { seen.push(cols.includes("reply_to")); return { data: [{ id: "x", reply_to: null }], error: null }; });
  assert.deepEqual(seen, [true]);
  assert.equal(r1.data.length, 1);
  seen.length = 0;
  const missingErr = { code: "42703", message: "column group_messages.reply_to does not exist" };
  const r2 = await h.selectGroupHistory(async (cols) => {
    seen.push(cols.includes("reply_to"));
    return cols.includes("reply_to") ? [{ data: null, error: missingErr }, { data: null, error: missingErr }] : [{ data: [{ id: "y" }], error: null }, { data: [], error: null }];
  });
  assert.deepEqual(seen, [true, false], "missing column: retried without reply_to");
  assert.deepEqual(r2[0].data, [{ id: "y" }]);
  seen.length = 0;
  await h.selectGroupHistory(async (cols) => { seen.push(cols.includes("reply_to")); return { data: [], error: null }; });
  assert.deepEqual(seen, [false], "the missing column is remembered");
  assert.equal(await h.withGroupReplyMeta([{ id: "z" }]).then((r) => r[0].reply_to), undefined);
  const other = await make({}).selectGroupHistory(async () => ({ data: null, error: { code: "57014", message: "timeout" } }));
  assert.equal(other.error.code, "57014", "other errors are returned as before");

  console.log("channelFanoutPerf unit test OK");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
