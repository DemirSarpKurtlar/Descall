import { useEffect, useReducer, useRef } from "react";
import { decideVideoPresence, holdVideoPresence, readVideoTracks, VIDEO_MUTE_HOLD_MS } from "../lib/videoPresence.js";

/**
 * Live answer to "show this tile's camera video?" for a MediaStream.
 * Re-evaluates on addtrack / removetrack and on every video track's
 * mute / unmute / ended, so a camera turned off (remote track muted,
 * LiveKit mute, replaceTrack(null)) returns the tile to the avatar.
 * Returns { show, mount, reason }.
 */
export function useVideoPresence(stream, { cameraOn = null, holdMs = VIDEO_MUTE_HOLD_MS } = {}) {
  const [, bump] = useReducer((x) => x + 1, 0);
  const heldRef = useRef({ show: false, holdUntil: 0 });
  const timerRef = useRef(null);

  useEffect(() => {
    if (!stream) return undefined;
    const tracks = new Set();
    const onTrackEvent = () => bump();
    const bind = () => {
      let list = [];
      try {
        list = stream.getVideoTracks?.() || [];
      } catch {
        list = [];
      }
      for (const track of list) {
        if (!track || tracks.has(track)) continue;
        tracks.add(track);
        track.addEventListener?.("mute", onTrackEvent);
        track.addEventListener?.("unmute", onTrackEvent);
        track.addEventListener?.("ended", onTrackEvent);
      }
    };
    const onStreamChange = () => {
      bind();
      bump();
    };
    bind();
    stream.addEventListener?.("addtrack", onStreamChange);
    stream.addEventListener?.("removetrack", onStreamChange);
    // Local tracks flip `enabled` without an event; a cheap poll covers it.
    const poll = setInterval(onTrackEvent, 1000);
    return () => {
      clearInterval(poll);
      stream.removeEventListener?.("addtrack", onStreamChange);
      stream.removeEventListener?.("removetrack", onStreamChange);
      for (const track of tracks) {
        track.removeEventListener?.("mute", onTrackEvent);
        track.removeEventListener?.("unmute", onTrackEvent);
        track.removeEventListener?.("ended", onTrackEvent);
      }
    };
  }, [stream]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const decision = decideVideoPresence({ cameraOn, tracks: readVideoTracks(stream) });
  const now = Date.now();
  const next = holdVideoPresence(heldRef.current, decision, now, holdMs);
  heldRef.current = next;
  if (next.holdUntil > 0) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => bump(), Math.max(16, next.holdUntil - now + 5));
  }
  return { show: next.show, mount: decision.mount, reason: decision.reason };
}
