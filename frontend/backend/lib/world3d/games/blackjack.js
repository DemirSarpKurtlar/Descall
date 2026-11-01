"use strict";

/**
 * Blackjack against a robot dealer, points only ("eğlence modu, puanla").
 *
 * Nothing here is money: every player gets a session balance of `startPoints`
 * puan, a bet is a number of those points chosen on a slider each round, and
 * the result is a score and a leaderboard. No chips, stakes, prizes or DesCoin.
 *
 * Table rules (defaults, all documented in GAMES_PROTOCOL.md):
 *   - 5 seats, 6-deck shoe, one burn card after each shuffle, reshuffle before
 *     the next round once the cut card (70-80 % penetration, default 75 %) came out;
 *   - dealer stands on all 17s (S17), peeks for blackjack with an Ace or a
 *     10-value up card (US hole card);
 *   - natural blackjack pays 3:2; insurance (optional, on by default) costs half
 *     the bet when the dealer shows an Ace and pays 2:1;
 *   - double on any first two cards, also after a split (DAS);
 *   - split two cards of the same value (K-Q splits), up to `maxHands` hands per
 *     seat (default 3); split aces get exactly one card each and cannot be
 *     re-split; 21 after a split is not a blackjack;
 *   - late surrender (optional, on by default) on the first two cards of an
 *     unsplit hand, after the dealer peeked: half the bet comes back.
 *
 * Phases: idle (nobody seated) -> betting -> insurance? -> playing -> settled
 * -> betting ... The dealer's hole card and the shoe never leave the state
 * until revealed.
 */

const C = require("./common");

const GAME = "blackjack";
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["S", "H", "D", "C"];
const DEAL_STEP_MS = 380;

const DEFAULTS = Object.freeze({
  seats: 5,
  decks: 6,
  penetration: 0.75,
  startPoints: 1000,
  minBet: 10,
  maxBet: 500,
  betStep: 10,
  insurance: true,
  surrender: true,
  maxHands: 3,
  betMs: 15000,
  insuranceMs: 10000,
  actMs: 20000,
  settleMs: 6000,
  botDelayMs: [700, 900],
});

function create(options = {}) {
  const o = { ...DEFAULTS };
  const int = (k, lo, hi) => {
    if (C.isInt(options[k])) o[k] = Math.min(hi, Math.max(lo, options[k]));
  };
  int("seats", 1, 7);
  int("decks", 1, 8);
  int("startPoints", 100, 100000);
  int("minBet", 2, 10000);
  int("maxBet", 2, 100000);
  int("betStep", 2, 1000);
  int("maxHands", 1, 4);
  int("betMs", 3000, 60000);
  int("insuranceMs", 3000, 30000);
  int("actMs", 5000, 60000);
  int("settleMs", 1000, 30000);
  if (typeof options.penetration === "number" && options.penetration >= 0.5 && options.penetration <= 0.9) o.penetration = options.penetration;
  if (typeof options.insurance === "boolean") o.insurance = options.insurance;
  if (typeof options.surrender === "boolean") o.surrender = options.surrender;
  if (Array.isArray(options.botDelayMs) && options.botDelayMs.length === 2 && options.botDelayMs.every(C.isInt)) o.botDelayMs = options.botDelayMs.slice();
  // Bets move in even steps so 3:2, half insurance and half surrender stay whole numbers.
  if (o.betStep % 2) o.betStep += 1;
  o.minBet = Math.max(o.betStep, Math.ceil(o.minBet / o.betStep) * o.betStep);
  o.maxBet = Math.max(o.minBet, Math.floor(o.maxBet / o.betStep) * o.betStep);
  return {
    game: GAME,
    v: 1,
    options: o,
    phase: "idle",
    seq: 0,
    seats: Array.from({ length: o.seats }, C.emptySeat),
    members: {},
    players: {},
    shoe: { cards: [], cut: 0, tray: [], shuffles: 0, needsShuffle: true },
    roundNo: 0,
    round: null,
    bets: new Array(o.seats).fill(0),
    leaving: [],
  };
}

// ---------------------------------------------------------------- cards

function rankOf(card) {
  return card % 13;
}

function valueOf(card) {
  const r = rankOf(card);
  return r === 0 ? 11 : r >= 9 ? 10 : r + 1;
}

