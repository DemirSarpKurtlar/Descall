/**
 * Does a call tile show its camera video, or the avatar?
 *
 * 2.10.108 bug: after a peer turned the camera on and then off, the DM tile
 * kept a black <video> (name + red camera-off icon on a dark gradient)
 * because it only asked "is there a non-ended video track?". Turning the
 * camera off does not end the remote track: the sender disables it, stops it
 * locally, or replaceTrack(null)s it, and the receiver's track just goes
 * `muted` (no more frames). LiveKit camera mute does the same.
 *
 * Rules (pure, used by DM, group mesh and server voice / LiveKit tiles):
 *  - cameraOn === false (signaled call:media-state / LiveKit mute) → avatar now.
 *  - no video track, or every one ended / disabled                   → avatar now.
 *  - tracks only `muted` (no frames)                                 → avatar after
 *    a short hold, so a one-second network stall does not flash the avatar.
 *  - a live, unmuted, enabled track                                  → video.
 * `mount` says whether a <video> element is worth keeping mounted (any track
 * not ended), so turning the camera back on shows video without re-attaching.
 */

export const VIDEO_MUTE_HOLD_MS = 700;

/** Plain snapshot of a stream's video tracks (works on fake tracks in tests). */
export function readVideoTracks(stream) {
  if (!stream || typeof stream.getVideoTracks !== "function") return [];
  try {
    return stream.getVideoTracks().filter(Boolean).map((t) => ({
      readyState: t.readyState || "live",
      muted: Boolean(t.muted),
      enabled: t.enabled !== false,
    }));
  } catch {
    return [];
  }
}

/** { mount, show, reason } — reason: "camera-off" | "no-track" | "ended" | "disabled" | "muted" | "live" */
export function decideVideoPresence({ cameraOn = null, tracks = [] } = {}) {
  const list = Array.isArray(tracks) ? tracks : [];
  const notEnded = list.filter((t) => t && t.readyState !== "ended");
  const mount = notEnded.length > 0;
  if (cameraOn === false) return { mount, show: false, reason: "camera-off" };
  if (!list.length) return { mount, show: false, reason: "no-track" };
  if (!notEnded.length) return { mount, show: false, reason: "ended" };
  const enabled = notEnded.filter((t) => t.enabled !== false);
  if (!enabled.length) return { mount, show: false, reason: "disabled" };
  if (enabled.some((t) => !t.muted)) return { mount, show: true, reason: "live" };
  return { mount, show: false, reason: "muted" };
}

/**
 * Debounce only the "frames stopped" case. Returns { show, holdUntil }.
 * prev = { show, holdUntil } from the previous evaluation.
 */
export function holdVideoPresence(prev, decision, now, holdMs = VIDEO_MUTE_HOLD_MS) {
  const was = Boolean(prev?.show);
  if (decision.show) return { show: true, holdUntil: 0 };
  if (decision.reason !== "muted" || !was) return { show: false, holdUntil: 0 };
  const until = prev?.holdUntil > 0 ? prev.holdUntil : now + holdMs;
  if (now < until) return { show: true, holdUntil: until };
  return { show: false, holdUntil: 0 };
}
