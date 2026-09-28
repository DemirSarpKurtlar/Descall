/** LiveKit source strings. Compared as strings so tests do not import the SDK. */
export const SCREEN_SHARE_SOURCE = "screen_share";
export const SCREEN_SHARE_AUDIO_SOURCE = "screen_share_audio";

/**
 * Screen-share audio must stay on the screen stream.
 * Treating every audio track as the microphone drops tab/system audio
 * and replaces the voice element.
 */
export function classifyLiveKitTrack({ kind, source, screenExpected = false } = {}) {
  if (source === SCREEN_SHARE_SOURCE || source === SCREEN_SHARE_AUDIO_SOURCE) return "screen";
  if (kind === "audio") return "mic";
  // A window capture often arrives with an empty source and the window title
  // as its label. Once the room has announced a share, that video is the screen
  // unless LiveKit already marked it as the camera.
  if (kind === "video" && screenExpected && source !== "camera") return "screen";
  return "camera";
}

/**
 * The share signal often lands after the video track. That track was stored as
 * the camera, so the room shows a tiny tile and never opens the screen stage.
 * Move it onto the screen stream unless a real camera was announced.
 */
export function adoptLateScreenShare(participant) {
  const next = { ...(participant || {}), isScreenSharing: true };
  if (screenShareStillLive(next.screenStream)) return next;
  if (next.cameraAnnounced) return next;
  if (!screenShareStillLive(next.cameraStream)) return next;
  return {
    ...next,
    screenStream: next.cameraStream,
    cameraStream: null,
    cameraOn: false,
  };
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

export function screenShareStillLive(stream) {
  if (!stream?.getVideoTracks) return false;
  return stream.getVideoTracks().some((track) => track && track.readyState !== "ended");
}

/**
 * The room paints a screen stage only from `screenStream`. A window capture
 * often lands in `cameraStream` first, so the share stays a small cropped tile.
 * Use the camera video as the screen until a real camera has been announced.
 */
export function visibleScreenStream(participant) {
  if (!participant) return null;
  if (screenShareStillLive(participant.screenStream)) return participant.screenStream;
  if (
    participant.isScreenSharing &&
    !participant.cameraAnnounced &&
    screenShareStillLive(participant.cameraStream)
  ) {
    return participant.cameraStream;
  }
  return null;
}