function describeCard(card) {
  return { r: RANKS[rankOf(card)], s: SUITS[Math.floor(card / 13) % 4] };
}

/** { total, soft } with aces counted 11 while that does not bust. */
function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += valueOf(c);
    if (rankOf(c) === 0) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

function isNatural(hand) {
  return hand.cards.length === 2 && !hand.split && handTotal(hand.cards).total === 21;
}

function freshShoe(o) {
  const cards = [];
  for (let d = 0; d < o.decks; d++) for (let c = 0; c < 52; c++) cards.push(c);
  return cards;
}

function shuffleShoe(s, rng, events) {
  const sh = s.shoe;
  const all = sh.cards.concat(sh.tray);
  sh.cards = C.shuffle(all.length ? all : freshShoe(s.options), rng);
  sh.tray = [];
  const total = sh.cards.length;
  const jitter = (rng.float() - 0.5) * 0.1; // cut card between 70 % and 80 % at the default
  sh.cut = Math.round(total * Math.min(0.9, Math.max(0.5, s.options.penetration + jitter)));
  sh.tray.push(sh.cards.shift()); // burn card
  sh.dealt = 1;
  sh.shuffles++;
  sh.needsShuffle = false;
  events.push({ type: "shuffle", cards: sh.cards.length });
}

function drawCard(s, rng, events) {
  const sh = s.shoe;
  if (sh.cards.length === 0) {
    // Only reachable with very small shoes: shuffle the tray back in mid-round.
    shuffleShoe(s, rng, events);
  }
  const card = sh.cards.shift();
  sh.dealt++;
  if (sh.dealt >= sh.cut) sh.needsShuffle = true;
  return card;
}

// ---------------------------------------------------------------- membership and ledger

/** Whose session points a seat books to (a leaver's seat is played out by a bot). */
function ledgerId(seat) {
  return seat.ledgerId || seat.playerId;
}

function ledger(s, id) {
  if (!s.players[id]) {
    s.players[id] = {
      name: s.members[id] ? s.members[id].name : id,
      points: s.options.startPoints,
      refills: 0,
      hands: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
      best: 0,
    };
  }
  return s.players[id];
}

function join(state, player) {
  const r = C.joinMember(state, player);
  if (r.error) return r;
  const id = C.cleanPlayerId(player.id);
  if (r.state.players[id]) r.state.players[id].name = r.state.members[id].name;
  return r;
}

function inRound(state, i) {
  return Boolean(state.round && state.round.hands[i] && state.round.hands[i].length);
}

function seat(state, playerId, index, ctx = {}) {
  const id = C.cleanPlayerId(playerId);
  if (!id || !state.members[id]) return C.fail(state, "not_member");
  const cur = C.seatOf(state, id);
  if (index === null) {
    if (cur < 0) return C.fail(state, "not_seated");
    return standUp(state, cur, ctx);
  }
  if (!C.isInt(index) || index < 0 || index >= state.seats.length) return C.fail(state, "bad_seat");
  if (cur === index) return C.ok(state);
  if (state.seats[index].playerId) return C.fail(state, "seat_taken");
  if (cur >= 0) return C.fail(state, "already_seated");
  const s = C.clone(state);
  s.seats[index] = C.humanSeat(id, s.members[id].name);
  ledger(s, id);
  s.seq++;
  const events = [{ type: "seat", seat: index, playerId: id }];
  if (s.phase === "idle") {
    s.phase = "betting";
    events.push({ type: "betting", round: s.roundNo + 1 });
  }
  return C.ok(s, events);
}

function standUp(state, i, ctx) {
  const s = C.clone(state);
  const events = [];
  if (inRound(s, i) && s.phase !== "settled") {
    // Hands already in play are finished by the basic-strategy autopilot; the
    // seat is freed when the round ends.
    if (!s.leaving.includes(i)) s.leaving.push(i);
    const left = s.seats[i];
    s.seats[i] = { ...C.botSeat(i, "basic"), name: left.name, ledgerId: left.playerId };
    events.push({ type: "leaving", seat: i, playerId: left.playerId });
  } else {
    s.bets[i] = 0;
    events.push({ type: "seat", seat: i, playerId: null });
    s.seats[i] = C.emptySeat();
  }
  progress(s, C.rngOf(ctx), events);
  s.seq++;
  return C.ok(s, events);
}

