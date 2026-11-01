"use strict";

/**
 * Blackjack (points only): betting, dealing, peek, insurance, naturals 3:2,
 * hit / stand / double / split / surrender, dealer S17, shoe and cut card,
 * redacted views, timers, leaving mid-round, leaderboard, and a randomized
 * multi-player run with card and point conservation.
 * Run: node frontend/backend/lib/world3d/games/blackjack.selftest.cjs
 */

const assert = require("assert");
const C = require("./common");
const B = require("./blackjack");
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

const RANK = { A: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, J: 10, Q: 11, K: 12 };
/** "A 9 K 7" -> card ints (suits rotate so cards are distinct-looking). */
const cards = (str) => str.trim().split(/\s+/).map((t, i) => (i % 4) * 13 + RANK[t]);

function tableWith(ids, opts = {}) {
  let s = B.create(opts);
  ids.forEach((id, i) => {
    s = B.join(s, { id, name: id }).state;
    s = B.seat(s, id, i).state;
  });
  return s;
}

/** Put a known card order on top of the shoe (deal order: seats, dealer up, seats, dealer hole, then draws). */
function rigShoe(s, str) {
  s = C.clone(s);
  s.shoe.cards = cards(str).concat(s.shoe.cards.length ? s.shoe.cards : Array.from({ length: 300 }, (_, i) => i % 52));
  s.shoe.needsShuffle = false;
  s.shoe.cut = 100000;
  s.shoe.dealt = 0;
  return s;
}

const rng = seeded("bj");
const ctx = { rng };
const act = (s, id, a) => {
  const r = B.apply(s, id, a, ctx);
  if (r.error) throw new Error(`${id} ${JSON.stringify(a)}: ${r.error}`);
  return r;
};
const pts = (s, id) => s.players[id].points;

// ---------------------------------------------------------------- options and seating

{
  const s = B.create({ seats: 9, betStep: 5, minBet: 7, maxBet: 999, maxHands: 9 });
  eq(s.options.seats, 7);
  eq(s.options.betStep, 6, "bet steps are even (3:2 and halves stay whole)");
  eq(s.options.minBet % 6, 0);
  eq(s.options.maxHands, 4);
  const d = B.create();
  eq(d.options.seats, 5, "five seats like the draft");
  eq([d.options.decks, d.options.startPoints, d.options.maxHands, d.options.insurance, d.options.surrender], [6, 1000, 3, true, true]);
  eq(d.phase, "idle");
  let t = B.join(d, { id: "a", name: "Ayse" }).state;
  t = B.seat(t, "a", 2).state;
  eq(t.phase, "betting", "sitting down opens betting");
  eq(B.seat(t, "a", 3).error, "already_seated");
  t = B.join(t, { id: "b", name: "Mert" }).state;
  eq(B.seat(t, "b", 2).error, "seat_taken");
  eq(B.seat(t, "b", 5).error, "bad_seat");
  t = B.seat(t, "a", null).state;
  eq(t.phase, "idle", "nobody seated");
  eq(B.start(t).error, "auto_start");
}

// ---------------------------------------------------------------- betting

