"use strict";

/**
 * Server refuses casino deal/spin/flip/transfer on the native iOS socket,
 * and on any other socket while that iOS session is still connected.
 * Run: node frontend/backend/socket/casinoIosGate.selftest.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const { createFakeSupabase } = require("../test/fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fakeSupabase = createFakeSupabase({
  users: [{ id: "u-ios", username: "iosuser", birth_date: "1990-01-01" }],
  user_credits: [],
});
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: fakeSupabase,
};

const gate = require("../lib/casinoPlatformGate");
const { GameManager } = require("../games/BlackjackGame");
const { CoinFlipManager } = require("../games/CoinFlipGame");
const games = require("./gameHandlers");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

function creditRows() {
  return fakeSupabase._tables.user_credits.rows;
}

function makeSocket({ id, userId, platform }) {
  const events = [];
  const handlers = {};
  const socket = {
    id,
    user: { id: userId, username: "iosuser" },
    handshake: { auth: platform ? { platform } : {} },
    events,
    handlers,
    emit(name, payload) {
      events.push({ name, payload });
    },
    on(name, fn) {
      handlers[name] = fn;
    },
  };
  return socket;
}

function notices(socket) {
  return socket.events.filter((e) => e.name === "game:notice");
}

function iosNotices(socket) {
  return notices(socket).filter((e) => e.payload?.code === "ios_unavailable");
}

async function emitCommand(socket, command, args = "100") {
  await socket.handlers["game:command"]({ groupId: "g1", command, args });
}

async function run() {
  gate.resetCasinoPlatformState();
  const userId = "u-ios";
  const groupId = "g1";
  GameManager.remove(userId, groupId);
  CoinFlipManager.remove?.(userId, groupId);

  const ios = makeSocket({ id: "sock-ios", userId, platform: "ios" });
  const web = makeSocket({ id: "sock-web", userId, platform: null });
  games.registerGameHandlers({}, ios);
  games.registerGameHandlers({}, web);

  assert(gate.casinoBlockReason(ios) === "ios_socket", "ios handshake is blocked");
  assert(gate.casinoBlockReason(web) === "ios_session", "web socket is blocked while the iOS socket is connected");
  assert(gate.iosSessionActive(userId), "iOS socket is tracked for the account");

  const commands = ["bj", "blackjack", "slot", "coinflip", "cf", "pay", "send", "gonder", "tip", "daily", "hit"];
  for (const command of commands) {
    const before = creditRows().length;
    await emitCommand(ios, command, command === "pay" || command === "send" || command === "gonder" || command === "tip" ? "@other 50" : "100");
    assert(creditRows().length === before, `${command} on iOS does not write credits`);
    assert(iosNotices(ios).length > 0, `${command} on iOS returns the polite error`);
  }

  const beforeWeb = creditRows().length;
  await emitCommand(web, "bj", "100");
  await emitCommand(web, "slot", "100");
  await emitCommand(web, "cf", "heads 100");
  await emitCommand(web, "pay", "@other 50");
  assert(creditRows().length === beforeWeb, "mid-session web socket does not write credits");
  assert(iosNotices(web).length >= 4, "mid-session web socket gets the same polite error");
  assert(!GameManager.get(userId, groupId), "no blackjack hand was opened");

  let creditsCb = null;
  await ios.handlers["game:credits"]((row) => {
    creditsCb = row;
  });
  assert(creditsCb && creditsCb.code === "ios_unavailable" && creditsCb.credits == null, "game:credits does not return a balance");
  assert(creditRows().length === 0, "game:credits does not create a wallet");

  let statusCb = null;
  ios.handlers["game:status"]({ groupId }, (row) => {
    statusCb = row;
  });
  assert(statusCb && statusCb.active === false && statusCb.game == null, "game:status does not join a hand");

  await ios.handlers["game:action"]({ groupId, action: "hit" });
  await ios.handlers["game:action"]({ groupId, action: "call:heads" });
  assert(!GameManager.get(userId, groupId), "game:action hit does not start a hand");
  assert(creditRows().length === 0, "game:action does not move credits");

  const roomMessages = [];
  const slashSocket = makeSocket({ id: "sock-ios-slash", userId, platform: "iOS" });
  games.registerGameHandlers({}, slashSocket);
  await games.handleGameCommand(
    { to: () => ({ emit: (_e, payload) => roomMessages.push(payload) }) },
    slashSocket,
    userId,
    "iosuser",
    groupId,
    "/slot 100"
  );
  assert(iosNotices(slashSocket).length === 1, "slash /slot is refused once");
  assert(roomMessages.length === 0, "slash refusal does not broadcast a casino board");
  assert(creditRows().length === 0, "slash /slot does not write credits");

  ios.handlers.disconnect();
  slashSocket.handlers.disconnect();
  assert(!gate.iosSessionActive(userId), "closing the iOS sockets clears the mid-session mark");
  assert(gate.casinoBlockReason(web) === null, "web socket is allowed after the iOS session ends");

  const plain = makeSocket({ id: "sock-plain", userId: "u-plain", platform: null });
  games.registerGameHandlers({}, plain);
  assert(gate.casinoBlockReason(plain) === null, "a socket with no platform is not an iOS session");
  await plain.handlers["game:command"]({ groupId: "g1", command: "bj", args: "100" });
  assert(iosNotices(plain).length === 0, "web blackjack is not refused as an iOS session");
  assert(
    notices(plain).some((e) => e.payload?.code === "age_gate"),
    "web blackjack still reaches the age gate"
  );
  assert(creditRows().filter((r) => r.user_id === "u-plain").length === 0, "age gate stops before a wallet write");

  const desktop = makeSocket({ id: "sock-desktop", userId: "u-desk", platform: "electron" });
  games.registerGameHandlers({}, desktop);
  assert(gate.casinoBlockReason(desktop) === null, "non-ios platform is not blocked");

  gate.resetCasinoPlatformState();
  GameManager.remove(userId, groupId);
  console.log("casino iOS gate selftest ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