/** After somebody left: deal or close insurance when nobody else is pending. */
function progress(s, rng, events) {
  if (s.phase === "betting") {
    if (!s.seats.some((x) => x.playerId)) {
      s.phase = "idle";
      return;
    }
    const pending = activeHumans(s).filter((k) => !s.bets[k]);
    if (pending.length === 0 && s.bets.some((b) => b > 0)) dealRound(s, rng, events);
  } else if (s.phase === "insurance") {
    const waiting = activeHumans(s).filter((k) => s.round.hands[k].length && s.round.insurance[k] === null);
    if (waiting.length === 0) closeInsurance(s, rng, events);
  }
}

function leave(state, playerId, ctx = {}) {
  const id = C.cleanPlayerId(playerId);
  if (!id || !state.members[id]) return C.fail(state, "not_member");
  let res = C.ok(state);
  const cur = C.seatOf(state, id);
  if (cur >= 0) res = standUp(state, cur, ctx);
  const s = res.state === state ? C.clone(state) : res.state;
  delete s.members[id];
  return C.ok(s, [...res.events, { type: "member", op: "leave", playerId: id }]);
}

function setPresence(state, playerId, patch) {
  return C.setPresence(state, playerId, patch);
}

/** Blackjack has no start button: sitting down opens betting. */
function start(state) {
  return C.fail(state, "auto_start");
}

// ---------------------------------------------------------------- betting

const FREE_ACTIONS = new Set(["bet", "clearBet", "refill"]);

function activeHumans(s) {
  const out = [];
  s.seats.forEach((x, i) => {
    if (x.kind === "human" && !x.autopilot && x.connected && !s.leaving.includes(i)) out.push(i);
  });
  return out;
}

function placeBet(state, i, amount, rng) {
  const o = state.options;
  if (state.phase !== "betting") return C.fail(state, "not_betting");
  if (!C.isInt(amount) || amount < o.minBet || amount > o.maxBet || amount % o.betStep !== 0) return C.fail(state, "bad_amount");
  const id = ledgerId(state.seats[i]);
  const pts = state.players[id] ? state.players[id].points : o.startPoints;
  if (amount > pts) return C.fail(state, "not_enough_points");
  const s = C.clone(state);
  s.bets[i] = amount;
  s.seq++;
  const events = [{ type: "bet", seat: i, amount }];
  const pending = activeHumans(s).filter((k) => !s.bets[k]);
  if (pending.length === 0) dealRound(s, rng, events);
  return C.ok(s, events);
}

function clearBet(state, i) {
  if (state.phase !== "betting") return C.fail(state, "not_betting");
  if (!state.bets[i]) return C.fail(state, "no_bet");
  const s = C.clone(state);
  s.bets[i] = 0;
  s.seq++;
  return C.ok(s, [{ type: "bet", seat: i, amount: 0 }]);
}

function refill(state, playerId) {
  const p = state.players[playerId];
  if (!p) return C.fail(state, "no_ledger");
  const i = C.seatOf(state, playerId);
  if (i >= 0 && (inRound(state, i) && state.phase !== "settled")) return C.fail(state, "in_round");
  if (p.points >= state.options.minBet) return C.fail(state, "has_points");
  const s = C.clone(state);
  s.players[playerId].points = s.options.startPoints;
  s.players[playerId].refills++;
  s.seq++;
  return C.ok(s, [{ type: "refill", playerId, points: s.options.startPoints }]);
}

// ---------------------------------------------------------------- dealing

