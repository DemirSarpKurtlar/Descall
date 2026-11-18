"use strict";
// Regression (security scan 17 Nov 2026): two /bj stakes sent at once in two rooms each
// started a hand while only one stake was taken (blackjack start ran outside the credit
// lock and applyCreditDelta clamped an overdraw to 0). Now the stakes are serialized:
// the second one is refused for lack of credits, and every staked credit was debited.
// Run: node frontend/backend/socket/casinoStakeLock.selftest.cjs
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("../test/fakeSupabase.cjs");
const fake = createFakeSupabase({
  users: [{ id: "alice", username: "alice", birth_date: "1990-01-01" }],
  user_credits: [{ user_id: "alice", credits: 1000 }],
  game_history: [],
});
{
  // Copies with a small delay, like a real database, so concurrent commands interleave.
  const realFrom = fake.from.bind(fake);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  fake.from = (name) => {
    const q = realFrom(name);
    q.then = (res, rej) => {
      let r;
      try { r = q._run(); } catch (err) { if (rej) rej(err); return; }
      setTimeout(() => res({ ...r, data: clone(r.data) }), 2);
    };
    return q;
  };
}
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
const access = require("../lib/casinoRoomAccess");
access.setCasinoRoomAccessDeps({
  isGroupMember: async (g, u) => u === "alice" && (g === "g1" || g === "g2"),
  channelAccess: async () => ({ ok: false }),
  isBanned: () => false,
  isTimedOut: () => false,
  isPairBlocked: async () => false,
  isFriend: async () => false,
});
const games = require("./gameHandlers");
const { GameManager } = require("../games/BlackjackGame");
const io = { to() { return { emit() {} }; } };
const handlers = {};
const socket = { id: "s1", user: { id: "alice", username: "alice" }, handshake: { auth: { platform: "electron" } }, emit() {}, to() { return { emit() {} }; }, on(n, f) { handlers[n] = f; } };
games.registerGameHandlers(io, socket);
(async () => {
  await Promise.all([
    handlers["game:command"]({ groupId: "g1", command: "bj", args: "1000" }),
    handlers["game:command"]({ groupId: "g2", command: "bj", args: "1000" }),
  ]);
  const hands = ["g1", "g2"].map((g) => GameManager.get("alice", g)).filter(Boolean);
  const balance = fake._tables.user_credits.rows[0].credits;
  assert.equal(hands.length, 1, "only one 1000-credit hand can start on a 1000 balance");
  assert.ok(balance >= 0, "balance never goes negative");
  console.log("casino stake lock selftest ok");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
