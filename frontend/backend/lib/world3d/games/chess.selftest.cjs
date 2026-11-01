"use strict";

/**
 * Chess rules and table engine: FEN, SAN in/out, castling, en passant (with
 * pins), promotion choice, check, mate, stalemate, threefold repetition,
 * fifty-move rule, insufficient material, clocks (first-move window,
 * increments, flag fall, timeout vs insufficient material), resign, draw
 * offers, rematch, views, PGN, and random games through the engine.
 * Run: node frontend/backend/lib/world3d/games/chess.selftest.cjs
 */

const assert = require("assert");
const C = require("./common");
const R = require("./chessRules");
const CH = require("./chess");
const { seeded } = require("./testkit.cjs");

let checks = 0;
const ok = (c, m) => {
  checks++;
  assert.ok(c, m);
};
const eq = (a, b, m) => {
  checks++;
  assert.deepStrictEqual(a, b, m);
};

const P = (fen) => R.Position.fromFen(fen);
const sans = (pos) => {
  const legal = pos.legalMoves();
  return legal.map((m) => R.sanOf(pos, m, legal)).sort();
};
function play(pos, list) {
  for (const san of list) {
    const m = R.moveFromSan(pos, san);
    assert.ok(m, `SAN ${san} in ${pos.toFen()}`);
    pos.make(m);
  }
  return pos;
}

// ---------------------------------------------------------------- FEN

