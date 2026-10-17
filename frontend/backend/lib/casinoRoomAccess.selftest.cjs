"use strict";

/**
 * Chat membership gate for casino games and slash commands (group / channel / DM).
 * Run: node frontend/backend/lib/casinoRoomAccess.selftest.cjs
 */

const assert = require("node:assert/strict");
const { resolveCasinoTarget, dmRoomId } = require("./casinoRoomAccess");

const deps = {
  isGroupMember: async (g, u) => g === "g1" && u === "alice",
  channelAccess: async (c, u) => {
    if (c === "c1" && u === "alice") return { ok: true, serverId: "s1" };
    if (c === "c1" && u === "muted") return { ok: false, timedOut: true };
    return { ok: false };
  },
  isBanned: (u) => u === "banned",
  isTimedOut: (u) => u === "timeout",
  isPairBlocked: async (a, b) => [a, b].sort().join() === ["alice", "blocker"].sort().join(),
  isFriend: async (a, b) => {
    const pairs = new Set(["alice|bob", "bob|alice", "banned|bob", "timeout|bob", "alice|blocker", "blocker|alice"]);
    return pairs.has(`${a}|${b}`);
  },
};

async function run() {
  // Group
  let r = await resolveCasinoTarget({ userId: "alice", groupId: "g1" }, deps);
  assert.equal(r.ok, true);
  assert.deepEqual(r.target, { kind: "group", roomId: "g1", groupId: "g1", channelId: null, serverId: null, dmUserIds: null });
  r = await resolveCasinoTarget({ userId: "mallory", groupId: "g1" }, deps);
  assert.equal(r.ok, false);
  assert.equal(r.code, "not_member");
  r = await resolveCasinoTarget({ userId: "alice", groupId: "g-other" }, deps);
  assert.equal(r.code, "not_member", "a group the caller is not in is refused");

  // Channel
  r = await resolveCasinoTarget({ userId: "alice", channelId: "c1" }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.target.kind, "channel");
  assert.equal(r.target.serverId, "s1");
  r = await resolveCasinoTarget({ userId: "mallory", channelId: "c1" }, deps);
  assert.equal(r.code, "no_channel_access");
  r = await resolveCasinoTarget({ userId: "muted", channelId: "c1" }, deps);
  assert.equal(r.code, "timed_out");
  // channelId wins over a forged groupId
  r = await resolveCasinoTarget({ userId: "mallory", channelId: "c1", groupId: "g1" }, deps);
  assert.equal(r.ok, false, "a forged groupId does not bypass the channel check");

  // DM
  r = await resolveCasinoTarget({ userId: "alice", dmUserId: "bob" }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.target.kind, "dm");
  assert.deepEqual(r.target.dmUserIds, ["alice", "bob"]);
  assert.equal(r.target.roomId, dmRoomId("bob", "alice"), "dm room id is symmetric");
  assert.equal((await resolveCasinoTarget({ userId: "bob", dmUserId: "alice" }, deps)).target.roomId, r.target.roomId);
  assert.equal((await resolveCasinoTarget({ userId: "alice", dmUserId: "stranger" }, deps)).code, "dm_not_friend",
    "non-friends (message requests) are refused");
  assert.equal((await resolveCasinoTarget({ userId: "alice", dmUserId: "blocker" }, deps)).code, "dm_blocked",
    "a blocked pair is refused even when friends");
  assert.equal((await resolveCasinoTarget({ userId: "banned", dmUserId: "bob" }, deps)).code, "banned");
  assert.equal((await resolveCasinoTarget({ userId: "timeout", dmUserId: "bob" }, deps)).code, "timed_out");
  assert.equal((await resolveCasinoTarget({ userId: "alice", dmUserId: "alice" }, deps)).code, "dm_self");

  // Missing / malformed
  assert.equal((await resolveCasinoTarget({ userId: "alice" }, deps)).code, "no_target");
  assert.equal((await resolveCasinoTarget({ groupId: "g1" }, deps)).code, "no_target");
  assert.equal((await resolveCasinoTarget({ userId: "alice", groupId: { $ne: 1 } }, deps)).code, "no_target");

  // Every refusal has Turkish text
  for (const code of ["not_member", "no_channel_access", "dm_not_friend"]) {
    const res = [
      await resolveCasinoTarget({ userId: "mallory", groupId: "g1" }, deps),
      await resolveCasinoTarget({ userId: "mallory", channelId: "c1" }, deps),
      await resolveCasinoTarget({ userId: "alice", dmUserId: "x" }, deps),
    ].find((x) => x.code === code);
    assert.ok(res && /[a-zçğıöşü]/i.test(res.text), `${code} has a message`);
  }
  console.log("casinoRoomAccess selftest ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
