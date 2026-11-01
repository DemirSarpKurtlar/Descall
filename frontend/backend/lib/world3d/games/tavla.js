"use strict";

/**
 * Tavla (backgammon, Turkish rules), 2 seats, matches to N points (default 5).
 *
 * Board: 24 points, index 0..23. board[i] > 0 are white (seat 0) checkers,
 * board[i] < 0 black (seat 1). White moves 23 -> 0 and bears off below 0 (home
 * 0..5); black moves 0 -> 23 and bears off above 23 (home 18..23). Standard
 * start: 2 on the 24-point, 5 on the 13, 3 on the 8, 5 on the 6 for each side.
 *
 * Rules:
 *   - opening roll: each player rolls one die, the higher starts (ties roll
 *     again); the starter then rolls both dice for the first move (Turkish
 *     custom; `useOpeningDice: true` plays the opening dice instead);
 *   - doubles move four times;
 *   - a checker on the bar must enter before anything else moves;
 *   - a single opposing checker (blot) is hit and goes to the bar;
 *   - bearing off only with all 15 checkers home; a higher die may bear off
 *     from the highest point when no checker is further back;
 *   - a player must use both dice when possible (all four for doubles, as many
 *     as possible otherwise); when only one die can be used it must be the
 *     higher one if that one is playable;
 *   - a game is worth 1, a mars (loser bore off nothing) 2; no doubling cube
 *     and no triple game;
 *   - resigning a game gives the opponent the points the position would give
 *     right now (2 if the resigner bore off nothing, else 1).
 * There is no hidden information: dice already rolled are public and future
 * dice do not exist until the server rolls them.
 */

const C = require("./common");

const GAME = "tavla";
const BAR = 24;
const OFF = -1;
const LEVELS = ["easy", "medium", "hard"];

const DEFAULTS = Object.freeze({
  matchTo: 5,
  rollMs: 10000,
  turnMs: 60000,
  gameOverMs: 6000,
  botLevel: "medium",
  useOpeningDice: false,
  botDelayMs: [700, 1100],
});

function create(options = {}) {
  const o = { ...DEFAULTS };
  if (C.isInt(options.matchTo)) o.matchTo = Math.min(25, Math.max(1, options.matchTo));
  if (C.isInt(options.rollMs)) o.rollMs = Math.min(60000, Math.max(2000, options.rollMs));
  if (C.isInt(options.turnMs)) o.turnMs = Math.min(300000, Math.max(5000, options.turnMs));
  if (C.isInt(options.gameOverMs)) o.gameOverMs = Math.min(60000, Math.max(1000, options.gameOverMs));
  if (LEVELS.includes(options.botLevel)) o.botLevel = options.botLevel;
  if (typeof options.useOpeningDice === "boolean") o.useOpeningDice = options.useOpeningDice;
  if (Array.isArray(options.botDelayMs) && options.botDelayMs.length === 2 && options.botDelayMs.every(C.isInt)) o.botDelayMs = options.botDelayMs.slice();
  return {
    game: GAME,
    v: 1,
    options: o,
    phase: "waiting",
    seq: 0,
    seats: [C.emptySeat(), C.emptySeat()],
    members: {},
    match: { scores: [0, 0], games: 0, winner: null, history: [] },
    g: null,
  };
}

// ---------------------------------------------------------------- position helpers

function startBoard() {
  const b = new Array(24).fill(0);
  b[23] = 2;
  b[12] = 5;
  b[7] = 3;
  b[5] = 5;
  b[0] = -2;
  b[11] = -5;
  b[16] = -3;
  b[18] = -5;
  return b;
}

function count(board, i, p) {
  const v = board[i];
  return p === 0 ? (v > 0 ? v : 0) : v < 0 ? -v : 0;
}

function oppCount(board, i, p) {
  return count(board, i, 1 - p);
}

function addChecker(board, i, p, n = 1) {
  board[i] += p === 0 ? n : -n;
}

