"use strict";

/**
 * Growth 3B "Arkadaştan çağrı" (lib/reengage/winback.js), signed in:
 *   GET  /api/winback/suggestion       -> { suggestion | null } for the caller's home card
 *   POST /api/winback/:id/call         -> { ok, sent, mode } (message optional, up to 200 chars)
 *   POST /api/winback/:id/dismiss      -> { ok } ("Şimdi değil")
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const winback = require("../lib/reengage/winback");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(res, e, label) {
  const status = e?.status || (e?.code === "NOT_READY" ? 503 : 500);
  if (status >= 500 && e?.code !== "NOT_READY") console.error(`[winback] ${label} failed:`, e?.message || e);
  return res.status(status).json({ ok: false, error: e?.code === "NOT_READY" ? "not_ready" : status >= 500 ? "failed" : e.code || "failed" });
}

router.get("/suggestion", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(await winback.suggestionFor(req.user.id));
  } catch (e) {
    fail(res, e, "suggestion");
  }
});

router.post("/:id/call", requireAuth, async (req, res) => {
  if (!UUID.test(String(req.params.id))) return res.status(400).json({ ok: false, error: "bad_id" });
  try {
    require("../lib/reengage/io").setIo(req.app.get("io"));
    res.json(await winback.call(req.user.id, String(req.params.id), { message: String(req.body?.message || "") }));
  } catch (e) {
    fail(res, e, "call");
  }
});

router.post("/:id/dismiss", requireAuth, async (req, res) => {
  if (!UUID.test(String(req.params.id))) return res.status(400).json({ ok: false, error: "bad_id" });
  try {
    res.json(await winback.dismiss(req.user.id, String(req.params.id)));
  } catch (e) {
    fail(res, e, "dismiss");
  }
});

module.exports = router;
