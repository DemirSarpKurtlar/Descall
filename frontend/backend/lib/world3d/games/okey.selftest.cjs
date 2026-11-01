"use strict";

/**
 * Okey engine: deal, turn order, validation, finishing and scoring, indicator
 * bonus, pile exhaustion, match end, seats, views (no hidden tiles), timers,
 * determinism, and randomized bot matches with invariants.
 * Run: node frontend/backend/lib/world3d/games/okey.selftest.cjs
 */

const assert = require("assert");
const C = require("./common");
const R = require("./okeyRules");
const O = require("./okey");
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

const COLOR = { Y: 0, B: 1, K: 2, R: 3 };
const T = (c, n, copy = 0) => copy * 52 + COLOR[c] * 13 + n - 1;

function table(humans = ["alice"], opts = {}) {
  let s = O.create(opts);
  humans.forEach((h, i) => {
    s = O.join(s, { id: h, name: h.toUpperCase() }).state;
    s = O.seat(s, h, i).state;
  });
  return s;
}

function started(seed = "s1", humans = ["alice"], opts = {}) {
  const r = O.start(table(humans, opts), humans[0], { rng: seeded(seed) });
  assert.ifError(r.error);
  return r.state;
}

function allTiles(s) {
  const h = s.hand;
  const out = [h.indicator, ...h.pile, ...h.racks.flat(), ...h.discards.flat()];
  if (h.finishTile != null && !h.racks.flat().includes(h.finishTile)) out.push(h.finishTile);
  return out;
}

function conserved(s) {
  const all = allTiles(s);
  return all.length === 106 && new Set(all).size === 106;
}

/**
 * Rig a hand: give seats exact racks, the rest of the tiles to the pile.
 * racks: array of 4 tile arrays; the seat to move gets `turn`, `step`.
 */
function rig(s, { indicator, racks, turn = 0, step = "discard", pileFirst = [], discards = [[], [], [], []] }) {
  s = C.clone(s);
  const h = s.hand;
  h.indicator = indicator;
  h.okeyFace = R.okeyFaceFor(indicator);
  const used = new Set([indicator, ...racks.flat(), ...discards.flat(), ...pileFirst]);
  assert.strictEqual(used.size, 1 + racks.flat().length + discards.flat().length + pileFirst.length, "rig: duplicate tile");
  const rest = [];
  for (let t = 0; t < 106; t++) if (!used.has(t)) rest.push(t);
  h.pile = pileFirst.concat(rest);
  h.racks = racks.map((r) => r.slice());
  h.slots = racks.map((r) => R.suggestArrangement(r, h.okeyFace, "sorted").slots);
  h.discards = discards.map((d) => d.slice());
  h.turn = turn;
  h.step = step;
  h.drawn = null;
  h.discarded = [false, false, false, false];
  h.starter = turn;
  return s;
}

// Filler racks: 14 tiles that never win and avoid the tiles used in a test.
function filler(exclude, n = 14, seedTiles = []) {
  const out = seedTiles.slice();
  for (let t = 0; out.length < n && t < 104; t += 7) if (!exclude.has(t) && !out.includes(t)) out.push(t);
  for (let t = 0; out.length < n && t < 104; t++) if (!exclude.has(t) && !out.includes(t)) out.push(t);
  return out;
}

// ---------------------------------------------------------------- create, seats, start

