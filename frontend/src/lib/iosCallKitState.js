/**
 * Tiny shared state for the native iOS CallKit bridge.
 *
 * `enabled` only ever becomes true inside the native iOS app when CallKit is
 * allowed (not in mainland China). On web, Electron and Android it stays
 * false, so every check below is a no-op there.
 */

let snapshot = Object.freeze({ enabled: false, fallback: false });
const subscribers = new Set();

function update(patch) {
  const next = { ...snapshot, ...patch };
  if (next.enabled === snapshot.enabled && next.fallback === snapshot.fallback) return;
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

/** CallKit activates/deactivates the AVAudioSession for calls itself. */
export function callKitManagesAudioSession() {
  return snapshot.enabled;
}
