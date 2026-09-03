"use strict";

/**
 * Admin voice-recording archive (API only — Dima owns Admin UI).
 *
 * Mounted at /voice-recordings on the admin router (requireAuth + requireAdmin).
 *   GET  /admin/voice-recordings?kind=dm|group|server
 *   GET  /admin/voice-recordings/export.mp3?kind=
 *   GET  /admin/voice-recordings/:id
 *   GET  /admin/voice-recordings/:id/mp3
 */

const express = require("express");
const voice = require("../lib/voiceRecordings");

const router = express.Router();

function sendErr(res, err, fallback) {
  const status = err.status || (err.code === "NOT_FOUND" ? 404 : err.code === "BAD_REQUEST" ? 400 : 500);
  if (status >= 500) console.error("[adminVoice]", err);
  return res.status(status).json({ error: err.message || fallback, code: err.code || undefined });
}

router.get("/export.mp3", async (req, res) => {
  try {
    const kind = voice.parseKind(req.query.kind);
    if (!kind) return res.status(400).json({ error: "kind must be dm, group, or server." });
    const { buffer, count } = await voice.concatKindToMp3(kind);
    const filename = `descall-${kind}-export-${count}.mp3`;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Recording-Count", String(count));
    return res.send(buffer);
  } catch (err) {
    return sendErr(res, err, "Failed to export concatenated MP3.");
  }
});

router.get("/", async (req, res) => {
  try {
    const recordings = await voice.listRecordings({
      kind: req.query.kind,
      limit: req.query.limit,
    });
    return res.json({ recordings, kinds: ["dm", "group", "server"] });
  } catch (err) {
    return sendErr(res, err, "Failed to list recordings.");
  }
});

router.get("/:id/mp3", async (req, res) => {
  try {
    const row = await voice.getRecording(req.params.id);
    if (!row) return res.status(404).json({ error: "Recording not found." });
    if (row.status !== "ready" || !row.storage_path) {
      return res.status(409).json({ error: "Recording is not ready.", status: row.status });
    }
    const buffer = await voice.downloadStored(row.storage_path);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", `attachment; filename="${voice.downloadFilename(row)}"`);
    return res.send(buffer);
  } catch (err) {
    return sendErr(res, err, "Failed to download recording.");
  }
});

router.get("/:id", async (req, res) => {
  try {
    const row = await voice.getRecording(req.params.id);
    if (!row) return res.status(404).json({ error: "Recording not found." });
    return res.json({ recording: voice.publicRow(row) });
  } catch (err) {
    return sendErr(res, err, "Failed to load recording.");
  }
});

module.exports = router;
