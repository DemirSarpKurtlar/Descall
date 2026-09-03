"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const reports = require("../lib/userReports");
const { notifyAdminRoom } = require("../socket/adminHandlers");

const router = express.Router();

router.use(requireAuth);

router.get("/reasons", (_req, res) => {
  res.json({ reasons: reports.USER_REASONS });
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const result = await reports.createReport({
      reporterId: req.user.id,
      targetId: body.targetId || body.userId,
      reason: body.reason,
      note: body.note,
      contextType: body.contextType,
      contextId: body.contextId,
      snippet: body.snippet,
      occurredAt: body.occurredAt,
    });
    const io = req.app.get("io");
    notifyAdminRoom(io, {
      type: "user_report",
      reportId: result.report.id,
      targetId: result.report.targetId,
      reporterId: result.report.reporterId,
      openCount: result.openCount,
      autoOpen: result.autoOpen,
    });
    res.status(201).json(result);
  } catch (err) {
    const code = err.code;
    if (code === "SELF_REPORT" || code === "BAD_REQUEST") {
      return res.status(400).json({ error: err.message, code });
    }
    if (code === "NOT_FOUND") return res.status(404).json({ error: err.message, code });
    if (code === "RATE_LIMIT") return res.status(429).json({ error: err.message, code });
    if (code === "DUPLICATE") return res.status(409).json({ error: err.message, code });
    console.error("[reports] create:", err.message);
    res.status(500).json({ error: "Failed to submit report." });
  }
});

module.exports = router;