function allHome(pos, p) {
  if (pos.bar[p] > 0) return false;
  for (let i = 0; i < 24; i++) {
    if (count(pos.board, i, p) === 0) continue;
    if (p === 0 ? i > 5 : i < 18) return false;
  }
  return true;
}

function pipCount(pos, p) {
  let pips = pos.bar[p] * 25;
  for (let i = 0; i < 24; i++) {
    const n = count(pos.board, i, p);
    if (n) pips += n * (p === 0 ? i + 1 : 24 - i);
  }
  return pips;
}

function posKey(pos) {
  return pos.board.join(",") + "|" + pos.bar.join(",") + "|" + pos.off.join(",");
}

function clonePos(pos) {
  return { board: pos.board.slice(), bar: pos.bar.slice(), off: pos.off.slice() };
}

/** Target of a step, or OFF; null when the step is illegal. Does not mutate. */
function stepTarget(pos, p, from, die) {
  const b = pos.board;
  if (pos.bar[p] > 0 && from !== BAR) return null;
  if (from === BAR) {
    if (pos.bar[p] === 0) return null;
    const to = p === 0 ? 24 - die : die - 1;
    return oppCount(b, to, p) >= 2 ? null : to;
  }
  if (!Number.isInteger(from) || from < 0 || from > 23 || count(b, from, p) === 0) return null;
  const to = p === 0 ? from - die : from + die;
  if (to >= 0 && to <= 23) return oppCount(b, to, p) >= 2 ? null : to;
  // Bearing off.
  if (!allHome(pos, p)) return null;
  const exact = p === 0 ? to === -1 : to === 24;
  if (exact) return OFF;
  // Overshoot: only from the furthest-back checker.
  if (p === 0) {
    for (let i = from + 1; i <= 5; i++) if (count(b, i, 0) > 0) return null;
  } else {
    for (let i = 18; i < from; i++) if (count(b, i, 1) > 0) return null;
  }
  return OFF;
}

/** Apply a step (assumed legal); returns { pos, hit }. */
function doStep(pos, p, from, die) {
  const to = stepTarget(pos, p, from, die);
  const n = clonePos(pos);
  if (from === BAR) n.bar[p]--;
  else addChecker(n.board, from, p, -1);
  let hit = false;
  if (to === OFF) n.off[p]++;
  else {
    if (oppCount(n.board, to, p) === 1) {
      n.board[to] = 0;
      n.bar[1 - p]++;
      hit = true;
    }
    addChecker(n.board, to, p, 1);
  }
  return { pos: n, to, hit };
}

/** Distinct single steps available with one die value. */
function stepsForDie(pos, p, die) {
  const out = [];
  if (pos.bar[p] > 0) {
    if (stepTarget(pos, p, BAR, die) !== null) out.push(BAR);
    return out;
  }
  for (let i = 0; i < 24; i++) if (count(pos.board, i, p) > 0 && stepTarget(pos, p, i, die) !== null) out.push(i);
  return out;
}

function uniqueDice(dice) {
  return Array.from(new Set(dice));
}

function removeDie(dice, d) {
  const i = dice.indexOf(d);
  const out = dice.slice();
  out.splice(i, 1);
  return out;
}

/** Max number of dice usable from here (memoised per call tree). */
function maxUsable(pos, p, dice, memo = new Map()) {
  if (dice.length === 0) return 0;
  const key = posKey(pos) + "#" + dice.slice().sort().join("");
  if (memo.has(key)) return memo.get(key);
  let best = 0;
  for (const d of uniqueDice(dice)) {
    const rest = removeDie(dice, d);
    for (const from of stepsForDie(pos, p, d)) {
      const sub = 1 + maxUsable(doStep(pos, p, from, d).pos, p, rest, memo);
      if (sub > best) best = sub;
      if (best === dice.length) break;
    }
    if (best === dice.length) break;
  }
  memo.set(key, best);
  return best;
}

/**
 * Legal next steps given the remaining dice and how many dice the whole turn
 * must still use (`need`). Applies the "use both dice" and "use the higher die"
 * rules. Returns [{ from, to, die }].
 */