function dealRound(s, rng, events) {
  const n = s.seats.length;
  const players = [];
  for (let i = 0; i < n; i++) {
    const seatRec = s.seats[i];
    if (!seatRec.playerId || !s.bets[i]) continue;
    const p = s.players[ledgerId(seatRec)];
    if (!p || p.points < s.bets[i]) {
      s.bets[i] = 0;
      continue;
    }
    players.push(i);
  }
  if (players.length === 0) {
    s.phase = s.seats.some((x) => x.playerId) ? "betting" : "idle";
    return;
  }
  if (s.shoe.needsShuffle) shuffleShoe(s, rng, events);
  s.roundNo++;
  const round = {
    number: s.roundNo,
    hands: new Array(n).fill(null).map(() => []),
    insurance: new Array(n).fill(null),
    dealer: { cards: [], revealed: false },
    active: null,
    results: null,
    dealAt: 0,
  };
  s.round = round;
  for (const i of players) {
    const p = s.players[ledgerId(s.seats[i])];
    p.points -= s.bets[i];
    round.hands[i].push(newHand(s.bets[i]));
  }
  let at = 0;
  events.push({ type: "roundStart", round: round.number, seats: players.slice(), bets: players.map((i) => s.bets[i]) });
  for (let pass = 0; pass < 2; pass++) {
    for (const i of players) {
      const c = drawCard(s, rng, events);
      round.hands[i][0].cards.push(c);
      events.push({ type: "card", to: "seat", seat: i, hand: 0, card: describeCard(c), at });
      at += DEAL_STEP_MS;
    }
    const d = drawCard(s, rng, events);
    round.dealer.cards.push(d);
    if (pass === 0) events.push({ type: "card", to: "dealer", card: describeCard(d), at });
    else events.push({ type: "card", to: "dealer", faceDown: true, at });
    at += DEAL_STEP_MS;
  }
  round.dealAt = at;
  const up = round.dealer.cards[0];
  if (s.options.insurance && rankOf(up) === 0) {
    s.phase = "insurance";
    events.push({ type: "insuranceOffer", at });
  } else {
    peekAndPlay(s, rng, events);
  }
  s.seq++;
}

function newHand(bet) {
  return { cards: [], bet, doubled: false, split: false, splitAces: false, surrendered: false, done: false, result: null };
}

function dealerHasBlackjack(round) {
  return handTotal(round.dealer.cards).total === 21 && round.dealer.cards.length === 2;
}

/** After the deal (and insurance): dealer peek, naturals, first player to act. */
function peekAndPlay(s, rng, events) {
  const round = s.round;
  const up = round.dealer.cards[0];
  const peeks = rankOf(up) === 0 || valueOf(up) === 10;
  // Insurance resolves at the peek.
  const dealerBJ = peeks && dealerHasBlackjack(round);
  if (peeks) events.push({ type: "peek", blackjack: dealerBJ });
  if (dealerBJ) {
    for (const hands of round.hands) for (const h of hands) h.done = true;
    finishDealer(s, rng, events, true);
    return;
  }
  // Lost insurance is already paid in; nothing to do. Naturals are done.
  for (const hands of round.hands) for (const h of hands) if (isNatural(h)) h.done = true;
  s.phase = "playing";
  advance(s, rng, events);
}

// ---------------------------------------------------------------- playing

function currentHand(s) {
  const a = s.round && s.round.active;
  if (!a) return null;
  return s.round.hands[a.seat][a.hand];
}

/** Move `active` to the next unfinished hand, or run the dealer. */
function advance(s, rng, events) {
  if (s.phase !== "playing") return;
  const round = s.round;
  for (let i = 0; i < round.hands.length; i++) {
    for (let k = 0; k < round.hands[i].length; k++) {
      const h = round.hands[i][k];
      if (h.done) continue;
      // A split hand waiting for its second card gets it now.
      if (h.cards.length === 1) {
        const c = drawCard(s, rng, events);
        h.cards.push(c);
        events.push({ type: "card", to: "seat", seat: i, hand: k, card: describeCard(c), at: 0 });
        if (h.splitAces || handTotal(h.cards).total === 21) {
          h.done = true;
          continue;
        }
      }
      round.active = { seat: i, hand: k };
      events.push({ type: "turn", seat: i, hand: k });
      return;
    }
  }
  round.active = null;
  finishDealer(s, rng, events, false);
}

function finishDealer(s, rng, events, dealerBJ) {
  const round = s.round;
  round.dealer.revealed = true;
  let at = 0;
  events.push({ type: "reveal", card: describeCard(round.dealer.cards[1]), total: handTotal(round.dealer.cards).total, at });
  at += DEAL_STEP_MS * 2;
  const live = round.hands.some((hs) => hs.some((h) => !h.surrendered && handTotal(h.cards).total <= 21 && !isNatural(h)));
  if (!dealerBJ && live) {
    while (handTotal(round.dealer.cards).total < 17) {
      const c = drawCard(s, rng, events);
      round.dealer.cards.push(c);
      events.push({ type: "card", to: "dealer", card: describeCard(c), total: handTotal(round.dealer.cards).total, at });
      at += DEAL_STEP_MS * 2;
    }
  }
  settle(s, events, at);
}

