/**
 * Instant clip ring buffer math (pure).
 *
 * The recorder (instantClip.js) encodes frames with WebCodecs VideoEncoder (hardware
 * preferred) and keeps the encoded chunks in RAM. A keyframe is forced every
 * `keyframeSec`, so the ring can always start on a keyframe: anything before the first
 * keyframe would be undecodable. MediaRecorder is not used because its chunks are not
 * independently playable. On save the chosen range is muxed (mediabunny, no re-encode).
 *
 * Chunk: { key: boolean, ts: microseconds, dur: microseconds, bytes: number }.
 */

export const DEFAULTS = Object.freeze({ windowSec: 30, height: 720, fps: 30, keyframeSec: 1 });
export const WINDOW_CHOICES = [30, 60];
export const MAX_BYTES_CAP = 160 * 1024 * 1024;

/** Video bitrate (bits / s) for a capture size. 720p30 = 4 Mbps (~30 MB per 60 s). */
export function bitrateFor(height = 720, fps = 30) {
  const base = height >= 1080 ? 10_000_000 : height >= 720 ? 4_000_000 : 2_000_000;
  return Math.round(base * (fps > 30 ? 1.6 : 1));
}

/** Expected bytes for `seconds` at `bitsPerSec`. */
export function estimateBytes(seconds, bitsPerSec) {
  return Math.round((bitsPerSec / 8) * seconds);
}

/** RAM cap for the ring: the window plus two keyframe intervals, +30 % headroom, capped. */
export function memoryCapBytes({ windowSec = DEFAULTS.windowSec, height = DEFAULTS.height, fps = DEFAULTS.fps, keyframeSec = DEFAULTS.keyframeSec } = {}) {
  return Math.min(MAX_BYTES_CAP, Math.round(estimateBytes(windowSec + 2 * keyframeSec, bitrateFor(height, fps)) * 1.3));
}

/** Frames between forced keyframes. */
export function keyframeEvery(fps = DEFAULTS.fps, keyframeSec = DEFAULTS.keyframeSec) {
  return Math.max(1, Math.round(fps * keyframeSec));
}

export function totalBytes(chunks) {
  let n = 0;
  for (const c of chunks || []) n += c.bytes || 0;
  return n;
}

/** Index of the last keyframe at or before `ts` (or the first keyframe after it), -1 when none. */
export function keyIndexAtOrBefore(chunks, ts) {
  let best = -1;
  for (let i = 0; i < chunks.length; i += 1) {
    if (!chunks[i].key) continue;
    if (chunks[i].ts <= ts) best = i;
    else return best === -1 ? i : best;
  }
  return best;
}

/**
 * Drop what the window no longer needs. Keeps chunks from the last keyframe at or before
 * (newest - windowSec), so the ring always covers the full window and starts on a keyframe,
 * then drops whole GOPs from the front while over `maxBytes` (the newest GOP stays).
 * Returns the number of chunks to drop from the front (callers splice in place).
 */
export function pruneCount(chunks, { windowSec = DEFAULTS.windowSec, maxBytes = MAX_BYTES_CAP } = {}) {
  if (!chunks || !chunks.length) return 0;
  const newest = chunks[chunks.length - 1].ts;
  const firstKey = chunks.findIndex((c) => c.key);
  if (firstKey === -1) return chunks.length; // nothing decodable yet
  let start = Math.max(firstKey, keyIndexAtOrBefore(chunks, newest - windowSec * 1_000_000));
  if (start < 0) start = firstKey;
  let bytes = 0;
  for (let i = start; i < chunks.length; i += 1) bytes += chunks[i].bytes || 0;
  while (bytes > maxBytes) {
    let next = -1;
    for (let i = start + 1; i < chunks.length; i += 1) if (chunks[i].key) { next = i; break; }
    if (next === -1) break;
    for (let i = start; i < next; i += 1) bytes -= chunks[i].bytes || 0;
    start = next;
  }
  return start;
}

/** Length (ms) covered by a chunk list. */
export function timelineLength(chunks) {
  if (!chunks || !chunks.length) return 0;
  const a = chunks[0].ts;
  const last = chunks[chunks.length - 1];
  return Math.max(0, Math.round((last.ts + (last.dur || 0) - a) / 1000));
}

/** Default selection: the last windowSec seconds of the snapshot, in ms from its start. */
export function defaultTrim(chunks, windowSec = DEFAULTS.windowSec) {
  const len = timelineLength(chunks);
  return { from: Math.max(0, len - windowSec * 1000), to: len };
}

/** Clamp a trim to [0, length] with a minimum length (ms). */
export function clampTrim(trim, length, minMs = 1000) {
  let from = Math.max(0, Math.min(Number(trim?.from) || 0, length));
  let to = Math.max(0, Math.min(trim?.to == null ? length : Number(trim.to), length));
  if (to < from) [from, to] = [to, from];
  if (to - from < minMs) {
    to = Math.min(length, from + minMs);
    from = Math.max(0, to - minMs);
  }
  return { from, to };
}

/**
 * Chunks to mux for a selection [from, to] (ms from the snapshot start): starts at the
 * keyframe at or before `from` (no re-encode, so the cut snaps back to a keyframe; at most
 * keyframeSec early) and ends with the last chunk that starts before `to`.
 * Returns { start, end, fromMs } with end exclusive and fromMs the real start.
 */
export function selectRange(chunks, from, to) {
  if (!chunks || !chunks.length) return { start: 0, end: 0, fromMs: 0 };
  const base = chunks[0].ts;
  const fromUs = base + Math.max(0, from) * 1000;
  const toUs = base + Math.max(from, to) * 1000;
  let start = keyIndexAtOrBefore(chunks, fromUs);
  if (start < 0) start = 0;
  let end = start;
  while (end < chunks.length && chunks[end].ts < toUs) end += 1;
  if (end === start) end = Math.min(chunks.length, start + 1);
  return { start, end, fromMs: Math.round((chunks[start].ts - base) / 1000) };
}