{
  let s = tableWith(["a", "b"]);
  eq(B.apply(s, "a", { type: "bet", amount: 5 }, ctx).error, "bad_amount", "below minimum");
  eq(B.apply(s, "a", { type: "bet", amount: 15 }, ctx).error, "bad_amount", "not a step");
  eq(B.apply(s, "a", { type: "bet", amount: 510 }, ctx).error, "bad_amount", "above maximum");
  eq(B.apply(s, "a", { type: "bet", amount: "100" }, ctx).error, "bad_amount");
  eq(B.apply(s, "zz", { type: "bet", amount: 100 }, ctx).error, "not_seated");
  eq(B.timers(s), [], "no deal timer before the first bet");
  s = act(s, "a", { type: "bet", amount: 100 }).state;
  eq(s.phase, "betting", "waits for the other player");
  eq(B.timers(s)[0].action, { type: "deal" });
  eq(B.timers(s)[0].ms, s.options.betMs);
  s = act(s, "a", { type: "bet", amount: 200 }).state;
  eq(s.bets[0], 200, "bets can change while betting");
  s = act(s, "a", { type: "clearBet" }).state;
  eq(s.bets[0], 0);
  eq(B.apply(s, "a", { type: "clearBet" }, ctx).error, "no_bet");
  s = act(s, "a", { type: "bet", amount: 100 }).state;
  s = act(s, "b", { type: "bet", amount: 50 }).state;
  ok(s.phase !== "betting", "all bets in: dealt at once");
  eq(pts(s, "a"), 900, "the bet is taken out of the session points");
  // Timer deal with only one bet.
  let t = tableWith(["a", "b"]);
  t = act(t, "a", { type: "bet", amount: 100 }).state;
  const r = B.apply(t, C.SYSTEM, { type: "deal" }, ctx);
  assert.ifError(r.error);
  eq(r.state.round.hands[1].length, 0, "no bet, no hand");
  eq(B.apply(tableWith(["a"]), C.SYSTEM, { type: "deal" }, ctx).error, "no_bets");
  // Cannot bet more than you have.
  let poor = tableWith(["a"]);
  poor.players.a.points = 40;
  eq(B.apply(poor, "a", { type: "bet", amount: 50 }, ctx).error, "not_enough_points");
}

// ---------------------------------------------------------------- naturals, peek, insurance

function dealt(str, bets = { a: 100 }, opts = {}) {
  let s = tableWith(Object.keys(bets), opts);
  s = rigShoe(s, str);
  for (const [id, amount] of Object.entries(bets)) s = act(s, id, { type: "bet", amount }).state;
  return s;
}

{
  // Player A+K vs dealer 9 + 7: blackjack pays 3:2.
  const s = dealt("A 9 K 7");
  eq(s.phase, "settled", "a lone natural settles at once");
  eq(s.round.results[0].hands[0].outcome, "blackjack");
  eq(pts(s, "a"), 1150, "+150 on 100");
  eq(s.players.a.blackjacks, 1);
  // Natural vs natural (dealer peeks with a 10 up): push.
  const p = dealt("A K K A");
  eq(p.round.results[0].hands[0].outcome, "push");
  eq(pts(p, "a"), 1000);
  // Dealer blackjack with a 10 up: the player loses only the bet.
  const d = dealt("9 K 8 A");
  eq(d.phase, "settled", "peek ends the round");
  eq(d.round.results[0].hands[0].outcome, "lose");
  eq(pts(d, "a"), 900);
  ok(d.round.dealer.revealed);
}

{
  // Ace up: insurance phase; dealer has blackjack; insurance pays 2:1.
  let s = dealt("9 A 8 K", { a: 100, b: 100 }.a ? { a: 100 } : {});
  eq(s.phase, "insurance");
  ok(B.viewFor(s, "a").you.canInsure);
  eq(B.timers(s)[0].action, { type: "closeInsurance" });
  const took = act(s, "a", { type: "insurance", take: true }).state;
  eq(took.phase, "settled", "the last decision closes insurance; dealer peeks");
  eq(took.round.results[0].insurance, 100, "insurance +100 (50 at 2:1)");
  eq(took.round.results[0].net, 0, "hand lost, insurance won: even");
  eq(pts(took, "a"), 1000);
  const declined = act(s, "a", { type: "insurance", take: false }).state;
  eq(pts(declined, "a"), 900);
  eq(B.apply(took, "a", { type: "insurance", take: true }, ctx).error, "not_insurance");
  // Ace up, no dealer blackjack: insurance is lost and play goes on.
  let n = dealt("9 A 8 7 K");
  n = act(n, "a", { type: "insurance", take: true }).state;
  eq(n.phase, "playing");
  eq(pts(n, "a"), 850, "bet 100 and insurance 50 are in");
  n = act(n, "a", { type: "stand" }).state;
  eq(n.phase, "settled");
  eq(n.round.dealer.cards.length, 2, "dealer A+7 is soft 18 and stands");
  eq(n.round.results[0].hands[0].outcome, "lose", "17 loses to 18");
  eq(n.round.results[0].net, -150);
  // Insurance switched off: no insurance phase.
  const off = dealt("9 A 8 7", { a: 100 }, { insurance: false });
  eq(off.phase, "playing");
  // Timer closes insurance for those who did not answer.
  let two = dealt("9 9 A 8 8 7", { a: 100, b: 100 });
  two = act(two, "a", { type: "insurance", take: true }).state;
  eq(two.phase, "insurance", "b still deciding");
  const closed = B.apply(two, C.SYSTEM, { type: "closeInsurance" }, ctx).state;
  eq(closed.round.insurance, [50, 0, null, null, null]);
}