function legalSteps(pos, p, dice, need, firstOfTurn, rolled) {
  if (need <= 0 || dice.length === 0) return [];
  const memo = new Map();
  let steps = [];
  for (const d of uniqueDice(dice)) {
    const rest = removeDie(dice, d);
    for (const from of stepsForDie(pos, p, d)) {
      const after = doStep(pos, p, from, d);
      if (1 + maxUsable(after.pos, p, rest, memo) >= need) steps.push({ from, to: after.to, die: d });
    }
  }
  // Only one die can be played in total: it must be the higher one when that one is playable.
  if (firstOfTurn && need === 1 && rolled && rolled.length === 2 && rolled[0] !== rolled[1]) {
    const hi = Math.max(rolled[0], rolled[1]);
    if (steps.some((s) => s.die === hi)) steps = steps.filter((s) => s.die === hi);
  }
  return steps;
}

/**
 * Every complete legal move (distinct final positions) for a roll, for the bot
 * and for the tests. Returns [{ steps: [{from,to,die}], pos, hits }].
 */
function allMoves(pos, p, rolled) {
  const dice = rolled[0] === rolled[1] ? [rolled[0], rolled[0], rolled[0], rolled[0]] : rolled.slice();
  // One DFS over (position, remaining dice), each visited once; the longest
  // sequences win ("use as many dice as possible").
  let need = 0;
  let finals = new Map();
  const seen = new Set();
  const walk = (cur, remaining, steps, hits) => {
    const depth = steps.length;
    if (depth > need) {
      need = depth;
      finals = new Map();
    }
    if (depth === need && depth > 0) {
      const k = posKey(cur);
      if (!finals.has(k)) finals.set(k, { steps, pos: cur, hits });
    }
    if (remaining.length === 0) return;
    const vk = posKey(cur) + "#" + remaining.join("");
    if (seen.has(vk)) return;
    seen.add(vk);
    for (const d of uniqueDice(remaining)) {
      const rest = removeDie(remaining, d);
      for (const from of stepsForDie(cur, p, d)) {
        const r = doStep(cur, p, from, d);
        walk(r.pos, rest, steps.concat([{ from, to: r.to, die: d }]), hits + (r.hit ? 1 : 0));
      }
    }
  };
  walk(pos, dice, [], 0);
  // Only one die playable: the higher one when it can be played. (Rebuilt from
  // scratch: the dedupe above may have kept a lower-die step that reaches the
  // same position, e.g. bearing off the last checker.)
  if (need === 1 && rolled[0] !== rolled[1]) {
    const hi = Math.max(rolled[0], rolled[1]);
    const lo = Math.min(rolled[0], rolled[1]);
    const d = stepsForDie(pos, p, hi).length ? hi : lo;
    const out = new Map();
    for (const from of stepsForDie(pos, p, d)) {
      const r = doStep(pos, p, from, d);
      const k = posKey(r.pos);
      if (!out.has(k)) out.set(k, { steps: [{ from, to: r.to, die: d }], pos: r.pos, hits: r.hit ? 1 : 0 });
    }
    return Array.from(out.values());
  }
  return Array.from(finals.values());
}

// ---------------------------------------------------------------- membership

function join(state, player) {
  return C.joinMember(state, player);
}

function seat(state, playerId, index) {
  const id = C.cleanPlayerId(playerId);
  if (!id || !state.members[id]) return C.fail(state, "not_member");
  const cur = C.seatOf(state, id);
  if (index === null) {
    if (cur < 0) return C.fail(state, "not_seated");
    return standUp(state, id, cur);
  }
  if (!C.isInt(index) || index < 0 || index > 1) return C.fail(state, "bad_seat");
  if (cur === index) return C.ok(state);
  if (state.phase !== "waiting" && state.phase !== "matchOver") return C.fail(state, "in_game");
  const t = state.seats[index];
  if (t.playerId && t.kind !== "bot") return C.fail(state, "seat_taken");
  const s = C.clone(state);
  if (cur >= 0) s.seats[cur] = C.emptySeat();
  s.seats[index] = C.humanSeat(id, s.members[id].name);
  s.seq++;
  return C.ok(s, [{ type: "seat", seat: index, playerId: id }]);
}

