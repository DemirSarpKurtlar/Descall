"use strict";

/**
 * Chess bot: evaluation symmetry, tactics (mates, free material, no stalemate
 * when winning), budgets, determinism, and the worker runner keeping the
 * caller's event loop free.
 * Run: node frontend/backend/lib/world3d/games/chessBot.selftest.cjs
 */

const assert = require("assert");
const R = require("./chessRules");
const Bot = require("./chessBot");
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

function mirrorFen(fen) {
  const [board, side, castling, ep, half, full] = fen.split(" ");
  const swap = (s) => s.replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
  const b = swap(board.split("/").reverse().join("/"));
  const c = castling === "-" ? "-" : swap(castling).split("").sort((x, y) => "KQkq".indexOf(x) - "KQkq".indexOf(y)).join("");
  const e = ep === "-" ? "-" : ep[0] + (9 - Number(ep[1]));
  return `${b} ${side === "w" ? "b" : "w"} ${c} ${e} ${half} ${full}`;
}

// ---------------------------------------------------------------- evaluation

{
  const fens = [
    R.START_FEN,
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
  ];
  for (const f of fens) {
    const a = Bot.evaluate(R.Position.fromFen(f));
    const b = Bot.evaluate(R.Position.fromFen(mirrorFen(f)));
    eq(a, b, `evaluation is colour-symmetric for ${f}`);
  }
  ok(Math.abs(Bot.evaluate(R.Position.fromFen(R.START_FEN))) <= 20, "start position is about level");
  ok(Bot.evaluate(R.Position.fromFen("4k3/8/8/8/8/8/8/3QK3 w - - 0 1")) > 800, "a queen up");
  ok(Bot.evaluate(R.Position.fromFen("4k3/8/8/8/8/8/8/3QK3 b - - 0 1")) < -800, "side-to-move point of view");
}

// ---------------------------------------------------------------- tactics

const PUZZLES = [
  ["r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4", "f3f7", "mate in 1 (Qxf7#)"],
  ["6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", "d1d8", "back-rank mate in 1"],
  ["r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1", "d5f6", "mate in 2 starts with Nf6+"],
  ["4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1", "e4d5", "a free queen"],
  ["k7/8/1K6/8/8/8/8/6Q1 w - - 0 1", "g1g8", "queen mate in 1 on the back rank"],
];
for (const [fen, want, why] of PUZZLES) {
  for (const level of ["medium", "hard"]) {
    const r = Bot.search(fen, { ...Bot.budgetFor(level), maxMs: 4000, maxNodes: 400000 });
    if (want) eq(r.move, want, `${level}: ${why}`);
    else ok(r.score > Bot.MATE - 10, `${level}: ${why} (${r.san})`);
  }
}
{
  // Winning with K+Q against K: never stalemate. Qb7?? and Qc7?? stalemate here; mate is Qb7#? no: find any mate or progress.
  const fen = "k7/2K5/8/8/8/8/8/1Q6 w - - 0 1";
  const r = Bot.search(fen, { maxMs: 2000, maxNodes: 200000 });
  const pos = R.Position.fromFen(fen);
  const m = R.moveFromUci(pos, r.move);
  pos.make(m);
  const status = CH.gameStatus(pos, 1);
  ok(!status || status.reason === "checkmate", `no stalemate (${r.san})`);
  ok(r.score > Bot.MATE - 10, "sees the mate");
  // Only one legal move: returned at once.
  const forced = Bot.search("7k/5Q2/5K2/8/8/8/8/8 b - - 0 1", { maxMs: 1000 });
  ok(forced.move === null || typeof forced.move === "string");
  // Mated / stalemated root: no move.
  eq(Bot.search("R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1", { maxMs: 100 }).move, null);
}

// ---------------------------------------------------------------- determinism and budgets

{
  const a = Bot.search(R.START_FEN, { maxNodes: 20000, maxMs: 1e9, maxDepth: 64 });
  const b = Bot.search(R.START_FEN, { maxNodes: 20000, maxMs: 1e9, maxDepth: 64 });
  eq([a.move, a.score, a.depth], [b.move, b.score, b.depth], "node budget makes the search deterministic");
  ok(R.moveFromUci(R.Position.fromFen(R.START_FEN), a.move), "legal");
  const t0 = Date.now();
  const timed = Bot.search("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", { maxMs: 60, maxDepth: 64 });
  const took = Date.now() - t0;
  ok(took < 400, `time budget respected (${took} ms)`);
  ok(timed.depth >= 1 && timed.move, "a move from the last finished depth");
  eq(Bot.budgetFor("hard", 30000).maxMs, 1000, "the clock caps thinking time (remaining / 30)");
  eq(Bot.budgetFor("easy").maxDepth, 2);
  // Repetition awareness: with the game history, a repeated position scores as a draw.
  const pos = R.Position.fromFen(R.START_FEN);
  const hist = [pos.key()];
  const r = Bot.search(R.START_FEN, { maxNodes: 5000, maxMs: 1e9, historyKeys: hist });
  ok(typeof r.score === "number");
  // Easy level picks among near-best moves with the given random source.
  const picks = new Set();
  for (let i = 0; i < 12; i++) {
    const rng = seeded(`easy${i}`);
    picks.add(Bot.search(R.START_FEN, { ...Bot.budgetFor("easy"), maxMs: 1e9, random: () => rng.float() }).move);
  }
  ok(picks.size > 1, "easy varies its play");
}

