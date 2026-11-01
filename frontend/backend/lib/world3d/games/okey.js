"use strict";

/**
 * Okey engine (standard Turkish Okey, 4 seats, points only).
 *
 * Phases: waiting -> playing -> handOver -> playing ... -> matchOver.
 * Seats go counter-clockwise: seat i plays after seat i-1 and discards to its
 * right, onto its own discard stack, which is the stack seat i+1 may draw from.
 *
 * Hand: 106 tiles are shuffled; the first numbered tile becomes the indicator
 * (face up, out of play); the starter gets 15 tiles, the others 14; the rest is
 * the centre pile (48 tiles with four players). The starter discards first
 * without drawing. On a turn: draw (centre pile or the previous player's last
 * discard), then discard or finish.
 *
 * Finish: discard one tile face down and show the other 14 as a complete hand
 * (runs and groups, or 7 pairs). The server checks the hand itself.
 *
 * Scoring (countdown, the common "puanlı" table; see GAMES_PROTOCOL.md):
 *   every seat starts with `startPoints` (20); when a hand is won every other
 *   seat loses
 *     normal finish             2
 *     finish discarding an okey 4  (double)
 *     pairs (çift) finish       4  (double)
 *     pairs + okey discard      8
 *   showing the indicator twin on your first turn: every other seat loses 1.
 *   The centre pile running out (a non-winning discard with an empty pile)
 *   ends the hand as a draw: nobody loses points.
 *   The match ends after the hand in which a seat reaches 0 or less (or after
 *   `maxHands` when set); the highest score wins (ties share the win).
 *
 * Hidden information: racks and the pile order exist only in the state; views
 * (viewFor / publicView) whitelist what each viewer may see.
 */

const C = require("./common");
const R = require("./okeyRules");

const GAME = "okey";
const SEATS = 4;
const PENALTY = Object.freeze({ normal: 2, okey: 4, pairs: 4, pairsOkey: 8 });
const INDICATOR_PENALTY = 1;
const LEVELS = ["easy", "medium", "hard"];

const DEFAULTS = Object.freeze({
  turnMs: 30000,
  handOverMs: 8000,
  startPoints: 20,
  maxHands: 0, // 0 = until someone reaches 0
  indicatorBonus: true,
  botLevel: "medium",
  minHumans: 1,
  botDelayMs: [900, 1600], // base, spread
});

function create(options = {}) {
  const o = { ...DEFAULTS };
  if (C.isInt(options.turnMs)) o.turnMs = Math.min(120000, Math.max(5000, options.turnMs));
  if (C.isInt(options.handOverMs)) o.handOverMs = Math.min(60000, Math.max(1000, options.handOverMs));
  if (C.isInt(options.startPoints)) o.startPoints = Math.min(200, Math.max(4, options.startPoints));
  if (C.isInt(options.maxHands)) o.maxHands = Math.min(100, Math.max(0, options.maxHands));
  if (typeof options.indicatorBonus === "boolean") o.indicatorBonus = options.indicatorBonus;
  if (LEVELS.includes(options.botLevel)) o.botLevel = options.botLevel;
  if (C.isInt(options.minHumans)) o.minHumans = Math.min(4, Math.max(1, options.minHumans));
  if (Array.isArray(options.botDelayMs) && options.botDelayMs.length === 2 && options.botDelayMs.every(C.isInt)) {
    o.botDelayMs = [Math.max(0, options.botDelayMs[0]), Math.max(0, options.botDelayMs[1])];
  }
  return {
    game: GAME,
    v: 1,
    options: o,
    phase: "waiting",
    seq: 0,
    seats: Array.from({ length: SEATS }, C.emptySeat),
    members: {},
    scores: [0, 0, 0, 0],
    handsPlayed: 0,
    nextStarter: null,
    hand: null,
    lastResult: null,
    matchResult: null,
    history: [],
  };
}

// ---------------------------------------------------------------- membership