function settle(s, events, at) {
  const round = s.round;
  const dealer = handTotal(round.dealer.cards).total;
  const dealerBJ = dealerHasBlackjack(round);
  const dealerBust = dealer > 21;
  const results = [];
  for (let i = 0; i < round.hands.length; i++) {
    const hands = round.hands[i];
    if (!hands.length) continue;
    const id = ledgerId(s.seats[i]);
    const p = s.players[id];
    let seatNet = 0;
    const handResults = [];
    for (const h of hands) {
      const t = handTotal(h.cards).total;
      const stake = h.bet;
      let outcome;
      let back;
      if (h.surrendered) {
        outcome = "surrender";
        back = stake / 2;
      } else if (isNatural(h) && !dealerBJ) {
        outcome = "blackjack";
        back = stake + (stake * 3) / 2;
      } else if (t > 21) {
        outcome = "bust";
        back = 0;
      } else if (dealerBJ) {
        outcome = isNatural(h) ? "push" : "lose";
        back = isNatural(h) ? stake : 0;
      } else if (dealerBust || t > dealer) {
        outcome = "win";
        back = stake * 2;
      } else if (t === dealer) {
        outcome = "push";
        back = stake;
      } else {
        outcome = "lose";
        back = 0;
      }
      h.result = outcome;
      p.points += back;
      seatNet += back - stake;
      handResults.push({ outcome, bet: stake, net: back - stake, total: t });
      p.hands++;
      if (outcome === "win" || outcome === "blackjack") p.wins++;
      else if (outcome === "push") p.pushes++;
      else p.losses++;
      if (outcome === "blackjack") p.blackjacks++;
    }
    const ins = round.insurance[i];
    let insNet = 0;
    if (ins) {
      const back = dealerBJ ? ins * 3 : 0;
      p.points += back;
      insNet = back - ins;
      seatNet += insNet;
    }
    if (seatNet > p.best) p.best = seatNet;
    results.push({ seat: i, playerId: id, hands: handResults, insurance: ins ? insNet : null, net: seatNet, points: p.points });
  }
  round.results = results;
  round.active = null;
  s.phase = "settled";
  events.push({ type: "settle", round: round.number, dealer: { total: dealer, blackjack: dealerBJ, bust: dealerBust }, results, at });
}

function act(state, i, action, rng) {
  if (state.phase !== "playing") return C.fail(state, "not_playing");
  const a = state.round.active;
  if (!a || a.seat !== i) return C.fail(state, "not_your_turn");
  if (C.isInt(action.hand) && action.hand !== a.hand) return C.fail(state, "not_this_hand");
  const allowed = legalActions(state, i);
  if (!allowed.includes(action.type)) return C.fail(state, "illegal_action");
  const s = C.clone(state);
  const events = [];
  const h = currentHand(s);
  const p = s.players[ledgerId(s.seats[i])];
  switch (action.type) {
    case "hit": {
      const c = drawCard(s, rng, events);
      h.cards.push(c);
      const t = handTotal(h.cards).total;
      events.push({ type: "card", to: "seat", seat: i, hand: a.hand, card: describeCard(c), total: t, at: 0 });
      if (t >= 21) h.done = true;
      break;
    }
    case "stand":
      h.done = true;
      events.push({ type: "stand", seat: i, hand: a.hand });
      break;
    case "double": {
      p.points -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      const c = drawCard(s, rng, events);
      h.cards.push(c);
      h.done = true;
      events.push({ type: "double", seat: i, hand: a.hand, bet: h.bet });
      events.push({ type: "card", to: "seat", seat: i, hand: a.hand, card: describeCard(c), total: handTotal(h.cards).total, at: 0 });
      break;
    }
    case "split": {
      p.points -= h.bet;
      const aces = rankOf(h.cards[0]) === 0;
      const second = newHand(h.bet);
      second.cards.push(h.cards.pop());
      h.split = true;
      second.split = true;
      h.splitAces = aces;
      second.splitAces = aces;
      s.round.hands[i].splice(a.hand + 1, 0, second);
      events.push({ type: "split", seat: i, hand: a.hand, hands: s.round.hands[i].length });
      const c = drawCard(s, rng, events);
      h.cards.push(c);
      events.push({ type: "card", to: "seat", seat: i, hand: a.hand, card: describeCard(c), total: handTotal(h.cards).total, at: 0 });
      if (aces || handTotal(h.cards).total === 21) h.done = true;
      break;
    }
    case "surrender":
      h.surrendered = true;
      h.done = true;
      events.push({ type: "surrender", seat: i, hand: a.hand });
      break;
    default:
      return C.fail(state, "bad_action");
  }
  if (h.done) advance(s, rng, events);
  s.seq++;
  return C.ok(s, events);
}

