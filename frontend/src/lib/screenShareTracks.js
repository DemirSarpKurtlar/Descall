import { classifyInboundMedia, isScreenRole } from "./screenShareIdentity.js";

/** LiveKit source strings. Compared as strings so tests do not import the SDK. */
export const SCREEN_SHARE_SOURCE = "screen_share";
export const SCREEN_SHARE_AUDIO_SOURCE = "screen_share_audio";

/**
 * Screen-share audio must stay on the screen stream.
 * A camera is never promoted just because a share was announced.
 */
export function classifyLiveKitTrack({
  kind,
  source,
  trackName = null,
  streamId = null,
  mid = null,
  displaySurface = null,
  label = "",
  announcement = null,
} = {}) {
  const role = classifyInboundMedia({
    kind,
    source,
    trackName,
    streamId,
    mid,
    displaySurface,
    label,
    announcement,
  });
  if (isScreenRole(role)) return "screen";
  if (role === "mic") return "mic";
  return "camera";
}

/**
 * Mark the participant as sharing without moving their camera onto the
 * screen stage. The screen stream is attached only when classification
 * says the track is a display capture.
 */
export function adoptLateScreenShare(participant) {
  return { ...(participant || {}), isScreenSharing: true };
}

/** One live track per kind. Video and screen-audio often arrive as separate events. */
export function tracksAfterMerge(existingTracks, track) {
  if (!track) return [...(existingTracks || [])];
  const kept = (existingTracks || []).filter(
    (current) => current && current !== track && current.kind !== track.kind
  );
  kept.push(track);
  return kept;
}

/** Keep one live track per kind so video and screen-audio can arrive separately. */
export function nextScreenStream(existing, track) {
  if (!track) return existing || new MediaStream();
  const stream = existing || new MediaStream();
  const next = tracksAfterMerge(stream.getTracks(), track);
  for (const current of stream.getTracks()) {
    if (!next.includes(current)) {
      try {
        stream.removeTrack(current);
      } catch {
        /* ignore */
      }
    }
  }
  if (!stream.getTracks().includes(track)) {
    try {
      stream.addTrack(track);
    } catch {
      /* ignore */
    }
  }
  return stream;
}

const DISPLAY_LABEL = /screen|display|window|\btab\b|web contents|desktop|monitor|primary/;

/** Remote receivers often have an empty label. displaySurface only exists locally. */
export function looksLikeDisplayTrack(track) {
  if (!track || track.kind !== "video") return false;
  let surface = "";
  try {
    surface = track.getSettings?.().displaySurface || "";
  } catch {
    surface = "";
  }
  if (surface) return true;
  return DISPLAY_LABEL.test(String(track.label || "").toLowerCase());
}

/**
 * Video track that belongs on the screen stage after a share announcement.
 * Tab/system audio on the same MediaStream must not disqualify it — that
 * filter hid DM shares whenever Chrome's picker included audio.
 * A remote track with an empty label is still the share when the camera is off.
 *
 * @param {Array<{ kind?: string, readyState?: string, label?: string }>} tracks
 * @param {{ cameraTracks?: object[] }} [opts]
 */
export function pickAnnouncedScreenTrack(tracks, { cameraTracks = [] } = {}) {
  const videos = (tracks || []).filter(
    (track) => track && track.kind === "video" && track.readyState !== "ended"
  );
  const cameras = new Set((cameraTracks || []).filter(Boolean));
  const labeled = videos.find((track) => !cameras.has(track) && looksLikeDisplayTrack(track));
  if (labeled) return labeled;
  const extras = videos.filter((track) => !cameras.has(track));
  if (cameras.size === 0) return extras[extras.length - 1] || null;
  if (videos.length > cameras.size && extras.length) return extras[extras.length - 1];
  return null;
}

/** Audio that arrived on the display stream, excluding the call microphone. */
export function screenAudioAlongside(stream, { micTracks = [] } = {}) {
  const mic = new Set((micTracks || []).filter(Boolean));
  return (stream?.getAudioTracks?.() || []).filter(
    (track) => track && track.readyState !== "ended" && !mic.has(track)
  );
}

/**
 * Which share stays on the main stage.
 * A new share becomes the stage unless one is pinned. A share that stops
 * releases the pin and falls back to a share that is still live.
 */
export function nextShareSelection({ ids = [], activeId = null, pinnedId = null, previousIds = [] } = {}) {
  const list = ids.map((id) => String(id));
  const pin = pinnedId != null && list.includes(String(pinnedId)) ? String(pinnedId) : null;
  if (pin) return { activeId: pin, pinnedId: pin };
  const prev = new Set((previousIds || []).map((id) => String(id)));
  const added = list.filter((id) => !prev.has(id));
  if (added.length && (previousIds || []).length) {
    return { activeId: added[added.length - 1], pinnedId: null };
  }
  if (activeId != null && list.includes(String(activeId))) {
    return { activeId: String(activeId), pinnedId: null };
  }
  return { activeId: list[list.length - 1] || null, pinnedId: null };
}

export function screenShareStillLive(stream) {
  if (!stream?.getVideoTracks) return false;
  return stream.getVideoTracks().some((track) => track && track.readyState !== "ended");
}

/** The room paints a screen stage only from a live display stream. */
export function visibleScreenStream(participant) {
  if (!participant) return null;
  if (screenShareStillLive(participant.screenStream)) return participant.screenStream;
  return null;
}