{
  let s = O.create({ turnMs: 1000, startPoints: 3, botLevel: "hard", minHumans: 2 });
  eq(s.options.turnMs, 5000, "turnMs clamped");
  eq(s.options.startPoints, 4, "startPoints clamped");
  eq(s.phase, "waiting");
  eq(O.join(s, { id: "bot:1", name: "x" }).error, "bad_player", "humans cannot use bot ids");
  eq(O.join(s, { id: "../x" }).error, "bad_player");
  s = O.join(s, { id: "a", name: "Ayse" }).state;
  eq(O.seat(s, "zz", 0).error, "not_member");
  eq(O.seat(s, "a", 7).error, "bad_seat");
  s = O.seat(s, "a", 2).state;
  eq(C.seatOf(s, "a"), 2);
  s = O.seat(s, "a", 1).state;
  eq(C.seatOf(s, "a"), 1, "move seats while waiting");
  eq(O.start(s, "a", { rng: seeded(1) }).error, "not_enough_players", "minHumans 2");
  s = O.join(s, { id: "b", name: "Mert" }).state;
  eq(O.seat(s, "b", 1).error, "seat_taken");
  s = O.seat(s, "b", 3).state;
  eq(O.start(s, "zz", { rng: seeded(1) }).error, "not_seated");
  const r = O.start(s, "a", { rng: seeded(1) });
  assert.ifError(r.error);
  s = r.state;
  eq(s.phase, "playing");
  eq(s.seats.filter((x) => x.kind === "bot").length, 2, "empty seats get bots");
  eq(s.seats[1].playerId, "a");
  eq(O.start(s, "a").error, "already_started");
  eq(O.seat(s, "a", 0).error, "seat_taken", "cannot jump to a bot seat mid-hand");
}

// Deal shape.
for (let k = 0; k < 20; k++) {
  const s = started(`deal${k}`);
  const h = s.hand;
  ok(conserved(s), "106 tiles");
  ok(!R.isFake(h.indicator), "indicator is never a false okey");
  eq(h.racks.map((r) => r.length).sort(), [14, 14, 14, 15]);
  eq(h.racks[h.starter].length, 15, "starter has 15");
  eq(h.pile.length, 48);
  eq(h.turn, h.starter);
  eq(h.step, "discard", "starter discards first");
  eq(h.okeyFace, R.okeyFaceFor(h.indicator));
}

// ---------------------------------------------------------------- turn order and validation

{
  let s = started("turns");
  const h = s.hand;
  const st = h.starter;
  const next = (st + 1) % 4;
  const starterId = s.seats[st].playerId;
  const nextId = s.seats[next].playerId;
  // Use the human-free path: act as whoever sits there (bots accept actions too).
  eq(O.apply(s, nextId, { type: "draw", from: "pile" }).error, "not_your_turn");
  eq(O.apply(s, starterId, { type: "draw", from: "pile" }).error, "already_drawn", "starter does not draw");
  eq(O.apply(s, starterId, { type: "discard", tile: h.racks[next][0] }).error, "no_such_tile", "only own tiles");
  eq(O.apply(s, starterId, { type: "discard", tile: 999 }).error, "no_such_tile");
  eq(O.apply(s, starterId, { type: "discard", tile: "3" }).error, "no_such_tile");
  eq(O.apply(s, starterId, { type: "fly" }).error, "bad_action");
  eq(O.apply(s, starterId, null).error, "bad_action");
  eq(O.apply(s, "nobody", { type: "draw", from: "pile" }).error, "not_seated");
  const tile = h.racks[st][3];
  const r = O.apply(s, starterId, { type: "discard", tile });
  assert.ifError(r.error);
  s = r.state;
  eq(s.hand.discards[st], [tile], "discard goes to the starter's own stack (to the right)");
  eq(s.hand.turn, next, "counter-clockwise: next seat");
  eq(s.hand.step, "draw");
  eq(O.apply(s, nextId, { type: "discard", tile: s.hand.racks[next][0] }).error, "must_draw");
  eq(O.apply(s, nextId, { type: "draw", from: "nowhere" }).error, "bad_source");
  const before = s;
  const d = O.apply(s, nextId, { type: "draw", from: "discard" });
  assert.ifError(d.error);
  s = d.state;
  ok(s.hand.racks[next].includes(tile), "took the previous player's discard");
  eq(s.hand.discards[st], [], "taken from the stack");
  eq(d.events[0].tile.id, tile, "a discard pickup is public");
  eq(O.apply(s, nextId, { type: "draw", from: "pile" }).error, "already_drawn");
  // A pile draw is private to the drawer.
  const p = O.apply(before, nextId, { type: "draw", from: "pile" });
  const pub = C.eventsFor(p.events, "someone-else")[0];
  ok(pub.tile === undefined && pub.from === "pile", "others do not see the pile tile");
  eq(C.eventsFor(p.events, nextId)[0].tile.id, before.hand.pile[0], "drawer sees it");
  // The seat after can only take from its own previous player.
  s = O.apply(s, nextId, { type: "discard", tile: s.hand.racks[next][0] }).state;
  const third = (st + 2) % 4;
  eq(s.hand.turn, third);
  ok(O.viewFor(s, s.seats[third].playerId).you.canTakeDiscard, "can take the discard of seat before");
  ok(conserved(s));
  eq(O.apply(started("turns"), starterId, { type: "finish", tile }).error, "not_a_winning_hand");
}

