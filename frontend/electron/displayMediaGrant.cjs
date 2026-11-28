'use strict';
// Screen-share grant for setDisplayMediaRequestHandler (3.7.33 echo fix, 4.2.1 rework).
// The in-app picker stores its choice here just before getDisplayMedia.
let pending = null;
const PENDING_TTL_MS = 15000;

function setPendingDisplaySource(id, now = Date.now()) {
  pending = { id, at: now };
}

/**
 * The picked source for every getDisplayMedia of this share. Not one-shot: the
 * renderer retries getDisplayMedia with simpler constraints when the first try
 * fails (getDisplayMediaStream), and a one-shot pick made those retries share
 * the first screen instead of the window the user chose. The next pick
 * replaces it; a stale pick expires.
 */
function takePendingDisplaySource(now = Date.now()) {
  const p = pending;
  if (!p) return null;
  if (now - p.at > PENDING_TTL_MS) {
    pending = null;
    return null;
  }
  return p.id;
}

function clearPendingDisplaySource() {
  pending = null;
}

/** Windows build number from os.release() ("10.0.19045" -> 19045), 0 when unknown. */
function windowsBuild(release) {
  const m = /^10\.0\.(\d+)/.exec(String(release || ''));
  return m ? Number(m[1]) : 0;
}

/**
 * WASAPI process loopback (AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK) works from
 * Windows 10 2004 (build 19041). Same floor as the Tauri capture crate
 * (desktop/crates/descall-capture/src/caps.rs MIN_PROCESS_LOOPBACK).
 */
const MIN_PROCESS_LOOPBACK_BUILD = 19041;

/**
 * Chromium's own audio device id for "system audio without this browser"
 * (media::AudioDeviceDescription::kLoopbackWithoutChromeId). On Windows the
 * audio service opens it as process loopback in EXCLUDE_TARGET_PROCESS_TREE
 * mode with the audio service's PID, which is where Descall plays the call:
 * games, music and videos go out, the other participants' voices do not.
 */
const LOOPBACK_WITHOUT_DESCALL_ID = 'loopbackWithoutChrome';

/**
 * How system audio may be shared on this machine:
 *   'exclude-self'  system audio minus Descall's own playback
 *   'off'           no system audio (video only): this OS cannot leave Descall out
 *
 * Why not Electron's documented `audio: 'loopback'`: Electron turns it into
 * loopbackWithoutChrome only when the request carries restrictOwnAudio, and
 * Chromium drops that constraint unless media::IsRestrictOwnAudioSupported(),
 * which on Windows is `GetVersion() >= WIN11`. On Windows 10 the grant stayed
 * plain 'loopback' = the whole system mix, call included, so friends heard
 * themselves (4.1.x feedback). Plain 'loopback' is therefore never granted.
 */
function systemAudioPolicy({ platform = process.platform, release = '' } = {}) {
  if (platform === 'win32') {
    return windowsBuild(release) >= MIN_PROCESS_LOOPBACK_BUILD ? 'exclude-self' : 'off';
  }
  // macOS: Chromium opens loopbackWithoutChrome with a Core Audio process tap
  // (macOS 14.2+). Older systems fail to start that audio source and the
  // renderer falls back to video only, which never echoes.
  if (platform === 'darwin') return 'exclude-self';
  // Linux: the only loopback is the PulseAudio / PipeWire monitor of the whole
  // mix, which carries the call.
  return 'off';
}

/**
 * The handler's answer. Audio, when this machine can leave Descall out, is
 * the explicit loopbackWithoutChrome device (Electron's `{ id, name }` form),
 * so it no longer depends on the renderer's constraint surviving. Never
 * `loopbackWithMute`: that silences the call for the sharer. A video-only
 * request must not get audio, or a loopback failure cancels the whole share.
 */
function buildDisplayMediaGrant(source, request, policy = 'exclude-self') {
  const wantsAudio = request?.audioRequested !== false;
  if (!wantsAudio || policy !== 'exclude-self') return { video: source };
  return { video: source, audio: { id: LOOPBACK_WITHOUT_DESCALL_ID, name: 'System audio' } };
}

module.exports = {
  setPendingDisplaySource,
  takePendingDisplaySource,
  clearPendingDisplaySource,
  buildDisplayMediaGrant,
  systemAudioPolicy,
  windowsBuild,
  MIN_PROCESS_LOOPBACK_BUILD,
  LOOPBACK_WITHOUT_DESCALL_ID,
  PENDING_TTL_MS,
};