// ---------------------------------------------------------------- hit, stand, double, surrender, dealer rules

{
  let s = dealt("10 9 6 7 K");
  eq(s.phase, "playing");
  eq(B.legalActions(s, 0).sort(), ["double", "hit", "stand", "surrender"]);
  eq(B.apply(s, "a", { type: "split" }, ctx).error, "illegal_action", "no pair");
  s = act(s, "a", { type: "hit" }).state;
  eq(s.phase, "settled", "bust ends the hand");
  eq(s.round.results[0].hands[0].outcome, "bust");
  eq(s.round.dealer.cards.length, 2, "dealer does not draw when everyone busted");
  eq(pts(s, "a"), 900);

  // 21 by hitting stands automatically.
  let t = dealt("5 9 6 7 K 8");
  t = act(t, "a", { type: "hit" }).state;
  eq(t.round.hands[0][0].done, true);
  eq(t.round.results[0].hands[0].total, 21);
  eq(t.round.results[0].hands[0].outcome, "win");
  eq(B.legalActions(dealt("5 9 6 7 2"), 0).includes("double"), true);

  // Double: one card, bet doubled.
  let d = dealt("6 10 5 7 9 K");
  d = act(d, "a", { type: "double" }).state;
  eq(d.round.hands[0][0].bet, 200);
  eq(d.round.hands[0][0].cards.length, 3);
  eq(d.round.results[0].hands[0].outcome, "win", "11 doubled with a 9 is 20 against the dealer's 17");
  eq(pts(d, "a"), 1200, "won 200 on a doubled 100");
  // No double after a hit; no double without points.
  let h = dealt("2 10 3 7 2");
  h = act(h, "a", { type: "hit" }).state;
  ok(!B.legalActions(h, 0).includes("double"));
  ok(!B.legalActions(h, 0).includes("surrender"), "surrender only as the first decision");
  let broke = tableWith(["a"]);
  broke.players.a.points = 100;
  broke = rigShoe(broke, "6 10 5 7");
  broke = act(broke, "a", { type: "bet", amount: 100 }).state;
  ok(!B.legalActions(broke, 0).includes("double"), "no points left to double");

  // Surrender: half back.
  let sr = dealt("10 10 6 7");
  sr = act(sr, "a", { type: "surrender" }).state;
  eq(sr.round.results[0].hands[0].outcome, "surrender");
  eq(pts(sr, "a"), 950);
  ok(!B.legalActions(dealt("10 10 6 7", { a: 100 }, { surrender: false }), 0).includes("surrender"), "option off");

  // Dealer stands on soft 17 (A+6) and hits 16.
  let s17 = dealt("10 A 8 6");
  s17 = act(s17, "a", { type: "insurance", take: false }).state;
  s17 = act(s17, "a", { type: "stand" }).state;
  eq(s17.round.dealer.cards.length, 2, "S17: dealer stands on A+6");
  eq(s17.round.results[0].hands[0].outcome, "win", "18 beats soft 17");
  let h16 = dealt("10 10 8 6 5");
  h16 = act(h16, "a", { type: "stand" }).state;
  eq(h16.round.dealer.cards.length, 3, "dealer hits 16");
  eq(h16.round.results[0].hands[0].outcome, "lose", "18 vs 21");
  let bust = dealt("10 10 8 6 K");
  bust = act(bust, "a", { type: "stand" }).state;
  eq(bust.round.results[0].hands[0].outcome, "win", "dealer busts");
  // Turn order: only the active seat acts.
  let two = dealt("10 9 10 9 7 8", { a: 100, b: 100 });
  eq(B.apply(two, "b", { type: "stand" }, ctx).error, "not_your_turn");
  two = act(two, "a", { type: "stand" }).state;
  eq(two.round.active.seat, 1);
}