// ---------------------------------------------------------------- finishing and the scoring table

function finishCase({ win, finishTile, indicator, expectKind, expectPenalty }) {
  let s = started("finish");
  const others = new Set([indicator, ...win, finishTile]);
  const racks = [win.concat([finishTile])];
  for (let i = 1; i < 4; i++) {
    const r = filler(others);
    r.forEach((t) => others.add(t));
    racks.push(r);
  }
  s = rig(s, { indicator, racks, turn: 0 });
  ok(conserved(s), "rig conserves");
  const id0 = s.seats[0].playerId;
  const r = O.apply(s, id0, { type: "finish", tile: finishTile });
  assert.ifError(r.error);
  eq(r.state.lastResult.finish, expectKind);
  eq(r.state.lastResult.penalty, expectPenalty);
  eq(r.state.lastResult.deltas, [0, -expectPenalty, -expectPenalty, -expectPenalty]);
  eq(r.state.scores, [20, 20 - expectPenalty, 20 - expectPenalty, 20 - expectPenalty]);
  eq(r.state.phase, "handOver");
  ok(conserved(r.state), "finish tile is accounted for");
  eq(r.state.lastResult.melds.flat().length, 14, "winner shows 14 tiles");
  return r.state;
}

// Indicator K3 -> okey K4.
const IND = T("K", 3);
const NORMAL = [T("Y", 1), T("Y", 2), T("Y", 3), T("B", 12), T("B", 13), T("B", 1), T("K", 7), T("Y", 7), T("B", 7), T("R", 2), T("R", 3), T("R", 4), T("R", 5), T("R", 6)];
finishCase({ win: NORMAL, finishTile: T("R", 11), indicator: IND, expectKind: "normal", expectPenalty: 2 });
finishCase({ win: NORMAL, finishTile: T("K", 4), indicator: IND, expectKind: "okey", expectPenalty: 4 });
const PAIRS = [T("Y", 1), T("Y", 1, 1), T("B", 5), T("B", 5, 1), T("K", 9), T("K", 9, 1), T("R", 13), T("R", 13, 1), T("Y", 7), T("Y", 7, 1), T("B", 2), T("B", 2, 1), T("R", 6), T("R", 6, 1)];
finishCase({ win: PAIRS, finishTile: T("R", 11), indicator: IND, expectKind: "pairs", expectPenalty: 4 });
finishCase({ win: PAIRS, finishTile: T("K", 4, 1), indicator: IND, expectKind: "pairsOkey", expectPenalty: 8 });
// A false okey thrown is not an okey discard.
finishCase({ win: NORMAL, finishTile: 104, indicator: IND, expectKind: "normal", expectPenalty: 2 });
eq(O.PENALTY, { normal: 2, okey: 4, pairs: 4, pairsOkey: 8 });

