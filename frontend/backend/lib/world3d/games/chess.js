"use strict";

/**
 * Satranç (chess) table engine: full FIDE rules on top of chessRules.js.
 *
 * Endings:
 *   checkmate, stalemate, insufficient material (dead position), threefold
 *   repetition and the fifty-move rule end the game automatically (no claim
 *   needed, like most online servers); resignation; mutual draw agreement;
 *   loss on time, except a draw when the opponent cannot mate with any series
 *   of legal moves; abort when a side does not make its first move in time.
 * Clocks (optional): "M+S" presets such as 5+0 and 10+5. Each side's first move
 * is not on the clock (it has `firstMoveMs` instead, else the game is aborted);
 * the clock runs from the second move on and gains the increment after each
 * move. Time is passed in through ctx.now, so the engine stays pure.
 * Draw offers: one pending offer; it lapses when the other side moves or
 * declines; at most 3 offers per player per game.
 * Rematch: both players ask (a bot always agrees); colours swap.
 */

const C = require("./common");
const R = require("./chessRules");

const GAME = "chess";
const LEVELS = ["easy", "medium", "hard"];
const MAX_OFFERS = 3;

const DEFAULTS = Object.freeze({
  timeControl: null, // { initialMs, incrementMs } or "5+0" / "10+5"
  firstMoveMs: 30000,
  idleMs: 15 * 60000, // untimed games: an idle human's move is played by the bot after this
  botLevel: "medium",
  whiteSeat: "random",
  startFen: null,
  botDelayMs: [250, 450],
});

function parseTimeControl(tc) {
  if (tc == null) return null;
  if (typeof tc === "string") {
    const m = /^(\d{1,3})\+(\d{1,3})$/.exec(tc.trim());
    if (!m) return undefined;
    const minutes = Number(m[1]);
    const inc = Number(m[2]);
    if (minutes < 1 || minutes > 180 || inc > 180) return undefined;
    return { initialMs: minutes * 60000, incrementMs: inc * 1000 };
  }
  if (typeof tc === "object" && C.isInt(tc.initialMs) && C.isInt(tc.incrementMs)) {
    if (tc.initialMs < 10000 || tc.initialMs > 3 * 3600000 || tc.incrementMs < 0 || tc.incrementMs > 180000) return undefined;
    return { initialMs: tc.initialMs, incrementMs: tc.incrementMs };
  }
  return undefined;
}

function create(options = {}) {
  const o = { ...DEFAULTS };
  if (options.timeControl !== undefined) {
    const tc = parseTimeControl(options.timeControl);
    if (tc !== undefined) o.timeControl = tc;
  }
  if (C.isInt(options.firstMoveMs)) o.firstMoveMs = Math.min(300000, Math.max(5000, options.firstMoveMs));
  if (C.isInt(options.idleMs)) o.idleMs = Math.min(3600000, Math.max(30000, options.idleMs));
  if (LEVELS.includes(options.botLevel)) o.botLevel = options.botLevel;
  if (options.whiteSeat === 0 || options.whiteSeat === 1) o.whiteSeat = options.whiteSeat;
  if (typeof options.startFen === "string") {
    const p = new R.Position();
    if (!p.loadFen(options.startFen) && p.legalMoves().length > 0) o.startFen = p.toFen();
  }
  if (Array.isArray(options.botDelayMs) && options.botDelayMs.length === 2 && options.botDelayMs.every(C.isInt)) o.botDelayMs = options.botDelayMs.slice();
  return {
    game: GAME,
    v: 1,
    options: o,
    phase: "waiting",
    seq: 0,
    seats: [C.emptySeat(), C.emptySeat()],
    members: {},
    whiteSeat: 0,
    fen: o.startFen || R.START_FEN,
    startFen: o.startFen || R.START_FEN,
    moves: [],
    repCounts: {},
    searchKeys: [],
    clock: null,
    drawOffer: null,
    offers: [0, 0],
    result: null,
    tally: [0, 0],
    games: 0,
    rematch: [false, false],
  };
}

// ---------------------------------------------------------------- helpers

function colorOfSeat(state, seatIdx) {
  return seatIdx === state.whiteSeat ? R.WHITE : R.BLACK;
}

function seatOfColor(state, color) {
  return color === R.WHITE ? state.whiteSeat : 1 - state.whiteSeat;
}

