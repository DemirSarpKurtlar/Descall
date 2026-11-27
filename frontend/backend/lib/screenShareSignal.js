/**
 * Whitelist screen-share identity forwarded on call signaling.
 * Stream ids and transceiver mids only — never media bytes.
 */

function clean(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function sanitizeScreenAnnouncement(input) {
  if (!input || typeof input !== "object") return null;
  const streamId = clean(input.streamId, 128);
  const videoMid = clean(input.videoMid, 64);
  const audioMid = clean(input.audioMid, 64);
  if (!streamId && !videoMid && !audioMid) return null;
  return { v: 1, streamId, videoMid, audioMid };
}

/**
 * A member's video decode list (screen share codec choice with an SFU): codec family
 * names only, whitelisted, deduplicated. Mirrors frontend/src/lib/screenShareCodec.js
 * sanitizeVideoDecode (screenShareCodec.selftest.mjs checks both agree).
 */
const VIDEO_CODEC_FAMILIES = ["av1", "vp9", "h265", "h264", "vp8"];

function sanitizeVideoDecode(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const raw of input.slice(0, 16)) {
    const fam = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (VIDEO_CODEC_FAMILIES.includes(fam) && !out.includes(fam)) out.push(fam);
  }
  return out.length ? out : null;
}

module.exports = { sanitizeScreenAnnouncement, sanitizeVideoDecode, VIDEO_CODEC_FAMILIES };