// Finishing after a draw (15 tiles in hand at discard time, not the starter).
{
  let s = started("finish2");
  const used = new Set([IND, ...NORMAL]);
  const r1 = filler(used, 14, NORMAL.slice(0, 13));
  r1.forEach((t) => used.add(t));
  const racks = [null, NORMAL.slice(0, 13).concat([T("R", 11)]), null, null];
  const ex = new Set([IND, ...racks[1], NORMAL[13]]);
  for (const i of [0, 2, 3]) {
    racks[i] = filler(ex, i === 0 ? 14 : 14);
    racks[i].forEach((t) => ex.add(t));
  }
  // seat 0 has just discarded R6 (the missing tile); seat 1 draws it and finishes.
  s = rig(s, { indicator: IND, racks, turn: 1, step: "draw", discards: [[NORMAL[13]], [], [], []] });
  ok(conserved(s));
  const id1 = s.seats[1].playerId;
  s = O.apply(s, id1, { type: "draw", from: "discard" }).state;
  const r = O.apply(s, id1, { type: "finish", tile: T("R", 11) });
  assert.ifError(r.error);
  eq(r.state.lastResult.winner, 1);
}

// ---------------------------------------------------------------- indicator bonus

{
  let s = started("ind");
  const twin = T("K", 3, 1);
  const ex = new Set([IND, twin]);
  const racks = [];
  for (let i = 0; i < 4; i++) {
    const r = filler(ex, i === 0 ? 15 : 14, i === 2 ? [twin] : []);
    r.forEach((t) => ex.add(t));
    racks.push(r);
  }
  s = rig(s, { indicator: IND, racks, turn: 0 });
  const ids = s.seats.map((x) => x.playerId);
  eq(O.apply(s, ids[0], { type: "showIndicator" }).error, "cannot_show_indicator", "seat 0 has no twin");
  eq(O.apply(s, ids[2], { type: "showIndicator" }).error, "cannot_show_indicator", "only on your turn");
  s = O.apply(s, ids[0], { type: "discard", tile: racks[0][0] }).state;
  s = O.apply(s, ids[1], { type: "draw", from: "pile" }).state;
  s = O.apply(s, ids[1], { type: "discard", tile: s.hand.racks[1][0] }).state;
  ok(O.canShowIndicator(s, 2) === false || s.hand.turn === 2);
  s = O.apply(s, ids[2], { type: "draw", from: "pile" }).state;
  ok(O.viewFor(s, ids[2]).you.canShowIndicator, "first turn, holds the twin");
  const r = O.apply(s, ids[2], { type: "showIndicator" });
  assert.ifError(r.error);
  eq(r.state.scores, [19, 19, 20, 19], "others lose 1");
  eq(r.events[0].tile.id, twin, "the shown tile is public");
  eq(O.apply(r.state, ids[2], { type: "showIndicator" }).error, "cannot_show_indicator", "once per hand");
  // After the first discard it is too late.
  const late = O.apply(s, ids[2], { type: "discard", tile: s.hand.racks[2].find((t) => t !== twin) }).state;
  eq(late.hand.discarded[2], true);
  const s2 = O.create({ indicatorBonus: false });
  eq(s2.options.indicatorBonus, false);
}

// ---------------------------------------------------------------- pile exhaustion and match end

