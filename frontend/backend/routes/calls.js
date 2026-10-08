"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  listCallsForUser,
  markCalleeAnswering,
  findRingingByUuid,
  callStateByUuid,
} = require("../lib/dmCallLog");
const { verifyVoipStatus } = require("../lib/voipStatus");

const router = express.Router();

// GET /api/calls — unified DM + group call history
router.get("/", requireAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const calls = await listCallsForUser(req.user.id, { limit });
    return res.json({ calls });
  } catch (err) {
    console.error("[calls] list failed:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Failed to load call history" });
  }
});

/**
 * POST /api/calls/voip-status — native iOS CallKit reports for a VoIP-rung
 * call while the web app can't run (phone locked). Authenticated by the
 * call-scoped HMAC token from the VoIP push, not by a login token.
 *   answering: tell the caller to keep waiting (the callee is unlocking)
 *   failed:    the callee never joined → end the ring for the caller
 */
router.post("/voip-status", async (req, res) => {
  const { callUuid, calleeId, token, status } = req.body || {};
  if (
    typeof callUuid !== "string" || !callUuid || callUuid.length > 64 ||
    typeof calleeId !== "string" || !calleeId || calleeId.length > 64 ||
    (status !== "answering" && status !== "failed")
  ) {
    return res.status(400).json({ error: "Invalid request" });
  }
  if (!verifyVoipStatus(callUuid, calleeId, token)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const io = req.app.get("io");
  try {
    if (status === "answering") {
      const call = markCalleeAnswering(callUuid, calleeId);
      if (!call) return res.json({ ok: true, state: callStateByUuid(callUuid, calleeId) });
      io?.to(`user:${call.callerId}`).emit("call:callee-answering", { fromUserId: calleeId, callUuid });
      return res.json({ ok: true, state: "ringing" });
    }
    const call = findRingingByUuid(callUuid, calleeId);
    if (!call) return res.json({ ok: true, state: callStateByUuid(callUuid, calleeId) });
    io?.to(`user:${call.callerId}`).emit("call:declined", {
      fromUserId: calleeId,
      reason: "callee_unavailable",
    });
    // Stop the same ring on the callee's other devices.
    io?.to(`user:${calleeId}`).emit("call:cancelled", { fromUserId: call.callerId });
    const { finishDmCall } = require("../socket/handlers");
    await finishDmCall(io, call.callerId, calleeId, "missed");
    return res.json({ ok: true, state: "ended" });
  } catch (err) {
    console.warn("[calls] voip-status failed:", err?.message || err);
    return res.status(500).json({ error: "Failed" });
  }
});

module.exports = router;
