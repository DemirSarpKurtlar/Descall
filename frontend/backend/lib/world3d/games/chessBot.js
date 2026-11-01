"use strict";

/**
 * Chess bot: iterative deepening alpha-beta (negamax) with a transposition
 * table, quiescence search, null-move pruning, check extension, MVV-LVA,
 * killer and history move ordering. Evaluation: material + piece-square tables
 * (computed from simple geometric rules, tapered between middlegame and
 * endgame) + bishop pair, pawn structure (doubled, isolated, passed) and rooks
 * on open files.
 *
 * `search()` is synchronous and bounded by maxMs / maxNodes / maxDepth. On the
 * server it runs inside a worker thread (createRunner) so the socket server's
 * event loop never waits on it; tests call it directly with a node budget for
 * deterministic results.
 */

const path = require("path");
const R = require("./chessRules");

const VALUE = [0, 100, 320, 330, 500, 900, 0];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];
const INF = 1000000;
const MATE = 100000;

// ---------------------------------------------------------------- piece-square tables

function buildPst() {
  // pst[phase][type][sq64] from white's point of view (rank 0 = own back rank).
  const mg = [];
  const eg = [];
  for (let t = 0; t <= 6; t++) {
    mg.push(new Int16Array(64));
    eg.push(new Int16Array(64));
  }
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const i = r * 8 + f;
      const md = Math.abs(f - 3.5) + Math.abs(r - 3.5); // 1..7
      const centerFile = f === 3 || f === 4;
      // Pawns: advance, centre files early.
      const adv = [0, 0, 4, 10, 20, 34, 55, 0][r];
      mg[1][i] = adv + (centerFile && (r === 3 || r === 4) ? 18 : 0) + (centerFile && r === 1 ? -8 : 0) + (f === 0 || f === 7 ? -4 : 0);
      eg[1][i] = [0, 0, 8, 18, 32, 52, 85, 0][r];
      // Knights: centralisation, rim is dim.
      mg[2][i] = Math.round(26 - 8 * md) + (r === 0 ? -8 : 0);
      eg[2][i] = Math.round(18 - 7 * md);
      // Bishops: centre and long diagonals, leave the back rank.
      const diag = f === r || f === 7 - r ? 8 : 0;
      mg[3][i] = Math.round(12 - 3 * md) + diag + (r === 0 ? -10 : 0);
      eg[3][i] = Math.round(10 - 3 * md);
      // Rooks: seventh rank, central files a little.
      mg[4][i] = (r === 6 ? 18 : 0) + (f >= 2 && f <= 5 ? 4 : 0) + (r === 0 && (f === 3 || f === 4) ? 4 : 0);
      eg[4][i] = r === 6 ? 12 : 0;
      // Queen: mild centralisation.
      mg[5][i] = Math.round(6 - 2 * md);
      eg[5][i] = Math.round(12 - 4 * md);
      // King: shelter in the corner early, centre late.
      let k = 0;
      if (r === 0) k = f === 6 || f === 1 ? 24 : f === 2 || f === 7 || f === 0 ? 12 : f === 5 ? 4 : -6;
      else if (r === 1) k = f <= 2 || f >= 5 ? 0 : -18;
      else k = -24 - 10 * (r - 2);
      mg[6][i] = k;
      eg[6][i] = Math.round(24 - 9 * md);
    }
  }
  return { mg, eg };
}

const PST = buildPst();
const PASSED = [0, 6, 12, 22, 38, 62, 100, 0];

function sq64(sq, color) {
  const r = sq >> 4;
  const f = sq & 7;
  return (color === R.WHITE ? r : 7 - r) * 8 + f;
}

