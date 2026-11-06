"use strict";

/**
 * Per-conversation notification options (messaging phase 4), lib/notifyPrefs.js.
 *   GET /api/notify-prefs → { prefs: [{ convType, convId, level, mutedUntil }] }
 *   PUT /api/notify-prefs { convType: "dm"|"group", convId, level: "all"|"mentions"|"none", mutedUntil?: ISO|null }
 *       → { ok, pref } | 400 { error } | 503 { error: "not_ready" } before the migration
 * The caller's other devices get notify-prefs:update so their lists follow.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const np = require("../lib/notifyPrefs");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  res.json({ prefs: await np.listPrefs(req.user.id) });
});

router.put("/", requireAuth, async (req, res) => {
  const v = np.validatePref(req.body);
  if (!v.ok) return res.status(400).json(v);
  const out = await np.savePref(req.user.id, v.row);
  if (!out.ok) return res.status(out.error === "not_ready" ? 503 : 500).json(out);
  try {
    req.app.get("io")?.to(`user:${req.user.id}`).emit("notify-prefs:update", out.pref);
  } catch { /* other devices refresh on their next load */ }
  return res.json(out);
});

module.exports = router;
