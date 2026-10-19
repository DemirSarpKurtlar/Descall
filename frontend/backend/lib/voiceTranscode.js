"use strict";

// Voice notes must play on every client. iOS/macOS WebKit cannot decode WebM/Opus (what
// Chromium/Electron records) and Chromium's MediaRecorder "audio/mp4" may carry Opus, which
// older iOS cannot play either. Every voice note is therefore normalized on the server to
// AAC-LC in an MP4 (.m4a) container with the moov atom up front: the one format Safari,
// WKWebView, Chromium, Electron, Firefox and Android all decode.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUTPUT_MIME = "audio/mp4";
const OUTPUT_EXT = "m4a";
const TIMEOUT_MS = 30000;

let cachedBin;
function ffmpegPath() {
  if (cachedBin !== undefined) return cachedBin;
  cachedBin = null;
  try {
    const p = require("ffmpeg-static");
    if (p && fs.existsSync(p)) cachedBin = p;
  } catch {
    /* optional */
  }
  if (!cachedBin && process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    cachedBin = process.env.FFMPEG_PATH;
  }
  if (!cachedBin) cachedBin = "ffmpeg"; // PATH fallback; spawn error → transcode skipped
  return cachedBin;
}

function baseMime(mime) {
  return String(mime || "").split(";")[0].trim().toLowerCase();
}

/** Arguments for the ffmpeg run (exported for the selftest). */
function ffmpegArgs(input, output) {
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", input,
    "-vn", "-map_metadata", "-1",
    "-ac", "1", "-ar", "48000",
    "-c:a", "aac", "-b:a", "64k",
    "-movflags", "+faststart",
    "-f", "mp4", output,
  ];
}

/**
 * Transcode an audio buffer to AAC/M4A. Resolves { buffer, mimeType, ext } or rejects.
 * Uses temp files: MP4 input can keep its index at the end and +faststart needs a seekable output.
 */
async function transcodeToM4a(buffer, { bin = ffmpegPath(), timeoutMs = TIMEOUT_MS } = {}) {
  if (!buffer || !buffer.length) throw new Error("empty audio");
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "descall-voice-"));
  const input = path.join(dir, "in");
  const output = path.join(dir, `out.${OUTPUT_EXT}`);
  try {
    await fs.promises.writeFile(input, buffer);
    await new Promise((resolve, reject) => {
      const child = spawn(bin, ffmpegArgs(input, output), { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("ffmpeg timeout"));
      }, timeoutMs);
      child.stderr.on("data", (d) => { if (err.length < 2000) err += d; });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${err.trim().slice(0, 300)}`));
      });
    });
    const out = await fs.promises.readFile(output);
    if (!out.length) throw new Error("ffmpeg produced no output");
    return { buffer: out, mimeType: OUTPUT_MIME, ext: OUTPUT_EXT };
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Normalize an uploaded multer file in place when it is a voice note / chat audio clip.
 * Never throws: on failure the original file is kept (the client still has a fallback).
 */
async function normalizeVoiceUpload(file, opts) {
  if (!file || !baseMime(file.mimetype).startsWith("audio/")) return { transcoded: false };
  try {
    const out = await transcodeToM4a(file.buffer, opts);
    const stem = String(file.originalname || "voice").replace(/\.[^.]*$/, "") || "voice";
    file.buffer = out.buffer;
    file.size = out.buffer.length;
    file.mimetype = out.mimeType;
    file.originalname = `${stem}.${out.ext}`;
    return { transcoded: true };
  } catch (err) {
    console.warn("[MEDIA] voice transcode failed, keeping original:", err?.message);
    return { transcoded: false, error: err?.message };
  }
}

module.exports = { transcodeToM4a, normalizeVoiceUpload, ffmpegArgs, ffmpegPath, baseMime, OUTPUT_MIME, OUTPUT_EXT };
