/**
 * LiveKit active speakers, published without React state (so a talking room does
 * not re-render the app). useServerVoice publishes RoomEvent.ActiveSpeakersChanged
 * here; the 3D world subscribes for its green speaking rings. Group calls (mesh
 * WebRTC) have no SFU speaker list; the world falls back to the local voice
 * activity detector there (same as the call tiles).
 */

const listeners = new Set();
let current = { scope: null, ids: [] };

export function publishActiveSpeakers(scope, ids) {
  current = { scope: scope == null ? null : String(scope), ids: (ids || []).map(String) };
  for (const fn of listeners) {
    try {
      fn(current);
    } catch {
      /* a listener must never break the call */
    }
  }
}

export function subscribeActiveSpeakers(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

export function activeSpeakersSnapshot() {
  return current;
}