/** Leaving a running match resigns it. */
function standUp(state, id, cur) {
  let s = C.clone(state);
  const events = [];
  if (s.phase === "opening" || s.phase === "playing" || s.phase === "gameOver") {
    s.match.winner = 1 - cur;
    s.phase = "matchOver";
    s.match.resignedBy = cur;
    events.push({ type: "matchOver", winner: 1 - cur, scores: s.match.scores.slice(), reason: "left" });
  }
  s.seats[cur] = C.emptySeat();
  events.push({ type: "seat", seat: cur, playerId: null });
  s.seq++;
  return C.ok(s, events);
}

function leave(state, playerId) {
  const id = C.cleanPlayerId(playerId);
  if (!id || !state.members[id]) return C.fail(state, "not_member");
  let res = C.ok(state);
  const cur = C.seatOf(state, id);
  if (cur >= 0) res = standUp(state, id, cur);
  const s = res.state === state ? C.clone(state) : res.state;
  delete s.members[id];
  return C.ok(s, [...res.events, { type: "member", op: "leave", playerId: id }]);
}

function setPresence(state, playerId, patch) {
  return C.setPresence(state, playerId, patch);
}

/** Start a match; an empty seat gets a bot (`withBot`, default true). */
function start(state, playerId, ctx = {}, opts = {}) {
  if (state.phase !== "waiting" && state.phase !== "matchOver") return C.fail(state, "already_started");
  if (playerId !== C.SYSTEM && C.seatOf(state, playerId) < 0) return C.fail(state, "not_seated");
  const s = C.clone(state);
  const humans = s.seats.filter((x) => x.kind === "human").length;
  if (humans === 0) return C.fail(state, "not_enough_players");
  for (let i = 0; i < 2; i++) {
    if (!s.seats[i].playerId) {
      if (opts.withBot === false) return C.fail(state, "not_enough_players");
      s.seats[i] = C.botSeat(i, s.options.botLevel);
    }
  }
  s.match = { scores: [0, 0], games: 0, winner: null, history: [] };
  const events = [{ type: "matchStart", matchTo: s.options.matchTo }];
  newGame(s, events);
  return C.ok(s, events);
}

function newGame(s, events) {
  s.g = {
    number: s.match.games + 1,
    board: startBoard(),
    bar: [0, 0],
    off: [0, 0],
    turn: null,
    opening: [null, null],
    openingTies: 0,
    rolled: null,
    dice: [],
    need: 0,
    steps: [],
    turnStart: null,
    moves: 0,
    result: null,
  };
  s.phase = "opening";
  s.seq++;
  events.push({ type: "gameStart", game: s.g.number });
}

// ---------------------------------------------------------------- actions

const FREE_ACTIONS = new Set();

function pos(g) {
  return { board: g.board, bar: g.bar, off: g.off };
}

function die(rng) {
  return 1 + rng.int(6);
}

function apply(state, playerId, action, ctx = {}) {
  if (!action || typeof action !== "object" || typeof action.type !== "string") return C.fail(state, "bad_action");
  const rng = C.rngOf(ctx);
  if (playerId === C.SYSTEM) {
    if (action.type === "nextGame") return nextGame(state);
    return C.fail(state, "bad_action");
  }
  const me = C.seatOf(state, playerId);
  if (me < 0) return C.fail(state, "not_seated");
  if (action.type === "start") return start(state, playerId, ctx);
  if (action.type === "resign") return resign(state, me);
  if (state.phase === "opening") {
    if (action.type !== "roll") return C.fail(state, "must_roll");
    return openingRoll(state, me, rng);
  }
  if (state.phase !== "playing") return C.fail(state, "not_playing");
  const g = state.g;
  if (g.turn !== me) return C.fail(state, "not_your_turn");
  switch (action.type) {
    case "roll":
      if (g.rolled) return C.fail(state, "already_rolled");
      return roll(state, me, [die(rng), die(rng)]);
    case "move":
      return move(state, me, action);
    case "undo":
      return undo(state, me);
    default:
      return C.fail(state, "bad_action");
  }
}