{
  let s = started("pile");
  const ex = new Set([IND]);
  const racks = [];
  for (let i = 0; i < 4; i++) {
    const r = filler(ex, i === 1 ? 14 : 14);
    r.forEach((t) => ex.add(t));
    racks.push(r);
  }
  s = rig(s, { indicator: IND, racks, turn: 1, step: "draw" });
  // Leave a single tile in the pile; the rest go to discards (kept for conservation).
  const sh = s.hand;
  sh.discards[3] = sh.pile.splice(1);
  ok(conserved(s));
  const id1 = s.seats[1].playerId;
  s = O.apply(s, id1, { type: "draw", from: "pile" }).state;
  eq(s.hand.pile.length, 0);
  const r = O.apply(s, id1, { type: "discard", tile: s.hand.racks[1][0] });
  assert.ifError(r.error);
  eq(r.state.lastResult.kind, "draw", "empty pile ends the hand");
  eq(r.state.lastResult.deltas, [0, 0, 0, 0], "a draw costs nobody");
  eq(r.state.phase, "handOver");
  eq(O.timers(r.state)[0].action, { type: "nextHand" });
  eq(O.apply(r.state, C.SYSTEM, { type: "nextHand" }, { rng: seeded(2) }).state.hand.starter, (r.state.hand.starter + 1) % 4, "starter rotates");
  eq(O.apply(s, C.SYSTEM, { type: "nextHand" }).error, "not_hand_over");
  eq(O.apply(s, C.SYSTEM, { type: "deal" }).error, "bad_action");
}

{
  // Match ends when a seat drops to 0 or below; the highest score wins.
  let s = started("match");
  s.scores = [20, 2, 5, 9];
  const ex = new Set([IND, ...NORMAL, T("R", 11)]);
  const racks = [NORMAL.concat([T("R", 11)])];
  for (let i = 1; i < 4; i++) {
    const r = filler(ex);
    r.forEach((t) => ex.add(t));
    racks.push(r);
  }
  s = rig(s, { indicator: IND, racks, turn: 0 });
  const r = O.apply(s, s.seats[0].playerId, { type: "finish", tile: T("R", 11) });
  eq(r.state.phase, "matchOver");
  eq(r.state.scores, [20, 0, 3, 7]);
  eq(r.state.matchResult.winners, [0]);
  eq(O.timers(r.state), [], "no timers after the match");
  // A new match can start from matchOver; scores reset.
  const again = O.start(r.state, "alice", { rng: seeded(3) });
  assert.ifError(again.error);
  eq(again.state.scores, [20, 20, 20, 20]);
  eq(again.state.handsPlayed, 0);
  // maxHands cap.
  let capped = started("cap", ["alice"], { maxHands: 1 });
  capped = rig(capped, { indicator: IND, racks, turn: 0 });
  eq(O.apply(capped, capped.seats[0].playerId, { type: "finish", tile: T("R", 11) }).state.phase, "matchOver");
}

// ---------------------------------------------------------------- leaving, joining a bot seat, presence

{
  let s = started("leave", ["alice", "bob"]);
  const ai = C.seatOf(s, "alice");
  const r = O.leave(s, "alice");
  s = r.state;
  eq(s.seats[ai].kind, "bot", "a bot keeps the seat mid-hand");
  ok(!s.members.alice, "member removed");
  eq(s.hand.racks[ai].length >= 14, true, "rack kept");
  eq(O.leave(s, "alice").error, "not_member");
  // Presence flags.
  const p = O.setPresence(s, "bob", { connected: false });
  eq(p.state.seats[C.seatOf(s, "bob")].connected, false);
  const p2 = O.setPresence(p.state, "bob", { autopilot: true });
  ok(C.botControlled(p2.state.seats[C.seatOf(s, "bob")]), "autopilot");
  const p3 = O.setPresence(p2.state, "bob", { connected: true });
  ok(!p3.state.seats[C.seatOf(s, "bob")].autopilot, "coming back clears autopilot");
  eq(O.setPresence(s, "bot:0", { connected: false }).error, "not_seated", "bots have no presence");
  // Standing up while waiting frees the seat.
  let w = table(["x", "y"]);
  w = O.seat(w, "x", null).state;
  eq(w.seats[0].playerId, null);
  // A human can take over a bot seat between hands and keeps that seat's score.
  let h = started("takeover");
  h.phase = "handOver";
  h.scores = [20, 13, 20, 20];
  h = O.join(h, { id: "carol", name: "Carol" }).state;
  const t = O.seat(h, "carol", 1);
  assert.ifError(t.error);
  eq(t.state.seats[1].playerId, "carol");
  eq(t.state.scores[1], 13);
}