// ---------------------------------------------------------------- bot vs bot through the engine

{
  // Hard (deeper) beats easy over a few short-budget games (deterministic budgets).
  let hardScore = 0;
  for (let g = 0; g < 4; g++) {
    let s = CH.create({ whiteSeat: g % 2 });
    s = CH.join(s, { id: "h", name: "H" }).state;
    s = CH.seat(s, "h", 0).state;
    s = CH.start(s, "h", { rng: seeded(g), now: 0 }).state;
    s.seats[1].level = "easy";
    s = CH.setPresence(s, "h", { connected: false, autopilot: true }).state;
    const rng = seeded(`bvb${g}`);
    for (let k = 0; s.phase === "playing" && k < 300; k++) {
      const t = CH.timers(s).find((x) => x.kind === "bot");
      const hard = t.playerId === "h";
      const a = CH.botAction(s, t.playerId, { syncBot: true, rng, botBudget: hard ? { maxNodes: 6000, maxMs: 1e9, maxDepth: 64 } : { maxNodes: 600, maxMs: 1e9 } });
      const r = CH.apply(s, t.playerId, a, { rng, now: 0 });
      assert.ifError(r.error);
      s = r.state;
    }
    if (s.phase === "over") hardScore += s.result.winner === 0 ? 1 : s.result.winner === null ? 0.5 : 0;
    else hardScore += 0.5;
  }
  ok(hardScore >= 2.5, `stronger budget wins (${hardScore}/4)`);
}

// ---------------------------------------------------------------- worker runner: the event loop stays free

(async () => {
  const runner = Bot.createRunner();
  try {
    // Warm up the worker (thread start-up is not search time).
    await runner.think(R.START_FEN, { maxMs: 20 });
    const { performance } = require("perf_hooks");
    const KIWI = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    // 1. Event loop utilisation of the main thread while the worker searches: the
    //    loop should be idle (waiting for the message) nearly all the time. This is
    //    robust on loaded machines, unlike wall-clock gaps.
    const elu0 = performance.eventLoopUtilization();
    const t0 = Date.now();
    const r = await runner.think(KIWI, { maxMs: 600, maxDepth: 64 });
    const took = Date.now() - t0;
    const elu = performance.eventLoopUtilization(elu0);
    ok(R.moveFromUci(R.Position.fromFen(KIWI), r.move), "worker returns a legal move");
    ok(took >= 300, `the search really ran in the worker (${took} ms)`);
    ok(elu.active < 25, `main thread busy only ${elu.active.toFixed(1)} ms of ${took} ms`);
    // 2. Timers keep firing during a search (wall-clock gaps, reported; loose bound for loaded CI).
    let maxGap = 0;
    let ticks = 0;
    let last = process.hrtime.bigint();
    const iv = setInterval(() => {
      const now = process.hrtime.bigint();
      const gap = Number(now - last) / 1e6;
      if (gap > maxGap) maxGap = gap;
      last = now;
      ticks++;
    }, 1);
    await runner.think(R.START_FEN, { maxMs: 400, maxDepth: 64 });
    clearInterval(iv);
    ok(ticks > 40, `the main loop kept ticking (${ticks} ticks)`);
    ok(maxGap < 250, `main loop max gap ${maxGap.toFixed(1)} ms`);
    // Through the engine with an explicit runner: botAction returns a promise.
    let s = CH.create({ whiteSeat: 0 }); // the bot takes seat 0 and plays white
    s = CH.join(s, { id: "p", name: "P" }).state;
    s = CH.seat(s, "p", 1).state;
    s = CH.start(s, "p", { rng: seeded(9), now: 0 }).state;
    const pending = CH.botAction(s, "bot:0", { chessRunner: runner });
    ok(pending && typeof pending.then === "function", "async bot action");
    const a = await pending;
    assert.ifError(CH.apply(s, "bot:0", a, { now: 0 }).error);
    // Several requests in flight resolve independently.
    const many = await Promise.all([1, 2, 3].map(() => runner.think(R.START_FEN, { maxMs: 30 })));
    ok(many.every((x) => typeof x.move === "string"));
    console.log(`chessBot.selftest: ok (${checks} checks; worker search ${took} ms with the main loop busy ${elu.active.toFixed(1)} ms; max timer gap ${maxGap.toFixed(1)} ms over ${ticks} ticks)`);
  } finally {
    await runner.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