function openingRoll(state, me, rng) {
  const g = state.g;
  if (g.opening[me] !== null) return C.fail(state, "already_rolled");
  const s = C.clone(state);
  const sg = s.g;
  sg.opening[me] = die(rng);
  const events = [{ type: "openingRoll", seat: me, die: sg.opening[me] }];
  if (sg.opening[0] !== null && sg.opening[1] !== null) {
    const [a, b] = sg.opening;
    if (a === b) {
      sg.opening = [null, null];
      sg.openingTies = (sg.openingTies || 0) + 1;
      events.push({ type: "openingTie", die: a });
    } else {
      const starter = a > b ? 0 : 1;
      sg.turn = starter;
      s.phase = "playing";
      events.push({ type: "openingResult", starter, dice: [a, b] });
      if (s.options.useOpeningDice) {
        s.seq++;
        const r = roll(s, starter, [a, b]);
        return C.ok(r.state, events.concat(r.events));
      }
    }
  }
  s.seq++;
  return C.ok(s, events);
}

function roll(state, me, dice) {
  const s = C.clone(state);
  const g = s.g;
  g.rolled = dice.slice();
  g.dice = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice();
  g.need = maxUsable(pos(g), me, g.dice);
  g.steps = [];
  g.turnStart = { board: g.board.slice(), bar: g.bar.slice(), off: g.off.slice(), dice: g.dice.slice(), need: g.need };
  s.seq++;
  const events = [{ type: "roll", seat: me, dice: dice.slice() }];
  if (g.need === 0) {
    events.push({ type: "noMoves", seat: me });
    endTurn(s, events);
  }
  return C.ok(s, events);
}

function parseLoc(v, isFrom) {
  if (isFrom && (v === "bar" || v === BAR)) return BAR;
  if (!isFrom && (v === "off" || v === OFF)) return OFF;
  return Number.isInteger(v) && v >= 0 && v <= 23 ? v : undefined;
}

function move(state, me, action) {
  const g = state.g;
  if (!g.rolled) return C.fail(state, "must_roll");
  const list = Array.isArray(action.steps) ? action.steps : [action];
  if (list.length === 0 || list.length > 4) return C.fail(state, "bad_move");
  let cur = pos(g);
  let dice = g.dice.slice();
  let need = g.need - g.steps.length;
  const done = [];
  const events = [];
  let first = g.steps.length === 0;
  for (const st of list) {
    if (!st || typeof st !== "object") return C.fail(state, "bad_move");
    const from = parseLoc(st.from, true);
    if (from === undefined) return C.fail(state, "bad_move");
    const to = st.to === undefined ? undefined : parseLoc(st.to, false);
    if (st.to !== undefined && to === undefined) return C.fail(state, "bad_move");
    const opts = legalSteps(cur, me, dice, need, first, g.rolled).filter((x) => x.from === from && (to === undefined || x.to === to) && (st.die === undefined || x.die === st.die));
    if (opts.length === 0) return C.fail(state, "illegal_move");
    // Several dice reach the same place only when bearing off; use the smallest that works.
    opts.sort((a, b) => a.die - b.die);
    const pick = opts[0];
    const r = doStep(cur, me, pick.from, pick.die);
    cur = r.pos;
    dice = removeDie(dice, pick.die);
    need--;
    first = false;
    done.push({ from: pick.from === BAR ? "bar" : pick.from, to: pick.to === OFF ? "off" : pick.to, die: pick.die, hit: r.hit });
  }
  const s = C.clone(state);
  const sg = s.g;
  sg.board = cur.board;
  sg.bar = cur.bar;
  sg.off = cur.off;
  sg.dice = dice;
  sg.steps.push(...done);
  s.seq++;
  for (const d of done) events.push({ type: "move", seat: me, ...d });
  if (sg.off[me] === 15) {
    winGame(s, me, events, "bore_off");
  } else if (sg.steps.length >= sg.need) {
    endTurn(s, events);
  }
  return C.ok(s, events);
}

