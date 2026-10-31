"use strict";

/**
 * 1:1 DM slash routing (dm:send → games / app commands) + DM app replies.
 * Run: node frontend/backend/lib/dmSlashCommands.selftest.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("node:assert/strict");
const { createFakeSupabase } = require("../test/fakeSupabase.cjs");
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: createFakeSupabase({ users: [{ id: "alice", username: "alice" }, { id: "bob", username: "bob" }] }),
};

const slash = require("./slashCommands");
const { routeDmSlashCommand, dmCommandNames } = require("./dmSlashCommands");

function makeSocket() {
  const events = [];
  return { user: { id: "alice", username: "alice" }, events, emit: (name, payload) => events.push({ name, payload }) };
}
function makeIo() {
  const sent = [];
  return { sent, to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }) };
}
const okTarget = async ({ userId, dmUserId }) => ({
  ok: true,
  target: { kind: "dm", roomId: `dm:${[userId, dmUserId].sort().join(":")}`, dmUserIds: [userId, dmUserId] },
});

async function run() {
  // Catalog: casino + DM-safe app commands; server-only moderation stays out.
  const names = dmCommandNames();
  for (const n of ["help", "user", "avatar", "poll"]) assert.ok(names.has(n), `/${n} works in DMs`);
  for (const n of ["kick", "ban", "timeout", "purge", "nick", "server"]) assert.equal(names.has(n), false, `/${n} stays server-only`);

  // Unknown slash text is a normal message.
  let socket = makeSocket();
  let r = await routeDmSlashCommand({ io: makeIo(), socket, myId: "alice", toUserId: "bob", text: "/shrug" }, { resolveCasinoTarget: okTarget });
  assert.equal(r.handled, false);

  // Casino in a DM → executeSlashCommand(context dm) with the resolved target, ack, no persistence.
  const calls = [];
  const stubSlash = {
    ...slash,
    executeSlashCommand: async (ctx) => {
      calls.push(ctx);
      return { handled: true };
    },
  };
  socket = makeSocket();
  r = await routeDmSlashCommand(
    { io: makeIo(), socket, myId: "alice", toUserId: "bob", tempId: "t1", text: "/cf 100 yazı" },
    { slash: stubSlash, resolveCasinoTarget: okTarget }
  );
  assert.deepEqual(r, { handled: true, dmText: null });
  assert.equal(calls[0].context, "dm");
  assert.equal(calls[0].dmUserId, "bob");
  assert.equal(calls[0].gameOptions.target.kind, "dm");
  assert.deepEqual(calls[0].gameOptions.target.dmUserIds, ["alice", "bob"]);
  assert.equal(socket.events[0].name, "dm:command:ack");
  assert.equal(socket.events[0].payload.isGameCommand, true);

  // Not friends / blocked → refused before anything runs; no message request is created.
  calls.length = 0;
  socket = makeSocket();
  r = await routeDmSlashCommand(
    { io: makeIo(), socket, myId: "alice", toUserId: "stranger", tempId: "t2", text: "/slot 100" },
    {
      slash: stubSlash,
      resolveCasinoTarget: async () => ({ ok: false, code: "dm_not_friend", text: "Oyunlar ve komutlar yalnızca arkadaşlarınla olan DM'lerde çalışır." }),
    }
  );
  assert.equal(r.handled, true);
  assert.equal(calls.length, 0, "refused command never executes");
  assert.equal(socket.events[0].name, "dm:error");
  assert.equal(socket.events[0].payload.code, "dm_not_friend");
  assert.equal(socket.events[0].payload.tempId, "t2");

  // /help in a DM → the app help card (2.12.0: no longer the casino help) to both participants.
  for (const cmd of ["/help", "/yardım", "/commands"]) {
    socket = makeSocket();
    const helpIo = makeIo();
    r = await routeDmSlashCommand({ io: helpIo, socket, myId: "alice", toUserId: "bob", text: cmd }, { resolveCasinoTarget: okTarget });
    assert.equal(r.handled, true, cmd);
    assert.equal(helpIo.sent.filter((x) => x.event === "game:message").length, 0, `${cmd} must not reach the casino help`);
    const help = helpIo.sent.filter((x) => x.event === "dm:message");
    assert.deepEqual(help.map((x) => x.room).sort(), ["user:alice", "user:bob"], cmd);
    assert.equal(help[0].payload.type, "app_help");
    assert.equal(help[0].payload.embed.card.kind, "help");
    assert.equal(help[0].payload.embed.title, "Commands");
    assert.deepEqual(help[0].payload.embed.i18n.title, { key: "bot.slash.helpTitle" });
  }
  let io;

  // /avatar in a DM → app card delivered to both participants with convWith.
  socket = makeSocket();
  io = makeIo();
  r = await routeDmSlashCommand({ io, socket, myId: "alice", toUserId: "bob", text: "/avatar @bob" }, { resolveCasinoTarget: okTarget });
  assert.equal(r.handled, true);
  assert.deepEqual(io.sent.map((x) => x.room).sort(), ["user:alice", "user:bob"]);
  const toAlice = io.sent.find((x) => x.room === "user:alice").payload;
  const toBob = io.sent.find((x) => x.room === "user:bob").payload;
  assert.equal(toAlice.convWith, "bob");
  assert.equal(toBob.convWith, "alice");
  assert.equal(toAlice.isAppMessage, true);
  assert.ok(toAlice.embed, "app reply carries its embed");
  assert.equal(socket.events[0].payload.isAppCommand, true);

  // /poll in a DM → a validated poll that dm:send stores as the caller's own poll_v2 row.
  socket = makeSocket();
  r = await routeDmSlashCommand({ io: makeIo(), socket, myId: "alice", toUserId: "bob", text: "/poll Pizza mı? | Evet | Hayır" }, { resolveCasinoTarget: okTarget });
  assert.equal(r.handled, true);
  assert.equal(r.dmText, null);
  assert.equal(r.dmPoll.question, "Pizza mı?");
  assert.deepEqual(r.dmPoll.options.map((o) => o.text), ["Evet", "Hayır"]);
  assert.equal(slash.formatPollContent("Pizza mı? | Evet | Hayır"), "📊 Poll: Pizza mı?\n1. Evet\n2. Hayır\nUpdate Descall to vote");
  assert.equal(slash.formatPollContent("only | one"), null);

  // Handler errors surface as dm:error, not a crash.
  socket = makeSocket();
  r = await routeDmSlashCommand(
    { io: makeIo(), socket, myId: "alice", toUserId: "bob", tempId: "t3", text: "/bj 100" },
    { slash: { ...slash, executeSlashCommand: async () => { throw Object.assign(new Error("boom"), { code: "X" }); } }, resolveCasinoTarget: okTarget }
  );
  assert.equal(socket.events[0].name, "dm:error");
  assert.equal(socket.events[0].payload.code, "X");

  console.log("dmSlashCommands selftest ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
