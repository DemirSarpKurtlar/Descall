"use strict";

/**
 * "Mesaj önizlemesi" for server-sent pushes (messaging phase 5), lib/pushPreview.js.
 *   GET /api/push-preview              → { enabled, ready } (ready false before the migration or when it could not be read)
 *   PUT /api/push-preview { enabled }  → { ok, enabled } | 503 { error: "not_ready" } before the migration
 * The caller's other devices get push-preview:update so their switch follows.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const pp = require("../lib/pushPreview");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  res.json(await pp.readSetting(req.user.id));
});

router.put("/", requireAuth, async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ ok: false, error: "enabled_required" });
  const out = await pp.setPreviewEnabled(req.user.id, req.body.enabled);
  if (!out.ok) return res.status(out.error === "not_ready" ? 503 : 500).json(out);
  try {
    req.app.get("io")?.to(`user:${req.user.id}`).emit("push-preview:update", { enabled: out.enabled });
  } catch { /* other devices read it on their next settings open */ }
  return res.json(out);
});

module.exports = router;
