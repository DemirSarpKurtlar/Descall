/**
 * Output checks: ffprobe for streams, and a tiny MP4 box walk for the moov-before-mdat
 * ("faststart") rule Instagram asks for.
 */
import { execFileSync } from "node:child_process";
import { openSync, readSync, closeSync, statSync } from "node:fs";
import { SPEC } from "./config.mjs";

export function ffmpegPath(env = process.env) {
  return env.FFMPEG_PATH || "ffmpeg";
}

export function ffprobePath(env = process.env) {
  return env.FFPROBE_PATH || "ffprobe";
}

export function hasBinary(bin) {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Top-level boxes of an MP4: [{ type, offset, size }]. */
export function topLevelBoxes(file) {
  const fd = openSync(file, "r");
  const { size: fileSize } = statSync(file);
  const boxes = [];
  try {
    let offset = 0;
    const head = Buffer.alloc(16);
    while (offset + 8 <= fileSize && boxes.length < 64) {
      readSync(fd, head, 0, 16, offset);
      let size = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (size === 1) size = Number(head.readBigUInt64BE(8));
      else if (size === 0) size = fileSize - offset;
      if (size < 8) break;
      boxes.push({ type, offset, size });
      offset += size;
    }
  } finally {
    closeSync(fd);
  }
  return boxes;
}

export function probe(file, env = process.env) {
  const out = execFileSync(ffprobePath(env), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { encoding: "utf8" });
  return JSON.parse(out);
}

function fps(rate) {
  const [n, d] = String(rate || "0/1").split("/").map(Number);
  return d ? n / d : 0;
}

/** Checks a rendered Reel against SPEC and the duration limits. Returns { ok, errors, info }. */
export function validateVideoFile(file, { minSec = 10, maxSec = 30, env = process.env } = {}) {
  const errors = [];
  const info = probe(file, env);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const duration = Number(info.format?.duration || 0);
  const size = statSync(file).size;
  if (!v) errors.push("no video stream");
  else {
    if (v.codec_name !== SPEC.videoCodec) errors.push(`video codec ${v.codec_name} (want ${SPEC.videoCodec})`);
    if (v.width !== SPEC.width || v.height !== SPEC.height) errors.push(`resolution ${v.width}x${v.height} (want ${SPEC.width}x${SPEC.height})`);
    if (v.pix_fmt !== SPEC.pixFmt) errors.push(`pixel format ${v.pix_fmt} (want ${SPEC.pixFmt})`);
    const f = fps(v.avg_frame_rate || v.r_frame_rate);
    if (f < 23 || f > 60) errors.push(`frame rate ${f.toFixed(2)} outside 23-60`);
    if (v.field_order && !["progressive", "unknown"].includes(v.field_order)) errors.push(`field order ${v.field_order} (want progressive)`);
  }
  if (!a) errors.push("no audio stream");
  else {
    if (a.codec_name !== SPEC.audioCodec) errors.push(`audio codec ${a.codec_name} (want ${SPEC.audioCodec})`);
    if (Number(a.sample_rate) > 48000) errors.push(`audio sample rate ${a.sample_rate} above 48000`);
    if (a.channels > 2) errors.push(`audio channels ${a.channels} (max 2)`);
  }
  if (duration < minSec || duration > maxSec) errors.push(`duration ${duration.toFixed(2)}s outside ${minSec}-${maxSec}s`);
  if (size > SPEC.maxBytes) errors.push(`file is ${size} bytes (max ${SPEC.maxBytes})`);
  const boxes = topLevelBoxes(file);
  const moov = boxes.findIndex((b) => b.type === "moov");
  const mdat = boxes.findIndex((b) => b.type === "mdat");
  if (moov < 0 || mdat < 0) errors.push("moov or mdat box missing");
  else if (moov > mdat) errors.push("moov atom is after mdat (needs faststart)");
  if (boxes[0]?.type !== "ftyp") errors.push("file does not start with ftyp");
  return {
    ok: errors.length === 0,
    errors,
    info: { width: v?.width, height: v?.height, fps: v ? fps(v.avg_frame_rate || v.r_frame_rate) : 0, duration, size, videoCodec: v?.codec_name, audioCodec: a?.codec_name, audioRate: a ? Number(a.sample_rate) : 0, boxes: boxes.map((b) => b.type) },
  };
}
