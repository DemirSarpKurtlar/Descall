"use strict";

/**
 * Authenticated upload of a finished voice session (any participant).
 * POST /api/voice-recordings  multipart field `audio` + `metadata` JSON.
 */

const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const voice = require("../lib/voiceRecordings");

const router = express.Router();

const ALLOWED_AUDIO = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
  "audio/m4a",
  "video/webm",
  "video/webm;codecs=opus",
  "application/octet-stream",
]);

const MAX_BYTES = 80 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const base = mime.split(";")[0].trim();
    if (ALLOWED_AUDIO.has(mime) || ALLOWED_AUDIO.has(base) || base.startsWith("audio/")) {
      return cb(null, true);
    }
    cb(new Error(`File type ${file.mimetype} is not allowed.`));
  },
});

function parseMetadata(body) {
  if (!body) return {};
  if (body.metadata && typeof body.metadata === "object") return body.metadata;
  if (typeof body.metadata === "string") {
    try {
      return JSON.parse(body.metadata);
    } catch {
      return {};
    }
  }
  if (typeof body.meta === "string") {
    try {
      return JSON.parse(body.meta);
    } catch {
      return {};
    }
  }
  const kind = body.kind;
  const parseList = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return v.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    return [];
  };
  return {
    kind,
    dmPeerIds: parseList(body.dmPeerIds || body.dm_peer_ids),
    groupId: body.groupId || body.group_id,
    groupName: body.groupName || body.group_name,
    serverId: body.serverId || body.server_id,
    serverName: body.serverName || body.server_name,
    channelId: body.channelId || body.channel_id,
    channelName: body.channelName || body.channel_name,
    participantIds: parseList(body.participantIds || body.participant_ids),
    participantUsernames: parseList(body.participantUsernames || body.participant_usernames),
    startedAt: body.startedAt || body.started_at,
    endedAt: body.endedAt || body.ended_at,
    durationMs: body.durationMs || body.duration_ms,
  };
}

router.post("/", requireAuth, (req, res) => {
  upload.single("audio")(req, res, async (multerErr) => {
    if (multerErr) {
      const tooBig = multerErr.code === "LIMIT_FILE_SIZE";
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? "Audio is too large." : multerErr.message,
      });
    }
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: "multipart field `audio` is required." });
      }
      const meta = parseMetadata(req.body || {});
      const result = await voice.saveRecording({
        userId: req.user.id,
        buffer: req.file.buffer,
        sourceMime: req.file.mimetype,
        meta,
      });
      const status = result.duplicate ? 200 : 201;
      return res.status(status).json({
        recording: voice.publicRow(result.row),
        duplicate: Boolean(result.duplicate),
      });
    } catch (err) {
      const status =
        err.status ||
        (err.code === "FORBIDDEN"
          ? 403
          : err.code === "TOO_SHORT" || err.code === "BAD_REQUEST"
            ? 400
            : 500);
      if (status >= 500) console.error("[voiceRecordings] upload:", err);
      return res.status(status).json({ error: err.message || "Upload failed.", code: err.code });
    }
  });
});

module.exports = router;
