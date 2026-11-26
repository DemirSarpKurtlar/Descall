"use strict";

/**
 * Yönetici Paneli › Apple Watch oyunları (owner request, Nov 2026). Mounted inside
 * routes/admin.js, so every request already passed requireAuth + requireAdmin + admin
 * 2FA; the path maps to section "overview" (every admin, never a member).
 *   GET  /watch-games/scores  → { scores: [{game, mode, best, plays, updatedAt}], summary, storage }
 *   POST /watch-games/scores { scores: [{game, mode, best, plays}] } → same shape, merged
 * Only the caller's own rows are read or written. The POST changes nothing on the
 * platform (one admin's game records), so it is step-up exempt like saved audit views.
 * Storage: admin_watch_game_scores (supabase/migrations/20261124g_watch_games.sql).
 * Before the migration is applied: storage "unavailable", the watch keeps its local bests.
 */

const express = require("express");
const supabase = require("../db/supabase");
const wg = require("../lib/watchGames");

const router = express.Router();
const TABLE = "admin_watch_game_scores";

function isMissingTable(error) {
  const code = String(error?.code || "");
  return code === "PGRST205" || code === "42P01" || /does not exist|schema cache/i.test(String(error?.message || ""));
}

async function loadRows(userId) {
  const { data, error } = await supabase.from(TABLE).select("game, mode, best, plays, updated_at").eq("user_id", userId).limit(wg.MAX_ROWS * 2);
  if (error) return { error };
  return { rows: (data || []).filter((r) => wg.isKnown(r.game, r.mode || "")).map(wg.shapeRow) };
}

function reply(res, rows, storage) {
  res.set("Cache-Control", "no-store");
  return res.json({ scores: rows, summary: wg.summarize(rows), storage });
}

router.get("/watch-games/scores", async (req, res) => {
  try {
    const out = await loadRows(req.user.id);
    if (out.error) {
      if (isMissingTable(out.error)) return reply(res, [], "unavailable");
      throw out.error;
    }
    return reply(res, out.rows, "ok");
  } catch (err) {
    console.error("[adminWatchGames] read", err?.message || err);
    return res.status(500).json({ error: "Could not load game scores.", code: "WATCH_GAMES_READ_FAILED" });
  }
});

router.post("/watch-games/scores", async (req, res) => {
  const incoming = wg.sanitizeScores(req.body?.scores);
  if (!Array.isArray(req.body?.scores)) return res.status(400).json({ error: "scores must be a list.", code: "BAD_SCORES" });
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
    return reply(res, [...byKey.values()], "ok");
  } catch (err) {
    console.error("[adminWatchGames] write", err?.message || err);
    return res.status(500).json({ error: "Could not save game scores.", code: "WATCH_GAMES_WRITE_FAILED" });
  }
});

module.exports = router;
module.exports.TABLE = TABLE;