// ---------------------------------------------------------------- splits

{
  // 8-8 split: second hand gets its card when it becomes active; DAS.
  let s = dealt("8 6 8 10 3 K 9 Q");
  eq(B.legalActions(s, 0).includes("split"), true);
  s = act(s, "a", { type: "split" }).state;
  eq(s.round.hands[0].length, 2);
  eq(s.round.hands[0][0].cards.length, 2, "first split hand got its second card (3)");
  eq(s.round.hands[0][1].cards.length, 1, "second waits");
  eq(pts(s, "a"), 800, "the split puts in another bet");
  ok(B.legalActions(s, 0).includes("double"), "double after split");
  ok(!B.legalActions(s, 0).includes("surrender"), "no surrender after split");
  s = act(s, "a", { type: "double" }).state; // 8+3 = 11, double, + K = 21
  eq(s.round.hands[0][0].bet, 200);
  eq(s.round.active.hand, 1, "on to the second hand");
  eq(s.round.hands[0][1].cards.length, 2, "second hand dealt now (8+9)");
  s = act(s, "a", { type: "stand" }).state;
  eq(s.phase, "settled");
  // Dealer 6+10 = 16 hits the Q and busts: the doubled 21 and the 17 both win.
  eq(s.round.dealer.cards.length, 3);
  eq(s.round.results[0].hands.map((x) => x.outcome), ["win", "win"]);
  eq(pts(s, "a"), 1000 + 200 + 100);
}

{
  // Fix the expectation above with an explicit dealer: 8-8 vs dealer 10+7.
  let s = dealt("8 10 8 7 3 K 9");
  s = act(s, "a", { type: "split" }).state;
  s = act(s, "a", { type: "double" }).state;
  s = act(s, "a", { type: "stand" }).state;
  eq(s.round.results[0].hands.map((x) => x.outcome), ["win", "push"], "21 beats 17; 17 pushes");
  eq(pts(s, "a"), 1000 + 200, "doubled win +200, push 0");

  // Re-split up to maxHands (3) hands.
  let r = dealt("8 10 8 7 8 8 2 2");
  r = act(r, "a", { type: "split" }).state; // hand0: 8+8 again
  ok(B.legalActions(r, 0).includes("split"), "re-split allowed (2 of 3 hands)");
  r = act(r, "a", { type: "split" }).state;
  eq(r.round.hands[0].length, 3);
  ok(!B.legalActions(r, 0).includes("split"), "third hand: limit reached");
  // With maxHands 4 a third split is allowed.
  const four = dealt("8 10 8 7 8 8 8 2", { a: 100 }, { maxHands: 4 });
  const f2 = act(act(four, "a", { type: "split" }).state, "a", { type: "split" }).state;
  eq(f2.round.hands[0].length, 3);
  ok(B.legalActions(f2, 0).includes("split"), "8+8 again on the first hand, 3 of 4 hands");
  eq(act(f2, "a", { type: "split" }).state.round.hands[0].length, 4);

  // Split aces: one card each and the round goes on without decisions.
  let a = dealt("A 10 A 7 K A");
  a = act(a, "a", { type: "split" }).state;
  eq(a.phase, "settled", "both aces got one card and the round ended");
  eq(a.round.hands[0].map((h) => h.cards.length), [2, 2]);
  // A+K = 21 (even money after a split), A+A = soft 12 loses to 17.
  eq(a.round.results[0].hands.map((x) => x.outcome), ["win", "lose"]);
}

