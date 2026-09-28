/**
 * Descall Casino — five-reel, ten-line slot.
 * Server draws the stop; the client only animates the published strip.
 * Wild substitutes on paylines. Scatter pays anywhere and opens free spins
 * (no retrigger). Stake is the whole bet; each line pays (multiplier × bet) / 10.
 */

const crypto = require("crypto");
const { MIN_BET, MAX_BET } = require("./BlackjackGame");

const LINE_COUNT = 10;
const LEAD = 18;
const FREE_SPIN_CAP = 15;

const PAY = {
  wild: { 3: 80, 4: 240, 5: 800 },
  seven: { 3: 50, 4: 160, 5: 500 },
  diamond: { 3: 32, 4: 96, 5: 280 },
  crown: { 3: 24, 4: 72, 5: 200 },
  bell: { 2: 4, 3: 16, 4: 44, 5: 120 },
  bar: { 2: 4, 3: 12, 4: 32, 5: 88 },
  cherry: { 2: 2, 3: 10, 4: 28, 5: 80 },
  ace: { 3: 8, 4: 20, 5: 56 },
  king: { 2: 2, 3: 8, 4: 20, 5: 48 },
  queen: { 2: 2, 3: 6, 4: 16, 5: 40 },
};

/** Multiplier of the total bet, not the line bet. */
const SCATTER_PAY = { 3: 4, 4: 16, 5: 50 };
const FREE_SPINS = { 3: 5, 4: 8, 5: 10 };

/**
 * Ten paylines, row 0 = top. Classic center / edges / diagonals / breaks.
 */
const LINES = [
  { id: 1, rows: [1, 1, 1, 1, 1] },
  { id: 2, rows: [0, 0, 0, 0, 0] },
  { id: 3, rows: [2, 2, 2, 2, 2] },
  { id: 4, rows: [0, 1, 2, 1, 0] },
  { id: 5, rows: [2, 1, 0, 1, 2] },
  { id: 6, rows: [0, 0, 1, 2, 2] },
  { id: 7, rows: [2, 2, 1, 0, 0] },
  { id: 8, rows: [1, 0, 1, 2, 1] },
  { id: 9, rows: [1, 2, 1, 0, 1] },
  { id: 10, rows: [0, 1, 1, 1, 2] },
];

/**
 * Per-reel weights. Frequent tiles (cherry, queen, king) keep the hit rate
 * alive; highs stay scarce so a five-seven is an event. Reels are not copies.
 */
const REEL_WEIGHTS = [
  { wild: 1, scatter: 1, seven: 1, diamond: 1, crown: 2, bell: 3, bar: 3, cherry: 7, ace: 3, king: 5, queen: 7 },
  { wild: 1, scatter: 1, seven: 1, diamond: 2, crown: 2, bell: 3, bar: 3, cherry: 6, ace: 3, king: 5, queen: 7 },
  { wild: 2, scatter: 1, seven: 1, diamond: 2, crown: 2, bell: 3, bar: 3, cherry: 6, ace: 3, king: 4, queen: 6 },
  { wild: 1, scatter: 1, seven: 1, diamond: 2, crown: 2, bell: 3, bar: 3, cherry: 6, ace: 3, king: 5, queen: 7 },
  { wild: 1, scatter: 1, seven: 1, diamond: 1, crown: 2, bell: 2, bar: 3, cherry: 7, ace: 3, king: 5, queen: 8 },
];

function buildStrip(weights) {
  const strip = [];
  for (const [symbol, count] of Object.entries(weights)) {
    for (let i = 0; i < count; i += 1) strip.push(symbol);
  }
  return strip;
}

const REELS = REEL_WEIGHTS.map(buildStrip);

function randomInt(max) {
  return crypto.randomInt(0, max);
}

function lineSymbols(grid, rows) {
  return rows.map((row, reel) => grid[reel][row]);
}

/**
 * Left-to-right. Wilds substitute. Scatter breaks the line and never pays as a line symbol.
 * Returns null when fewer than 3 paying symbols connect from the left.
 */
function evaluateLine(symbols) {
  let paySymbol = null;
  for (const symbol of symbols) {
    if (symbol === "scatter") return null;
    if (symbol !== "wild") {
      paySymbol = symbol;
      break;
    }
  }
  if (!paySymbol) {
    if (symbols.length >= 3 && symbols.every((symbol) => symbol === "wild")) {
      return { symbol: "wild", count: symbols.length, multiplier: PAY.wild[symbols.length] || 0 };
    }
    return null;
  }
  let count = 0;
  for (const symbol of symbols) {
    if (symbol === paySymbol || symbol === "wild") count += 1;
    else break;
  }
  const multiplier = PAY[paySymbol]?.[count];
  if (!multiplier) return null;
  return { symbol: paySymbol, count, multiplier };
}

