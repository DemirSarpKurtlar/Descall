"use strict";

/**
 * Yönetici Paneli › Apple Watch oyunları (owner request, Nov 2026). Mounted inside
 * routes/admin.js, so every request already passed requireAuth + requireAdmin + admin
 * 2FA; the path maps to section "games", which only the owner account holds (never
 * grantable, lib/adminPermissions.js OWNER_WATCH). Other admins and members get 403.
 *   GET  /watch-games/scores  → { scores: [{game, mode, best, plays, updatedAt}], days, summary, storage }
 *   POST /watch-games/scores { scores: [{game, mode, best, plays}], days?: [{day, seconds, rounds, records}] }
 *        → same shape, merged (days: the last 14, counters only grow)
 * Only the caller's own rows are read or written. The POST changes nothing on the
 * platform (one admin's game records), so it is step-up exempt like saved audit views.
 * Storage: admin_watch_game_scores + admin_watch_game_days (supabase/migrations/20261124g_watch_games.sql).
 * Before the migration is applied: storage "unavailable", the watch keeps its local bests.
 */

const express = require("express");
const supabase = require("../db/supabase");
const wg = require("../lib/watchGames");
const { apiError } = require("../lib/apiError");

const router = express.Router();
const TABLE = "admin_watch_game_scores";
const DAYS = "admin_watch_game_days";

function isMissingTable(error) {
  const code = String(error?.code || "");
  return code === "PGRST205" || code === "42P01" || /does not exist|schema cache/i.test(String(error?.message || ""));
}

async function loadRows(userId) {
  const { data, error } = await supabase.from(TABLE).select("game, mode, best, plays, updated_at").eq("user_id", userId).limit(wg.MAX_ROWS * 2);
  if (error) return { error };
  return { rows: (data || []).filter((r) => wg.isKnown(r.game, r.mode || "")).map(wg.shapeRow) };
}

/** Last 14 days; a missing days table (half-applied migration) reads as none. */
async function loadDays(userId) {
  const since = wg.dayKey(Date.now() - wg.KEEP_DAYS * 86400000);
  const { data, error } = await supabase.from(DAYS).select("day, seconds, rounds, records").eq("user_id", userId).gte("day", since).limit(wg.KEEP_DAYS * 2);
  if (error) return { days: [], missing: isMissingTable(error), error };
  return { days: (data || []).map(wg.shapeDay).sort((a, b) => (a.day < b.day ? -1 : 1)) };
}

function reply(res, rows, storage, days = []) {
  res.set("Cache-Control", "no-store");
  return res.json({ scores: rows, days, summary: wg.summarize(rows), storage });
}

router.get("/watch-games/scores", async (req, res) => {
  try {
    const out = await loadRows(req.user.id);
    if (out.error) {
      if (isMissingTable(out.error)) return reply(res, [], "unavailable");
      throw out.error;
    }
    const d = await loadDays(req.user.id);
    return reply(res, out.rows, "ok", d.days);
  } catch (err) {
    console.error("[adminWatchGames] read", err?.message || err);
    return res.status(500).json(apiError("Internal server error.", null, { code: "WATCH_GAMES_READ_FAILED" }));
  }
});

router.post("/watch-games/scores", async (req, res) => {
  const incoming = wg.sanitizeScores(req.body?.scores);
  if (!Array.isArray(req.body?.scores)) return res.status(400).json(apiError("Invalid request body.", null, { code: "BAD_SCORES" }));
  try {
    const out = await loadRows(req.user.id);
    if (out.error) {
      if (isMissingTable(out.error)) return reply(res, [], "unavailable");
      throw out.error;
    }
    const byKey = new Map(out.rows.map((r) => [`${r.game}:${r.mode}`, r]));
    const now = new Date().toISOString();
    const writes = [];
    for (const row of incoming) {
      const key = `${row.game}:${row.mode}`;
      const stored = byKey.get(key);
      const merged = wg.mergeRow(stored, row);
      if (!wg.changed(stored, merged)) continue;
      writes.push({ user_id: req.user.id, game: merged.game, mode: merged.mode, best: merged.best, plays: merged.plays, updated_at: now });
      byKey.set(key, { ...merged, updatedAt: now });
    }
    if (writes.length) {
      const { error } = await supabase.from(TABLE).upsert(writes, { onConflict: "user_id,game,mode" });
      if (error) {
        if (isMissingTable(error)) return reply(res, [], "unavailable");
        throw error;
      }
    }
    const days = await saveDays(req.user.id, wg.sanitizeDays(req.body?.days));
    return reply(res, [...byKey.values()], "ok", days);
  } catch (err) {
    console.error("[adminWatchGames] write", err?.message || err);
    return res.status(500).json(apiError("Internal server error.", null, { code: "WATCH_GAMES_WRITE_FAILED" }));
  }
});

async function saveDays(userId, incoming) {
  const d = await loadDays(userId);
  if (d.error) {
    if (d.missing) return [];
    throw d.error;
  }
  const byDay = new Map(d.days.map((x) => [x.day, x]));
  const writes = [];
  for (const row of incoming) {
    const stored = byDay.get(row.day);
    const merged = wg.mergeDay(stored, row);
    if (stored && stored.seconds === merged.seconds && stored.rounds === merged.rounds && stored.records === merged.records) continue;
    writes.push({ user_id: userId, ...merged, updated_at: new Date().toISOString() });
    byDay.set(row.day, merged);
  }
  if (writes.length) {
    const { error } = await supabase.from(DAYS).upsert(writes, { onConflict: "user_id,day" });
    if (error && !isMissingTable(error)) throw error;
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

module.exports = router;
module.exports.TABLE = TABLE;