{
  // Re-check split aces outcomes explicitly: A+K (21, not blackjack) and A+5 (16) vs dealer 10+7.
  let a = dealt("A 10 A 7 K 5");
  a = act(a, "a", { type: "split" }).state;
  eq(a.round.results[0].hands.map((x) => [x.outcome, x.net]), [["win", 100], ["lose", -100]], "21 after split wins even money");
  // Ace pair re-split is refused.
  let aa = dealt("A 10 A 7 A A");
  aa = act(aa, "a", { type: "split" }).state;
  ok(aa.round.hands[0].every((h) => h.cards.length === 2 && h.done), "aces are done after one card");
  // 10-value cards of different ranks split (K and Q).
  ok(B.legalActions(dealt("K 9 Q 7 5"), 0).includes("split"));
}

// ---------------------------------------------------------------- shoe

{
  let s = tableWith(["a"]);
  s = act(s, "a", { type: "bet", amount: 10 }).state;
  eq(s.shoe.shuffles, 1, "first round shuffles");
  ok(s.shoe.cut >= 312 * 0.69 && s.shoe.cut <= 312 * 0.81, `cut card at ${s.shoe.cut}`);
  eq(s.shoe.tray.length, 1, "one burn card");
  // Force the cut: the next round reshuffles everything.
  s.shoe.needsShuffle = true;
  while (s.phase !== "settled") {
    const t = B.timers(s)[0];
    s = t.kind === "system" ? B.apply(s, C.SYSTEM, t.action, ctx).state : act(s, "a", t.kind === "bot" ? B.botAction(s, "a") : { type: "stand" }).state;
  }
  s = B.apply(s, C.SYSTEM, { type: "nextRound" }, ctx).state;
  const r = act(s, "a", { type: "bet", amount: 10 });
  ok(r.events.some((e) => e.type === "shuffle"), "reshuffled after the cut card");
  eq(r.state.shoe.shuffles, 2);
}

// ---------------------------------------------------------------- views

function assertHidden(s, viewer) {
  const v = viewer ? B.viewFor(s, viewer) : B.publicView(s);
  const text = JSON.stringify(v);
  ok(!text.includes('"tray"') && !text.includes('"cut"'), "no shoe internals");
  ok(typeof v.shoe.remaining === "number" && Object.keys(v.shoe).sort().join() === "remaining,reshuffleNext");
  if (s.round && !s.round.dealer.revealed) {
    eq(v.dealer.cards.length, 2);
    eq(v.dealer.cards[1], { hidden: true }, "hole card stays face down");
  }
  // Metamorphic: a different hole card and shoe order give the same view.
  if (s.round && !s.round.dealer.revealed) {
    const t = C.clone(s);
    t.round.dealer.cards[1] = (t.round.dealer.cards[1] + 7) % 52;
    t.shoe.cards.reverse();
    eq(JSON.stringify(viewer ? B.viewFor(t, viewer) : B.publicView(t)), text, "view independent of hidden cards");
  }
}

{
  const s = dealt("10 9 6 7 K", { a: 100 });
  assertHidden(s, "a");
  assertHidden(s, null);
  const ev = act(dealt("10 9 6 7 K"), "a", { type: "stand" });
  ok(ev.events.some((e) => e.type === "reveal"), "reveal event");
  const dealEvents = act(rigShoe(tableWith(["a"]), "10 9 6 7 K"), "a", { type: "bet", amount: 100 }).events;
  const hole = dealEvents.filter((e) => e.type === "card" && e.to === "dealer");
  eq(hole[1].faceDown, true);
  eq(hole[1].card, undefined, "the hole card is not in the deal events");
  ok(dealEvents.filter((e) => e.type === "card").every((e, i, arr) => i === 0 || e.at > arr[i - 1].at), "deal events carry increasing animation offsets");
  const v = B.viewFor(s, "a");
  eq(v.you.actions.sort(), ["double", "hit", "stand", "surrender"]);
  eq(v.options.blackjackPays, "3:2");
  eq(B.viewFor(s, "nobody").you, null);
}

// ---------------------------------------------------------------- timers, autopilot, leaving, leaderboard

