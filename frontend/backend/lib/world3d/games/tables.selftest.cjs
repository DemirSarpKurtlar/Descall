"use strict";

/**
 * Table manager with a fake clock: registry per room, seats, nonces, stale
 * seq, rate limits, turn timeouts and AFK autopilot, disconnect grace and
 * reconnect, redacted payloads, bot scheduling (sync and async), timer retry,
 * cleanup, and full bot-driven matches of every game.
 * Run: node frontend/backend/lib/world3d/games/tables.selftest.cjs
 */

const assert = require("assert");
const C = require("./common");
const R = require("./chessRules");
const { TableManager } = require("./tables");
const { createFakeClock, seeded } = require("./testkit.cjs");

let checks = 0;
const ok = (c, m) => {
  checks++;
  assert.ok(c, m);
};
const eq = (a, b, m) => {
  checks++;
  assert.deepStrictEqual(a, b, m);
};

function manager(extra = {}) {
  const clock = createFakeClock();
  const updates = [];
  const results = [];
  const errors = [];
  const tm = new TableManager({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    rng: seeded(extra.seed || "tables"),
    onUpdate: (u) => updates.push(u),
    onResult: (r) => results.push(r),
    onError: (e) => errors.push(e),
    ...extra,
  });
  return { tm, clock, updates, results, errors };
}

const ROOM = "world:voice:c1";

// ---------------------------------------------------------------- registry

{
  const { tm } = manager({ config: { maxTablesPerRoom: 2 } });
  eq(tm.createTable(ROOM, "poker").error, "unknown_game");
  eq(tm.createTable("", "okey").error, "bad_room");
  const a = tm.createTable(ROOM, "okey");
  const b = tm.createTable(ROOM, "blackjack");
  ok(a.ok && b.ok && a.tableId !== b.tableId);
  eq(tm.createTable(ROOM, "chess").error, "too_many_tables");
  ok(tm.createTable("world:group:g1", "chess").ok, "the limit is per room");
  eq(tm.listTables(ROOM).map((t) => t.game), ["okey", "blackjack"]);
  eq(tm.listTables("nope"), []);
  ok(tm.removeTable(a.tableId));
  eq(tm.removeTable(a.tableId), false);
  eq(tm.closeRoom(ROOM), 1);
  eq(tm.listTables(ROOM), []);
  eq(tm.join("missing", { id: "a" }).error, "no_table");
  eq(tm.act("missing", "a", { action: { type: "x" } }).error, "no_table");
  eq(tm.viewFor("missing", "a"), null);
}

// ---------------------------------------------------------------- okey table: actions, nonces, seq, timers

