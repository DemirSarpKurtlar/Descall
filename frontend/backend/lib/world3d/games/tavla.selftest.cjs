"use strict";

/**
 * Tavla (Turkish backgammon): start position, opening roll, entering, hitting,
 * bearing off, the "use both dice / the higher die" rules (checked against a
 * brute-force reference on random positions), mars scoring, matches to N,
 * undo, views, timers, bots, and randomized games with conservation checks.
 * Run: node frontend/backend/lib/world3d/games/tavla.selftest.cjs
 */

const assert = require("assert");
const C = require("./common");
const T = require("./tavla");
const { seeded, runEngine } = require("./testkit.cjs");

let checks = 0;
const ok = (c, m) => {
  checks++;
  assert.ok(c, m);
};
const eq = (a, b, m) => {
  checks++;
  assert.deepStrictEqual(a, b, m);
};

const W = 0;
const BL = 1;
const pos = (pairs, { bar = [0, 0], off = null } = {}) => {
  const board = new Array(24).fill(0);
  for (const [i, n] of pairs) board[i] += n;
  const on = [0, 0];
  board.forEach((v) => (v > 0 ? (on[0] += v) : (on[1] -= v)));
  return { board, bar, off: off || [15 - on[0] - bar[0], 15 - on[1] - bar[1]] };
};
const firstSteps = (p, side, rolled) => {
  const dice = rolled[0] === rolled[1] ? [rolled[0], rolled[0], rolled[0], rolled[0]] : rolled.slice();
  const need = T.maxUsable(p, side, dice);
  return T.legalSteps(p, side, dice, need, true, rolled);
};
const stepKey = (s) => `${s.from}>${s.to}@${s.die}`;

// ---------------------------------------------------------------- start position

{
  const p = { board: T.startBoard(), bar: [0, 0], off: [0, 0] };
  eq(T.pipCount(p, W), 167);
  eq(T.pipCount(p, BL), 167);
  eq(p.board.filter((v) => v > 0).reduce((a, b) => a + b, 0), 15);
  eq(p.board.filter((v) => v < 0).reduce((a, b) => a - b, 0), 15);
  eq(p.board[23], 2);
  eq(p.board[5], 5);
  eq(p.board[0], -2);
  eq(p.board[18], -5);
  eq(T.allMoves(p, W, [3, 1]).length > 0, true);
  // 6-5 from the start: "lover's leap" is among the moves.
  ok(T.allMoves(p, W, [6, 5]).some((m) => m.steps.length === 2 && m.steps.every((s) => s.from === 23 || s.from === 17)));
}

// ---------------------------------------------------------------- single-step rules

{
  // Entering: white enters at 24 - die; a point with 2+ black checkers is closed.
  const p = pos([[5, 5], [12, 9], [21, -2], [22, -1]], { bar: [1, 0] });
  eq(T.stepTarget(p, W, T.BAR, 3), null, "24-3 = 21 is blocked");
  eq(T.stepTarget(p, W, T.BAR, 2), 22, "a blot can be hit while entering");
  eq(T.stepTarget(p, W, 12, 1), null, "nothing else moves while on the bar");
  const r = T.doStep(p, W, T.BAR, 2);
  ok(r.hit);
  eq(r.pos.bar, [0, 1], "hit checker goes to the bar");
  eq(r.pos.board[22], 1);
  // Black enters at die - 1.
  const q = pos([[2, 2], [18, -14]], { bar: [0, 1] });
  eq(T.stepTarget(q, BL, T.BAR, 3), null);
  eq(T.stepTarget(q, BL, T.BAR, 4), 3);
}