function scatterCount(grid) {
  let count = 0;
  for (const reel of grid) {
    for (const symbol of reel) {
      if (symbol === "scatter") count += 1;
    }
  }
  return count;
}

function linePrize(bet, multiplier) {
  return Math.floor((bet * multiplier) / LINE_COUNT);
}

function evaluateGrid(grid, bet) {
  const wins = [];
  let lineTotal = 0;
  for (const line of LINES) {
    const symbols = lineSymbols(grid, line.rows);
    const hit = evaluateLine(symbols);
    if (!hit || !hit.multiplier) continue;
    const amount = linePrize(bet, hit.multiplier);
    if (amount <= 0) continue;
    lineTotal += amount;
    wins.push({
      line: line.id,
      rows: line.rows,
      symbol: hit.symbol,
      count: hit.count,
      multiplier: hit.multiplier,
      amount,
      cells: line.rows.slice(0, hit.count).map((row, reel) => ({ reel, row })),
    });
  }
  const scatters = scatterCount(grid);
  const scatterMultiplier = SCATTER_PAY[scatters] || 0;
  const scatterPay = scatterMultiplier ? bet * scatterMultiplier : 0;
  return {
    wins,
    scatterCount: scatters,
    scatterPay,
    prize: lineTotal + scatterPay,
  };
}

function drawGrid(rng) {
  const stops = REELS.map((strip) => rng(strip.length));
  const grid = stops.map((stop, reel) => {
    const strip = REELS[reel];
    const n = strip.length;
    return [0, 1, 2].map((offset) => strip[(stop + offset) % n]);
  });
  const strips = stops.map((stop, reel) => {
    const strip = REELS[reel];
    const n = strip.length;
    const symbols = [];
    for (let i = LEAD; i >= 1; i -= 1) {
      symbols.push(strip[(stop - i + n * 8) % n]);
    }
    symbols.push(grid[reel][0], grid[reel][1], grid[reel][2]);
    return symbols;
  });
  return { stops, grid, strips };
}

function spinPhase(bet, rng, kind, freeIndex, freeTotal) {
  const drawn = drawGrid(rng);
  const scored = evaluateGrid(drawn.grid, bet);
  return {
    kind,
    freeIndex,
    freeTotal,
    stops: drawn.stops,
    grid: drawn.grid,
    strips: drawn.strips,
    wins: scored.wins,
    scatterCount: scored.scatterCount,
    scatterPay: scored.scatterPay,
    prize: scored.prize,
  };
}

/**
 * One paid round. Free spins are generated up front so every spectator
 * animates the same sequence. Scatters inside free spins pay, but do not
 * add more spins.
 */
function playRound({ bet, rng = randomInt } = {}) {
  const base = spinPhase(bet, rng, "base", 0, 0);
  const awarded = Math.min(FREE_SPIN_CAP, FREE_SPINS[base.scatterCount] || 0);
  const freeSpins = [];
  for (let i = 0; i < awarded; i += 1) {
    freeSpins.push(spinPhase(bet, rng, "free", i + 1, awarded));
  }
  const prize = base.prize + freeSpins.reduce((sum, phase) => sum + phase.prize, 0);
  const profit = prize - bet;
  let result = "loss";
  if (profit > 0) result = "win";
  else if (profit === 0) result = "push";
  return {
    phases: [base, ...freeSpins],
    freeSpins: awarded,
    prize,
    profit,
    result,
    bet,
  };
}

function roundId() {
  return `slot_${crypto.randomBytes(8).toString("hex")}`;
}

function toPublicState({ userId, username, groupId, bet, round, credits }) {
  const base = round.phases[0];
  return {
    game: "slot",
    id: round.id,
    userId,
    username,
    groupId,
    bet,
    status: "finished",
    result: round.result,
    winAmount: round.prize,
    profit: round.profit,
    freeSpins: round.freeSpins,
    grid: base.grid,
    phases: round.phases,
    paytable: PAY,
    scatterPay: SCATTER_PAY,
    lineCount: LINE_COUNT,
    credits: credits ?? null,
    actions: [],
  };
}

module.exports = {
  PAY,
  LINES,
  LINE_COUNT,
  REELS,
  LEAD,
  SCATTER_PAY,
  FREE_SPINS,
  MIN_BET,
  MAX_BET,
  evaluateLine,
  evaluateGrid,
  playRound,
  toPublicState,
  roundId,
  linePrize,
};