function position(state) {
  return R.Position.fromFen(state.fen);
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
    return standUp(state, cur);
  }
  if (!C.isInt(index) || index < 0 || index > 1) return C.fail(state, "bad_seat");
  if (cur === index) return C.ok(state);
  if (state.phase === "playing") return C.fail(state, "in_game");
  const t = state.seats[index];
  if (t.playerId && t.kind !== "bot") return C.fail(state, "seat_taken");
  const s = C.clone(state);
  if (cur >= 0) s.seats[cur] = C.emptySeat();
  s.seats[index] = C.humanSeat(id, s.members[id].name);
  s.rematch = [false, false];
  s.seq++;
  return C.ok(s, [{ type: "seat", seat: index, playerId: id }]);
}

/** Leaving a running game resigns it. */
function standUp(state, cur) {
  let s = C.clone(state);
  const events = [];
  if (s.phase === "playing") endGame(s, { winner: 1 - cur, reason: "left" }, events);
  s.seats[cur] = C.emptySeat();
  s.rematch = [false, false];
  events.push({ type: "seat", seat: cur, playerId: null });
  s.seq++;
  return C.ok(s, events);
}

function leave(state, playerId) {
  const id = C.cleanPlayerId(playerId);
  if (!id || !state.members[id]) return C.fail(state, "not_member");
  let res = C.ok(state);
  const cur = C.seatOf(state, id);
  if (cur >= 0) res = standUp(state, cur);
  const s = res.state === state ? C.clone(state) : res.state;
  delete s.members[id];
  return C.ok(s, [...res.events, { type: "member", op: "leave", playerId: id }]);
}

function setPresence(state, playerId, patch) {
  return C.setPresence(state, playerId, patch);
}

// ---------------------------------------------------------------- start

function start(state, playerId, ctx = {}) {
  if (state.phase === "playing") return C.fail(state, "already_started");
  if (playerId !== C.SYSTEM && C.seatOf(state, playerId) < 0) return C.fail(state, "not_seated");
  if (!state.seats.some((x) => x.kind === "human")) return C.fail(state, "not_enough_players");
  const s = C.clone(state);
  for (let i = 0; i < 2; i++) if (!s.seats[i].playerId) s.seats[i] = C.botSeat(i, s.options.botLevel);
  if (s.games === 0) s.whiteSeat = s.options.whiteSeat === "random" ? C.rngOf(ctx).int(2) : s.options.whiteSeat;
  else s.whiteSeat = 1 - s.whiteSeat; // rematch: colours swap
  const events = [];
  newGame(s, C.nowOf(ctx), events);
  return C.ok(s, events);
}

function newGame(s, now, events) {
  const pos = R.Position.fromFen(s.startFen);
  s.fen = pos.toFen();
  s.moves = [];
  s.repCounts = { [R.repetitionKey(pos)]: 1 };
  s.searchKeys = [pos.key()];
  s.drawOffer = null;
  s.offers = [0, 0];
  s.result = null;
  s.rematch = [false, false];
  const tc = s.options.timeControl;
  s.clock = tc ? { ms: [tc.initialMs, tc.initialMs], turnStartedAt: now } : { ms: null, turnStartedAt: now };
  s.phase = "playing";
  s.seq++;
  events.push({ type: "gameStart", whiteSeat: s.whiteSeat, fen: s.fen, timeControl: tc });
}

// ---------------------------------------------------------------- actions

const FREE_ACTIONS = new Set(["offerDraw", "acceptDraw", "declineDraw", "rematch", "flag"]);

function apply(state, playerId, action, ctx = {}) {
  if (!action || typeof action !== "object" || typeof action.type !== "string") return C.fail(state, "bad_action");
  const now = C.nowOf(ctx);
  if (playerId === C.SYSTEM) {
    if (action.type === "flag") return flag(state, now);
    if (action.type === "abort") return abortGame(state);
    return C.fail(state, "bad_action");
  }
  const me = C.seatOf(state, playerId);
  if (me < 0) return C.fail(state, "not_seated");
  switch (action.type) {
    case "start":
      return start(state, playerId, ctx);
    case "rematch":
      return rematch(state, me, ctx);
    case "flag":
      return flag(state, now);
    default:
      break;
  }
  if (state.phase !== "playing") return C.fail(state, "not_playing");
  switch (action.type) {
    case "move":
      return move(state, me, action, now);
    case "resign": {
      const s = C.clone(state);
      const events = [{ type: "resign", seat: me }];
      endGame(s, { winner: 1 - me, reason: "resign" }, events);
      s.seq++;
      return C.ok(s, events);
    }
    case "offerDraw":
      return offerDraw(state, me);
    case "acceptDraw":
      return answerDraw(state, me, true);
    case "declineDraw":
      return answerDraw(state, me, false);
    default:
      return C.fail(state, "bad_action");
  }
}

