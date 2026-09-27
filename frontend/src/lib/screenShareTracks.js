/** LiveKit source strings. Compared as strings so tests do not import the SDK. */
export const SCREEN_SHARE_SOURCE = "screen_share";
export const SCREEN_SHARE_AUDIO_SOURCE = "screen_share_audio";

/**
 * Screen-share audio must stay on the screen stream.
 * Treating every audio track as the microphone drops tab/system audio
 * and replaces the voice element.
 */
export function classifyLiveKitTrack({ kind, source } = {}) {
  if (source === SCREEN_SHARE_SOURCE || source === SCREEN_SHARE_AUDIO_SOURCE) return "screen";
  if (kind === "audio") return "mic";
  return "camera";
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