function join(state, player) {
  return C.joinMember(state, player);
}

const inMatch = (state) => state.phase === "playing" || state.phase === "handOver";

/** Take seat `index` (0..3), or stand up with index null. */
function seat(state, playerId, index) {
  const id = C.cleanPlayerId(playerId);
  if (!id || !state.members[id]) return C.fail(state, "not_member");
  const cur = C.seatOf(state, id);
  if (index === null) {
    if (cur < 0) return C.fail(state, "not_seated");
    return standUp(state, id, cur);
  }
  if (!C.isInt(index) || index < 0 || index >= SEATS) return C.fail(state, "bad_seat");
  if (cur === index) return C.ok(state);
  const target = state.seats[index];
  const free = !target.playerId || (target.kind === "bot" && state.phase !== "playing");
  if (!free) return C.fail(state, "seat_taken");
  if (cur >= 0 && state.phase !== "waiting" && state.phase !== "matchOver") return C.fail(state, "in_game");
  const s = C.clone(state);
  if (cur >= 0) s.seats[cur] = C.emptySeat();
  s.seats[index] = C.humanSeat(id, s.members[id].name);
  s.seq++;
  return C.ok(s, [{ type: "seat", seat: index, playerId: id }]);
}

function standUp(state, id, cur) {
  const s = C.clone(state);
  const events = [];
  if (inMatch(s)) {
    // A bot keeps the seat (and its rack and score) so the hand goes on.
    s.seats[cur] = C.botSeat(cur, s.options.botLevel);
    events.push({ type: "seat", seat: cur, playerId: s.seats[cur].playerId, replaced: id });
  } else {
    s.seats[cur] = C.emptySeat();
    events.push({ type: "seat", seat: cur, playerId: null });
  }
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

// ---------------------------------------------------------------- start and deal

function humansSeated(state) {
  return state.seats.filter((x) => x.kind === "human").length;
}

/** Start a match: fill empty seats with bots, reset scores, deal hand 1. */
function start(state, playerId, ctx = {}) {
  if (state.phase === "playing" || state.phase === "handOver") return C.fail(state, "already_started");
  if (playerId !== C.SYSTEM && C.seatOf(state, playerId) < 0) return C.fail(state, "not_seated");
  if (humansSeated(state) < state.options.minHumans) return C.fail(state, "not_enough_players");
  const rng = C.rngOf(ctx);
  const s = C.clone(state);
  for (let i = 0; i < SEATS; i++) if (!s.seats[i].playerId) s.seats[i] = C.botSeat(i, s.options.botLevel);
  s.scores = new Array(SEATS).fill(s.options.startPoints);
  s.handsPlayed = 0;
  s.history = [];
  s.lastResult = null;
  s.matchResult = null;
  s.nextStarter = rng.int(SEATS);
  const events = [{ type: "matchStart", startPoints: s.options.startPoints }];
  deal(s, rng, events);
  return C.ok(s, events);
}

function deal(s, rng, events) {
  const tiles = C.shuffle(Array.from({ length: R.TILE_COUNT }, (_, i) => i), rng);
  // The indicator is the first numbered tile from the top; a false okey cannot be the indicator.
  const indIdx = tiles.findIndex((t) => !R.isFake(t));
  const indicator = tiles.splice(indIdx, 1)[0];
  const okeyFace = R.okeyFaceFor(indicator);
  const starter = s.nextStarter;
  const racks = [[], [], [], []];
  for (let k = 0; k < SEATS; k++) {
    const seatIdx = (starter + k) % SEATS;
    const n = seatIdx === starter ? 15 : 14;
    racks[seatIdx] = tiles.splice(0, n);
  }
  s.hand = {
    number: s.handsPlayed + 1,
    starter,
    indicator,
    okeyFace,
    pile: tiles,
    racks,
    slots: racks.map((r) => R.suggestArrangement(r, okeyFace, "sorted").slots),
    discards: [[], [], [], []],
    turn: starter,
    step: "discard",
    drawn: null,
    drewFrom: null,
    discarded: [false, false, false, false],
    indicatorShownBy: null,
    moves: 0,
  };
  s.phase = "playing";
  s.seq++;
  events.push({
    type: "deal",
    hand: s.hand.number,
    starter,
    indicator: R.describeTile(indicator),
    okey: faceInfo(okeyFace),
    counts: racks.map((r) => r.length),
    pile: tiles.length,
  });
  for (let i = 0; i < SEATS; i++) {
    const seat = s.seats[i];
    if (seat.kind === "human") {
      events.push({ type: "rack", seat: i, private: { playerId: seat.playerId, tiles: racks[i].map((t) => R.describeTile(t, okeyFace)) } });
    }
  }
}

function faceInfo(face) {
  return { color: R.COLORS[R.faceColor(face)], num: R.faceNum(face) };
}

// ---------------------------------------------------------------- actions

const FREE_ACTIONS = new Set(["arrange"]);

function apply(state, playerId, action, ctx = {}) {
  if (!action || typeof action !== "object" || typeof action.type !== "string") return C.fail(state, "bad_action");
  if (playerId === C.SYSTEM) {
    if (action.type === "nextHand") return nextHand(state, ctx);
    return C.fail(state, "bad_action");
  }
  const seatIdx = C.seatOf(state, playerId);
  if (seatIdx < 0) return C.fail(state, "not_seated");
  if (action.type === "start") return start(state, playerId, ctx);
  if (state.phase !== "playing") return C.fail(state, "not_playing");
  const h = state.hand;
  switch (action.type) {
    case "arrange":
      return arrange(state, seatIdx, action);
    case "showIndicator":
      return showIndicator(state, seatIdx);
    case "draw":
    case "discard":
    case "finish":
      break;
    default:
      return C.fail(state, "bad_action");
  }
  if (h.turn !== seatIdx) return C.fail(state, "not_your_turn");
  if (action.type === "draw") return draw(state, seatIdx, action);
  if (h.step !== "discard") return C.fail(state, "must_draw");
  const tile = action.tile;
  if (!R.isValidTileId(tile) || !h.racks[seatIdx].includes(tile)) return C.fail(state, "no_such_tile");
  return action.type === "finish" ? finish(state, seatIdx, tile) : discard(state, seatIdx, tile);
}

function arrange(state, seatIdx, action) {
  const rack = state.hand.racks[seatIdx];
  if (!R.validSlots(action.slots, rack)) return C.fail(state, "bad_slots");
  const s = C.clone(state);
  s.hand.slots[seatIdx] = action.slots.slice();
  return C.ok(s, [{ type: "arranged", seat: seatIdx, private: { playerId: s.seats[seatIdx].playerId } }]);
}

function twinOf(indicator) {
  return indicator < 52 ? indicator + 52 : indicator - 52;
}

function canShowIndicator(state, seatIdx) {
  const h = state.hand;
  if (!state.options.indicatorBonus || !h || state.phase !== "playing") return false;
  if (h.indicatorShownBy !== null || h.turn !== seatIdx || h.discarded[seatIdx]) return false;
  return h.racks[seatIdx].includes(twinOf(h.indicator));
}

function showIndicator(state, seatIdx) {
  if (!canShowIndicator(state, seatIdx)) return C.fail(state, "cannot_show_indicator");
  const s = C.clone(state);
  s.hand.indicatorShownBy = seatIdx;
  const deltas = [0, 0, 0, 0];
  for (let i = 0; i < SEATS; i++) if (i !== seatIdx) deltas[i] = -INDICATOR_PENALTY;
  for (let i = 0; i < SEATS; i++) s.scores[i] += deltas[i];
  s.seq++;
  return C.ok(s, [{ type: "indicatorShown", seat: seatIdx, tile: R.describeTile(twinOf(s.hand.indicator)), deltas, scores: s.scores.slice() }]);
}

function draw(state, seatIdx, action) {
  const h = state.hand;
  if (h.step !== "draw") return C.fail(state, "already_drawn");
  const from = action.from;
  if (from !== "pile" && from !== "discard") return C.fail(state, "bad_source");
  const prev = (seatIdx + SEATS - 1) % SEATS;
  if (from === "discard" && h.discards[prev].length === 0) return C.fail(state, "discard_empty");
  if (from === "pile" && h.pile.length === 0) return C.fail(state, "pile_empty");
  const s = C.clone(state);
  const sh = s.hand;
  const tile = from === "pile" ? sh.pile.shift() : sh.discards[prev].pop();
  sh.racks[seatIdx].push(tile);
  sh.slots[seatIdx] = R.reconcileSlots(sh.slots[seatIdx], sh.racks[seatIdx]);
  sh.step = "discard";
  sh.drawn = tile;
  sh.drewFrom = from;
  s.seq++;
  const ev = { type: "draw", seat: seatIdx, from, pile: sh.pile.length };
  if (from === "discard") ev.tile = R.describeTile(tile, sh.okeyFace);
  else ev.private = { playerId: s.seats[seatIdx].playerId, tile: R.describeTile(tile, sh.okeyFace) };
  return C.ok(s, [ev]);
}

function removeFromRack(sh, seatIdx, tile) {
  const rack = sh.racks[seatIdx];
  rack.splice(rack.indexOf(tile), 1);
  sh.slots[seatIdx] = R.reconcileSlots(sh.slots[seatIdx], rack);
}

function discard(state, seatIdx, tile) {
  const s = C.clone(state);
  const sh = s.hand;
  removeFromRack(sh, seatIdx, tile);
  sh.discards[seatIdx].push(tile);
  sh.discarded[seatIdx] = true;
  sh.moves++;
  const events = [{ type: "discard", seat: seatIdx, tile: R.describeTile(tile, sh.okeyFace) }];
  if (sh.pile.length === 0) {
    endHand(s, { kind: "draw", reason: "pile_empty" }, events);
  } else {
    sh.turn = (seatIdx + 1) % SEATS;
    sh.step = "draw";
    sh.drawn = null;
    sh.drewFrom = null;
  }
  s.seq++;
  return C.ok(s, events);
}

function finishKind(win, okeyDiscard) {
  if (win.kind === "pairs") return okeyDiscard ? "pairsOkey" : "pairs";
  return okeyDiscard ? "okey" : "normal";
}

function finish(state, seatIdx, tile) {
  const h = state.hand;
  const rest = h.racks[seatIdx].filter((t) => t !== tile);
  const win = R.findWin(rest, h.okeyFace);
  if (!win) return C.fail(state, "not_a_winning_hand");
  const s = C.clone(state);
  const sh = s.hand;
  removeFromRack(sh, seatIdx, tile);
  sh.finishTile = tile;
  sh.moves++;
  const okeyDiscard = R.isOkey(tile, sh.okeyFace);
  const kind = finishKind(win, okeyDiscard);
  const events = [{ type: "finish", seat: seatIdx, tile: R.describeTile(tile, sh.okeyFace), kind }];
  endHand(s, { kind: "win", winner: seatIdx, finish: kind, melds: win.melds }, events);
  s.seq++;
  return C.ok(s, events);
}

function endHand(s, outcome, events) {
  const sh = s.hand;
  const deltas = [0, 0, 0, 0];
  let result;
  if (outcome.kind === "win") {
    const pen = PENALTY[outcome.finish];
    for (let i = 0; i < SEATS; i++) if (i !== outcome.winner) deltas[i] = -pen;
    result = {
      hand: sh.number,
      kind: "win",
      winner: outcome.winner,
      finish: outcome.finish,
      penalty: pen,
      deltas,
      finishTile: R.describeTile(sh.finishTile, sh.okeyFace),
      melds: outcome.melds.map((m) => m.map((t) => R.describeTile(t, sh.okeyFace))),
    };
  } else {
    result = { hand: sh.number, kind: "draw", reason: outcome.reason, deltas };
  }
  for (let i = 0; i < SEATS; i++) s.scores[i] += deltas[i];
  result.scores = s.scores.slice();
  result.indicatorShownBy = sh.indicatorShownBy;
  s.handsPlayed++;
  s.lastResult = result;
  s.history.push({ hand: result.hand, kind: result.kind, winner: result.winner ?? null, finish: result.finish ?? null, deltas });
  if (s.history.length > 50) s.history.shift();
  s.nextStarter = (sh.starter + 1) % SEATS;
  events.push({ type: "handOver", result });
  const over = s.scores.some((x) => x <= 0) || (s.options.maxHands > 0 && s.handsPlayed >= s.options.maxHands);
  if (over) {
    const best = Math.max(...s.scores);
    const winners = [];
    for (let i = 0; i < SEATS; i++) if (s.scores[i] === best) winners.push(i);
    s.matchResult = { winners, scores: s.scores.slice(), hands: s.handsPlayed, players: s.seats.map((x) => ({ playerId: x.playerId, name: x.name, kind: x.kind })) };
    s.phase = "matchOver";
    events.push({ type: "matchOver", result: s.matchResult });
  } else {
    s.phase = "handOver";
  }
}

function nextHand(state, ctx) {
  if (state.phase !== "handOver") return C.fail(state, "not_hand_over");
  const s = C.clone(state);
  const events = [];
  // Seats whose human left between hands are already bots; empty seats get one too.
  for (let i = 0; i < SEATS; i++) if (!s.seats[i].playerId) s.seats[i] = C.botSeat(i, s.options.botLevel);
  deal(s, C.rngOf(ctx), events);
  return C.ok(s, events);
}

// ---------------------------------------------------------------- timers and bots

/**
 * Timers the table manager should run for this state.
 *   kind "turn":   human on the clock; on expiry apply `action` as `playerId`
 *   kind "bot":    bot (or autopiloted human) to move after `ms`; ask botAction()
 *   kind "system": apply `action` as SYSTEM after `ms`
 * `key` identifies the timer; a timer with an unchanged key keeps running.
 */
function timers(state) {
  if (state.phase === "handOver") {
    return [{ key: `next:${state.handsPlayed}`, kind: "system", playerId: C.SYSTEM, ms: state.options.handOverMs, action: { type: "nextHand" } }];
  }
  if (state.phase !== "playing") return [];
  const h = state.hand;
  const seatRec = state.seats[h.turn];
  const key = `turn:${h.number}:${h.moves}:${h.step}`;
  if (C.botControlled(seatRec)) {
    const [base, spread] = state.options.botDelayMs;
    const ms = C.delayFor(`${key}:${state.seq}`, h.step === "draw" ? base * 0.7 : base, spread);
    return [{ key: `${key}:bot`, kind: "bot", playerId: seatRec.playerId, ms }];
  }
  return [{ key, kind: "turn", playerId: seatRec.playerId, ms: state.options.turnMs, action: autoAction(state, h.turn) }];
}

/** What happens when a connected human runs out of time: draw from the pile, throw back the drawn tile. */
function autoAction(state, seatIdx) {
  const h = state.hand;
  if (h.step === "draw") return { type: "draw", from: "pile" };
  if (h.drawn != null && h.racks[seatIdx].includes(h.drawn)) return { type: "discard", tile: h.drawn };
  // The starter's first turn: drop the least useful tile.
  return require("./okeyBot").chooseDiscard(botKnowledge(state, seatIdx), "easy", null).action;
}

/** Everything a bot may know: its own rack and public table information. Never the pile or other racks. */
function botKnowledge(state, seatIdx) {
  const h = state.hand;
  return {
    seat: seatIdx,
    rack: h.racks[seatIdx].slice(),
    okeyFace: h.okeyFace,
    indicator: h.indicator,
    discards: h.discards.map((d) => d.slice()),
    pileCount: h.pile.length,
    step: h.step,
    drawn: h.drawn,
    canShowIndicator: canShowIndicator(state, seatIdx),
    scores: state.scores.slice(),
  };
}

function botAction(state, playerId, ctx = {}) {
  const seatIdx = C.seatOf(state, playerId);
  if (seatIdx < 0 || state.phase !== "playing" || state.hand.turn !== seatIdx) return null;
  const level = state.seats[seatIdx].kind === "bot" ? state.seats[seatIdx].level : state.options.botLevel;
  return require("./okeyBot").decide(botKnowledge(state, seatIdx), level, C.rngOf(ctx));
}

// ---------------------------------------------------------------- views

function seatView(state, i) {
  const h = state.hand;
  return {
    ...C.publicSeat(state.seats[i], i),
    score: state.scores[i],
    tiles: h && state.phase !== "waiting" ? h.racks[i].length : 0,
  };
}

function handView(state) {
  const h = state.hand;
  if (!h) return null;
  return {
    number: h.number,
    starter: h.starter,
    turn: state.phase === "playing" ? h.turn : null,
    step: state.phase === "playing" ? h.step : null,
    indicator: R.describeTile(h.indicator),
    okey: faceInfo(h.okeyFace),
    pile: h.pile.length,
    discards: h.discards.map((d) => d.map((t) => R.describeTile(t, h.okeyFace))),
    indicatorShownBy: h.indicatorShownBy,
  };
}

function publicView(state) {
  return {
    game: GAME,
    phase: state.phase,
    seq: state.seq,
    options: { turnMs: state.options.turnMs, startPoints: state.options.startPoints, maxHands: state.options.maxHands, indicatorBonus: state.options.indicatorBonus },
    seats: state.seats.map((_, i) => seatView(state, i)),
    scores: state.scores.slice(),
    handsPlayed: state.handsPlayed,
    hand: handView(state),
    lastResult: state.lastResult,
    matchResult: state.matchResult,
    you: null,
  };
}

function viewFor(state, playerId) {
  const v = publicView(state);
  const i = C.seatOf(state, playerId);
  if (i < 0 || !state.hand || state.phase === "waiting") {
    if (i >= 0) v.you = { seat: i };
    return v;
  }
  const h = state.hand;
  const rack = h.racks[i];
  const byId = new Map(rack.map((t) => [t, R.describeTile(t, h.okeyFace)]));
  v.you = {
    seat: i,
    rack: h.slots[i].filter((t) => t !== null && byId.has(t)).map((t) => byId.get(t)),
    slots: h.slots[i].slice(),
    drawn: h.turn === i && h.drawn != null && rack.includes(h.drawn) ? h.drawn : null,
    canShowIndicator: canShowIndicator(state, i),
    canTakeDiscard: state.phase === "playing" && h.turn === i && h.step === "draw" && h.discards[(i + SEATS - 1) % SEATS].length > 0,
  };
  return v;
}

/** Rack helper for the UI: suggestions for the viewer's own rack. */
function suggest(state, playerId, mode) {
  const i = C.seatOf(state, playerId);
  if (i < 0 || !state.hand) return null;
  return R.suggestArrangement(state.hand.racks[i], state.hand.okeyFace, mode);
}

/** Final standing for the table manager (leaderboards, persistence). */
function scores(state) {
  return state.seats.map((x, i) => ({ seat: i, playerId: x.playerId, name: x.name, kind: x.kind, score: state.scores[i] }));
}

module.exports = {
  GAME,
  SEATS,
  PENALTY,
  INDICATOR_PENALTY,
  DEFAULTS,
  FREE_ACTIONS,
  create,
  join,
  leave,
  seat,
  setPresence,
  start,
  apply,
  timers,
  botAction,
  botKnowledge,
  viewFor,
  publicView,
  suggest,
  scores,
  canShowIndicator,
};