function undo(state, me) {
  const g = state.g;
  if (!g.rolled || g.steps.length === 0) return C.fail(state, "nothing_to_undo");
  const s = C.clone(state);
  const sg = s.g;
  const t = sg.turnStart;
  sg.board = t.board.slice();
  sg.bar = t.bar.slice();
  sg.off = t.off.slice();
  sg.dice = t.dice.slice();
  sg.steps = [];
  s.seq++;
  return C.ok(s, [{ type: "undo", seat: me }]);
}

function endTurn(s, events) {
  const g = s.g;
  g.turn = 1 - g.turn;
  g.rolled = null;
  g.dice = [];
  g.need = 0;
  g.steps = [];
  g.turnStart = null;
  g.moves++;
  events.push({ type: "turn", seat: g.turn });
}

function gameValue(g, loser) {
  return g.off[loser] === 0 ? 2 : 1;
}

function winGame(s, winner, events, reason) {
  const g = s.g;
  const loser = 1 - winner;
  const points = gameValue(g, loser);
  s.match.scores[winner] += points;
  s.match.games++;
  g.result = { winner, points, mars: points === 2, reason };
  s.match.history.push({ game: g.number, winner, points, reason });
  g.rolled = null;
  g.dice = [];
  events.push({ type: "gameOver", winner, points, mars: points === 2, reason, scores: s.match.scores.slice() });
  if (s.match.scores[winner] >= s.options.matchTo) {
    s.match.winner = winner;
    s.phase = "matchOver";
    events.push({ type: "matchOver", winner, scores: s.match.scores.slice() });
  } else {
    s.phase = "gameOver";
  }
}

function resign(state, me) {
  if (state.phase !== "playing" && state.phase !== "opening") return C.fail(state, "not_playing");
  const s = C.clone(state);
  const events = [{ type: "resign", seat: me }];
  winGame(s, 1 - me, events, "resign");
  s.seq++;
  return C.ok(s, events);
}

function nextGame(state) {
  if (state.phase !== "gameOver") return C.fail(state, "not_game_over");
  const s = C.clone(state);
  const events = [];
  newGame(s, events);
  return C.ok(s, events);
}

// ---------------------------------------------------------------- timers and bot

function timers(state) {
  const o = state.options;
  if (state.phase === "gameOver") {
    return [{ key: `next:${state.match.games}`, kind: "system", playerId: C.SYSTEM, ms: o.gameOverMs, action: { type: "nextGame" } }];
  }
  const g = state.g;
  const out = [];
  const timerFor = (i, key, ms, action) => {
    const seatRec = state.seats[i];
    if (C.botControlled(seatRec)) out.push({ key: `${key}:bot`, kind: "bot", playerId: seatRec.playerId, ms: C.delayFor(`${key}:${state.seq}`, o.botDelayMs[0], o.botDelayMs[1]) });
    else out.push({ key, kind: "turn", playerId: seatRec.playerId, ms, action });
  };
  if (state.phase === "opening") {
    for (let i = 0; i < 2; i++) if (g.opening[i] === null) timerFor(i, `open:${g.number}:${i}:${g.openingTies || 0}`, o.rollMs, { type: "roll" });
    return out;
  }
  if (state.phase !== "playing") return out;
  if (!g.rolled) timerFor(g.turn, `roll:${g.number}:${g.moves}`, o.rollMs, { type: "roll" });
  else timerFor(g.turn, `move:${g.number}:${g.moves}`, o.turnMs, autoMove(state));
  return out;
}

/** On timeout: the best move by the medium bot from the turn start. */
function autoMove(state) {
  const g = state.g;
  const p = g.turn;
  if (g.steps.length > 0) {
    // Finish the turn from the current partial position.
    const moves = remainingMoves(state);
    return moves.length ? { type: "move", steps: moves } : { type: "undo" };
  }
  const best = chooseMove(pos(g), p, g.rolled, "medium", null);
  return best ? { type: "move", steps: best.steps.map(exportStep) } : { type: "undo" };
}

