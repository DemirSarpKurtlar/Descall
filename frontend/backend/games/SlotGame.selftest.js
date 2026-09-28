/**
 * Run: node frontend/backend/games/SlotGame.selftest.js
 */
const {
  evaluateLine,
  evaluateGrid,
  playRound,
  linePrize,
  LINE_COUNT,
  LEAD,
  REELS,
} = require("./SlotGame");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(evaluateLine(["ace", "ace", "king"]) === null, "two aces do not pay");
assert(evaluateLine(["cherry", "cherry", "king"])?.count === 2, "two cherries pay");
assert(evaluateLine(["scatter", "scatter", "scatter"]) === null, "scatter is not a line symbol");
assert(evaluateLine(["wild", "wild", "scatter", "seven"]) === null, "scatter breaks the line");

const sevens = evaluateLine(["seven", "seven", "seven", "queen", "king"]);
assert(sevens && sevens.count === 3 && sevens.symbol === "seven", "three sevens");

const wildDiamond = evaluateLine(["wild", "wild", "diamond", "queen", "king"]);
assert(
  wildDiamond && wildDiamond.symbol === "diamond" && wildDiamond.count === 3,
  "wilds substitute"
);

const allWild = evaluateLine(["wild", "wild", "wild", "wild", "wild"]);
assert(allWild && allWild.symbol === "wild" && allWild.count === 5, "five wilds");

const grid = [
  ["seven", "queen", "king"],
  ["seven", "ace", "king"],
  ["seven", "ace", "king"],
  ["queen", "ace", "king"],
  ["queen", "ace", "king"],
];
const scored = evaluateGrid(grid, 100);
const top = scored.wins.find((win) => win.line === 2);
assert(top && top.symbol === "seven" && top.count === 3, "top line sevens");
assert(top.amount === linePrize(100, 50), "line prize uses total bet / 10");
assert(LINE_COUNT === 10, "ten lines");
assert(scored.scatterCount === 0, "no scatter");

const scatterGrid = [
  ["scatter", "queen", "king"],
  ["scatter", "ace", "king"],
  ["scatter", "ace", "king"],
  ["queen", "ace", "king"],
  ["queen", "ace", "king"],
];
const scattered = evaluateGrid(scatterGrid, 100);
assert(scattered.scatterCount === 3 && scattered.scatterPay === 400, "three scatters pay 4× bet");

let cursor = 0;
const scripted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const round = playRound({
  bet: 100,
  rng: (max) => {
    const value = scripted[cursor % scripted.length] % max;
    cursor += 1;
    return value;
  },
});
assert(round.phases[0].strips.length === 5, "five strips");
assert(round.phases[0].strips[0].length === LEAD + 3, "lead-in plus window");
assert(round.phases[0].grid[0].length === 3, "three rows");
const visible = round.phases[0].strips[0].slice(-3);
assert(
  visible.join() === round.phases[0].grid[0].join(),
  "strip lands on the published window"
);
assert(REELS.every((strip) => strip.length > 20), "reels are built");

let prize = 0;
let hits = 0;
const samples = 6000;
for (let i = 0; i < samples; i += 1) {
  const played = playRound({ bet: 100 });
  prize += played.prize;
  if (played.prize > 0) hits += 1;
}
const rtp = prize / (samples * 100);
const hitRate = hits / samples;
console.log(
  `slot rtp over ${samples} rounds: ${(rtp * 100).toFixed(2)}% · hit ${(hitRate * 100).toFixed(1)}%`
);
assert(rtp > 0.75 && rtp < 1.12, `rtp out of band: ${rtp}`);
assert(hitRate > 0.16 && hitRate < 0.55, `hit rate out of band: ${hitRate}`);

console.log("SlotGame.selftest.js: ok");