/** Legal moves for the seat's active hand. */
function legalActions(state, i) {
  if (state.phase !== "playing" || !state.round.active || state.round.active.seat !== i) return [];
  const h = state.round.hands[i][state.round.active.hand];
  const p = state.players[ledgerId(state.seats[i])];
  const out = ["hit", "stand"];
  if (h.cards.length === 2) {
    if (p.points >= h.bet) out.push("double");
    const handsNow = state.round.hands[i].length;
    const sameValue = valueOf(h.cards[0]) === valueOf(h.cards[1]);
    const aces = rankOf(h.cards[0]) === 0 && rankOf(h.cards[1]) === 0;
    if (sameValue && handsNow < state.options.maxHands && p.points >= h.bet && !(aces && h.splitAces)) out.push("split");
    if (state.options.surrender && !h.split && state.round.hands[i].length === 1) out.push("surrender");
  }
  return out;
}

function insuranceDecision(state, i, take, rng) {
  if (state.phase !== "insurance") return C.fail(state, "not_insurance");
  const round = state.round;
  if (!round.hands[i].length) return C.fail(state, "not_in_round");
  if (round.insurance[i] !== null) return C.fail(state, "already_decided");
  const cost = round.hands[i][0].bet / 2;
  const p = state.players[ledgerId(state.seats[i])];
  if (take && p.points < cost) return C.fail(state, "not_enough_points");
  const s = C.clone(state);
  s.round.insurance[i] = take ? cost : 0;
  if (take) s.players[ledgerId(s.seats[i])].points -= cost;
  s.seq++;
  const events = [{ type: "insurance", seat: i, take }];
  progress(s, rng, events);
  return C.ok(s, events);
}

function closeInsurance(s, rng, events) {
  for (let i = 0; i < s.round.insurance.length; i++) if (s.round.hands[i].length && s.round.insurance[i] === null) s.round.insurance[i] = 0;
  peekAndPlay(s, rng, events);
}

// ---------------------------------------------------------------- dispatcher

function apply(state, playerId, action, ctx = {}) {
  if (!action || typeof action !== "object" || typeof action.type !== "string") return C.fail(state, "bad_action");
  const rng = C.rngOf(ctx);
  if (playerId === C.SYSTEM) return systemAction(state, action, rng);
  const id = C.cleanPlayerId(playerId);
  if (action.type === "refill") return refill(state, id);
  const i = C.seatOf(state, id);
  if (i < 0) return C.fail(state, "not_seated");
  switch (action.type) {
    case "bet":
      return placeBet(state, i, action.amount, rng);
    case "clearBet":
      return clearBet(state, i);
    case "insurance":
      return insuranceDecision(state, i, action.take === true, rng);
    case "hit":
    case "stand":
    case "double":
    case "split":
    case "surrender":
      return act(state, i, action, rng);
    default:
      return C.fail(state, "bad_action");
  }
}

function systemAction(state, action, rng) {
  const s = C.clone(state);
  const events = [];
  switch (action.type) {
    case "deal":
      if (state.phase !== "betting") return C.fail(state, "not_betting");
      if (!state.bets.some((b) => b > 0)) return C.fail(state, "no_bets");
      dealRound(s, rng, events);
      break;
    case "closeInsurance":
      if (state.phase !== "insurance") return C.fail(state, "not_insurance");
      closeInsurance(s, rng, events);
      s.seq++;
      break;
    case "nextRound":
      if (state.phase !== "settled") return C.fail(state, "not_settled");
      nextRound(s, events);
      break;
    default:
      return C.fail(state, "bad_action");
  }
  return C.ok(s, events);
}