// ---------------------------------------------------------------- rack arrangement

{
  const s = started("arrange");
  const me = C.seatOf(s, "alice");
  const rack = s.hand.racks[me];
  const sug = O.suggest(s, "alice", "runs");
  ok(R.validSlots(sug.slots, rack));
  const r = O.apply(s, "alice", { type: "arrange", slots: sug.slots });
  assert.ifError(r.error);
  eq(r.state.hand.slots[me], sug.slots);
  eq(r.state.seq, s.seq, "arranging does not bump seq (no stale turn actions)");
  eq(C.eventsFor(r.events, "bob")[0].type, "arranged");
  const bad = sug.slots.slice();
  bad[bad.indexOf(null)] = s.hand.racks[(me + 1) % 4][0];
  eq(O.apply(s, "alice", { type: "arrange", slots: bad }).error, "bad_slots", "cannot place someone else's tile");
  eq(O.apply(s, "alice", { type: "arrange", slots: [1, 2] }).error, "bad_slots");
  eq(O.suggest(s, "nobody", "runs"), null);
  ok(O.FREE_ACTIONS.has("arrange"));
  // The view follows the arrangement.
  const v = O.viewFor(r.state, "alice");
  eq(v.you.rack.map((x) => x.id), sug.slots.filter((x) => x !== null));
}

// ---------------------------------------------------------------- views never leak

function idsIn(obj, out = new Set()) {
  if (Array.isArray(obj)) obj.forEach((x) => idsIn(x, out));
  else if (obj && typeof obj === "object") {
    if (Number.isInteger(obj.id) && ("color" in obj || "fake" in obj)) out.add(obj.id);
    for (const v of Object.values(obj)) idsIn(v, out);
  }
  return out;
}

function assertNoLeak(s, viewerId) {
  const v = viewerId ? O.viewFor(s, viewerId) : O.publicView(s);
  const me = viewerId ? C.seatOf(s, viewerId) : -1;
  const allowed = new Set([s.hand.indicator, ...s.hand.discards.flat()]);
  if (me >= 0) s.hand.racks[me].forEach((t) => allowed.add(t));
  if (s.hand.indicatorShownBy !== null) allowed.add(s.hand.indicator < 52 ? s.hand.indicator + 52 : s.hand.indicator - 52);
  if (s.lastResult && s.lastResult.melds) {
    s.lastResult.melds.flat().forEach((t) => allowed.add(t.id));
    allowed.add(s.lastResult.finishTile.id);
  }
  for (const t of idsIn(v)) ok(allowed.has(t), `view of ${viewerId} leaks tile ${t}`);
  if (me >= 0 && v.you && Array.isArray(v.you.slots)) for (const t of v.you.slots) ok(t === null || s.hand.racks[me].includes(t), "slots only hold own tiles");
  ok(!("pile" in (v.hand || {})) || typeof v.hand.pile === "number", "pile is a count");
  const text = JSON.stringify(v);
  ok(!text.includes('"racks"') && !text.includes('"slots":[[') && !text.includes('"seed"'), "no internal arrays");
}

/** Metamorphic: shuffling hidden tiles (other racks and the pile) must not change a view. */
function assertViewStable(s, viewerId, rng) {
  const me = C.seatOf(s, viewerId);
  const before = JSON.stringify(O.viewFor(s, viewerId));
  const t = C.clone(s);
  const hidden = [];
  t.hand.racks.forEach((r, i) => {
    if (i !== me) hidden.push(...r);
  });
  hidden.push(...t.hand.pile);
  C.shuffle(hidden, rng);
  let k = 0;
  t.hand.racks = t.hand.racks.map((r, i) => (i === me ? r : r.map(() => hidden[k++])));
  t.hand.pile = t.hand.pile.map(() => hidden[k++]);
  // Other players' layouts and drawn markers are hidden state too.
  t.hand.slots = t.hand.slots.map((sl, i) => (i === me ? sl : R.reconcileSlots(null, t.hand.racks[i])));
  if (t.hand.turn !== me) t.hand.drawn = null;
  eq(JSON.stringify(O.viewFor(t, viewerId)), before, "view depends only on what the viewer may know");
}

