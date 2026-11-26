"use strict";

/**
 * Apple Watch games (admin only, owner request Nov 2026): the best scores the admin's
 * watch keeps locally are mirrored to the account so a new or reset watch gets them back.
 * Pure rules, no db: which games and modes exist, which direction is "better", how a
 * reported row is cleaned and how two rows merge. Mirrors the watch catalog in
 * ios/App/DescallWatch/Games/Logic/GameCore.swift (GameId, GameBest.merge).
 *
 * dir "high": a bigger number is better (points, wins). dir "low": a smaller number is
 * better (seconds to solve); 0 means "never finished" and never wins a merge.
 */

const GAMES = Object.freeze({
  pong: { dir: "high", modes: ["easy", "normal", "hard"] },
  bricks: { dir: "high", modes: [""] },
  snake: { dir: "high", modes: ["walls", "wrap"] },
  merge: { dir: "high", modes: [""] },
  blocks: { dir: "high", modes: [""] },
  mines: { dir: "low", modes: ["easy", "medium", "hard"] },
  sudoku: { dir: "low", modes: ["easy", "medium", "hard"] },
  chess: { dir: "high", modes: ["easy", "normal", "hard"] },
  runner: { dir: "high", modes: [""] },
  cards: { dir: "high", modes: [""] },
});

const MAX_BEST = 1_000_000_000;
const MAX_PLAYS = 10_000_000;
const MAX_ROWS = 40;

function isKnown(game, mode) {
  const g = GAMES[game];
  return Boolean(g) && g.modes.includes(mode);
}

function toInt(v, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(max, Math.floor(n));
}

/**
 * Cleans what the watch reported: known game + mode only, whole non-negative numbers,
 * at most MAX_ROWS rows, one row per game + mode (the better one wins).
 * @returns {{game: string, mode: string, best: number, plays: number}[]}
 */
function sanitizeScores(list) {
  if (!Array.isArray(list)) return [];
  const out = new Map();
  for (const raw of list.slice(0, MAX_ROWS * 2)) {
    if (!raw || typeof raw !== "object") continue;
    const game = String(raw.game ?? "");
    const mode = String(raw.mode ?? "");
    if (!isKnown(game, mode)) continue;
    const best = toInt(raw.best, MAX_BEST);
    const plays = toInt(raw.plays ?? 0, MAX_PLAYS);
    if (best == null || plays == null) continue;
    const row = { game, mode, best, plays };
    const key = `${game}:${mode}`;
    out.set(key, out.has(key) ? mergeRow(out.get(key), row) : row);
    if (out.size >= MAX_ROWS) break;
  }
  return [...out.values()];
}

/** The better of two bests in a game's direction (0 = no result for "low"). */
function better(dir, a, b) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  if (dir === "low") {
    if (x <= 0) return y;
    if (y <= 0) return x;
    return Math.min(x, y);
  }
  return Math.max(x, y);
}

/** Merge a stored row with a reported one: best by direction, plays only ever grow. */
function mergeRow(stored, incoming) {
  const dir = GAMES[incoming.game]?.dir || "high";
  return {
    game: incoming.game,
    mode: incoming.mode,
    best: better(dir, stored?.best, incoming.best),
    plays: Math.max(Number(stored?.plays) || 0, Number(incoming.plays) || 0),
  };
}

/** Did the merge change the stored row (skip the write when not)? */
function changed(stored, merged) {
  return !stored || Number(stored.best) !== merged.best || Number(stored.plays) !== merged.plays;
}

/** API shape of a db row. */
function shapeRow(r) {
  return {
    game: r.game,
    mode: r.mode || "",
    best: Number(r.best) || 0,
    plays: Number(r.plays) || 0,
    updatedAt: r.updated_at || null,
  };
}

/** Totals for the hub header: games played and the last time anything was saved. */
function summarize(rows) {
  let plays = 0;
  let last = null;
  for (const r of rows) {
    plays += Number(r.plays) || 0;
    if (r.updatedAt && (!last || r.updatedAt > last)) last = r.updatedAt;
  }
  return { plays, lastPlayedAt: last, games: new Set(rows.map((r) => r.game)).size };
}

module.exports = { GAMES, MAX_ROWS, isKnown, sanitizeScores, better, mergeRow, changed, shapeRow, summarize };