/** Static evaluation from the side to move's point of view. */
function evaluate(pos) {
  const b = pos.b;
  let mg = [0, 0];
  let eg = [0, 0];
  let phase = 0;
  const bishops = [0, 0];
  const pawnFiles = [new Int8Array(8), new Int8Array(8)];
  const pawnMinRank = [new Int8Array(8).fill(8), new Int8Array(8).fill(8)]; // least advanced (relative)
  const pawnMaxRank = [new Int8Array(8).fill(-1), new Int8Array(8).fill(-1)]; // most advanced (relative)
  const rooks = [[], []];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = b[sq];
    if (!p) continue;
    const c = p >> 3;
    const t = p & 7;
    const i = sq64(sq, c);
    mg[c] += VALUE[t] + PST.mg[t][i];
    eg[c] += VALUE[t] + PST.eg[t][i];
    phase += PHASE_W[t];
    if (t === R.BISHOP) bishops[c]++;
    else if (t === R.ROOK) rooks[c].push(sq & 7);
    else if (t === R.PAWN) {
      const f = sq & 7;
      const rel = c === R.WHITE ? sq >> 4 : 7 - (sq >> 4);
      pawnFiles[c][f]++;
      if (rel < pawnMinRank[c][f]) pawnMinRank[c][f] = rel;
      if (rel > pawnMaxRank[c][f]) pawnMaxRank[c][f] = rel;
    }
  }
  for (let c = 0; c < 2; c++) {
    const o = c ^ 1;
    if (bishops[c] >= 2) {
      mg[c] += 28;
      eg[c] += 40;
    }
    for (let f = 0; f < 8; f++) {
      const n = pawnFiles[c][f];
      if (!n) continue;
      if (n > 1) {
        mg[c] -= 10 * (n - 1);
        eg[c] -= 18 * (n - 1);
      }
      const left = f > 0 ? pawnFiles[c][f - 1] : 0;
      const right = f < 7 ? pawnFiles[c][f + 1] : 0;
      if (!left && !right) {
        mg[c] -= 10;
        eg[c] -= 14;
      }
      // Passed: no enemy pawn ahead on this or adjacent files.
      const rel = pawnMaxRank[c][f];
      let passed = true;
      for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1) && passed; ff++) {
        if (!pawnFiles[o][ff]) continue;
        // enemy pawn's rank from our side: 7 - its relative rank
        const enemyMostBack = 7 - pawnMinRank[o][ff];
        const enemyFurthest = 7 - pawnMaxRank[o][ff];
        if (enemyMostBack > rel || enemyFurthest > rel) passed = false;
      }
      if (passed) {
        mg[c] += PASSED[rel] >> 1;
        eg[c] += PASSED[rel];
      }
    }
    for (const f of rooks[c]) {
      if (!pawnFiles[c][f]) {
        const bonus = pawnFiles[o][f] ? 8 : 16;
        mg[c] += bonus;
        eg[c] += bonus >> 1;
      }
    }
  }
  if (phase > 24) phase = 24;
  const white = ((mg[0] - mg[1]) * phase + (eg[0] - eg[1]) * (24 - phase)) / 24;
  const score = Math.round(white) + (pos.side === R.WHITE ? 10 : -10); // tempo
  return pos.side === R.WHITE ? score : -score;
}

// ---------------------------------------------------------------- search

class Stop extends Error {}