function resolveMove(pos, action) {
  if (typeof action.uci === "string") return R.moveFromUci(pos, action.uci);
  if (typeof action.san === "string") return R.moveFromSan(pos, action.san);
  if (typeof action.from === "string" && typeof action.to === "string") return R.moveFromCoords(pos, action.from, action.to, action.promotion || null);
  return 0;
}

function move(state, me, action, now) {
  const color = colorOfSeat(state, me);
  const pos = position(state);
  if (pos.side !== color) return C.fail(state, "not_your_turn");
  if (action.promotion != null && !/^[qrbn]$/i.test(String(action.promotion))) return C.fail(state, "bad_promotion");
  const m = resolveMove(pos, action);
  if (!m) return C.fail(state, "illegal_move");
  const s = C.clone(state);
  const events = [];
  // Clock: the mover's time runs from the second move of the game on.
  const timed = Boolean(s.options.timeControl);
  if (timed && s.moves.length >= 2) {
    const left = s.clock.ms[color] - Math.max(0, now - s.clock.turnStartedAt);
    if (left <= 0) {
      s.clock.ms[color] = 0;
      flagFall(s, color, events);
      s.seq++;
      return C.ok(s, events);
    }
    s.clock.ms[color] = left + s.options.timeControl.incrementMs;
  }
  s.clock.turnStartedAt = now;
  const legal = pos.legalMoves();
  const san = R.sanOf(pos, m, legal);
  const uci = R.uci(m);
  pos.make(m);
  s.fen = pos.toFen();
  s.moves.push({ san, uci, seat: me });
  const key = R.repetitionKey(pos);
  s.repCounts[key] = (s.repCounts[key] || 0) + 1;
  s.searchKeys.push(pos.key());
  if (s.drawOffer !== null && s.drawOffer !== me) s.drawOffer = null; // moving declines the opponent's offer
  events.push({ type: "move", seat: me, san, uci, fen: s.fen, check: pos.inCheck(), clock: s.clock.ms ? s.clock.ms.slice() : null });
  const status = gameStatus(pos, s.repCounts[key]);
  if (status) endGame(s, status.winnerColor === undefined ? { winner: null, reason: status.reason } : { winner: seatOfColor(s, status.winnerColor), reason: status.reason }, events);
  s.seq++;
  return C.ok(s, events);
}

/** Result of the position after a move, or null when play goes on. */
function gameStatus(pos, repCount) {
  const legal = pos.legalMoves();
  if (legal.length === 0) {
    if (pos.inCheck()) return { reason: "checkmate", winnerColor: pos.side ^ 1 };
    return { reason: "stalemate" };
  }
  if (R.insufficientMaterial(pos)) return { reason: "insufficient_material" };
  if (repCount >= 3) return { reason: "threefold_repetition" };
  if (pos.half >= 100) return { reason: "fifty_move_rule" };
  return null;
}

function flagFall(s, color, events) {
  const pos = position(s);
  const other = color ^ 1;
  if (!R.canMate(pos, other)) endGame(s, { winner: null, reason: "timeout_vs_insufficient_material" }, events);
  else endGame(s, { winner: seatOfColor(s, other), reason: "timeout" }, events);
}

/** Anyone (or the server timer) may claim a fallen flag; checked against ctx.now. */
function flag(state, now) {
  if (state.phase !== "playing" || !state.options.timeControl || state.moves.length < 2) return C.fail(state, "no_flag");
  const pos = position(state);
  const color = pos.side;
  const left = state.clock.ms[color] - Math.max(0, now - state.clock.turnStartedAt);
  if (left > 0) return C.fail(state, "time_left");
  const s = C.clone(state);
  s.clock.ms[color] = 0;
  const events = [];
  flagFall(s, color, events);
  s.seq++;
  return C.ok(s, events);
}

function abortGame(state) {
  if (state.phase !== "playing" || state.moves.length >= 2) return C.fail(state, "cannot_abort");
  const s = C.clone(state);
  const events = [];
  endGame(s, { winner: null, reason: "aborted", aborted: true }, events);
  s.seq++;
  return C.ok(s, events);
}

function endGame(s, { winner, reason, aborted = false }, events) {
  const score = winner === null ? "1/2-1/2" : colorOfSeat(s, winner) === R.WHITE ? "1-0" : "0-1";
  s.result = { winner, reason, score: aborted ? "*" : score, aborted };
  if (!aborted) {
    s.games++;
    if (winner === null) {
      s.tally[0] += 0.5;
      s.tally[1] += 0.5;
    } else s.tally[winner] += 1;
  }
  s.drawOffer = null;
  s.phase = "over";
  events.push({ type: "gameOver", ...s.result, tally: s.tally.slice() });
}