{
  const { tm, clock, updates } = manager();
  const { tableId: id } = tm.createTable(ROOM, "okey", { turnMs: 20000 });
  ok(tm.join(id, { id: "alice", name: "Ayse" }).ok);
  ok(tm.join(id, { id: "spec", name: "Watcher" }).ok);
  ok(tm.sit(id, "alice", 0).ok);
  eq(tm.act(id, "zed", { action: { type: "draw" } }).error, "not_member");
  eq(tm.act(id, "alice", { action: null }).error, "bad_action");
  eq(tm.act(id, "alice", { action: { type: "x".repeat(40) } }).error, "bad_action");
  ok(tm.start(id, "alice").ok);
  const t = tm.table(id);
  eq(t.state.phase, "playing");
  ok(updates.length >= 3, "updates emitted");
  ok(clock.pending() >= 1, "a turn or bot timer is running");
  const view = tm.viewFor(id, "alice");
  ok(Array.isArray(view.timers) && view.timers.length === 1 && view.timers[0].deadline > clock.now());
  eq(view.tableId, id);
  eq(tm.viewFor(id, null).you, null, "spectator view");
  ok(Array.isArray(view.you.rack), "player view has the rack");
  // Let bots play until it is alice's turn.
  for (let k = 0; k < 50 && !(t.state.hand.turn === 0); k++) clock.step();
  eq(t.state.hand.turn, 0, "alice to move");
  // Stale seq is refused for turn actions; a free action (arrange) skips the check.
  const seq = t.state.seq;
  const step = t.state.hand.step;
  const turnAction = step === "draw" ? { type: "draw", from: "pile" } : { type: "discard", tile: t.state.hand.racks[0][0] };
  eq(tm.act(id, "alice", { action: turnAction, seq: seq - 1, nonce: "n0" }).error, "stale");
  const slots = tm.suggest(id, "alice", "runs").slots;
  ok(tm.act(id, "alice", { action: { type: "arrange", slots }, seq: seq - 5 }).ok, "free actions ignore seq");
  eq(tm.suggest(id, "alice", "bogus"), null);
  // Nonce: the same request twice applies once.
  const first = tm.act(id, "alice", { action: turnAction, seq, nonce: "n1" });
  ok(first.ok);
  const seqAfter = t.state.seq;
  const again = tm.act(id, "alice", { action: turnAction, seq, nonce: "n1" });
  eq(again.duplicate, true);
  eq(again.ok, true);
  eq(t.state.seq, seqAfter, "not applied twice");
  // Errors are answered and remembered under their nonce too.
  const bad = tm.act(id, "alice", { action: { type: "draw", from: "nowhere" }, nonce: "n2" });
  ok(!bad.ok);
  eq(tm.act(id, "alice", { action: { type: "draw", from: "nowhere" }, nonce: "n2" }).duplicate, true);
  // Payloads: private parts only for the owner.
  const fakeEvents = [{ type: "draw", seat: 0, from: "pile", private: { playerId: "alice", tile: { id: 5 } } }];
  eq(tm.payloadFor(id, "alice", fakeEvents).events[0].tile, { id: 5 });
  eq(tm.payloadFor(id, "spec", fakeEvents).events[0].tile, undefined);
  eq(tm.payloadFor(id, null, fakeEvents).events[0].tile, undefined);
  ok(tm.payloadFor(id, "spec", []).view.you === null, "spectator payload view");
}

// ---------------------------------------------------------------- rate limit

{
  const { tm, clock } = manager({ config: { actionRate: { ratePerSec: 2, burst: 3 } } });
  const { tableId: id } = tm.createTable(ROOM, "okey");
  tm.join(id, { id: "a", name: "A" });
  const r = [];
  for (let i = 0; i < 5; i++) r.push(tm.act(id, "a", { action: { type: "draw" } }).error);
  eq(r.slice(3), ["rate_limited", "rate_limited"]);
  clock.advance(1000);
  ok(tm.act(id, "a", { action: { type: "draw" } }).error !== "rate_limited", "tokens refill");
}

// ---------------------------------------------------------------- timeouts, AFK autopilot, reconnect

{
  const { tm, clock } = manager({ config: { afkLimit: 2, graceMs: 30000 } });
  const { tableId: id } = tm.createTable(ROOM, "okey", { turnMs: 60000 });
  tm.join(id, { id: "alice", name: "A" });
  tm.sit(id, "alice", 0);
  tm.start(id, "alice");
  const t = tm.table(id);
  const seat = () => t.state.seats[0];
  // Alice never acts: her turns time out; after two timeouts the bot plays for her.
  let guard = 0;
  while (!seat().autopilot && guard++ < 500) clock.step();
  ok(seat().autopilot && seat().connected, "AFK hands the seat to the bot");
  ok(t.afk.get("alice") >= 2);
  // When she acts again she gets the seat back.
  for (let k = 0; k < 200 && t.state.hand.turn !== 0; k++) clock.step();
  if (t.state.phase === "playing" && t.state.hand.turn === 0) {
    const a = t.state.hand.step === "draw" ? { type: "draw", from: "pile" } : { type: "discard", tile: t.state.hand.racks[0][0] };
    ok(tm.act(id, "alice", { action: a }).ok);
    eq(seat().autopilot, false, "acting clears the autopilot");
  }
  // Disconnect: seat kept, bot after the grace period, back on reconnect.
  tm.disconnect("alice");
  eq(seat().connected, false);
  eq(seat().autopilot, false, "still her seat during the grace period");
  clock.advance(29999);
  eq(seat().autopilot, false);
  clock.advance(2);
  eq(seat().autopilot, true, "grace over: the bot plays");
  tm.reconnect("alice");
  eq([seat().connected, seat().autopilot], [true, false]);
  // Reconnect inside the grace period cancels the timer.
  tm.disconnect("alice");
  clock.advance(10000);
  tm.reconnect("alice");
  clock.advance(25000); // past the original grace deadline, less than one 60 s turn
  eq(seat().autopilot, false, "no takeover after reconnecting in time");
  eq(t.grace.size, 0);
  // Leaving clears her grace timer and gives the seat to a bot.
  tm.disconnect("alice");
  ok(t.grace.size === 1);
  tm.leave(id, "alice");
  eq(t.grace.size, 0);
  eq(t.state.seats[0].kind, "bot");
  // Removing the table stops every timer.
  tm.removeTable(id);
  eq(clock.pending(), 0, "no timers left behind");
}

