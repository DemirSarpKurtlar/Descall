"use strict";

/**
 * Chess move generation: perft on the standard test positions, make/unmake
 * and incremental hashing consistency.
 * Run: node frontend/backend/lib/world3d/games/chessPerft.selftest.cjs
 */

const assert = require("assert");
const R = require("./chessRules");
const { seeded } = require("./testkit.cjs");

// Standard perft positions (chessprogramming.org "Perft Results").
const CASES = [
  ["start", R.START_FEN, [20, 400, 8902, 197281]],
  ["kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039, 97862, 4085603]],
  ["position 3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238, 674624]],
  ["position 4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467]],
  ["position 4 mirrored", "r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1", [6, 264, 9467]],
  ["position 5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379]],
  ["position 6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", [46, 2079, 89890]],
];

let nodes = 0;
const t0 = Date.now();
for (const [name, fen, counts] of CASES) {
  const pos = R.Position.fromFen(fen);
  counts.forEach((want, i) => {
    const got = R.perft(pos, i + 1);
    nodes += got;
    assert.strictEqual(got, want, `perft ${name} depth ${i + 1}`);
  });
  assert.strictEqual(pos.toFen(), fen, `${name}: make/unmake restores the position`);
}
const perftMs = Date.now() - t0;

// Incremental Zobrist hash and make/unmake on random playouts.
const rng = seeded("perft-hash");
let plies = 0;
for (let g = 0; g < 60; g++) {
  const pos = R.Position.fromFen(g % 2 ? CASES[1][1] : R.START_FEN);
  const fens = [];
  for (let k = 0; k < 120; k++) {
    const legal = pos.legalMoves();
    if (!legal.length) break;
    fens.push(pos.toFen());
    const m = legal[rng.int(legal.length)];
    assert.ok(pos.make(m), "legal move makes");
    const lo = pos.hashLo;
    const hi = pos.hashHi;
    pos.rehash();
    assert.strictEqual(pos.hashLo, lo, "incremental hash (lo)");
    assert.strictEqual(pos.hashHi, hi, "incremental hash (hi)");
    plies++;
  }
  for (let k = fens.length - 1; k >= 0; k--) {
    pos.unmake();
    assert.strictEqual(pos.toFen(), fens[k], "unmake walks back exactly");
  }
}

console.log(`chessPerft.selftest: ok (${nodes} perft leaves in ${perftMs} ms, ${plies} hashed plies)`);
