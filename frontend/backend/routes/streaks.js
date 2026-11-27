"use strict";

/**
 * Growth 3B "Seri ve görevler" (lib/reengage/streaks.js), signed in:
 *   GET    /api/streaks               -> personal streak (the DesCoin daily reward), shared streaks, today's tasks
 *   POST   /api/streaks/:peer         -> start a shared streak with a friend
 *   DELETE /api/streaks/:peer         -> end it
 *   POST   /api/streaks/:peer/nudge   -> "Dürt" (once a day, never in their quiet hours)
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const streaks = require("../lib/reengage/streaks");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function attach(req) {
  try {
    require("../lib/reengage/io").setIo(req.app.get("io"));
  } catch {
    /* optional */
  }
}

function fail(res, e, label) {
  const status = e?.status || (e?.code === "NOT_READY" ? 503 : 500);
  if (status >= 500 && e?.code !== "NOT_READY") console.error(`[streaks] ${label} failed:`, e?.message || e);
  return res.status(status).json({ ok: false, error: e?.code === "NOT_READY" ? "not_ready" : status >= 500 ? "failed" : e.code || "failed" });
}

router.get("/", requireAuth, async (req, res) => {
  attach(req);
  res.set("Cache-Control", "no-store");
  try {
    res.json(await streaks.stateFor(req.user.id));
  } catch (e) {
    fail(res, e, "state");
  }
});

router.post("/:peer", requireAuth, async (req, res) => {
  attach(req);
  if (!UUID.test(String(req.params.peer))) return res.status(400).json({ ok: false, error: "bad_id" });
  try {
    res.json(await streaks.start(req.user.id, String(req.params.peer)));
  } catch (e) {
    fail(res, e, "start");
  }
});

router.delete("/:peer", requireAuth, async (req, res) => {
  if (!UUID.test(String(req.params.peer))) return res.status(400).json({ ok: false, error: "bad_id" });
  try {
    res.json(await streaks.end(req.user.id, String(req.params.peer)));
  } catch (e) {
    fail(res, e, "end");
  }
});

router.post("/:peer/nudge", requireAuth, async (req, res) => {
  attach(req);
  if (!UUID.test(String(req.params.peer))) return res.status(400).json({ ok: false, error: "bad_id" });
  try {
    res.json(await streaks.nudge(req.user.id, String(req.params.peer)));
  } catch (e) {
    fail(res, e, "nudge");
  }
});

module.exports = router;