{
  let s = dealt("10 9 6 7 K", { a: 100 });
  const t = B.timers(s)[0];
  eq(t.kind, "turn");
  eq(t.action, { type: "stand" });
  ok(t.ms > s.options.actMs, "the first decision also waits for the deal animation");
  s = B.setPresence(s, "a", { connected: false, autopilot: true }).state;
  eq(B.timers(s)[0].kind, "bot");
  // Player 10+6 = 16 against a 9 up: late surrender by basic strategy.
  eq(B.botAction(s, "a"), { type: "surrender" });
  // Basic strategy spot checks.
  const bs = (p, up, allowed = ["hit", "stand", "double", "split", "surrender"]) => B.basicStrategy(cards(p), cards(up)[0], allowed);
  eq(bs("10 6", "10"), "surrender");
  eq(bs("10 6", "10", ["hit", "stand"]), "hit");
  eq(bs("10 2", "4"), "stand");
  eq(bs("10 2", "3"), "hit");
  eq(bs("6 5", "10"), "double");
  eq(bs("6 5", "A"), "hit");
  eq(bs("A 7", "3"), "double");
  eq(bs("A 7", "8"), "stand");
  eq(bs("A 7", "9"), "hit");
  eq(bs("8 8", "A"), "split");
  eq(bs("K Q", "6"), "stand", "never split tens");
  eq(bs("9 9", "7"), "stand");
  eq(bs("5 5", "6"), "double", "fives play as 10");
  eq(bs("A A", "10"), "split");
}

{
  // Leaving mid-round: the autopilot finishes the hands, the seat frees at the next round.
  let s = dealt("10 9 10 9 6 7 K", { a: 100, b: 100 });
  s = B.leave(s, "a", ctx).state;
  eq(s.leaving, [0]);
  ok(C.botControlled(s.seats[0]));
  eq(B.apply(s, "a", { type: "stand" }, ctx).error, "not_seated", "left players cannot act");
  while (s.phase === "playing") {
    const t = B.timers(s)[0];
    s = act(s, t.playerId, t.kind === "bot" ? B.botAction(s, t.playerId) : t.action).state;
  }
  eq(s.phase, "settled");
  s = B.apply(s, C.SYSTEM, { type: "nextRound" }, ctx).state;
  eq(s.seats[0].playerId, null, "seat freed");
  eq(s.phase, "betting");
  ok(B.leaderboard(s).some((x) => x.playerId === "a"), "the session leaderboard keeps leavers");
  // Leaving while betting frees at once and may trigger the deal for the rest.
  let bt = tableWith(["a", "b"]);
  bt = act(bt, "b", { type: "bet", amount: 100 }).state;
  bt = B.leave(bt, "a", ctx).state;
  eq(bt.phase, "playing", "b was the last one pending");
}

{
  // Refill only when broke and not in a round; leaderboard nets out refills.
  let s = tableWith(["a"]);
  eq(B.apply(s, "a", { type: "refill" }, ctx).error, "has_points");
  s.players.a.points = 0;
  s = act(s, "a", { type: "refill" }).state;
  eq(pts(s, "a"), 1000);
  const lb = B.leaderboard(s)[0];
  eq([lb.points, lb.refills, lb.net], [1000, 1, -1000]);
}

// ---------------------------------------------------------------- randomized multi-player run

const DECKS = 6;
function conserved(s) {
  const counts = new Array(52).fill(0);
  const add = (c) => counts[c]++;
  s.shoe.cards.forEach(add);
  s.shoe.tray.forEach(add);
  if (s.round) {
    s.round.hands.forEach((hs) => hs.forEach((h) => h.cards.forEach(add)));
    s.round.dealer.cards.forEach(add);
  }
  return counts.every((n) => n === DECKS) || counts.every((n) => n === 0);
}