function remainingMoves(state) {
  const g = state.g;
  const p = g.turn;
  const out = [];
  let cur = pos(g);
  let dice = g.dice.slice();
  for (let need = g.need - g.steps.length; need > 0; need--) {
    const opts = legalSteps(cur, p, dice, need, false, g.rolled);
    if (!opts.length) break;
    const st = opts[0];
    out.push(exportStep(st));
    cur = doStep(cur, p, st.from, st.die).pos;
    dice = removeDie(dice, st.die);
  }
  return out;
}

function exportStep(st) {
  return { from: st.from === BAR ? "bar" : st.from, to: st.to === OFF ? "off" : st.to, die: st.die };
}

// Single-roll chance (out of 36) that a checker at distance d is hit.
const SHOT = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1];

/** Higher is better for `p`. */
function evaluate(position, p, level) {
  const b = position.board;
  const o = 1 - p;
  const myPip = pipCount(position, p);
  const opPip = pipCount(position, o);
  let score = (opPip - myPip) * 1.0;
  score += (position.off[p] - position.off[o]) * 2;
  // Contact: does any of my checkers still have to pass an opponent checker?
  let myBack = -1; // furthest-back point in my direction (distance from my home), 0..24
  let opBack = -1;
  for (let i = 0; i < 24; i++) {
    if (count(b, i, p)) myBack = Math.max(myBack, p === 0 ? i : 23 - i);
    if (count(b, i, o)) opBack = Math.max(opBack, o === 0 ? i : 23 - i);
  }
  if (position.bar[p]) myBack = 24;
  if (position.bar[o]) opBack = 24;
  const contact = myBack + opBack >= 23;
  if (!contact) return score + 0.5 * position.off[p];
  if (level === "easy") return score + 6 * position.bar[o];
  // Made points, home board and primes.
  let prime = 0;
  let bestPrime = 0;
  for (let k = 0; k < 24; k++) {
    const i = p === 0 ? k : 23 - k; // k = distance from my bear-off edge
    const n = count(b, i, p);
    if (n >= 2) {
      score += k <= 5 ? 2.2 : k <= 7 ? 1.8 : 0.8;
      if (k === 4 || k === 6) score += 1; // 5-point and bar point
      prime++;
      bestPrime = Math.max(bestPrime, prime);
    } else prime = 0;
    if (n > 3) score -= (n - 3) * 0.35; // stacking
  }
  score += bestPrime >= 3 ? bestPrime * bestPrime * 0.45 : 0;
  // Opponent on the bar facing my closed home points.
  let closed = 0;
  for (let k = 0; k < 6; k++) if (count(b, p === 0 ? k : 23 - k, p) >= 2) closed++;
  score += position.bar[o] * (3 + closed * 1.2);
  score -= position.bar[p] * 3;
  // Blots: chance to be hit times what it costs.
  for (let i = 0; i < 24; i++) {
    if (count(b, i, p) !== 1) continue;
    let shots = 0;
    // Opponent checkers that move toward this point from behind it.
    for (let j = 0; j < 24; j++) {
      if (!count(b, j, o)) continue;
      const d = o === 0 ? j - i : i - j;
      if (d > 0 && d < SHOT.length) shots = Math.max(shots, SHOT[d]);
    }
    if (position.bar[o]) {
      const d = o === 0 ? 24 - i : i + 1;
      if (d > 0 && d < SHOT.length) shots = Math.max(shots, SHOT[d]);
    }
    if (!shots) continue;
    const travelled = p === 0 ? 24 - i : i + 1; // pips lost when hit
    const homeRisk = 1 + closedFor(b, o) * 0.25;
    score -= (shots / 36) * (travelled * 0.55 + 3) * homeRisk;
  }
  if (level === "hard") {
    // Anchors in the opponent's home keep a game when behind.
    for (let k = 18; k < 24; k++) {
      const i = p === 0 ? k : 23 - k;
      if (count(b, i, p) >= 2) score += 0.8;
    }
  }
  return score;
}

