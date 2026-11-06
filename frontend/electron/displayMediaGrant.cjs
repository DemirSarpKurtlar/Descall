'use strict';
// Screen-share grant for setDisplayMediaRequestHandler (3.7.33 echo fix).
// The in-app picker stores its choice here just before getDisplayMedia.
let pending = null;
const PENDING_TTL_MS = 15000;

function setPendingDisplaySource(id, now = Date.now()) {
  pending = { id, at: now };
}

function takePendingDisplaySource(now = Date.now()) {
  const p = pending;
  pending = null;
  if (!p || now - p.at > PENDING_TTL_MS) return null;
  return p.id;
}

/**
 * Loopback = system audio. With the renderer's `restrictOwnAudio` constraint,
 * Electron 43.4+ turns it into `loopbackWithoutChrome` (no Descall playback,
 * so viewers never hear their own voice back). Never `loopbackWithMute`: that
 * silences the call for the sharer. A video-only request must not require
 * audio, or a loopback failure cancels the whole share.
 */
function buildDisplayMediaGrant(source, request) {
  const wantsAudio = request?.audioRequested !== false;
  return { video: source, ...(wantsAudio ? { audio: 'loopback' } : {}) };
}

module.exports = { setPendingDisplaySource, takePendingDisplaySource, buildDisplayMediaGrant, PENDING_TTL_MS };