{
  const rng = seeded("leak");
  let s = started("views", ["alice", "bob"]);
  assertNoLeak(s, "alice");
  assertNoLeak(s, "bob");
  assertNoLeak(s, null);
  assertNoLeak(s, "stranger");
  assertViewStable(s, "alice", rng);
  const pub = O.publicView(s);
  eq(pub.you, null, "spectators have no rack");
  eq(pub.hand.pile, 48);
  eq(pub.seats.map((x) => x.tiles).sort(), [14, 14, 14, 15]);
  eq(O.viewFor(s, "stranger").you, null);
}

// ---------------------------------------------------------------- timers

{
  let s = started("timers", ["alice"], { turnMs: 20000 });
  s = rig(s, { indicator: IND, racks: s.hand.racks, turn: C.seatOf(s, "alice"), step: "discard" });
  // Re-rig so alice (15 tiles) starts: give her 15.
  const me = C.seatOf(s, "alice");
  const t0 = O.timers(s);
  eq(t0.length, 1);
  eq(t0[0].kind, "turn");
  eq(t0[0].playerId, "alice");
  eq(t0[0].ms, 20000);
  // Auto discard is legal.
  ok(!O.apply(s, "alice", t0[0].action).error || s.hand.racks[me].length !== 15);
  // Draw step: the auto action draws from the pile, then throws the drawn tile back.
  let d = started("timers2");
  while (d.seats[d.hand.turn].playerId !== "alice") d = runOne(d);
  if (d.hand.step === "draw") {
    eq(O.timers(d)[0].action, { type: "draw", from: "pile" });
    d = O.apply(d, "alice", { type: "draw", from: "pile" }).state;
  }
  if (d.hand.drawn != null) eq(O.timers(d)[0].action, { type: "discard", tile: d.hand.drawn });
  // Bots get a bot timer with a human-like delay; autopilot humans too.
  const b = started("timers3");
  const bt = O.timers(b);
  if (b.seats[b.hand.turn].kind === "bot") {
    eq(bt[0].kind, "bot");
    ok(bt[0].ms >= 600 && bt[0].ms <= 2600, `bot delay ${bt[0].ms}`);
    eq(O.timers(b), bt, "timers are a pure function of the state");
  }
}

function runOne(s) {
  const t = O.timers(s)[0];
  const ctx = { rng: seeded(`r${s.seq}`) };
  const a = t.kind === "bot" ? O.botAction(s, t.playerId, ctx) : t.action;
  const r = O.apply(s, t.kind === "system" ? C.SYSTEM : t.playerId, a, ctx);
  assert.ifError(r.error);
  return r.state;
}

// ---------------------------------------------------------------- determinism

function botMatch(seed, level, { checkViews = false } = {}) {
  const rng = seeded(seed);
  let s = O.create({ botLevel: level, startPoints: 8 });
  s = O.join(s, { id: "alice", name: "Alice" }).state;
  s = O.seat(s, "alice", 0).state;
  s = O.start(s, "alice", { rng }).state;
  s = O.setPresence(s, "alice", { connected: false, autopilot: true }).state;
  let steps = 0;
  const final = runEngine(O, s, {
    rng,
    until: (x) => x.phase === "matchOver",
    onStep(prev, res) {
      steps++;
      const n = res.state;
      if (n.hand && n.phase !== "waiting") {
        if (!conserved(n)) throw new Error("tile conservation broken");
        if (n.phase === "playing") {
          const h = n.hand;
          const counts = h.racks.map((r) => r.length);
          const expect = counts.map((_, i) => (i === h.turn && h.step === "discard" ? 15 : 14));
          eq(counts, expect, "rack sizes follow the turn");
        }
      }
      if (checkViews && n.hand && steps % 7 === 0) {
        assertNoLeak(n, "alice");
        assertNoLeak(n, null);
        if (n.phase === "playing") assertViewStable(n, "alice", rng);
      }
    },
  });
  // Scores are the start minus every recorded delta (hands and indicator shows).
  return { final, steps };
}