function nextRound(s, events) {
  for (const i of s.leaving) {
    events.push({ type: "seat", seat: i, playerId: null });
    s.seats[i] = C.emptySeat();
  }
  s.leaving = [];
  // Cards of the round go to the tray (conservation: shoe + tray + table = decks * 52).
  if (s.round) {
    for (const hands of s.round.hands) for (const h of hands) s.shoe.tray.push(...h.cards);
    s.shoe.tray.push(...s.round.dealer.cards);
  }
  s.round = null;
  s.bets = s.bets.map(() => 0);
  s.phase = s.seats.some((x) => x.playerId) ? "betting" : "idle";
  s.seq++;
  events.push({ type: "betting", round: s.roundNo + 1 });
}

// ---------------------------------------------------------------- timers and bots

function timers(state) {
  const o = state.options;
  switch (state.phase) {
    case "betting":
      if (!state.bets.some((b) => b > 0)) return [];
      return [{ key: `bet:${state.roundNo}`, kind: "system", playerId: C.SYSTEM, ms: o.betMs, action: { type: "deal" } }];
    case "insurance":
      return [{ key: `ins:${state.roundNo}`, kind: "system", playerId: C.SYSTEM, ms: o.insuranceMs, action: { type: "closeInsurance" } }];
    case "playing": {
      const a = state.round.active;
      if (!a) return [];
      const seatRec = state.seats[a.seat];
      const h = state.round.hands[a.seat][a.hand];
      const key = `act:${state.roundNo}:${a.seat}:${a.hand}:${h.cards.length}`;
      if (C.botControlled(seatRec)) {
        return [{ key: `${key}:bot`, kind: "bot", playerId: seatRec.playerId, ms: C.delayFor(key, o.botDelayMs[0], o.botDelayMs[1]) }];
      }
      return [{ key, kind: "turn", playerId: seatRec.playerId, ms: o.actMs + (state.round.dealAt || 0), action: { type: "stand" } }];
    }
    case "settled":
      return [{ key: `settle:${state.roundNo}`, kind: "system", playerId: C.SYSTEM, ms: o.settleMs, action: { type: "nextRound" } }];
    default:
      return [];
  }
}

/**
 * Basic strategy for 4-8 decks, dealer stands on soft 17, double after split,
 * late surrender. Used by the autopilot when a player dropped.
 */
function basicStrategy(cards, upCard, allowed) {
  const up = valueOf(upCard); // 2..11
  const can = (x) => allowed.includes(x);
  const { total, soft } = handTotal(cards);
  if (cards.length === 2 && can("split") && valueOf(cards[0]) === valueOf(cards[1])) {
    const v = valueOf(cards[0]);
    const split =
      v === 11 ||
      v === 8 ||
      (v === 9 && ((up >= 2 && up <= 6) || up === 8 || up === 9)) ||
      (v === 7 && up <= 7) ||
      (v === 6 && up <= 6) ||
      (v === 4 && (up === 5 || up === 6)) ||
      ((v === 3 || v === 2) && up <= 7);
    if (split) return "split";
  }
  if (!soft && can("surrender")) {
    if (total === 16 && up >= 9) return "surrender";
    if (total === 15 && up === 10) return "surrender";
  }
  if (soft) {
    if (total >= 19) return "stand";
    if (total === 18) {
      if (up >= 3 && up <= 6) return can("double") ? "double" : "stand";
      if (up <= 8) return "stand";
      return "hit";
    }
    if (total === 17) return up >= 3 && up <= 6 && can("double") ? "double" : "hit";
    if (total === 15 || total === 16) return up >= 4 && up <= 6 && can("double") ? "double" : "hit";
    if (total === 13 || total === 14) return up >= 5 && up <= 6 && can("double") ? "double" : "hit";
    return "hit";
  }
  if (total >= 17) return "stand";
  if (total >= 13) return up <= 6 ? "stand" : "hit";
  if (total === 12) return up >= 4 && up <= 6 ? "stand" : "hit";
  if (total === 11) return up <= 10 && can("double") ? "double" : "hit";
  if (total === 10) return up <= 9 && can("double") ? "double" : "hit";
  if (total === 9) return up >= 3 && up <= 6 && can("double") ? "double" : "hit";
  return "hit";
}