function search(input, opts = {}) {
  const pos = typeof input === "string" ? R.Position.fromFen(input) : input.clone();
  const now = opts.now || (() => Date.now());
  const started = now();
  const maxMs = opts.maxMs == null ? 1000 : opts.maxMs;
  const deadline = started + maxMs;
  const maxNodes = opts.maxNodes || Infinity;
  const maxDepth = Math.min(opts.maxDepth || 64, 64);
  const history = new Set(opts.historyKeys || []); // positions already seen in the game
  const tt = new Map();
  const killers = Array.from({ length: 128 }, () => [0, 0]);
  const hist = new Int32Array(16 * 128);
  const path = [];
  let nodes = 0;
  let stopped = false;

  const checkTime = () => {
    if ((nodes & 1023) === 0 && (now() > deadline || nodes > maxNodes)) {
      stopped = true;
      throw new Stop();
    }
    if (nodes > maxNodes) {
      stopped = true;
      throw new Stop();
    }
  };

  const scoreMove = (m, ttMove, ply) => {
    if (m === ttMove) return 10000000;
    const flags = R.mFlags(m);
    if (flags & R.F_CAPTURE) {
      const victim = flags & R.F_EP ? R.PAWN : pos.b[R.mTo(m)] & 7;
      const attacker = pos.b[R.mFrom(m)] & 7;
      return 1000000 + VALUE[victim] * 10 - VALUE[attacker] / 10;
    }
    if (R.mPromo(m) === R.QUEEN) return 900000;
    if (killers[ply][0] === m) return 800000;
    if (killers[ply][1] === m) return 700000;
    return hist[pos.b[R.mFrom(m)] * 128 + R.mTo(m)];
  };

  const order = (moves, ttMove, ply) => {
    const scored = moves.map((m) => [scoreMove(m, ttMove, ply), m]);
    scored.sort((a, b) => b[0] - a[0]);
    return scored.map((x) => x[1]);
  };

  const hasNonPawn = (color) => {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = pos.b[sq];
      if (p && p >> 3 === color) {
        const t = p & 7;
        if (t !== R.PAWN && t !== R.KING) return true;
      }
    }
    return false;
  };

  function quiesce(alpha, beta, ply) {
    nodes++;
    checkTime();
    const stand = evaluate(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = order(pos.pseudo([], true), 0, Math.min(ply, 127));
    for (const m of moves) {
      // Delta pruning: a capture that cannot lift alpha even with a margin.
      const flags = R.mFlags(m);
      const victim = flags & R.F_EP ? R.PAWN : pos.b[R.mTo(m)] & 7;
      if (!R.mPromo(m) && stand + VALUE[victim] + 200 < alpha) continue;
      if (!pos.make(m)) continue;
      const s = -quiesce(-beta, -alpha, ply + 1);
      pos.unmake();
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply, allowNull) {
    nodes++;
    checkTime();
    const key = pos.key();
    if (ply > 0) {
      if (pos.half >= 100) return 0;
      if (history.has(key) || path.includes(key)) return 0;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return quiesce(alpha, beta, ply);
    const alpha0 = alpha;
    const entry = tt.get(key);
    let ttMove = 0;
    if (entry) {
      ttMove = entry.m;
      if (entry.d >= depth && ply > 0) {
        if (entry.f === 0) return entry.s;
        if (entry.f === 1 && entry.s >= beta) return entry.s;
        if (entry.f === 2 && entry.s <= alpha) return entry.s;
      }
    }
    // Null move: give the opponent a free move; if we still beat beta, prune.
    if (allowNull && !inCheck && depth >= 3 && ply > 0 && hasNonPawn(pos.side) && evaluate(pos) >= beta) {
      pos.makeNull();
      path.push(key);
      let s;
      try {
        s = -negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      } finally {
        path.pop();
        pos.unmakeNull();
      }
      if (s >= beta && Math.abs(s) < MATE - 1000) return s;
    }
    const moves = order(pos.pseudo([]), ttMove, Math.min(ply, 127));
    let best = -INF;
    let bestMove = 0;
    let legal = 0;
    path.push(key);
    try {
      for (const m of moves) {
        if (!pos.make(m)) continue;
        legal++;
        let s;
        try {
          s = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
        } finally {
          pos.unmake();
        }
        if (s > best) {
          best = s;
          bestMove = m;
        }
        if (s > alpha) alpha = s;
        if (alpha >= beta) {
          if (!(R.mFlags(m) & R.F_CAPTURE)) {
            const k = killers[Math.min(ply, 127)];
            if (k[0] !== m) {
              k[1] = k[0];
              k[0] = m;
            }
            hist[pos.b[R.mFrom(m)] * 128 + R.mTo(m)] += depth * depth;
          }
          break;
        }
      }
    } finally {
      path.pop();
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;
    if (tt.size > 400000) tt.clear();
    tt.set(key, { d: depth, s: best, f: best <= alpha0 ? 2 : best >= beta ? 1 : 0, m: bestMove });
    return best;
  }

  const rootLegal = pos.legalMoves();
  if (rootLegal.length === 0) return { move: null, san: null, score: pos.inCheck() ? -MATE : 0, depth: 0, nodes: 0, ms: 0 };
  let bestMove = rootLegal[0];
  let bestScore = 0;
  let completed = 0;
  let rootOrder = order(rootLegal, 0, 0);
  path.push(pos.key()); // the root position counts for repetitions below it
  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -INF;
    let iterBest = 0;
    let iterScore = -INF;
    const scores = new Map();
    try {
      for (const m of rootOrder) {
        pos.make(m);
        let s;
        try {
          s = -negamax(depth - 1, -INF, -alpha, 1, true);
        } finally {
          pos.unmake();
        }
        scores.set(m, s);
        if (s > iterScore) {
          iterScore = s;
          iterBest = m;
        }
        if (s > alpha) alpha = s;
      }
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      // Keep a partial iteration's move only when it already beat the previous best.
      if (iterBest && iterScore > bestScore && completed > 0) bestMove = iterBest;
      break;
    }
    bestMove = iterBest;
    bestScore = iterScore;
    completed = depth;
    rootOrder = [iterBest, ...rootOrder.filter((m) => m !== iterBest).sort((a, b) => (scores.get(b) ?? -INF) - (scores.get(a) ?? -INF))];
    if (Math.abs(bestScore) > MATE - 200) break; // forced mate found
    if (now() > started + maxMs * 0.55) break; // the next depth would not finish
    if (opts.randomMargin && depth >= 2) {
      // Weak levels: pick among moves within the margin of the best.
      const rnd = opts.random || Math.random;
      const near = rootOrder.filter((m) => (scores.get(m) ?? -INF) >= bestScore - opts.randomMargin);
      if (near.length > 1 && depth >= (opts.maxDepth || 2)) {
        bestMove = near[Math.floor(rnd() * near.length)];
        bestScore = scores.get(bestMove);
      }
    }
  }
  if (stopped && completed === 0) bestMove = rootOrder[0];
  return { move: R.uci(bestMove), san: R.sanOf(pos, bestMove, rootLegal), score: bestScore, depth: completed, nodes, ms: now() - started };
}

/** Budgets per level; the clock caps them further. */
const LEVELS = {
  easy: { maxMs: 150, maxDepth: 2, randomMargin: 120 },
  medium: { maxMs: 500, maxDepth: 4 },
  hard: { maxMs: 1500, maxDepth: 64 },
};

function budgetFor(level, remainingMs) {
  const base = { ...(LEVELS[level] || LEVELS.medium) };
  if (Number.isFinite(remainingMs)) base.maxMs = Math.max(30, Math.min(base.maxMs, Math.floor(remainingMs / 30)));
  return base;
}

// ---------------------------------------------------------------- worker runner

/**
 * Off-thread search. think() resolves with search()'s result; the event loop of
 * the caller only handles a postMessage. A stuck worker is replaced after
 * maxMs + graceMs and the promise rejects.
 */
function createRunner({ graceMs = 3000 } = {}) {
  const { Worker } = require("worker_threads");
  let worker = null;
  let seq = 0;
  const pending = new Map();

  const failAll = (err) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  };

  const ensure = () => {
    if (worker) return worker;
    worker = new Worker(path.join(__dirname, "chessWorker.js"));
    worker.unref();
    worker.on("message", (msg) => {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    });
    worker.on("error", (err) => {
      worker = null;
      failAll(err);
    });
    worker.on("exit", () => {
      worker = null;
      failAll(new Error("chess worker exited"));
    });
    return worker;
  };

  return {
    think(fen, opts = {}) {
      const w = ensure();
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("chess worker timeout"));
          const old = worker;
          worker = null;
          if (old) old.terminate().catch(() => {});
        }, (opts.maxMs || 1000) + graceMs);
        timer.unref?.();
        pending.set(id, { resolve, reject, timer });
        w.postMessage({ id, fen, opts: { maxMs: opts.maxMs, maxDepth: opts.maxDepth, maxNodes: opts.maxNodes, randomMargin: opts.randomMargin, historyKeys: opts.historyKeys } });
      });
    },
    async close() {
      const w = worker;
      worker = null;
      failAll(new Error("chess runner closed"));
      if (w) await w.terminate();
    },
    get busy() {
      return pending.size;
    },
  };
}

module.exports = { evaluate, search, budgetFor, createRunner, LEVELS, MATE, PST };
