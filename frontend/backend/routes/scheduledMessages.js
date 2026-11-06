"use strict";

/**
 * Scheduled sending (messaging phase 4), lib/scheduledMessages.js.
 *   GET    /api/scheduled-messages[?convType=&convId=]  → { items } (my pending ones)
 *   POST   /api/scheduled-messages { convType, convId, content, sendAt }  → { ok, item }
 *   PATCH  /api/scheduled-messages/:id { content?, sendAt? }              → { ok, item }
 *   DELETE /api/scheduled-messages/:id                                    → { ok, item } (cancelled)
 * Errors: { ok: false, error } with 400 / 403 / 404 / 409 / 429, 503 not_ready before the migration.
 * Every change is echoed to my other devices as scheduled:update.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const { ScheduleError, scheduledMessages } = require("../lib/scheduledMessages");

function createScheduledRouter({ service = null } = {}) {
  const router = express.Router();
  const svc = () => service || scheduledMessages();
  const send = (res, err) => {
    if (err instanceof ScheduleError) return res.status(err.status).json({ ok: false, error: err.code });
    console.error("[scheduled] route failed:", err?.message || err);
    return res.status(500).json({ ok: false, error: "failed" });
  };
  const echo = (req, item) => {
    try { req.app.get("io")?.to(`user:${req.user.id}`).emit("scheduled:update", item); } catch { /* ignore */ }
  };

  router.get("/", requireAuth, async (req, res) => {
    const convType = typeof req.query.convType === "string" ? req.query.convType : null;
    const convId = typeof req.query.convId === "string" ? req.query.convId : null;
    res.json({ items: await svc().list(req.user.id, { convType, convId }) });
  });

  router.post("/", requireAuth, async (req, res) => {
    if (rejectIfLimited(res, [recordFailure(`schedule:${req.user.id}`, { windowMs: 60000, max: 30 })])) return undefined;
    try {
      const item = await svc().create(req.user.id, req.body || {});
      echo(req, item);
      return res.json({ ok: true, item });
    } catch (err) {
      return send(res, err);
    }
  });

  router.patch("/:id", requireAuth, async (req, res) => {
    try {
      const item = await svc().update(req.user.id, req.params.id, req.body || {});
      echo(req, item);
      return res.json({ ok: true, item });
    } catch (err) {
      return send(res, err);
    }
  });

  router.delete("/:id", requireAuth, async (req, res) => {
    try {
      const item = await svc().cancel(req.user.id, req.params.id);
      echo(req, item);
      return res.json({ ok: true, item });
    } catch (err) {
      return send(res, err);
    }
  });

  return router;
}

module.exports = createScheduledRouter();
module.exports.createScheduledRouter = createScheduledRouter;
