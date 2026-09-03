"use strict";

const express = require("express");
const voiceLive = require("../lib/voiceLive");

const router = express.Router();

function bearerFromQuery(req, _res, next) {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${String(req.query.token)}`;
  }
  next();
}

router.use(bearerFromQuery);

router.get("/", (req, res) => {
  const kind = String(req.query.kind || "").toLowerCase();
  const rooms = voiceLive.listRooms(kind === "dm" || kind === "group" || kind === "server" ? kind : undefined);
  return res.json({ rooms, kinds: ["dm", "group", "server"] });
});

router.get("/:id/audio", (req, res) => {
  const room = voiceLive.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: "No live room." });
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  voiceLive.pipeMp3(req.params.id, res);
});

router.get("/:id", (req, res) => {
  const room = voiceLive.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: "No live room." });
  return res.json({ room });
});

module.exports = router;
