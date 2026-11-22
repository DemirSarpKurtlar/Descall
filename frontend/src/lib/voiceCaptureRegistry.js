/**
 * Tracks the microphone captures that calls and voice channels are using, so
 * the Settings voice tab can stay out of their way.
 *
 * Opening Settings during a call used to break the call's microphone:
 *   - the voice tab captured and stopped a second microphone just to unlock
 *     device labels; in the iOS app (WKWebView) that interrupts the call's
 *     capture and the other side stops hearing you;
 *   - the mic test replaced the shared noise suppression session, and closing
 *     Settings (or leaving the voice tab) disposed it even when no test ran.
 *
 * Pure apart from the module-level set, so it runs in Node selftests.
 */

const captures = new Set();

/** Native iOS app (Capacitor), checked through the global so no plugin is pulled in. */
export function isNativeIosShell(win = typeof window !== "undefined" ? window : null) {
  try {
    const cap = win?.Capacitor;
    return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}

function isLive(track) {
  return Boolean(track) && track.readyState !== "ended";
}

function prune() {
  for (const track of captures) {
    if (!isLive(track)) captures.delete(track);
  }
}

/** Remember the audio tracks of a voice capture (call, group call, voice channel). */
export function registerVoiceCapture(stream) {
  const tracks = stream?.getAudioTracks?.() || [];
  for (const track of tracks) {
    if (isLive(track)) captures.add(track);
  }
  prune();
}

/** Live voice capture track, or null when no call is using the microphone. */
export function liveVoiceCaptureTrack() {
  prune();
  for (const track of captures) return track;
  return null;
}

export function hasLiveVoiceCapture() {
  return liveVoiceCaptureTrack() !== null;
}

/**
 * Whether the Settings voice tab may open a throwaway microphone capture just
 * to read device names. Never in the iOS app (one capture at a time; the
 * system picks the route anyway), never while a call is capturing, and not
 * when the names are already readable.
 */
export function shouldProbeMicForLabels({ devices = [], nativeIos = false, liveCapture = false } = {}) {
  if (nativeIos || liveCapture) return false;
  const inputs = devices.filter((d) => d?.kind === "audioinput");
  if (inputs.some((d) => d.label)) return false;
  return true;
}

/**
 * How the mic test gets audio. During a call it meters a clone of the call's
 * own track and must not touch the shared noise suppression session; it only
 * opens (and later disposes) its own session when nothing else is capturing.
 */
export function micTestPlan({ callTrack = null } = {}) {
  if (isLive(callTrack)) return { mode: "clone", ownsSession: false };
  return { mode: "acquire", ownsSession: true };
}

/** Test hook. */
export function _resetVoiceCaptures() {
  captures.clear();
}