{
  // Black enters on 0..5; close those with white.
  const closed = pos([[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [10, 3], [20, -14]], { bar: [0, 1] });
  eq(T.allMoves(closed, BL, [6, 3]).length, 0, "black cannot enter a closed board");
  eq(T.maxUsable(closed, BL, [6, 3]), 0);
}

{
  // Bearing off.
  const home = pos([[0, 3], [2, 4], [4, 3], [20, -15]], { off: [5, 0] });
  eq(T.stepTarget(home, W, 2, 3), T.OFF, "exact");
  eq(T.stepTarget(home, W, 2, 6), null, "overshoot only from the furthest point (4 is occupied)");
  eq(T.stepTarget(home, W, 4, 6), T.OFF, "furthest point bears off with a higher die");
  eq(T.stepTarget(home, W, 4, 2), 2, "moving inside home is fine");
  const notHome = pos([[0, 3], [2, 4], [9, 1], [20, -15]]);
  eq(T.stepTarget(notHome, W, 2, 3), null, "no bearing off with a checker outside home");
  const bHome = pos([[23, -3], [19, -2], [3, 15]], { off: [0, 10] });
  eq(T.stepTarget(bHome, BL, 23, 1), T.OFF, "black exact");
  eq(T.stepTarget(bHome, BL, 23, 6), null, "black overshoot only from the furthest (19 occupied)");
  eq(T.stepTarget(bHome, BL, 19, 6), T.OFF);
  eq(T.stepTarget(bHome, BL, 19, 2), 21);
  // Blocked landing.
  const blk = pos([[10, 2], [7, -2], [20, -13]]);
  eq(T.stepTarget(blk, W, 10, 3), null, "two or more opposing checkers close a point");
  eq(T.stepTarget(blk, W, 10, 4), 6);
}

// ---------------------------------------------------------------- dice rules vs brute force

/** Reference: all sequences of single steps, keep the longest, then the higher-die rule. */
function bruteFirstSteps(p, side, rolled) {
  const dice = rolled[0] === rolled[1] ? [rolled[0], rolled[0], rolled[0], rolled[0]] : rolled.slice();
  // Walk every ordering of every playable step (no memo, no pruning); remember for
  // each first step the longest sequence it starts.
  const longest = new Map(); // stepKey -> { len, die }
  let max = 0;
  const rec = (cur, left, depth, first) => {
    let moved = false;
    for (let k = 0; k < left.length; k++) {
      if (left.indexOf(left[k]) !== k) continue; // equal dice give equal sequences
      const d = left[k];
      const froms = cur.bar[side] > 0 ? [T.BAR] : Array.from({ length: 24 }, (_, i) => i);
      for (const f of froms) {
        if (f !== T.BAR && (side === 0 ? cur.board[f] <= 0 : cur.board[f] >= 0)) continue;
        const to = T.stepTarget(cur, side, f, d);
        if (to === null) continue;
        moved = true;
        const step = { from: f, to, die: d };
        rec(T.doStep(cur, side, f, d).pos, left.filter((_, j) => j !== k), depth + 1, first || step);
      }
    }
    if (!moved && first) {
      const key = stepKey(first);
      const prev = longest.get(key);
      if (!prev || prev.len < depth) longest.set(key, { len: depth, die: first.die });
      if (depth > max) max = depth;
    }
  };
  rec(p, dice, 0, null);
  let best = Array.from(longest.entries()).filter(([, v]) => v.len === max && max > 0);
  if (max === 1 && rolled[0] !== rolled[1]) {
    const hi = Math.max(...rolled);
    if (best.some(([, v]) => v.die === hi)) best = best.filter(([, v]) => v.die === hi);
  }
  return { max, first: new Set(best.map(([k]) => k)) };
}

function randomPosition(rng) {
  for (;;) {
    const board = new Array(24).fill(0);
    const bar = [0, 0];
    const off = [0, 0];
    for (const side of [0, 1]) {
      // Clustered placements make blocked and bearing-off situations common.
      const style = rng.int(4);
      for (let k = 0; k < 15; k++) {
        const r = rng.float();
        if (r < 0.05) bar[side]++;
        else if (r < 0.12 + (style === 3 ? 0.4 : 0)) off[side]++;
        else {
          let i = style === 0 || style === 3 ? rng.int(6) : rng.int(24);
          if (side === 1) i = style === 0 || style === 3 ? 23 - i : i;
          const sgn = side === 0 ? 1 : -1;
          if (board[i] * sgn < 0) {
            k--;
            continue;
          }
          board[i] += sgn;
        }
      }
    }
    return { board, bar, off };
  }
}

{
  const rng = seeded("tavla-brute");
  let compared = 0;
  let higherDieCases = 0;
  for (let n = 0; n < 1500; n++) {
    const p = randomPosition(rng);
    const side = rng.int(2);
    const rolled = [1 + rng.int(6), 1 + rng.int(6)];
    const ref = bruteFirstSteps(p, side, rolled);
    const mine = firstSteps(p, side, rolled);
    eq(new Set(mine.map(stepKey)), ref.first, `legal first steps for ${JSON.stringify(p)} side ${side} dice ${rolled}`);
    const all = T.allMoves(p, side, rolled);
    if (ref.max === 0) eq(all.length, 0);
    else ok(all.length > 0 && all.every((m) => m.steps.length === ref.max && ref.first.has(stepKey(m.steps[0]))), "allMoves plays the most dice and starts legally");
    // Every complete move of allMoves is accepted step by step by the engine rules.
    for (const m of all.slice(0, 5)) {
      let cur = p;
      let dice = rolled[0] === rolled[1] ? [rolled[0], rolled[0], rolled[0], rolled[0]] : rolled.slice();
      m.steps.forEach((st, k) => {
        const legal = T.legalSteps(cur, side, dice, m.steps.length - k, k === 0, rolled).map(stepKey);
        ok(legal.includes(stepKey(st)), "allMoves step is legal");
        cur = T.doStep(cur, side, st.from, st.die).pos;
        dice = dice.slice();
        dice.splice(dice.indexOf(st.die), 1);
      });
    }
    if (ref.max === 1 && rolled[0] !== rolled[1]) higherDieCases++;
    compared++;
  }
  ok(higherDieCases > 5, `the higher-die rule was exercised (${higherDieCases})`);
  console.log(`  tavla brute-force comparisons: ${compared}, higher-die cases ${higherDieCases}`);
}

{
  // Hand-made cases (white moves down towards 0).
  // 1. Nothing playable: the only movable checker (on 7) finds 1 and 2 closed.
  const pass = pos([[7, 1], [20, -2], [1, -2], [2, -2], [19, -9]]);
  eq(T.allMoves(pass, W, [6, 5]).length, 0, "nothing playable, the turn passes");
  // 2. Higher die forced: white's only movable checker sits on 13 (the rest are on 0 and
  //    cannot bear off while 13 is out). 13-6 = 7 and 13-5 = 8 are open, but 7-5 = 2 and
  //    8-6 = 2 are closed, so only one die can be played: it must be the 6.
  const forced = pos([[13, 1], [0, 14], [2, -2], [19, -13]]);
  eq(T.maxUsable(forced, W, [6, 5]), 1);
  eq(firstSteps(forced, W, [6, 5]).map(stepKey), ["13>7@6"], "the higher die must be played");
  eq(T.allMoves(forced, W, [6, 5]).map((m) => m.steps.map(stepKey)), [["13>7@6"]]);
  // 3. If only the lower die can be played at all, it is played.
  const lowOnly = pos([[13, 1], [0, 14], [7, -2], [19, -13]]);
  eq(firstSteps(lowOnly, W, [6, 5]).map(stepKey), ["13>8@5"]);
  // 4. Order matters: both dice playable only one way round. Checker on 10: 10-4 = 6 open
  //    but then 6-3 = 3 closed; 10-3 = 7 then 7-4 = 3 closed too... use a lone checker on 9
  //    with 5 closed: 9-4 = 5 closed, 9-3 = 6 then 6-4 = 2 open: 3 first is the only way.
  const order = pos([[9, 1], [0, 14], [5, -2], [19, -13]]);
  eq(T.maxUsable(order, W, [4, 3]), 2);
  eq(firstSteps(order, W, [4, 3]).map(stepKey), ["9>6@3"], "the die order that uses both dice");
}

// ---------------------------------------------------------------- engine: opening, turns, undo

function seatedTable(ids = ["a"], opts = {}) {
  let s = T.create(opts);
  ids.forEach((id, i) => {
    s = T.join(s, { id, name: id }).state;
    s = T.seat(s, id, i).state;
  });
  return s;
}

/** A dice-scripted RNG: int(6) returns the next scripted die - 1. */
function diceRng(list) {
  const q = list.slice();
  return { int: (n) => (n === 6 ? q.shift() - 1 : 0), float: () => 0 };
}

{
  let s = seatedTable(["a", "b"]);
  const r = T.start(s, "a", { rng: seeded(1) });
  assert.ifError(r.error);
  s = r.state;
  eq(s.phase, "opening");
  eq(T.apply(s, "a", { type: "move", from: 12, to: 10 }).error, "must_roll");
  s = T.apply(s, "a", { type: "roll" }, { rng: diceRng([4]) }).state;
  eq(T.apply(s, "a", { type: "roll" }, { rng: diceRng([4]) }).error, "already_rolled");
  s = T.apply(s, "b", { type: "roll" }, { rng: diceRng([4]) }).state;
  eq(s.g.opening, [null, null], "a tie rolls again");
  s = T.apply(s, "a", { type: "roll" }, { rng: diceRng([2]) }).state;
  const r2 = T.apply(s, "b", { type: "roll" }, { rng: diceRng([5]) });
  s = r2.state;
  eq(s.phase, "playing");
  eq(s.g.turn, 1, "higher opening die starts");
  eq(s.g.rolled, null, "the starter rolls both dice (Turkish custom)");
  eq(T.apply(s, "a", { type: "roll" }).error, "not_your_turn");
  s = T.apply(s, "b", { type: "roll" }, { rng: diceRng([3, 1]) }).state;
  eq(s.g.rolled, [3, 1]);
  eq(s.g.need, 2);
  const v = T.viewFor(s, "b");
  ok(v.you.legal.length > 0);
  eq(T.viewFor(s, "a").you.legal, [], "not a's turn");
  // Black 3-1: make the 5-point-equivalent (16->19 and 18->19).
  const m = T.apply(s, "b", { type: "move", steps: [{ from: 16, to: 19 }, { from: 18, to: 19 }] });
  assert.ifError(m.error);
  eq(m.state.g.board[19], -2);
  eq(m.state.g.turn, 0, "turn passes after both dice");
  // Undo inside a turn.
  let u = T.apply(s, "b", { type: "move", from: 16, to: 19 }).state;
  eq(u.g.steps.length, 1);
  ok(T.viewFor(u, "b").you.canUndo);
  u = T.apply(u, "b", { type: "undo" }).state;
  eq(u.g.board, s.g.board, "undo restores the turn start");
  eq(u.g.dice, [3, 1]);
  eq(T.apply(u, "b", { type: "undo" }).error, "nothing_to_undo");
  eq(T.apply(s, "b", { type: "move", from: 16, to: 22 }).error, "illegal_move");
  eq(T.apply(s, "b", { type: "move", from: "x", to: 3 }).error, "bad_move");
  eq(T.apply(s, "b", { type: "move", steps: [] }).error, "bad_move");
  eq(T.apply(s, "b", { type: "move", steps: [{ from: 16, to: 19 }, { from: 16, to: 19 }] }).error, "illegal_move", "dice used twice");
  // Doubles move four times.
  let d = T.apply(s, "b", { type: "roll" }, { rng: diceRng([2, 2]) });
  ok(d.error);
  const s2 = C.clone(s);
  s2.g.rolled = null;
  const dd = T.apply(s2, "b", { type: "roll" }, { rng: diceRng([2, 2]) }).state;
  eq(dd.g.dice, [2, 2, 2, 2]);
  eq(dd.g.need, 4);
  // useOpeningDice option plays the opening dice.
  let o = seatedTable(["a", "b"], { useOpeningDice: true });
  o = T.start(o, "a", { rng: seeded(2) }).state;
  o = T.apply(o, "a", { type: "roll" }, { rng: diceRng([6]) }).state;
  o = T.apply(o, "b", { type: "roll" }, { rng: diceRng([1]) }).state;
  eq(o.g.turn, 0);
  eq(o.g.rolled, [6, 1], "the opening dice are the first move");
}

// ---------------------------------------------------------------- winning, mars, match

function endgame(whiteOff, blackOff, matchTo = 5) {
  let s = seatedTable(["a", "b"], { matchTo });
  s = T.start(s, "a", { rng: seeded(3) }).state;
  s.phase = "playing";
  s.g.turn = 0;
  s.g.board = new Array(24).fill(0);
  s.g.board[0] = 15 - whiteOff;
  s.g.board[18] = -(15 - blackOff);
  s.g.off = [whiteOff, blackOff];
  s.g.bar = [0, 0];
  return s;
}

{
  // White bears off the last checker; black bore off nothing: mars = 2.
  let s = endgame(14, 0);
  s = T.apply(s, "a", { type: "roll" }, { rng: diceRng([1, 2]) }).state;
  const r = T.apply(s, "a", { type: "move", from: 0, to: "off" });
  assert.ifError(r.error);
  eq(r.state.g.result, { winner: 0, points: 2, mars: true, reason: "bore_off" });
  eq(r.state.match.scores, [2, 0]);
  eq(r.state.phase, "gameOver");
  ok(r.events.some((e) => e.type === "gameOver" && e.mars));
  eq(T.timers(r.state)[0].action, { type: "nextGame" });
  const next = T.apply(r.state, C.SYSTEM, { type: "nextGame" }).state;
  eq(next.phase, "opening");
  eq(next.g.board, T.startBoard());
  // Normal win = 1.
  let n = endgame(14, 3);
  n = T.apply(n, "a", { type: "roll" }, { rng: diceRng([1, 2]) }).state;
  eq(T.apply(n, "a", { type: "move", from: 0, to: "off" }).state.match.scores, [1, 0]);
  // Match to N.
  let m = endgame(14, 3, 1);
  m = T.apply(m, "a", { type: "roll" }, { rng: diceRng([1, 2]) }).state;
  const mo = T.apply(m, "a", { type: "move", from: 0, to: "off" }).state;
  eq(mo.phase, "matchOver");
  eq(mo.match.winner, 0);
  eq(T.timers(mo), []);
  // Resign: the opponent gets what the position gives (black bore off nothing here: 2).
  const rs = T.apply(endgame(10, 0), "b", { type: "resign" }).state;
  eq(rs.g.result.points, 2);
  eq(rs.g.result.winner, 0);
  const rs1 = T.apply(endgame(10, 4), "b", { type: "resign" }).state;
  eq(rs1.g.result.points, 1);
  // Leaving a running match loses it.
  const left = T.leave(endgame(10, 4), "b").state;
  eq(left.phase, "matchOver");
  eq(left.match.winner, 0);
}

// ---------------------------------------------------------------- views and timers

{
  let s = seatedTable(["a"]);
  s = T.start(s, "a", { rng: seeded(4) }).state;
  eq(s.seats[1].kind, "bot", "playing alone against a bot");
  const ts = T.timers(s);
  eq(ts.length, 2, "both opening rolls pending");
  ok(ts.some((t) => t.kind === "turn" && t.playerId === "a" && t.action.type === "roll"));
  ok(ts.some((t) => t.kind === "bot"));
  const pub = T.publicView(s);
  eq(pub.you, null);
  eq(pub.board.pips, [167, 167]);
  eq(T.viewFor(s, "a").you.mustRoll, true);
  // Auto move on timeout is legal.
  s = runEngine(T, s, { rng: seeded(5), until: (x) => x.phase === "playing" && x.g.rolled && x.seats[x.g.turn].kind === "human" });
  const t = T.timers(s)[0];
  eq(t.kind, "turn");
  eq(t.ms, s.options.turnMs);
  const r = T.apply(s, "a", t.action, { rng: seeded(6) });
  assert.ifError(r.error);
}

// ---------------------------------------------------------------- randomized games

function checkInvariants(s) {
  const g = s.g;
  if (!g) return;
  let w = g.bar[0] + g.off[0];
  let b = g.bar[1] + g.off[1];
  for (const v of g.board) {
    if (v > 0) w += v;
    else b -= v;
  }
  eq([w, b], [15, 15], "15 checkers each");
}

const t0 = Date.now();
let games = 0;
let mars = 0;
const wins = { hard: 0, easy: 0 };
{
  // Bot vs bot matches across levels.
  const pairs = [
    ["hard", "easy"],
    ["medium", "hard"],
    ["easy", "medium"],
  ];
  for (let i = 0; i < 18; i++) {
    const [l0, l1] = pairs[i % 3];
    const rng = seeded(`tv-${i}`);
    let s = T.create({ botLevel: l0, matchTo: 3 });
    s = T.join(s, { id: "a", name: "A" }).state;
    s = T.seat(s, "a", 0).state;
    s = T.start(s, "a", { rng }).state;
    s.seats[1].level = l1;
    s = T.setPresence(s, "a", { connected: false, autopilot: true }).state;
    s = runEngine(T, s, {
      rng,
      until: (x) => x.phase === "matchOver",
      onStep(prev, res) {
        checkInvariants(res.state);
        for (const ev of res.events) {
          if (ev.type === "gameOver") {
            games++;
            if (ev.mars) mars++;
          }
        }
      },
    });
    eq(Math.max(...s.match.scores) >= 3, true);
    eq(s.match.history.reduce((a, h) => a + h.points, 0), s.match.scores[0] + s.match.scores[1], "scores add up");
    if (l0 === "hard" && l1 === "easy") wins[s.match.winner === 0 ? "hard" : "easy"]++;
  }
}
ok(wins.hard > wins.easy, `hard beats easy (${wins.hard}:${wins.easy})`);

// Random human-style play: single steps picked from the view's legal list, undos, resigns.
{
  const rng = seeded("tv-random");
  for (let i = 0; i < 200; i++) {
    let s = seatedTable(["a", "b"], { matchTo: 1 });
    s = T.start(s, "a", { rng }).state;
    for (let guard = 0; s.phase !== "matchOver" && guard < 5000; guard++) {
      checkInvariants(s);
      let actor;
      let action;
      if (s.phase === "opening") {
        actor = s.g.opening[0] === null ? "a" : "b";
        action = { type: "roll" };
      } else {
        actor = s.seats[s.g.turn].playerId;
        const v = T.viewFor(s, actor);
        if (v.you.mustRoll) action = { type: "roll" };
        else if (v.you.canUndo && rng.float() < 0.05) action = { type: "undo" };
        else if (rng.float() < 0.0005) action = { type: "resign" };
        else action = { type: "move", ...v.you.legal[rng.int(v.you.legal.length)] };
      }
      const r = T.apply(s, actor, action, { rng });
      if (r.error) throw new Error(`random tavla: ${r.error} ${JSON.stringify(action)}`);
      for (const ev of r.events) if (ev.type === "gameOver") games++;
      s = r.state;
    }
    eq(s.phase, "matchOver", "random game finishes");
  }
}
const propMs = Date.now() - t0;

console.log(`tavla.selftest: ok (${checks} checks; ${games} games (${mars} mars) in ${propMs} ms; hard vs easy ${wins.hard}:${wins.easy})`);
