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

module.exports = { sanitizeScreenAnnouncement };
