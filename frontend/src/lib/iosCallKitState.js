/**
 * Tiny shared state for the native iOS CallKit bridge.
 *
 * `enabled` only ever becomes true inside the native iOS app when CallKit is
 * allowed (not in mainland China). On web, Electron and Android it stays
 * false, so every check below is a no-op there.
 */

let snapshot = Object.freeze({ enabled: false, fallback: false, audioReleased: false });
const subscribers = new Set();

function update(patch) {
  const next = { ...snapshot, ...patch };
  if (
    next.enabled === snapshot.enabled &&
    next.fallback === snapshot.fallback &&
    next.audioReleased === snapshot.audioReleased
  ) {
    return;
  }
  snapshot = Object.freeze(next);
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  });
}

export function getCallKitUiSnapshot() {
  return snapshot;
}

export function subscribeCallKitUi(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function setCallKitEnabled(enabled) {
  update({ enabled: Boolean(enabled) });
}

/** CallKit couldn't show this ring (report failed) → use the in-app ring UI. */
export function setCallKitFallback(fallback) {
  update({ fallback: Boolean(fallback) });
}

/** True while CallKit (not the web UI) owns the incoming ring. */
export function callKitOwnsIncomingRing() {
  return snapshot.enabled && !snapshot.fallback;
}

/**
 * The current call's CallKit entry was ended to free the microphone (last-
 * resort recovery); the web call continues on the plain audio session.
 * Reset when the call ends.
 */
export function setCallKitAudioReleased(released) {
  update({ audioReleased: Boolean(released) });
}

/**
 * CallKit activates/deactivates the AVAudioSession for INCOMING DM calls
 * itself. Outgoing calls are not reported to CallKit (see
 * iosCallKitController.js), so they always use the CallKeepAlive session.
 */
export function callKitManagesAudioSession(direction = "incoming") {
  return snapshot.enabled && direction === "incoming" && !snapshot.audioReleased;
}

/**
 * In-app "Accept" while CallKit owns the ring: the bridge answers through
 * CallKit first so the microphone starts inside CallKit's audio session
 * (capture started before didActivate is interrupted and has to be
 * re-acquired, which left the peer hearing silence for a second or more).
 * Returns true when the answer was taken over.
 */
let uiAnswerInterceptor = null;
export function setUiAnswerInterceptor(fn) {
  uiAnswerInterceptor = typeof fn === "function" ? fn : null;
}
export function interceptUiAnswer() {
  if (!uiAnswerInterceptor || !snapshot.enabled) return false;
  try {
    return Boolean(uiAnswerInterceptor());
  } catch {
    return false;
  }
}