function botAction(state, playerId) {
  const i = C.seatOf(state, playerId);
  if (i < 0 || state.phase !== "playing" || !state.round.active || state.round.active.seat !== i) return null;
  const h = state.round.hands[i][state.round.active.hand];
  return { type: basicStrategy(h.cards, state.round.dealer.cards[0], legalActions(state, i)) };
}

// ---------------------------------------------------------------- views

function dealerView(state) {
  const r = state.round;
  if (!r) return null;
  const shown = r.dealer.revealed ? r.dealer.cards : r.dealer.cards.slice(0, 1);
  const cards = shown.map(describeCard);
  if (!r.dealer.revealed && r.dealer.cards.length > 1) cards.push({ hidden: true });
  return { cards, total: handTotal(shown).total, revealed: r.dealer.revealed };
}

function seatView(state, i) {
  const seatRec = state.seats[i];
  const r = state.round;
  const p = seatRec.playerId && state.players[ledgerId(seatRec)];
  return {
    ...C.publicSeat(seatRec, i),
    points: p ? p.points : null,
    bet: state.bets[i] || 0,
    leaving: state.leaving.includes(i),
    insurance: r ? r.insurance[i] : null,
    hands: r
      ? r.hands[i].map((h) => ({
          cards: h.cards.map(describeCard),
          total: handTotal(h.cards).total,
          soft: handTotal(h.cards).soft,
          bet: h.bet,
          doubled: h.doubled,
          split: h.split,
          surrendered: h.surrendered,
          done: h.done,
          result: h.result,
        }))
      : [],
  };
}

function leaderboard(state) {
  const start = state.options.startPoints;
  return Object.entries(state.players)
    .map(([playerId, p]) => ({
      playerId,
      name: p.name,
      points: p.points,
      net: p.points - start * (1 + p.refills),
      refills: p.refills,
      hands: p.hands,
      wins: p.wins,
      losses: p.losses,
      pushes: p.pushes,
      blackjacks: p.blackjacks,
      best: p.best,
    }))
    .sort((a, b) => b.net - a.net || b.wins - a.wins || a.playerId.localeCompare(b.playerId));
}

function publicView(state) {
  const o = state.options;
  const r = state.round;
  return {
    game: GAME,
    phase: state.phase,
    seq: state.seq,
    options: {
      seats: o.seats,
      decks: o.decks,
      minBet: o.minBet,
      maxBet: o.maxBet,
      betStep: o.betStep,
      startPoints: o.startPoints,
      insurance: o.insurance,
      surrender: o.surrender,
      maxHands: o.maxHands,
      dealerStandsSoft17: true,
      blackjackPays: "3:2",
    },
    round: r ? r.number : state.roundNo,
    shoe: { remaining: state.shoe.cards.length, reshuffleNext: state.shoe.needsShuffle },
    dealer: dealerView(state),
    seats: state.seats.map((_, i) => seatView(state, i)),
    active: r && r.active ? { ...r.active } : null,
    results: r && r.results ? r.results : null,
    leaderboard: leaderboard(state),
    you: null,
  };
}

function viewFor(state, playerId) {
  const v = publicView(state);
  const id = C.cleanPlayerId(playerId);
  const i = C.seatOf(state, id);
  const p = state.players[id];
  if (i >= 0 || p) {
    v.you = {
      seat: i >= 0 ? i : null,
      points: p ? p.points : state.options.startPoints,
      actions: i >= 0 ? legalActions(state, i) : [],
      canInsure: Boolean(i >= 0 && state.phase === "insurance" && state.round.hands[i].length && state.round.insurance[i] === null),
      canRefill: Boolean(p && p.points < state.options.minBet),
      maxBet: p ? Math.min(state.options.maxBet, Math.floor(p.points / state.options.betStep) * state.options.betStep) : 0,
    };
  }
  return v;
}

function scores(state) {
  return leaderboard(state);
}

module.exports = {
  GAME,
  DEFAULTS,
  FREE_ACTIONS,
  RANKS,
  SUITS,
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
  leaderboard,
  legalActions,
  handTotal,
  valueOf,
  rankOf,
  describeCard,
  basicStrategy,
};
