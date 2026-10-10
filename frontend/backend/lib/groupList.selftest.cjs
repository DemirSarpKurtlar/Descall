"use strict";

/**
 * Run: node frontend/backend/lib/groupList.selftest.cjs
 * Counts Supabase calls for 32 groups. The previous helper did
 * 2 + 3*32 = 98 calls (membership, groups, then per group: last message,
 * members, users).
 */

const assert = require("assert");
const { assembleGroupList, formatGroupListPreview, getUserGroups, loadUserGroups } = require("./groupList");

function createFakeDb({ groups = 32, membersEach = 3, fillLastWindow = false } = {}) {
  const calls = [];
  function rowsFor(state) {
    if (state.table === "group_members" && state.eq) {
      return Array.from({ length: groups }, (_, i) => ({
        group_id: `g${i}`,
        joined_at: "2026-01-01T00:00:00.000Z",
      }));
    }
    if (state.table === "groups") {
      return Array.from({ length: groups }, (_, i) => ({
        id: `g${i}`,
        name: `Grup ${i}`,
        avatar_url: null,
        created_by: "u0",
        created_at: "2026-01-01T00:00:00.000Z",
      }));
    }
    if (state.table === "group_members") {
      const rows = [];
      for (const gid of state.in?.[1] || []) {
        for (let m = 0; m < membersEach; m += 1) {
          rows.push({ group_id: gid, user_id: `${gid}-u${m}`, joined_at: "2026-01-01T00:00:00.000Z" });
        }
      }
      return rows;
    }
    if (state.table === "users") {
      return (state.in?.[1] || []).map((id) => ({
        id,
        username: id,
        avatar_url: null,
        status: "online",
        is_admin: false,
      }));
    }
    if (state.table === "group_messages" && state.limit) {
      const count = fillLastWindow ? 800 : groups;
      return Array.from({ length: count }, (_, i) => ({
        group_id: fillLastWindow ? "g0" : `g${i % groups}`,
        content: "selam",
        media_type: null,
        media_url: null,
        message_type: "text",
        created_at: new Date(Date.UTC(2026, 9, 10, 0, 0, groups - (i % groups))).toISOString(),
        sender: { id: "u0", username: "ada" },
      }));
    }
    if (state.table === "group_messages") {
      return (state.in?.[1] || []).map((gid) => ({
        group_id: gid,
        content: "eski",
        created_at: "2026-01-02T00:00:00.000Z",
        sender: { id: "u0", username: "ada" },
      }));
    }
    return [];
  }

  function from(table) {
    const state = { table };
    const self = {
      select() { return self; },
      eq(col, val) { state.eq = [col, val]; return self; },
      in(col, ids) { state.in = [col, ids]; return self; },
      order() { return self; },
      limit(n) { state.limit = n; return self; },
      then(resolve, reject) {
        calls.push({
          table: state.table,
          eq: state.eq?.[0] || null,
          in: state.in?.[0] || null,
          inCount: state.in?.[1]?.length || 0,
          limit: state.limit || null,
        });
        try {
          resolve({ data: rowsFor(state), error: null });
        } catch (err) {
          reject(err);
        }
      },
    };
    return self;
  }

  return { from, calls };
}

const preview = formatGroupListPreview({
  content: "merhaba",
  sender: { username: "ada" },
});
assert.equal(preview, "ada: merhaba");

const assembled = assembleGroupList({
  memberships: [{ group_id: "g0", joined_at: "2026-01-01T00:00:00.000Z" }],
  groups: [{ id: "g0", name: "Grup", created_at: "2026-01-01T00:00:00.000Z" }],
  memberRows: [{ group_id: "g0", user_id: "u1" }],
  users: [{ id: "u1", username: "ada", status: "online", is_admin: false }],
  lastRows: [{ group_id: "g0", content: "selam", created_at: "2026-02-01T00:00:00.000Z", sender: { username: "ada" } }],
});
assert.equal(assembled.length, 1);
assert.equal(assembled[0].memberCount, 1);
assert.deepEqual(assembled[0].memberIds, ["u1"]);
assert.equal(assembled[0].lastMessage, "ada: selam");
assert.equal(assembled[0].lastActivity, "2026-02-01T00:00:00.000Z");
assert.equal(assembled[0].members[0].username, "ada");

(async () => {
  const db = createFakeDb({ groups: 32 });
  const [first, second] = await Promise.all([
    getUserGroups("owner", db),
    getUserGroups("owner", db),
  ]);
  assert.equal(first.length, 32);
  assert.equal(second.length, 32);
  assert.equal(db.calls.length, 5, `expected 5 queries, got ${db.calls.length}: ${JSON.stringify(db.calls)}`);
  assert.equal(first[0].memberCount, 3);
  assert.ok(first.every((group) => group.lastMessage && group.members.length === 3));

  const full = createFakeDb({ groups: 32, fillLastWindow: true });
  const rows = await loadUserGroups("owner", full);
  assert.equal(rows.length, 32);
  assert.equal(full.calls.length, 6, `expected 6 queries when the newest window is full, got ${full.calls.length}`);
  assert.ok(rows.every((group) => group.lastMessage));

  const oldQueries = 2 + (32 * 3);
  assert.equal(oldQueries, 98);
  assert.ok(db.calls.length < 10);

  console.log(`groupList.selftest: ok (${oldQueries} queries -> ${db.calls.length}, full window ${full.calls.length})`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