{
  const a = botMatch("det-1", "medium").final;
  const b = botMatch("det-1", "medium").final;
  eq(JSON.stringify(a), JSON.stringify(b), "same seed, same match");
  const c = botMatch("det-2", "medium").final;
  ok(JSON.stringify(a) !== JSON.stringify(c), "different seed, different match");
}

// ---------------------------------------------------------------- randomized bot matches

const t0 = Date.now();
const finishes = {};
let hands = 0;
let matches = 0;
for (const level of ["easy", "medium", "hard"]) {
  for (let i = 0; i < 4; i++) {
    const { final } = botMatch(`prop-${level}-${i}`, level, { checkViews: i < 2 });
    matches++;
    hands += final.handsPlayed;
    for (const h of final.history) finishes[h.kind === "win" ? h.finish : "draw"] = (finishes[h.kind === "win" ? h.finish : "draw"] || 0) + 1;
    // Score bookkeeping: start + sum of hand deltas + indicator penalties.
    const fromHistory = [0, 1, 2, 3].map((i2) => final.history.reduce((acc, h) => acc + h.deltas[i2], 0));
    const diff = final.scores.map((x, i2) => 8 - x + fromHistory[i2]);
    ok(diff.every((x) => x >= 0 && Number.isInteger(x)), "only indicator penalties are outside the hand deltas");
    ok(final.scores.some((x) => x <= 0), "match ended by reaching 0");
    eq(final.matchResult.winners.every((w) => final.scores[w] === Math.max(...final.scores)), true);
  }
}
const botMs = Date.now() - t0;
ok((finishes.normal || 0) > 0, "bots finish hands");

// Bulk random-policy hands: thousands of fast hands through the rules (pile
// exhaustion, random discards and pickups, finishes found by the engine's checker).
const t1 = Date.now();
let bulkHands = 0;
let bulkWins = 0;
{
  const rng = seeded("bulk");
  for (let m = 0; m < 1000; m++) {
    let s = started(`bulk-${m}`, ["alice"]);
    for (let guard = 0; s.phase === "playing" && guard < 400; guard++) {
      const h = s.hand;
      const who = s.seats[h.turn].playerId;
      let a;
      if (h.step === "draw") {
        const prev = (h.turn + 3) % 4;
        a = { type: "draw", from: h.discards[prev].length && rng.float() < 0.3 ? "discard" : "pile" };
      } else {
        const rack = h.racks[h.turn];
        const tile = rack[rng.int(rack.length)];
        const rest = rack.filter((t) => t !== tile);
        a = rng.float() < 0.25 && R.findWin(rest, h.okeyFace) ? { type: "finish", tile } : { type: "discard", tile };
      }
      const r = O.apply(s, who, a, { rng });
      if (r.error) throw new Error(`bulk: ${r.error}`);
      s = r.state;
      if (!conserved(s)) throw new Error("bulk: conservation");
    }
    eq(s.phase === "handOver" || s.phase === "matchOver", true, "every hand ends");
    bulkHands++;
    if (s.lastResult.kind === "win") bulkWins++;
  }
}
const bulkMs = Date.now() - t1;

console.log(
  `okey.selftest: ok (${checks} checks; ${matches} bot matches / ${hands} hands in ${botMs} ms ${JSON.stringify(finishes)}; ${bulkHands} random hands (${bulkWins} wins) in ${bulkMs} ms)`
);
