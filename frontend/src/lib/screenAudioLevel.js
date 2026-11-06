/**
 * Level of a received screen / tab share's audio (components/call/RemoteScreenAudioSink.jsx).
 * `volume` is the share slider in percent (0..200), `deafened` the local
 * deafen: deafen silences the share like every other voice.
 */
export function screenAudioGain({ volume = 100, deafened = false } = {}) {
  if (deafened) return 0;
  const n = Number(volume);
  const pct = Number.isFinite(n) ? n : 100;
  return Math.max(0, Math.min(200, pct)) / 100;
}

/** Ids of the stream's live audio tracks: the sink rebinds only when this changes. */
export function liveAudioTrackKey(stream) {
  const tracks = stream?.getAudioTracks?.() || [];
  return tracks
    .filter((t) => t && t.readyState !== "ended")
    .map((t) => t.id || "")
    .filter(Boolean)
    .sort()
    .join(",");
}