{
  const fens = [
    R.START_FEN,
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
    "8/8/8/8/8/8/6k1/4K2R w K - 12 40",
  ];
  for (const f of fens) eq(P(f).toFen(), f, "FEN round trip");
  const bad = [
    ["", "fen_fields"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1", "fen_ranks"],
    ["rnbqkbnr/ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "fen_rank_len"],
    ["rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "fen_piece"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1", "fen_side"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkx - 0 1", "fen_castling"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e4 0 1", "fen_ep"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w kq - 0 1", "fen_no_king"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKKBNR w kq - 0 1", "fen_two_kings"],
    ["rnbqkbnP/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQq - 0 1", "fen_pawn_rank"],
    ["4k3/8/8/8/8/8/8/R3K3 b - - 0 1", null],
    ["4k3/4R3/8/8/8/8/8/4K3 w - - 0 1", "fen_illegal_check"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - -1 1", "fen_counters"],
  ];
  for (const [f, err] of bad) eq(new R.Position().loadFen(f), err, `FEN "${f}"`);
  // Castling rights the pieces cannot back up are dropped.
  eq(P("4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1").toFen(), "4k3/8/8/8/8/8/8/4K3 w - - 0 1");
}

// ---------------------------------------------------------------- SAN out and in

{
  eq(sans(P(R.START_FEN)).length, 20);
  ok(sans(P("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1")).includes("Nbd2") && sans(P("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1")).includes("Nfd2"), "file disambiguation");
  const rooks = sans(P("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1"));
  ok(rooks.includes("R1a3") && rooks.includes("R5a3"), "rank disambiguation");
  const queens = sans(P("4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1"));
  ok(queens.includes("Qa1b2"), "full square disambiguation");
  const promo = sans(P("8/4P3/8/8/8/8/k7/4K3 w - - 0 1"));
  ok(["e8=Q", "e8=R", "e8=B", "e8=N"].every((x) => promo.includes(x)), "promotion choices");
  const promoCheck = sans(P("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1"));
  ok(promoCheck.includes("b8=Q+") && promoCheck.includes("b8=R+") && promoCheck.includes("b8=N"), "promotion with check");
  const castle = sans(P("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"));
  ok(castle.includes("O-O") && castle.includes("O-O-O"), "castling SAN");
  // Fool's mate: the last move is a mate.
  const fool = play(P(R.START_FEN), ["f3", "e5", "g4"]);
  const legal = fool.legalMoves();
  const mate = legal.find((m) => R.uci(m) === "d8h4");
  eq(R.sanOf(fool, mate, legal), "Qh4#");
  // SAN parsing is lenient on decorations.
  const p = P("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  eq(R.uci(R.moveFromSan(p, "0-0")), "e1g1");
  eq(R.uci(R.moveFromSan(p, "O-O-O+")), "e1c1");
  eq(R.uci(R.moveFromSan(P("8/4P3/8/8/8/8/k7/4K3 w - - 0 1"), "e8Q")), "e7e8q");
  eq(R.uci(R.moveFromSan(P("8/4P3/8/8/8/8/k7/4K3 w - - 0 1"), "e8=N")), "e7e8n");
  eq(R.moveFromSan(P(R.START_FEN), "e5"), 0, "illegal SAN");
  eq(R.moveFromSan(P(R.START_FEN), "Nd2"), 0);
  eq(R.uci(R.moveFromSan(P("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1"), "Nb1d2")), "b1d2", "over-disambiguated SAN");
  eq(R.moveFromSan(P("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1"), "Nd2"), 0, "ambiguous SAN is refused");
  eq(R.moveFromUci(P(R.START_FEN), "e2e5"), 0);
  eq(R.uci(R.moveFromUci(P(R.START_FEN), "g1f3")), "g1f3");
}

// ---------------------------------------------------------------- special rules

{
  // En passant: available right after the double step only.
  const ep = play(P(R.START_FEN), ["e4", "a6", "e5", "d5"]);
  ok(sans(ep).includes("exd6"), "en passant available");
  play(ep, ["exd6"]);
  eq(ep.toFen().split(" ")[0], "rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR", "captured pawn removed");
  const late = play(P(R.START_FEN), ["e4", "a6", "e5", "d5", "Nf3", "a5"]);
  ok(!sans(late).includes("exd6"), "en passant expires");
  // A pinned en passant (horizontal pin along the 5th rank) is illegal.
  const pin = P("8/8/8/K2pP2r/8/8/8/7k w - d6 0 1");
  ok(!sans(pin).some((s) => s.startsWith("exd6")), "ep that exposes the king is illegal");
  eq(R.repetitionKey(pin).split(" ")[3], "-", "an impossible ep does not count for repetition");
  eq(R.repetitionKey(P("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3")).split(" ")[3], "f6");
  // Castling: not out of, through or into check; rights vanish when king or rook move.
  ok(sans(P("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")).includes("O-O"), "castling available");
  const inCheck = sans(P("4k3/4r3/8/8/8/8/8/R3K2R w KQ - 0 1"));
  ok(!inCheck.includes("O-O") && !inCheck.includes("O-O-O"), "not out of check");
  ok(!sans(P("4k3/5r2/8/8/8/8/8/R3K2R w KQ - 0 1")).includes("O-O"), "not through check (f1)");
  ok(!sans(P("4k3/6r1/8/8/8/8/8/R3K2R w KQ - 0 1")).includes("O-O"), "not into check (g1)");
  ok(sans(P("4k3/1r6/8/8/8/8/8/R3K2R w KQ - 0 1")).includes("O-O-O"), "b1 attacked does not stop O-O-O");
  ok(!sans(P("4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1")).includes("O-O-O"), "pieces in between");
  const moved = play(P("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), ["Rh2", "Rh7", "Rh1", "Rh8"]);
  eq(moved.toFen().split(" ")[2], "Qq", "rook moves drop the right for good");
  const captured = play(P("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), ["Rxa8+"]);
  eq(captured.toFen().split(" ")[2], "Kk", "a captured rook drops the right");
  // Check, mate, stalemate.
  ok(P("4k3/4R3/8/8/8/8/8/4K3 b - - 0 1").inCheck());
  eq(CH.gameStatus(P("R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1"), 1), { reason: "checkmate", winnerColor: R.WHITE });
  eq(CH.gameStatus(P("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), 1), { reason: "stalemate" });
  // Insufficient material.
  const dead = ["8/8/8/4k3/8/8/8/4K3 w - - 0 1", "8/8/8/4k3/8/8/8/4KB2 w - - 0 1", "8/8/8/4k3/8/8/8/4KN2 w - - 0 1", "8/8/8/4k3/2b5/8/8/4KB2 w - - 0 1", "8/8/8/4k3/8/8/2B5/1B2K3 w - - 0 1"];
  for (const f of dead) ok(R.insufficientMaterial(P(f)), `dead: ${f}`);
  const alive = ["8/8/8/4k3/3b4/8/8/4KB2 w - - 0 1", "8/8/8/4k3/8/8/8/3NKN2 w - - 0 1", "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1", "8/8/8/4k3/8/8/8/4KR2 w - - 0 1", "8/8/8/2n1k3/8/8/8/4KB2 w - - 0 1"];
  for (const f of alive) ok(!R.insufficientMaterial(P(f)), `not dead: ${f}`);
  ok(!R.canMate(P("8/8/8/4k3/8/8/8/4KN2 w - - 0 1"), R.BLACK), "a lone king cannot mate");
  ok(R.canMate(P("8/8/8/4k3/8/8/8/3NKN2 w - - 0 1"), R.WHITE));
}

// ---------------------------------------------------------------- engine: game flow

function game(opts = {}, ids = ["w", "b"]) {
  let s = CH.create({ whiteSeat: 0, ...opts });
  ids.forEach((id, i) => {
    s = CH.join(s, { id, name: id.toUpperCase() }).state;
    s = CH.seat(s, id, i).state;
  });
  const r = CH.start(s, ids[0], { rng: seeded(1), now: 0 });
  assert.ifError(r.error);
  return r.state;
}
const mv = (s, id, a, now = 0) => {
  const r = CH.apply(s, id, a, { now, rng: seeded(2) });
  if (r.error) throw new Error(`${id} ${JSON.stringify(a)}: ${r.error}`);
  return r;
};

{
  let s = game();
  eq(s.phase, "playing");
  eq(CH.publicView(s).turn, "white");
  eq(CH.apply(s, "b", { type: "move", uci: "e7e5" }).error, "not_your_turn");
  eq(CH.apply(s, "w", { type: "move", uci: "e2e5" }).error, "illegal_move");
  eq(CH.apply(s, "w", { type: "move", from: "e2", to: "e4", promotion: "k" }).error, "bad_promotion");
  eq(CH.apply(s, "x", { type: "move", uci: "e2e4" }).error, "not_seated");
  s = mv(s, "w", { type: "move", from: "e2", to: "e4" }).state;
  s = mv(s, "b", { type: "move", san: "e5" }).state;
  s = mv(s, "w", { type: "move", uci: "g1f3" }).state;
  eq(CH.publicView(s).moves, ["e4", "e5", "Nf3"]);
  eq(CH.publicView(s).lastMove, { uci: "g1f3", san: "Nf3" });
  const v = CH.viewFor(s, "b");
  eq(v.you.color, "black");
  ok(v.you.legal.some((m) => m.san === "Nc6" && m.from === "b8" && m.to === "c6"));
  eq(CH.viewFor(s, "w").you.legal, [], "not white's turn");
  eq(CH.publicView(s).board.length, 64);
  eq(CH.publicView(s).board[4], "k", "e8 holds the black king (a8 first)");
  eq(CH.viewFor(s, "nobody").you, null);
  // Promotion needs a choice.
  let pr = game({ startFen: "8/4P3/8/8/8/8/k7/4K3 w - - 0 1" });
  eq(CH.apply(pr, "w", { type: "move", from: "e7", to: "e8" }).error, "illegal_move", "promotion without a piece");
  pr = mv(pr, "w", { type: "move", from: "e7", to: "e8", promotion: "n" }).state;
  eq(CH.publicView(pr).board[4], "N", "underpromotion to a knight");
  // Fool's mate ends the game.
  let f = game();
  for (const [id, san] of [["w", "f3"], ["b", "e5"], ["w", "g4"]]) f = mv(f, id, { type: "move", san }).state;
  const r = mv(f, "b", { type: "move", san: "Qh4" });
  eq(r.state.phase, "over");
  eq(r.state.result, { winner: 1, reason: "checkmate", score: "0-1", aborted: false });
  eq(r.state.tally, [0, 1]);
  eq(CH.apply(r.state, "w", { type: "move", san: "a3" }).error, "not_playing");
  ok(r.events.some((e) => e.type === "gameOver"));
  ok(CH.toPgn(r.state).includes("1. f3 e5 2. g4 Qh4# 0-1"), "PGN movetext");
  ok(CH.toPgn(r.state).includes('[Result "0-1"]'));
}

{
  // Threefold repetition: the start position appears for the third time.
  let s = game();
  const shuffle = [["w", "Nf3"], ["b", "Nf6"], ["w", "Ng1"], ["b", "Ng8"]];
  for (let k = 0; k < 2; k++) for (const [id, san] of shuffle) s = mv(s, id, { type: "move", san }).state;
  eq(s.result && s.result.reason, "threefold_repetition");
  eq(s.tally, [0.5, 0.5]);
  // Fifty-move rule (automatic at 100 half-moves) unless the move mates.
  let f = game({ startFen: "4k3/8/8/8/8/8/8/R3K3 w - - 99 80" });
  f = mv(f, "w", { type: "move", san: "Ra2" }).state;
  eq(f.result.reason, "fifty_move_rule");
  let fm = game({ startFen: "7k/8/6K1/8/8/8/8/R7 w - - 99 80" });
  fm = mv(fm, "w", { type: "move", san: "Ra8" }).state;
  eq(fm.result.reason, "checkmate", "mate on the 100th half-move counts");
  // Capturing into a dead position.
  let d = game({ startFen: "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1" });
  d = mv(d, "w", { type: "move", san: "Kxe2" }).state;
  eq(d.result.reason, "insufficient_material");
  // Stalemate.
  let st = game({ startFen: "7k/4Q3/6K1/8/8/8/8/8 w - - 0 1" });
  st = mv(st, "w", { type: "move", san: "Qf7" }).state;
  eq(st.result.reason, "stalemate");
}

{
  // Resign, draw offers, rematch.
  let s = game();
  s = mv(s, "w", { type: "offerDraw" }).state;
  eq(CH.apply(s, "w", { type: "offerDraw" }).error, "already_offered");
  eq(CH.apply(s, "w", { type: "acceptDraw" }).error, "no_offer", "cannot accept your own offer");
  eq(s.drawOffer, 0);
  s = mv(s, "b", { type: "declineDraw" }).state;
  eq(s.drawOffer, null);
  s = mv(s, "w", { type: "move", san: "e4" }).state;
  s = mv(s, "w", { type: "offerDraw" }).state;
  s = mv(s, "b", { type: "move", san: "e5" }).state;
  eq(s.drawOffer, null, "moving declines the offer");
  s = mv(s, "w", { type: "offerDraw" }).state;
  eq(CH.apply(s, "w", { type: "offerDraw" }).error, "already_offered");
  s = mv(s, "b", { type: "declineDraw" }).state;
  eq(CH.apply(s, "w", { type: "offerDraw" }).error, "too_many_offers", "three offers per game");
  s = mv(s, "b", { type: "offerDraw" }).state;
  const agreed = mv(s, "w", { type: "acceptDraw" }).state;
  eq(agreed.result.reason, "agreement");
  // Both offering at once is an agreement too.
  let both = game();
  both = mv(both, "b", { type: "offerDraw" }).state;
  eq(mv(both, "w", { type: "offerDraw" }).state.result.reason, "agreement");
  // Resign.
  const res = mv(game(), "b", { type: "resign" }).state;
  eq(res.result, { winner: 0, reason: "resign", score: "1-0", aborted: false });
  // Rematch: both ask, colours swap, tally carries on.
  eq(CH.apply(game(), "w", { type: "rematch" }).error, "not_over");
  let rm = mv(res, "w", { type: "rematch" }).state;
  eq(rm.phase, "over");
  rm = mv(rm, "b", { type: "rematch" }).state;
  eq(rm.phase, "playing");
  eq(rm.whiteSeat, 1, "colours swap");
  eq(rm.tally, [1, 0]);
  eq(CH.viewFor(rm, "b").you.color, "white");
  // Against a bot the rematch starts at once.
  const vb = CH.apply(mv(game({}, ["w"]), "w", { type: "resign" }).state, "w", { type: "rematch" }, { rng: seeded(3), now: 0 }).state;
  eq(vb.phase, "playing");
  // Leaving resigns.
  eq(CH.leave(game(), "w").state.result.reason, "left");
  // Random colours are seeded.
  let rc = CH.create({});
  rc = CH.join(rc, { id: "a" }).state;
  rc = CH.seat(rc, "a", 0).state;
  const cA = CH.start(rc, "a", { rng: seeded("c1") }).state.whiteSeat;
  const cB = CH.start(rc, "a", { rng: seeded("c1") }).state.whiteSeat;
  eq(cA, cB);
}

// ---------------------------------------------------------------- clocks

{
  eq(CH.parseTimeControl("5+0"), { initialMs: 300000, incrementMs: 0 });
  eq(CH.parseTimeControl("10+5"), { initialMs: 600000, incrementMs: 5000 });
  eq(CH.parseTimeControl("0+5"), undefined);
  eq(CH.parseTimeControl("abc"), undefined);
  eq(CH.create({ timeControl: "nope" }).options.timeControl, null);
  let s = game({ timeControl: "10+5" });
  eq(CH.timers(s)[0], { key: "first:0", kind: "system", playerId: C.SYSTEM, ms: 30000, action: { type: "abort" } }, "first move window");
  s = mv(s, "w", { type: "move", san: "e4" }, 20000).state;
  eq(s.clock.ms, [600000, 600000], "first moves are not on the clock");
  s = mv(s, "b", { type: "move", san: "e5" }, 25000).state;
  eq(s.clock.ms, [600000, 600000]);
  ok(CH.timers(s).some((t) => t.key === "flag:2" && t.ms === 600000), "white's flag timer");
  s = mv(s, "w", { type: "move", san: "Nf3" }, 25000 + 7000).state;
  eq(s.clock.ms[R.WHITE], 600000 - 7000 + 5000, "time used, increment added");
  // A move after the flag fell loses on time.
  const late = mv(s, "b", { type: "move", san: "Nc6" }, 32000 + 600001);
  eq(late.state.result.reason, "timeout");
  eq(late.state.result.winner, 0);
  eq(late.state.clock.ms[R.BLACK], 0);
  // The server flag timer, checked against the real elapsed time.
  eq(CH.apply(s, C.SYSTEM, { type: "flag" }, { now: 32000 + 1000 }).error, "time_left");
  eq(CH.apply(s, C.SYSTEM, { type: "flag" }, { now: 32000 + 600000 }).state.result.reason, "timeout");
  // Timeout against a lone king is a draw.
  let lone = game({ timeControl: "5+0", startFen: "4k3/8/8/8/8/8/2QQ4/4K3 w - - 0 1" });
  lone = mv(lone, "w", { type: "move", san: "Qa4" }, 0).state;
  lone = mv(lone, "b", { type: "move", san: "Kf7" }, 0).state;
  const drawn = CH.apply(lone, C.SYSTEM, { type: "flag" }, { now: 300000 }).state;
  eq(drawn.result.reason, "timeout_vs_insufficient_material", "black cannot mate: white's flag fall is a draw");
  // Abort when the first move never comes.
  const ab = CH.apply(game({ timeControl: "5+0" }), C.SYSTEM, { type: "abort" }, { now: 30000 }).state;
  eq(ab.result, { winner: null, reason: "aborted", score: "*", aborted: true });
  eq(ab.tally, [0, 0], "aborted games do not count");
  let after2 = game();
  after2 = mv(after2, "w", { type: "move", san: "e4" }).state;
  after2 = mv(after2, "b", { type: "move", san: "e5" }).state;
  eq(CH.apply(after2, C.SYSTEM, { type: "abort" }).error, "cannot_abort");
  // Untimed games hand an idle human's move to the bot after idleMs.
  eq(CH.timers(after2)[0].kind, "bot");
  eq(CH.timers(after2)[0].ms, after2.options.idleMs);
  // View clock.
  const vc = CH.publicView(s).clock;
  eq([vc.running, typeof vc.since], ["black", "number"]);
}

// ---------------------------------------------------------------- bots through the engine

{
  let s = game({ botLevel: "easy" }, ["w"]);
  eq(s.seats[1].kind, "bot");
  s = mv(s, "w", { type: "move", san: "e4" }).state;
  const t = CH.timers(s).find((x) => x.kind === "bot");
  ok(t && t.ms >= 250 && t.ms <= 700);
  const a = CH.botAction(s, t.playerId, { syncBot: true, rng: seeded(4), botBudget: { maxNodes: 2000 } });
  ok(a && a.type === "move" && typeof a.uci === "string");
  assert.ifError(CH.apply(s, t.playerId, a).error);
  // Draw offer to a bot: declined in an equal position, accepted when lost.
  let d = mv(s, "w", { type: "offerDraw" }).state;
  const resp = CH.botAction(d, "bot:1", { syncBot: true, rng: seeded(5), botBudget: { maxNodes: 2000 } });
  ok(resp.type === "move" || resp.type === "declineDraw", "bot to move declines by moving");
  let lost = game({ startFen: "4k3/8/8/8/8/8/3QQ3/4K3 b - - 0 1" }, ["w"]);
  lost.whiteSeat = 0;
  lost = mv(lost, "w", { type: "offerDraw" }).state;
  // Black (the bot) is to move and is lost: it takes the draw.
  eq(CH.botAction(lost, "bot:1", { syncBot: true, rng: seeded(6) }).type, "acceptDraw");
}

// ---------------------------------------------------------------- random games (rules + engine)

const t0 = Date.now();
const reasons = {};
let plies = 0;
{
  const rng = seeded("chess-random");
  // Rules level: fast random playouts with SAN and FEN round trips.
  for (let g = 0; g < 120; g++) {
    const pos = P(R.START_FEN);
    const counts = new Map();
    let reason = null;
    counts.set(R.repetitionKey(pos), 1);
    for (let k = 0; k < 1200 && !reason; k++) {
      const legal = pos.legalMoves();
      const m = legal[rng.int(legal.length)];
      if (k % 9 === 0) {
        const san = R.sanOf(pos, m, legal);
        eq(R.moveFromSan(pos, san), m, `SAN round trip ${san}`);
        eq(P(pos.toFen()).toFen(), pos.toFen());
      }
      pos.make(m);
      plies++;
      const key = R.repetitionKey(pos);
      counts.set(key, (counts.get(key) || 0) + 1);
      const st = CH.gameStatus(pos, counts.get(key));
      if (st) reason = st.reason;
    }
    reasons[reason || "cap"] = (reasons[reason || "cap"] || 0) + 1;
  }
  // Engine level: random games through apply() with random draw offers and resignations.
  for (let g = 0; g < 25; g++) {
    let s = game({}, ["w", "b"]);
    for (let k = 0; s.phase === "playing" && k < 1500; k++) {
      const pos = P(s.fen);
      const id = (pos.side === R.WHITE) === (s.whiteSeat === 0) ? "w" : "b";
      const legal = CH.viewFor(s, id).you.legal;
      const roll = rng.float();
      let a;
      if (roll < 0.002) a = { type: "resign" };
      else if (roll < 0.004 && s.drawOffer === null) a = { type: "offerDraw" };
      else if (s.drawOffer !== null && s.drawOffer !== (id === "w" ? 0 : 1) && roll < 0.3) a = { type: "acceptDraw" };
      else {
        const pick = legal[rng.int(legal.length)];
        a = rng.float() < 0.5 ? { type: "move", san: pick.san } : { type: "move", from: pick.from, to: pick.to, promotion: pick.promotion };
      }
      const r = CH.apply(s, id, a, { now: 0, rng });
      if (r.error && a.type === "offerDraw") continue;
      if (r.error) throw new Error(`random engine game: ${r.error} ${JSON.stringify(a)}`);
      s = r.state;
    }
    eq(s.phase, "over");
    reasons[`engine:${s.result.reason}`] = (reasons[`engine:${s.result.reason}`] || 0) + 1;
  }
}
const randMs = Date.now() - t0;
ok(Object.keys(reasons).length >= 4, "random games reach several kinds of endings");

console.log(`chess.selftest: ok (${checks} checks; ${plies} random plies + 25 engine games in ${randMs} ms ${JSON.stringify(reasons)})`);