function closedFor(b, p) {
  let n = 0;
  for (let k = 0; k < 6; k++) if (count(b, p === 0 ? k : 23 - k, p) >= 2) n++;
  return n;
}

function chooseMove(position, p, rolled, level, rng) {
  const moves = allMoves(position, p, rolled);
  if (!moves.length) return null;
  const scored = moves.map((m) => ({ m, v: evaluate(m.pos, p, level) + (level === "easy" ? 0 : m.hits * 0.2) }));
  scored.sort((a, b) => b.v - a.v);
  if (level === "easy" && rng && scored.length > 1 && rng.float() < 0.4) return scored[Math.min(scored.length - 1, 1 + rng.int(Math.min(3, scored.length - 1)))].m;
  if (level === "medium" && rng && scored.length > 1 && rng.float() < 0.12) return scored[1].m;
  return scored[0].m;
}

function botAction(state, playerId, ctx = {}) {
  const me = C.seatOf(state, playerId);
  if (me < 0) return null;
  if (state.phase === "opening") return state.g.opening[me] === null ? { type: "roll" } : null;
  if (state.phase !== "playing" || state.g.turn !== me) return null;
  const g = state.g;
  if (!g.rolled) return { type: "roll" };
  if (g.steps.length) return autoMove(state);
  const level = state.seats[me].kind === "bot" ? state.seats[me].level : state.options.botLevel;
  const best = chooseMove(pos(g), me, g.rolled, level, C.rngOf(ctx));
  return best ? { type: "move", steps: best.steps.map(exportStep) } : null;
}

// ---------------------------------------------------------------- views

function publicView(state) {
  const g = state.g;
  return {
    game: GAME,
    phase: state.phase,
    seq: state.seq,
    options: { matchTo: state.options.matchTo, rollMs: state.options.rollMs, turnMs: state.options.turnMs },
    seats: state.seats.map((x, i) => C.publicSeat(x, i)),
    match: { scores: state.match.scores.slice(), games: state.match.games, winner: state.match.winner },
    board: g
      ? {
          number: g.number,
          points: g.board.slice(),
          bar: g.bar.slice(),
          off: g.off.slice(),
          pips: [pipCount(pos(g), 0), pipCount(pos(g), 1)],
          turn: state.phase === "playing" ? g.turn : null,
          opening: g.opening.slice(),
          rolled: g.rolled ? g.rolled.slice() : null,
          dice: g.dice.slice(),
          steps: g.steps.map((x) => ({ ...x })),
          result: g.result,
        }
      : null,
    you: null,
  };
}

function viewFor(state, playerId) {
  const v = publicView(state);
  const me = C.seatOf(state, playerId);
  if (me < 0) return v;
  const g = state.g;
  const you = { seat: me, legal: [], canUndo: false, mustRoll: false };
  if (state.phase === "opening") you.mustRoll = g.opening[me] === null;
  if (state.phase === "playing" && g.turn === me) {
    if (!g.rolled) you.mustRoll = true;
    else {
      you.legal = legalSteps(pos(g), me, g.dice, g.need - g.steps.length, g.steps.length === 0, g.rolled).map(exportStep);
      you.canUndo = g.steps.length > 0;
    }
  }
  v.you = you;
  return v;
}

function scores(state) {
  return state.seats.map((x, i) => ({ seat: i, playerId: x.playerId, name: x.name, kind: x.kind, score: state.match.scores[i] }));
}

module.exports = {
  GAME,
  DEFAULTS,
  FREE_ACTIONS,
  BAR,
  OFF,
  create,
  join,
  leave,
  seat,
  setPresence,
  start,
  apply,
  timers,
  botAction,
  viewFor,
  publicView,
  scores,
  // rules, exported for tests and the UI
  startBoard,
  pipCount,
  allMoves,
  legalSteps,
  maxUsable,
  stepTarget,
  doStep,
  evaluate,
  chooseMove,
};
