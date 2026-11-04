"use strict";

// Profile photo / banner picker: crop + zoom + quarter-turn rotate for ANIMATED
// GIFs without losing the animation. Still images are cropped in the client canvas; a GIF
// is sent whole with the crop rectangle and cut here with ffmpeg (already a dependency for
// voice notes): rotate (legacy clients) → pad → crop → scale → palettegen/paletteuse, every frame, loop forever.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ffmpegPath } = require("./voiceTranscode");

const TIMEOUT_MS = 45000;
const TARGETS = Object.freeze({
  avatar: { maxW: 512, maxH: 512 },
  banner: { maxW: 1200, maxH: 480 },
});

/**
 * Parse the client's crop JSON. Returns null when absent or invalid (caller then stores the
 * file as-is, which is the pre-behaviour). Rotation is clockwise quarter turns.
 * x/y/width/height are pixels in the ROTATED source (react-easy-crop croppedAreaPixels).
 */
function parseCrop(raw) {
  if (raw == null || raw === "") return null;
  let c = raw;
  if (typeof raw === "string") {
    if (raw.length > 512) return null;
    try { c = JSON.parse(raw); } catch { return null; }
  }
  if (!c || typeof c !== "object") return null;
  const n = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);
  const x = n(c.x), y = n(c.y), width = n(c.width), height = n(c.height);
  let rotation = n(c.rotation ?? 0);
  if ([x, y, width, height, rotation].some(Number.isNaN)) return null;
  rotation = ((rotation % 360) + 360) % 360;
  if (rotation % 90 !== 0) return null;
  // x/y may be negative and the rectangle may reach past the source: the picker lets the user
  // zoom OUT until the whole GIF fits inside the frame (contain). That margin is padded
  // transparent in filterChain, never stretched.
  if (width < 8 || height < 8 || width > 8192 || height > 8192 || x < -8192 || y < -8192 || x > 16384 || y > 16384) return null;
  return { x, y, width, height, rotation };
}

/** ffmpeg -vf chain (exported for the selftest). */
function filterChain(crop, target = "avatar") {
  const t = TARGETS[target] || TARGETS.avatar;
  const rot = { 0: [], 90: ["transpose=1"], 180: ["transpose=1", "transpose=1"], 270: ["transpose=2"] }[crop.rotation] || [];
  const scale = Math.min(1, t.maxW / crop.width, t.maxH / crop.height);
  const w = Math.max(2, Math.round((crop.width * scale) / 2) * 2);
  const h = Math.max(2, Math.round((crop.height * scale) / 2) * 2);
  // Pad first so a crop rectangle that is larger than / outside the GIF stays valid
  // (contain zoom-out). For a rectangle fully inside the GIF the pad is the input size (no-op).
  const left = Math.max(0, -crop.x);
  const top = Math.max(0, -crop.y);
  const cx = crop.x + left;
  const cy = crop.y + top;
  return [
    ...rot,
    "format=rgba",
    `pad=w='max(iw+${left},${cx + crop.width})':h='max(ih+${top},${cy + crop.height})':x=${left}:y=${top}:color=black@0`,
    `crop=${crop.width}:${crop.height}:${cx}:${cy}`,
    `scale=${w}:${h}:flags=lanczos`,
    "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
  ].join(",");
}

function ffmpegArgs(input, output, crop, target) {
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", input,
    "-filter_complex", filterChain(crop, target),
    "-loop", "0",
    "-f", "gif", output,
  ];
}

/** Crop an animated GIF buffer. Resolves a Buffer (still a GIF, every frame kept). */
async function cropGif(buffer, crop, { target = "avatar", bin = ffmpegPath(), timeoutMs = TIMEOUT_MS } = {}) {
  if (!buffer || !buffer.length) throw new Error("empty gif");
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "descall-gif-"));
  const input = path.join(dir, "in.gif");
  const output = path.join(dir, "out.gif");
  try {
    await fs.promises.writeFile(input, buffer);
    await new Promise((resolve, reject) => {
      const child = spawn(bin, ffmpegArgs(input, output, crop, target), { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("ffmpeg timeout")); }, timeoutMs);
      child.stderr.on("data", (d) => { if (err.length < 2000) err += d; });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${err.trim().slice(0, 300)}`));
      });
    });
    const out = await fs.promises.readFile(output);
    if (out.length < 16 || out.toString("ascii", 0, 3) !== "GIF") throw new Error("ffmpeg produced no gif");
    return out;
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Number of image frames in a GIF (image descriptor blocks). Used by tests. */
function countGifFrames(buf) {
  let n = 0;
  if (!buf || buf.toString("ascii", 0, 3) !== "GIF") return 0;
  let i = 13;
  const flags = buf[10];
  if (flags & 0x80) i += 3 * (1 << ((flags & 7) + 1));
  while (i < buf.length) {
    const b = buf[i];
    if (b === 0x3b) break;
    if (b === 0x21) { i += 2; while (i < buf.length && buf[i] !== 0) i += buf[i] + 1; i += 1; continue; }
    if (b === 0x2c) {
      n += 1;
      const lf = buf[i + 9];
      i += 10;
      if (lf & 0x80) i += 3 * (1 << ((lf & 7) + 1));
      i += 1;
      while (i < buf.length && buf[i] !== 0) i += buf[i] + 1;
      i += 1;
      continue;
    }
    break;
  }
  return n;
}

/**
 * Apply the crop to an uploaded multer file in place when it is a GIF with a valid crop.
 * Returns true when cropped. A failure leaves the original file (logged), never a 500.
 */
async function applyGifCrop(file, rawCrop, target) {
  const crop = parseCrop(rawCrop);
  if (!crop || !file || file.mimetype !== "image/gif") return false;
  try {
    const out = await cropGif(file.buffer, crop, { target });
    file.buffer = out;
    file.size = out.length;
    return true;
  } catch (err) {
    console.warn("[MEDIA] gif crop failed, storing original:", err?.message);
    return false;
  }
}

module.exports = { parseCrop, filterChain, ffmpegArgs, cropGif, countGifFrames, applyGifCrop, TARGETS };