function offerDraw(state, me) {
  if (state.drawOffer === me) return C.fail(state, "already_offered");
  if (state.drawOffer !== null) return answerDraw(state, me, true); // both offered: agreed
  if (state.offers[me] >= MAX_OFFERS) return C.fail(state, "too_many_offers");
  const s = C.clone(state);
  s.drawOffer = me;
  s.offers[me]++;
  s.seq++;
  return C.ok(s, [{ type: "drawOffer", seat: me }]);
}

function answerDraw(state, me, accept) {
  if (state.drawOffer === null || state.drawOffer === me) return C.fail(state, "no_offer");
  const s = C.clone(state);
  const events = [{ type: accept ? "drawAccepted" : "drawDeclined", seat: me }];
  if (accept) endGame(s, { winner: null, reason: "agreement" }, events);
  else s.drawOffer = null;
  s.seq++;
  return C.ok(s, events);
}

function rematch(state, me, ctx) {
  if (state.phase !== "over") return C.fail(state, "not_over");
  if (state.seats.some((x) => !x.playerId)) return C.fail(state, "seat_empty");
  const s = C.clone(state);
  s.rematch[me] = true;
  for (let i = 0; i < 2; i++) if (s.seats[i].kind === "bot") s.rematch[i] = true;
  s.seq++;
  const events = [{ type: "rematch", seat: me }];
  if (s.rematch[0] && s.rematch[1]) {
    const r = start(s, C.SYSTEM, ctx);
    return C.ok(r.state, events.concat(r.events));
  }
  return C.ok(s, events);
}

// ---------------------------------------------------------------- timers and bot

function timers(state) {
  if (state.phase !== "playing") return [];
  const o = state.options;
  const pos = position(state);
  const toMove = seatOfColor(state, pos.side);
  const seatRec = state.seats[toMove];
  const n = state.moves.length;
  const out = [];
  if (C.botControlled(seatRec)) {
    out.push({ key: `bot:${n}`, kind: "bot", playerId: seatRec.playerId, ms: C.delayFor(`chess:${n}:${state.games}`, o.botDelayMs[0], o.botDelayMs[1]) });
  } else if (n < 2) {
    out.push({ key: `first:${n}`, kind: "system", playerId: C.SYSTEM, ms: o.firstMoveMs, action: { type: "abort" } });
  } else if (!o.timeControl) {
    out.push({ key: `idle:${n}`, kind: "bot", playerId: seatRec.playerId, ms: o.idleMs });
  }
  if (o.timeControl && n >= 2) {
    out.push({ key: `flag:${n}`, kind: "system", playerId: C.SYSTEM, ms: Math.max(0, state.clock.ms[pos.side]), action: { type: "flag" } });
  }
  if (state.drawOffer !== null && C.botControlled(state.seats[1 - state.drawOffer])) {
    const bot = state.seats[1 - state.drawOffer];
    out.push({ key: `draw:${n}:${state.offers.join(",")}`, kind: "bot", playerId: bot.playerId, ms: 1200 });
  }
  return out;
}

/**
 * Bot decision. Returns an action, or a Promise of one when the search runs in
 * the worker (ctx.chessRunner, or the shared runner unless ctx.syncBot).
 */
function botAction(state, playerId, ctx = {}) {
  const me = C.seatOf(state, playerId);
  if (me < 0 || state.phase !== "playing") return null;
  const pos = position(state);
  const color = colorOfSeat(state, me);
  if (state.drawOffer !== null && state.drawOffer !== me) {
    // Accept when clearly worse or when the position is dead even and long.
    const ev = require("./chessBot").evaluate(pos) * (pos.side === color ? 1 : -1);
    const accept = ev < -150 || (state.moves.length > 80 && Math.abs(ev) < 30);
    if (pos.side !== color || accept) return { type: accept ? "acceptDraw" : "declineDraw" };
  }
  if (pos.side !== color) return null;
  const level = state.seats[me].kind === "bot" ? state.seats[me].level : state.options.botLevel;
  const remaining = state.options.timeControl && state.moves.length >= 2 ? state.clock.ms[color] : Infinity;
  const Bot = require("./chessBot");
  const budget = Bot.budgetFor(level, remaining);
  const history = state.searchKeys.slice(0, -1);
  if (ctx.syncBot) {
    const rng = C.rngOf(ctx);
    const r = Bot.search(state.fen, { ...budget, ...(ctx.botBudget || {}), historyKeys: history, random: () => rng.float() });
    return r.move ? { type: "move", uci: r.move } : null;
  }
  const runner = ctx.chessRunner || sharedRunner();
  return runner.think(state.fen, { ...budget, historyKeys: history }).then((r) => (r && r.move ? { type: "move", uci: r.move } : null));
}

