"use strict";

// Apple Watch games score rules (lib/watchGames.js): catalog, cleaning, merge direction.
const assert = require("assert");
const wg = require("./watchGames");

let n = 0;
function ok(name, fn) {
  fn();
  n += 1;
}

ok("catalog: ten games, modes, directions", () => {
  assert.strictEqual(Object.keys(wg.GAMES).length, 10);
  assert(!("tictactoe" in wg.GAMES), "no tic-tac-toe");
  assert(wg.isKnown("chess", "hard") && wg.isKnown("merge", "") && !wg.isKnown("chess", "") && !wg.isKnown("x", ""));
  assert.strictEqual(wg.GAMES.sudoku.dir, "low");
  assert.strictEqual(wg.GAMES.mines.dir, "low");
  assert.strictEqual(wg.GAMES.runner.dir, "high");
});

ok("sanitize: unknown rows, bad numbers and duplicates", () => {
  const rows = wg.sanitizeScores([
    { game: "runner", mode: "", best: 12.9, plays: 3 },
    { game: "runner", mode: "", best: 30, plays: 2 },
    { game: "sudoku", mode: "hard", best: 400, plays: 1 },
    { game: "sudoku", mode: "hard", best: 300, plays: 4 },
    { game: "chess", mode: "nope", best: 1 },
    { game: "evil'; drop", mode: "", best: 1 },
    { game: "pong", mode: "easy", best: -5 },
    { game: "pong", mode: "easy", best: "abc" },
    { game: "cards", mode: "", best: 9e99, plays: 9e99 },
    null,
    "x",
  ]);
  const by = Object.fromEntries(rows.map((r) => [`${r.game}:${r.mode}`, r]));
  assert.deepStrictEqual(by["runner:"], { game: "runner", mode: "", best: 30, plays: 3 });
  assert.deepStrictEqual(by["sudoku:hard"], { game: "sudoku", mode: "hard", best: 300, plays: 4 });
  assert(!by["chess:nope"] && !by["pong:easy"]);
  assert.strictEqual(by["cards:"].best, 1_000_000_000);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(wg.sanitizeScores("nope"), []);
  const many = Array.from({ length: 500 }, (_, i) => ({ game: "runner", mode: "", best: i }));
  assert.strictEqual(wg.sanitizeScores(many).length, 1);
});

ok("merge: high keeps the max, low the smallest finished time, plays never shrink", () => {
  assert.strictEqual(wg.better("high", 10, 7), 10);
  assert.strictEqual(wg.better("low", 0, 95), 95);
  assert.strictEqual(wg.better("low", 120, 0), 120);
  assert.strictEqual(wg.better("low", 120, 95), 95);
  const m = wg.mergeRow({ game: "mines", mode: "easy", best: 80, plays: 9 }, { game: "mines", mode: "easy", best: 0, plays: 4 });
  assert.deepStrictEqual(m, { game: "mines", mode: "easy", best: 80, plays: 9 });
  assert(!wg.changed({ best: 80, plays: 9 }, m));
  assert(wg.changed(null, m));
  const s = wg.summarize([{ game: "a", plays: 2, updatedAt: "2026-01-01" }, { game: "a", plays: 3, updatedAt: "2026-02-01" }]);
  assert.deepStrictEqual(s, { plays: 5, lastPlayedAt: "2026-02-01", games: 1 });
});

ok("days: format, window, bounds, merge only grows", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const days = wg.sanitizeDays([
    { day: "2026-11-26", seconds: 600, rounds: 4, records: 1 },
    { day: "2026-11-26", seconds: 300, rounds: 6, records: 0 },
    { day: "2026-11-27", seconds: 10 },
    { day: "2026-11-29", seconds: 10 },
    { day: "2026-10-01", seconds: 10 },
    { day: "26-11-2026", seconds: 10 },
    { day: "2026-11-25", seconds: 999999, rounds: -1 },
    { day: "2026-11-24", seconds: 999999 },
  ], now);
  assert.deepStrictEqual(days, [
    { day: "2026-11-24", seconds: 86400, rounds: 0, records: 0 },
    { day: "2026-11-26", seconds: 600, rounds: 6, records: 1 },
    { day: "2026-11-27", seconds: 10, rounds: 0, records: 0 },
  ]);
  assert.deepStrictEqual(wg.mergeDay({ seconds: 50, rounds: 9, records: 2 }, { day: "d", seconds: 40, rounds: 10, records: 1 }), { day: "d", seconds: 50, rounds: 10, records: 2 });
  assert.deepStrictEqual(wg.sanitizeDays(null), []);
});

console.log(`watchGames selftest ok (${n})`);