// ---------------------------------------------------------------- timer retry on engine errors

{
  let failures = 1;
  const stub = {
    FREE_ACTIONS: new Set(),
    create: () => ({ phase: "x", seq: 0, seats: [], members: {}, done: false }),
    join: (s, p) => C.joinMember(s, p),
    timers: (s) => (s.done ? [] : [{ key: "k", kind: "system", playerId: null, ms: 100, action: { type: "tick" } }]),
    apply: (s) => {
      if (failures-- > 0) return C.fail(s, "flaky");
      return C.ok({ ...s, done: true, seq: s.seq + 1 }, [{ type: "done" }]);
    },
    viewFor: (s) => ({ phase: s.phase }),
    publicView: (s) => ({ phase: s.phase }),
    scores: () => [],
  };
  const { tm, clock, errors } = manager({ engines: { stub } });
  const { tableId: id } = tm.createTable(ROOM, "stub");
  tm.join(id, { id: "a" });
  clock.advance(100);
  eq(errors.length, 1, "error reported");
  eq(tm.table(id).state.done, false);
  clock.advance(1000);
  eq(tm.table(id).state.done, true, "retried after a back-off");
  eq(clock.pending(), 0);
}

// ---------------------------------------------------------------- full matches through the manager

function driveToEnd(tm, clock, id, until, maxSteps = 20000) {
  let n = 0;
  while (!until(tm.table(id).state) && n++ < maxSteps) {
    if (!clock.step()) throw new Error(`no timer pending in phase ${tm.table(id).state.phase}`);
  }
  ok(until(tm.table(id).state), "reached the end");
  return n;
}

const t0 = Date.now();
{
  // Okey: one human on autopilot plus three bots, a short match.
  const { tm, clock, results, errors } = manager({ seed: "m-okey" });
  const { tableId: id } = tm.createTable(ROOM, "okey", { startPoints: 6, botLevel: "medium" });
  tm.join(id, { id: "alice", name: "A" });
  tm.sit(id, "alice", 1);
  tm.start(id, "alice");
  tm.disconnect("alice");
  driveToEnd(tm, clock, id, (s) => s.phase === "matchOver");
  ok(results.some((r) => r.event.type === "matchOver" && r.game === "okey"), "match result reported");
  eq(errors, []);
  ok(results[results.length - 1].standings.length === 4);
}