let shared = null;
function sharedRunner() {
  if (!shared) shared = require("./chessBot").createRunner();
  return shared;
}

// ---------------------------------------------------------------- views

function boardArray(pos) {
  const out = [];
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const p = pos.b[rank * 16 + file];
      if (!p) out.push(null);
      else {
        const ch = R.PIECE_CHARS[R.typeOf(p)];
        out.push(R.colorOf(p) === R.WHITE ? ch.toUpperCase() : ch);
      }
    }
  }
  return out; // a8..h8, a7..h7, ... a1..h1
}

function publicView(state) {
  const pos = position(state);
  const last = state.moves[state.moves.length - 1] || null;
  const tc = state.options.timeControl;
  return {
    game: GAME,
    phase: state.phase,
    seq: state.seq,
    options: { timeControl: tc, firstMoveMs: state.options.firstMoveMs },
    seats: state.seats.map((x, i) => ({ ...C.publicSeat(x, i), color: colorOfSeat(state, i) === R.WHITE ? "white" : "black" })),
    fen: state.fen,
    board: boardArray(pos),
    turn: pos.side === R.WHITE ? "white" : "black",
    check: pos.inCheck(),
    moves: state.moves.map((x) => x.san),
    lastMove: last ? { uci: last.uci, san: last.san } : null,
    clock: tc && state.clock ? { white: state.clock.ms[R.WHITE], black: state.clock.ms[R.BLACK], running: state.phase === "playing" && state.moves.length >= 2 ? (pos.side === R.WHITE ? "white" : "black") : null, since: state.clock.turnStartedAt } : null,
    drawOffer: state.drawOffer,
    result: state.result,
    tally: state.tally.slice(),
    games: state.games,
    rematch: state.rematch.slice(),
    you: null,
  };
}

function viewFor(state, playerId) {
  const v = publicView(state);
  const me = C.seatOf(state, playerId);
  if (me < 0) return v;
  const color = colorOfSeat(state, me);
  const you = { seat: me, color: color === R.WHITE ? "white" : "black", legal: [], canOfferDraw: false };
  if (state.phase === "playing") {
    const pos = position(state);
    if (pos.side === color) {
      const legal = pos.legalMoves();
      you.legal = legal.map((m) => ({ from: R.sqName(R.mFrom(m)), to: R.sqName(R.mTo(m)), promotion: R.mPromo(m) ? R.PIECE_CHARS[R.mPromo(m)] : null, san: R.sanOf(pos, m, legal) }));
    }
    you.canOfferDraw = state.drawOffer === null && state.offers[me] < MAX_OFFERS;
  }
  v.you = you;
  return v;
}

/** PGN text of the current game (Seven Tag Roster plus FEN when not the start position). */
function toPgn(state, { event = "Descall", date = null } = {}) {
  const white = state.seats[state.whiteSeat].name || "White";
  const black = state.seats[1 - state.whiteSeat].name || "Black";
  const res = state.result ? state.result.score : "*";
  const tags = [
    ["Event", event],
    ["Site", "Descall"],
    ["Date", date || "????.??.??"],
    ["Round", String(state.games + (state.phase === "playing" ? 1 : 0))],
    ["White", white],
    ["Black", black],
    ["Result", res],
  ];
  if (state.startFen !== R.START_FEN) tags.push(["SetUp", "1"], ["FEN", state.startFen]);
  const start = R.Position.fromFen(state.startFen);
  let n = start.full;
  let side = start.side;
  let body = "";
  state.moves.forEach((mv, i) => {
    if (side === R.WHITE) body += `${n}. `;
    else if (i === 0) body += `${n}... `;
    body += mv.san + " ";
    if (side === R.BLACK) n++;
    side ^= 1;
  });
  return tags.map(([k, v]) => `[${k} "${String(v).replace(/["\\]/g, "")}"]`).join("\n") + "\n\n" + (body + res).trim() + "\n";
}

function scores(state) {
  return state.seats.map((x, i) => ({ seat: i, playerId: x.playerId, name: x.name, kind: x.kind, score: state.tally[i] }));
}

module.exports = {
  GAME,
  DEFAULTS,
  FREE_ACTIONS,
  parseTimeControl,
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
  toPgn,
  gameStatus,
};
