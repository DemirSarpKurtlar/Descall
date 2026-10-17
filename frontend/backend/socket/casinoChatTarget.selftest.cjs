"use strict";

/**
 * Casino socket events: membership gate (security) + per-request chat target
 * (wrong-room fix) + 1:1 DM games delivered to both participants.
 * Run: node frontend/backend/socket/casinoChatTarget.selftest.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("node:assert/strict");
const { createFakeSupabase } = require("../test/fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fakeSupabase = createFakeSupabase({
  users: [
    { id: "alice", username: "alice", birth_date: "1990-01-01" },
    { id: "bob", username: "bob", birth_date: "1990-01-01" },
    { id: "carol", username: "carol", birth_date: "1990-01-01" },
    { id: "mallory", username: "mallory", birth_date: "1990-01-01" },
  ],
  user_credits: [
    { user_id: "alice", credits: 5000 },
    { user_id: "bob", credits: 5000 },
    { user_id: "carol", credits: 5000 },
    { user_id: "mallory", credits: 5000 },
  ],
  game_history: [],
});
// Rows come back as copies, like a real database (the shared fake hands out
// live row objects, which would make the escrow check see its own write).
{
  const realFrom = fakeSupabase.from.bind(fakeSupabase);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  fakeSupabase.from = (name) => {
    const q = realFrom(name);
    // Every query takes a few ms, so concurrent commands interleave at each await.
    q.then = (res, rej) => {
      let r;
      try {
        r = q._run();
      } catch (err) {
        if (rej) rej(err);
        return;
      }
      setTimeout(() => res({ ...r, data: clone(r.data) }), 2);
    };
    return q;
  };
}
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fakeSupabase };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const access = require("../lib/casinoRoomAccess");
access.setCasinoRoomAccessDeps({
  // Group lookups answer at once, channel lookups later: forces the two
  // commands below to interleave across awaits.
  isGroupMember: async (g, u) => (g === "g1" && ["bob", "alice"].includes(u)),
  channelAccess: async (c, u) => {
    await sleep(1);
    return c === "c1" && u === "alice" ? { ok: true, serverId: "s1" } : { ok: false };
  },
  isBanned: () => false,
  isTimedOut: () => false,
  isPairBlocked: async (a, b) => [a, b].includes("carol") && [a, b].includes("bob"),
  isFriend: async (a, b) => {
    const k = [a, b].sort().join("|");
    return k === "alice|bob" || k === "bob|carol";
  },
});

const games = require("./gameHandlers");
const { CoinFlipManager } = require("../games/CoinFlipGame");

const roomEmits = [];
const io = {
  to(rooms) {
    return {
      emit(event, payload) {
        for (const room of [].concat(rooms)) roomEmits.push({ via: "io", room, event, payload });
      },
    };
  },
};

function makeSocket(userId) {
  const events = [];
  const handlers = {};
  return {
    id: `sock-${userId}`,
    user: { id: userId, username: userId },
    handshake: { auth: { platform: "electron" } },
    events,
    handlers,
    emit(name, payload) {
      events.push({ name, payload });
    },
    to(room) {
      return {
        emit(event, payload) {
          roomEmits.push({ via: "socket", from: userId, room, event, payload });
        },
      };
    },
    on(name, fn) {
      handlers[name] = fn;
    },
  };
}

function credits(userId) {
  return fakeSupabase._tables.user_credits.rows.find((r) => r.user_id === userId)?.credits;
}

async function run() {
  const alice = makeSocket("alice");
  const bob = makeSocket("bob");
  const mallory = makeSocket("mallory");
  for (const s of [alice, bob, mallory]) games.registerGameHandlers(io, s);

  // 1) Security: a non-member cannot target someone else's group / channel.
  const before = credits("mallory");
  await mallory.handlers["game:command"]({ groupId: "g1", command: "cf", args: "100 yazı" });
  await mallory.handlers["game:command"]({ channelId: "c1", command: "slot", args: "100" });
  await mallory.handlers["game:action"]({ groupId: "g1", action: "call:heads" });
  await mallory.handlers["game:command"]({ groupId: "g1", command: "pay", args: "@bob 10" });
  assert.equal(roomEmits.length, 0, "nothing is broadcast into a chat the caller is not in");
  assert.equal(credits("mallory"), before, "no credits move for a refused command");
  const codes = mallory.events.filter((e) => e.name === "game:notice").map((e) => e.payload.code);
  assert.deepEqual(codes, ["not_member", "no_channel_access", "not_member", "not_member"]);
  // Slash path (handleGameCommand) is gated too, not only the socket events.
  await games.handleGameCommand(io, mallory, "mallory", "mallory", "g1", "/cf 100 tura");
  assert.equal(roomEmits.length, 0, "slash-routed game into a foreign group is refused");

  // 2) Wrong-room fix: interleaved commands keep their own chat target.
  CoinFlipManager.remove("alice", "c1");
  CoinFlipManager.remove("bob", "g1");
  await Promise.all([
    alice.handlers["game:command"]({ channelId: "c1", command: "cf", args: "100 yazı" }),
    bob.handlers["game:command"]({ groupId: "g1", command: "cf", args: "100 tura" }),
    bob.handlers["game:command"]({ groupId: "g1", command: "credits" }),
  ]);
  const aliceEmits = roomEmits.filter((e) => e.from === "alice");
  const bobEmits = roomEmits.filter((e) => e.from === "bob");
  assert.ok(aliceEmits.length > 0 && bobEmits.length > 0, "both commands broadcast");
  for (const e of aliceEmits) {
    assert.equal(e.room, "server-channel:c1", "alice's channel game stays in the channel");
    assert.equal(e.payload.channelId, "c1");
    assert.equal(e.payload.serverId, "s1");
  }
  for (const e of bobEmits) {
    assert.equal(e.room, "group:g1", "bob's group game stays in the group");
    assert.equal(e.payload.channelId, null);
    assert.equal(e.payload.groupId, "g1");
  }
  const hist = fakeSupabase._tables.game_history.rows;
  assert.ok(hist.some((r) => r.user_id === "bob" && r.group_id === "g1"), "group round keeps group_id");
  assert.ok(hist.some((r) => r.user_id === "alice" && r.group_id === undefined), "channel round has no group_id");

  // 3) DM: friends play in a 1:1 DM; both users get the card; payout unchanged.
  roomEmits.length = 0;
  const aliceBefore = credits("alice");
  await alice.handlers["game:command"]({ dmUserId: "bob", command: "cf", args: "100 tura" });
  const dmEmits = roomEmits.filter((e) => e.event === "game:update");
  assert.deepEqual(dmEmits.map((e) => e.room).sort(), ["user:alice", "user:bob"], "both DM users get the card");
  const state = dmEmits[0].payload.message.gameData;
  assert.deepEqual(dmEmits[0].payload.dmUserIds, ["alice", "bob"]);
  assert.equal(dmEmits[0].payload.groupId, null);
  assert.equal(state.game, "coinflip");
  assert.equal(state.status, "finished");
  assert.equal(credits("alice") - aliceBefore, state.result === "win" ? 100 : -100, "even-money payout unchanged");
  assert.ok(!roomEmits.some((e) => e.via === "socket"), "DM games never use group/channel rooms");
  const dmHist = fakeSupabase._tables.game_history.rows.at(-1);
  assert.equal(dmHist.group_id, undefined, "DM round has no group_id FK");

  // Rematch with side through game:command (what the new card sends)
  roomEmits.length = 0;
  await alice.handlers["game:command"]({ dmUserId: "bob", command: "cf", args: "100 yazı" });
  assert.equal(roomEmits.filter((e) => e.event === "game:update").length, 2);

  // Action in the DM (open round, then call)
  roomEmits.length = 0;
  await bob.handlers["game:command"]({ dmUserId: "alice", command: "cf", args: "50" });
  await bob.handlers["game:action"]({ dmUserId: "alice", action: "call:tails" });
  const settled = roomEmits.filter((e) => e.event === "game:update").at(-1).payload.message.gameData;
  assert.equal(settled.status, "finished");
  assert.equal(settled.call, "tails");

  // Non-friend / blocked pair: refused, no emits
  roomEmits.length = 0;
  await mallory.handlers["game:command"]({ dmUserId: "alice", command: "cf", args: "100" });
  assert.equal(mallory.events.at(-1).payload.code, "dm_not_friend");
  const carol = makeSocket("carol");
  games.registerGameHandlers(io, carol);
  await carol.handlers["game:command"]({ dmUserId: "bob", command: "slot", args: "100" });
  assert.equal(carol.events.at(-1).payload.code, "dm_blocked");
  assert.equal(roomEmits.length, 0, "refused DM games broadcast nothing");

  // game:status in a DM only returns the caller's own hand
  let status = null;
  alice.handlers["game:status"]({ dmUserId: "bob" }, (s) => { status = s; });
  assert.equal(status.active, false);

  console.log("casino chat target selftest ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