{
  // Blackjack: two players bet each round; one drops and the autopilot plays.
  const { tm, clock, results, errors } = manager({ seed: "m-bj" });
  const { tableId: id } = tm.createTable(ROOM, "blackjack");
  for (const u of ["a", "b"]) {
    tm.join(id, { id: u, name: u });
    tm.sit(id, u, u === "a" ? 0 : 3);
  }
  let rounds = 0;
  for (let k = 0; k < 4000 && rounds < 25; k++) {
    const s = tm.table(id).state;
    if (s.phase === "betting") {
      for (const u of ["a", "b"]) {
        const i = C.seatOf(s, u);
        if (i >= 0 && !tm.table(id).state.bets[i] && tm.table(id).state.phase === "betting") {
          if (tm.table(id).state.players[u].points < 10) tm.act(id, u, { action: { type: "refill" } });
          tm.act(id, u, { action: { type: "bet", amount: 20 }, nonce: `${u}-${k}` });
        }
      }
      if (k === 40) tm.disconnect("b");
      continue;
    }
    if (!clock.step()) throw new Error(`blackjack stalled in ${s.phase}`);
    rounds = results.filter((r) => r.event.type === "settle").length;
  }
  ok(rounds >= 25, `blackjack rounds settled through timers (${rounds})`);
  eq(errors, []);
}

{
  // Tavla against the bot, the human on autopilot.
  const { tm, clock, results, errors } = manager({ seed: "m-tavla" });
  const { tableId: id } = tm.createTable(ROOM, "tavla", { matchTo: 2 });
  tm.join(id, { id: "a", name: "A" });
  tm.sit(id, "a", 0);
  tm.start(id, "a");
  tm.disconnect("a");
  driveToEnd(tm, clock, id, (s) => s.phase === "matchOver");
  ok(results.some((r) => r.event.type === "matchOver"));
  eq(errors, []);
}

{
  // Chess with the synchronous bot (deterministic budget) on both sides.
  const { tm, clock, results, errors } = manager({ seed: "m-chess", engineCtx: { syncBot: true, botBudget: { maxNodes: 1500, maxMs: 1e9, maxDepth: 3 } } });
  const { tableId: id } = tm.createTable(ROOM, "chess", { timeControl: "5+0", botLevel: "easy" });
  tm.join(id, { id: "a", name: "A" });
  tm.sit(id, "a", 0);
  tm.start(id, "a");
  tm.disconnect("a");
  driveToEnd(tm, clock, id, (s) => s.phase === "over", 4000);
  ok(results.some((r) => r.game === "chess" && r.event.type === "gameOver"));
  eq(errors, []);
}

// ---------------------------------------------------------------- async bot: results that arrive late are dropped

(async () => {
  // A controllable runner: think() resolves when the test says so.
  const waiting = [];
  const runner = {
    think(fen) {
      return new Promise((resolve) => {
        const pos = R.Position.fromFen(fen);
        const m = pos.legalMoves()[0];
        waiting.push(() => resolve({ move: R.uci(m) }));
      });
    },
  };
  const { tm, clock, errors } = manager({ seed: "async", engineCtx: { chessRunner: runner } });
  const { tableId: id } = tm.createTable(ROOM, "chess", { whiteSeat: 1 });
  tm.join(id, { id: "h", name: "H" });
  tm.sit(id, "h", 0);
  tm.start(id, "h"); // the bot (seat 1) plays white
  const t = tm.table(id);
  await clock.advanceAsync(1000);
  eq(waiting.length, 1, "the bot is thinking");
  ok(t.busy);
  waiting.shift()();
  await clock.advanceAsync(0);
  eq(t.state.moves.length, 1, "the async move was applied");
  eq(t.busy, false);
  // Human answers, bot thinks again; meanwhile the human resigns: the late move is dropped.
  const pos = R.Position.fromFen(t.state.fen);
  ok(tm.act(id, "h", { action: { type: "move", uci: R.uci(pos.legalMoves()[0]) } }).ok);
  await clock.advanceAsync(1000);
  eq(waiting.length, 1);
  ok(tm.act(id, "h", { action: { type: "resign" } }).ok);
  waiting.shift()();
  await clock.advanceAsync(0);
  eq(t.state.phase, "over");
  eq(t.state.moves.length, 2, "the bot's late answer was discarded");
  eq(errors, []);
  const ms = Date.now() - t0;
  console.log(`tables.selftest: ok (${checks} checks; full matches of all four games in ${ms} ms)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