const t0 = Date.now();
let rounds = 0;
const outcomes = {};
{
  const r2 = seeded("bj-prop");
  const c2 = { rng: r2 };
  const ids = ["p1", "p2", "p3", "p4", "p5"];
  let s = B.create({ startPoints: 500 });
  for (const id of ids) s = B.join(s, { id, name: id }).state;
  for (let i = 0; i < 3; i++) s = B.seat(s, ids[i], i).state;
  let lastSeq = -1;
  let guard = 0;
  while (rounds < 8000 && guard++ < 600000) {
    ok(conserved(s) || s.shoe.shuffles === 0, "card conservation");
    // Random churn: someone sits down or leaves now and then.
    if (r2.float() < 0.01) {
      const id = ids[r2.int(5)];
      const i = C.seatOf(s, id);
      const r = i >= 0 ? B.seat(s, id, null, c2) : B.seat(s, id, s.seats.findIndex((x) => !x.playerId), c2);
      if (!r.error) s = r.state;
      continue;
    }
    if (s.phase === "idle") {
      s = B.seat(s, ids[0], s.seats.findIndex((x) => !x.playerId), c2).state;
      continue;
    }
    if (s.phase === "betting") {
      const pending = s.seats.map((x, i) => [x, i]).filter(([x, i]) => x.playerId && !s.bets[i] && !s.leaving.includes(i));
      if (pending.length) {
        const [x] = pending[r2.int(pending.length)];
        const p = s.players[x.playerId];
        if (p.points < s.options.minBet) {
          s = act(s, x.playerId, { type: "refill" }).state;
          continue;
        }
        const max = Math.min(s.options.maxBet, Math.floor(p.points / 10) * 10);
        const amount = 10 * (1 + r2.int(max / 10));
        s = B.apply(s, x.playerId, { type: "bet", amount }, c2).state;
        continue;
      }
    }
    const specs = B.timers(s);
    if (!specs.length) throw new Error(`stuck in ${s.phase}`);
    const t = specs[0];
    let res;
    if (s.phase === "insurance") {
      const who = s.seats.map((x, i) => [x, i]).find(([x, i]) => x.playerId && s.round.hands[i].length && s.round.insurance[i] === null);
      res = who && r2.float() < 0.8 ? B.apply(s, who[0].playerId, { type: "insurance", take: r2.float() < 0.3 }, c2) : B.apply(s, C.SYSTEM, t.action, c2);
      if (res.error === "not_enough_points") res = B.apply(s, who[0].playerId, { type: "insurance", take: false }, c2);
    } else if (t.kind === "system") res = B.apply(s, C.SYSTEM, t.action, c2);
    else {
      // Mix basic strategy and random legal actions.
      const i = C.seatOf(s, t.playerId);
      const legal = B.legalActions(s, i);
      const a = r2.float() < 0.5 ? B.botAction(s, t.playerId) : { type: legal[r2.int(legal.length)] };
      res = B.apply(s, t.playerId, a, c2);
    }
    if (res.error) throw new Error(`prop: ${res.error} in ${s.phase}`);
    const before = s;
    s = res.state;
    ok(s.seq > before.seq || s === before, "seq grows");
    for (const ev of res.events) {
      if (ev.type !== "settle") continue;
      rounds++;
      for (const r of ev.results) {
        for (const h of r.hands) outcomes[h.outcome] = (outcomes[h.outcome] || 0) + 1;
        // Per seat: points before the round (incl. bets) + net = points after.
        const handNet = r.hands.reduce((a, h) => a + h.net, 0) + (r.insurance || 0);
        eq(handNet, r.net, "seat net adds up");
      }
    }
    for (const id of Object.keys(s.players)) ok(s.players[id].points >= 0, "points never negative");
    if (rounds % 97 === 0 && s.round && s.seq !== lastSeq) {
      lastSeq = s.seq;
      for (const x of s.seats) if (x.playerId) assertHidden(s, x.playerId);
      assertHidden(s, null);
    }
  }
  // Leaderboard identity: net = points - start * (1 + refills).
  for (const row of B.leaderboard(s)) eq(row.net, row.points - 500 * (1 + row.refills));
}
const propMs = Date.now() - t0;
ok(rounds >= 8000, `ran ${rounds} rounds`);
ok(outcomes.blackjack > 0 && outcomes.surrender > 0 && outcomes.bust > 0 && outcomes.push > 0, "every outcome shows up");

console.log(`blackjack.selftest: ok (${checks} checks; ${rounds} random rounds in ${propMs} ms ${JSON.stringify(outcomes)})`);
