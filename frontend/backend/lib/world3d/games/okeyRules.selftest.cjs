"use strict";

/**
 * Okey rules: tiles, okey tile, win validation tables, partition search, rack helper.
 * Run: node frontend/backend/lib/world3d/games/okeyRules.selftest.cjs
 */

const assert = require("assert");
const R = require("./okeyRules");
const { seeded } = require("./testkit.cjs");

const COLOR = { Y: 0, B: 1, K: 2, R: 3 };
const id = (c, n, copy = 0) => copy * 52 + COLOR[c] * 13 + n - 1;

/**
 * Hand notation: "Y1 B12 K7 R13", J = false okey, a trailing ' picks the second copy.
 * Duplicates without ' get the second copy automatically.
 */
function hand(str) {
  const used = new Set();
  let fakes = 0;
  return str
    .trim()
    .split(/\s+/)
    .map((tok) => {
      if (tok === "J") return R.FAKE_IDS[fakes++];
      const m = /^([YBKR])(\d{1,2})('?)$/.exec(tok);
      if (!m) throw new Error(`bad tile ${tok}`);
      let t = id(m[1], Number(m[2]), m[3] ? 1 : 0);
      if (used.has(t)) t = id(m[1], Number(m[2]), 1);
      if (used.has(t)) throw new Error(`three copies of ${tok}`);
      used.add(t);
      return t;
    });
}

let checks = 0;
const ok = (cond, msg) => {
  checks++;
  assert.ok(cond, msg);
};
const eq = (a, b, msg) => {
  checks++;
  assert.deepStrictEqual(a, b, msg);
};

// ---------------------------------------------------------------- tiles and okey

eq(R.TILE_COUNT, 106);
eq(new Set(Array.from({ length: 104 }, (_, i) => `${R.tileColor(i)}-${R.tileNum(i)}`)).size, 52, "52 faces x 2 copies");
eq(R.isFake(104) && R.isFake(105) && !R.isFake(103), true);
// Okey = same colour, next number; 13 wraps to 1.
const okeyOf = (c, n) => {
  const f = R.okeyFaceFor(id(c, n));
  return [R.faceColor(f), R.faceNum(f)];
};
eq(okeyOf("R", 7), [3, 8], "indicator red 7 -> okey red 8 (draft)");
eq(okeyOf("Y", 13), [0, 1], "13 wraps to 1");
eq(okeyOf("B", 1), [1, 2]);
eq(okeyOf("K", 12), [2, 13]);
eq(okeyOf("R", 7), okeyOf("R", 7), "both copies of the indicator agree");
eq(R.okeyFaceFor(id("R", 7, 1)), R.okeyFaceFor(id("R", 7, 0)));

// Indicator K3 -> okey K4 for the tables below.
const OKEY = R.okeyFaceFor(id("K", 3));
eq([R.faceColor(OKEY), R.faceNum(OKEY)], [2, 4]);
eq(R.meldFace(id("K", 4), OKEY), R.WILD, "real okey is wild");
eq(R.meldFace(id("K", 4, 1), OKEY), R.WILD, "both okeys are wild");
eq(R.meldFace(104, OKEY), OKEY, "false okey stands for the okey face");
ok(R.isOkey(id("K", 4), OKEY) && !R.isOkey(104, OKEY) && !R.isOkey(id("K", 5), OKEY));
eq(R.describeTile(104, OKEY), { id: 104, fake: true, color: "black", num: 4 });
eq(R.describeTile(id("K", 4), OKEY), { id: id("K", 4), color: "black", num: 4, okey: true });

// ---------------------------------------------------------------- win validation table
// OK = a real okey (K4 here). J = false okey (= K4 face, not wild).

const WIN_SETS = [
  ["Y1 Y2 Y3 B12 B13 B1 K7 Y7 B7 R2 R3 R4 R5 R6", "runs, 12-13-1, group"],
  ["Y11 Y12 Y13 Y1 B5 K5 R5 Y5 B9 B10 B11 R1 K1 B1", "11-12-13-1 run, group of 4, group of 3 ones"],
  ["Y1 Y2 Y3 Y4 Y5 Y6 Y7 Y8 Y9 Y10 Y11 Y12 Y13 Y1", "one 14-tile run 1..13-1"],
  ["Y3 K4 Y5 B8 B9 B10 R11 R12 R13 Y6 B6 R6 K6 Y7", "okey fills a run gap"],
  ["Y9 K4 K4 B1 B2 B3 R7 R8 R9 R10 Y12 B12 R12 K12", "one tile plus two okeys"],
  ["K1 K2 K3 J K5 B5 B6 B7 R5 R6 R7 Y1 B1 R1", "false okey plays as black 4 in a run"],
  ["Y13 Y1 K4 B5 B6 B7 B8 R5 R6 R7 R8 Y9 B9 R9", "13-1 with an okey becomes 12-13-1"],
  ["Y4 B4 R4 J Y9 Y10 Y11 B1 B2 B3 R10 R11 R12 R13", "false okey completes a group of fours"],
  ["Y5 B5 K4 R7 R8 R9 R10 Y1 Y2 Y3 B11 B12 B13 B1", "okey as the third colour of a group"],
  ["Y1 Y2 Y3 Y4 Y5 Y6 B1 B2 B3 B4 R1 R2 R3 R4", "long runs"],
];
const WIN_PAIRS = [
  ["Y1 Y1 B5 B5 K9 K9 R13 R13 Y7 Y7 B2 B2 R6 R6", "seven pairs"],
  ["Y1 Y1 B5 B5 K9 K9 R13 R13 Y7 Y7 B2 B2 R6 K4", "okey pairs a single"],
  ["Y1 Y1 B5 B5 K9 K9 R13 R13 Y7 Y7 B2 B2 K4 K4", "two okeys pair together"],
  ["Y1 Y1 B5 B5 K9 K9 R13 R13 Y7 Y7 B2 B2 J J", "two false okeys pair"],
  ["Y1 Y1 B5 B5 K9 K9 R13 R13 Y7 Y7 B2 B2 J K4", "false okey with a real okey"],
];
const NOT_WIN = [
  ["Y12 Y13 Y1 B5 B6 B7 R5 R6 R7 Y8 B8 R8 K8 Y2", "single left over"],
  ["Y13 Y1 Y2 B5 B6 B7 R5 R6 R7 Y8 B8 R8 K8 K9", "13-1-2 is not a run"],
  ["Y5 Y5 B5 B6 B7 B8 R5 R6 R7 Y8 B9 R8 K8 K9", "same colour twice is not a group"],
  ["Y5 B5 J B6 B7 B8 R5 R6 R7 Y8 B9 R8 K8 K9", "a false okey is not wild"],
  ["Y1 Y2 B4 B5 R7 R8 K10 K11 Y13 B13 R6 K2 Y9 B11", "two-tile runs are not melds"],
  ["Y1 Y2 B1 B2 R1 R2 K1 K2 Y5 B5 R5 Y9 B9 K10", "one tile short of four melds"],
  ["Y1 Y1 B5 B5 K9 K9 R13 R13 Y7 Y7 B2 B2 R6 R7", "six pairs and two singles"],
  ["Y1 Y1 B5 B5 K9 K9 R13 R13 Y7 Y7 B2 B2 R6 J", "false okey does not pair with red 6"],
  ["Y1 Y2 Y3 B7 B8 B9 R10 R11 R12 K1 K2 K3 Y12 B12", "two tiles left"],
  ["Y2 Y4 Y6 B7 B8 B9 R10 R11 R12 K1 K2 K3 Y12 B12", "no gaps without okeys"],
];

for (const [h, why] of WIN_SETS) {
  const w = R.findWin(hand(h), OKEY);
  ok(w && w.kind === "sets", `should win (sets): ${why}`);
}
for (const [h, why] of WIN_PAIRS) {
  const w = R.findWin(hand(h), OKEY);
  ok(w && w.kind === "pairs", `should win (pairs): ${why}`);
}
for (const [h, why] of NOT_WIN) ok(!R.findWin(hand(h), OKEY), `should not win: ${why}`);
ok(!R.findWin(hand("Y1 Y2 Y3 B12 B13 B1 K7 Y7 B7 R2 R3 R4 R5"), OKEY), "13 tiles never win");
ok(!R.findWin(hand("Y1 Y2 Y3 B12 B13 B1 K7 Y7 B7 R2 R3 R4 R5 R6 R7"), OKEY), "15 tiles never win");

// ---------------------------------------------------------------- independent meld checker

function checkMeld(ids, okeyFace) {
  const faces = ids.map((t) => R.meldFace(t, okeyFace));
  const real = faces.filter((f) => f !== R.WILD);
  if (ids.length < 3) return false;
  // group
  const nums = new Set(real.map(R.faceNum));
  const cols = real.map(R.faceColor);
  if (ids.length <= 4 && nums.size <= 1 && new Set(cols).size === cols.length) return true;
  // run in table order: find a start rank r0 so that position k has rank r0 + k (14 = 1 high)
  if (new Set(cols).size > 1) return false;
  for (let r0 = 1; r0 + ids.length - 1 <= 14; r0++) {
    let good = true;
    for (let k = 0; k < ids.length && good; k++) {
      if (faces[k] === R.WILD) continue;
      const rank = r0 + k;
      if (R.faceNum(faces[k]) !== (rank === 14 ? 1 : rank)) good = false;
    }
    if (good) return true;
  }
  return false;
}

function checkPair(ids, okeyFace) {
  if (ids.length !== 2) return false;
  const [a, b] = ids.map((t) => R.meldFace(t, okeyFace));
  return a === R.WILD || b === R.WILD || a === b;
}

function checkWin(ids, okeyFace, w) {
  const flat = w.melds.flat().sort((a, b) => a - b);
  if (JSON.stringify(flat) !== JSON.stringify(ids.slice().sort((a, b) => a - b))) return false;
  return w.melds.every((m) => (w.kind === "pairs" ? checkPair(m, okeyFace) : checkMeld(m, okeyFace)));
}

for (const [h] of [...WIN_SETS, ...WIN_PAIRS]) {
  const ids = hand(h);
  ok(checkWin(ids, OKEY, R.findWin(ids, OKEY)), `melds of a win check out: ${h}`);
}

// Randomized: (1) constructed winning hands are always found (completeness);
// (2) every win reported on random hands passes the independent checker (soundness).
const rng = seeded("okey-rules");
function randomWinningHand() {
  for (;;) {
    const ind = rng.int(104);
    const okeyFace = R.okeyFaceFor(ind);
    const pool = new Set(Array.from({ length: 106 }, (_, i) => i));
    pool.delete(ind);
    const take = (t) => (pool.has(t) ? (pool.delete(t), t) : null);
    const pick = (c, n) => take(c * 13 + n - 1) ?? take(52 + c * 13 + n - 1);
    const ids = [];
    const sizes = [[3, 3, 4, 4], [3, 3, 3, 5], [4, 4, 6], [3, 4, 7], [5, 5, 4], [3, 3, 3, 3, 2]][rng.int(6)];
    if (sizes.includes(2)) continue; // keep shapes legal (no 2-melds)
    let good = true;
    for (const size of sizes) {
      if (size <= 4 && rng.float() < 0.5) {
        const n = 1 + rng.int(13);
        const colors = [0, 1, 2, 3].sort(() => rng.float() - 0.5).slice(0, size);
        for (const c of colors) {
          const t = pick(c, n);
          if (t == null) good = false;
          else ids.push(t);
        }
      } else {
        const c = rng.int(4);
        const start = 1 + rng.int(14 - size + 1);
        for (let r = start; r < start + size; r++) {
          const t = pick(c, r === 14 ? 1 : r);
          if (t == null) good = false;
          else ids.push(t);
        }
      }
    }
    if (!good || ids.length !== 14) continue;
    // Swap 0..2 random tiles for the okeys (they are wild, the hand stays winning).
    const okIds = [okeyFace, 52 + okeyFace].filter((t) => pool.has(t));
    const swaps = rng.int(Math.min(2, okIds.length) + 1);
    for (let k = 0; k < swaps; k++) ids[rng.int(14)] = okIds[k];
    if (new Set(ids).size !== 14) continue;
    // A tile that happens to be the okey face is wild anyway; the hand still wins.
    return { ids, okeyFace };
  }
}

const t0 = Date.now();
let constructed = 0;
for (let i = 0; i < 1500; i++) {
  const { ids, okeyFace } = randomWinningHand();
  const w = R.findWin(ids, okeyFace);
  ok(w, `constructed winning hand must win: ${ids.join(",")}`);
  ok(checkWin(ids, okeyFace, w), "constructed win checks out");
  constructed++;
}
let randomWins = 0;
for (let i = 0; i < 4000; i++) {
  const okeyFace = rng.int(52);
  const deck = Array.from({ length: 106 }, (_, k) => k);
  for (let k = deck.length - 1; k > 0; k--) {
    const j = rng.int(k + 1);
    [deck[k], deck[j]] = [deck[j], deck[k]];
  }
  const ids = deck.slice(0, 14);
  const w = R.findWin(ids, okeyFace);
  if (w) {
    randomWins++;
    ok(checkWin(ids, okeyFace, w), "reported win checks out");
  }
  // bestPartition is consistent with findWin: 14 placed <=> sets win.
  const bp = R.bestPartition(ids, okeyFace);
  ok(bp.melds.every((m) => checkMeld(m, okeyFace)), "partition melds are valid");
  eq(bp.melds.flat().length + bp.rest.length, 14, "partition keeps every tile");
  const setsWin = Boolean(R.searchMelds(...Object.values(R.countHand(ids, okeyFace)), "all"));
  eq(bp.score === 14, setsWin, "max partition 14 iff the hand is a sets win");
}
const randMs = Date.now() - t0;

// ---------------------------------------------------------------- partition and rack helper

const part = R.bestPartition(hand("Y1 Y2 Y3 Y9 B7 K7 R7 R1 R12 B4 B5 K11 Y13 R10"), OKEY);
eq(part.score, 6, "two melds found, the rest left over");
const pairsInfo = R.pairsInfo(...Object.values(R.countHand(hand("Y1 Y1 B5 B5 K4 R2 R3 R9 R10 K10 Y12 Y13 B1 B2"), OKEY)));
eq(pairsInfo.pairs, 2);
eq(pairsInfo.total, 3, "okey completes a third pair");

const h15 = hand("Y3 Y4 Y5 B9 B10 B11 K7 Y7 B7 K1 Y2 Y3 K12 K13 R8");
const sug = R.suggestArrangement(h15, OKEY, "runs");
eq(sug.slots.length, R.RACK_SLOTS);
ok(R.validSlots(sug.slots, h15), "suggested layout holds the rack exactly");
ok(sug.melds.length >= 3 && sug.melds.every((m) => checkMeld(m, OKEY)));
// Melds are separated by a gap and not split across rows.
for (const m of sug.melds) {
  const pos = m.map((t) => sug.slots.indexOf(t));
  ok(pos.every((p, k) => k === 0 || p === pos[k - 1] + 1), "meld tiles are adjacent");
  ok(Math.floor(pos[0] / R.RACK_COLS) === Math.floor(pos[pos.length - 1] / R.RACK_COLS), "meld on one row");
}
const pairSug = R.suggestArrangement(hand("Y1 Y1 B5 B5 K4 R2 R3 R9 R10 K10 Y12 Y13 B1 B2 R13"), OKEY, "pairs");
eq(pairSug.melds.length, 3, "two pairs plus okey with the highest single");
ok(pairSug.melds.every((m) => checkPair(m, OKEY)));
ok(R.validSlots(R.suggestArrangement(h15, OKEY, "sorted").slots, h15));

// validSlots rejects foreign, duplicate and missing tiles.
const good = sug.slots.slice();
ok(R.validSlots(good, h15));
const dup = good.slice();
dup[dup.indexOf(null)] = h15[0];
ok(!R.validSlots(dup, h15), "duplicate");
const foreign = good.slice();
foreign[foreign.indexOf(h15[0])] = 99;
ok(!R.validSlots(foreign, h15), "foreign tile");
const missing = good.slice();
missing[missing.indexOf(h15[1])] = null;
ok(!R.validSlots(missing, h15), "missing tile");
ok(!R.validSlots(good.slice(0, 10), h15), "wrong length");
// reconcileSlots keeps positions, drops gone tiles, adds new ones.
const rec = R.reconcileSlots(good, h15.slice(1).concat([hand("R13")[0]]));
ok(R.validSlots(rec, h15.slice(1).concat([hand("R13")[0]])));
eq(rec.indexOf(h15[2]), good.indexOf(h15[2]), "existing tile stays put");

console.log(`okeyRules.selftest: ok (${checks} checks, ${constructed} constructed wins, ${randomWins} random wins, randomized part ${randMs} ms)`);
