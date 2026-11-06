import { useEffect, useRef } from "react";
import { applyPlaybackGain, releasePlaybackGain } from "../../lib/voiceGain";
import { liveAudioTrackKey, screenAudioGain } from "../../lib/screenAudioLevel";

/**
 * Always-mounted sink for a remote screen / tab share's audio (DM, group and
 * server voice). Lives outside the share layout so minimize / layout swaps do
 * not cut it.
 *
 * Before (two copies, CallOverlay and ServerVoicePanel):
 *  - Deafen did not reach it: you heard the share while deafened.
 *  - One effect did everything, so every volume tick (slider drag) set
 *    srcObject to null and back: a dropout on each step.
 *  - Each run wrapped track.onunmute again, so the handler chain grew with
 *    every render.
 * Now the stream is bound only when its live audio tracks change, the level
 * (volume, deafen) is applied on its own, and the unmute listener is removed.
 */
export default function RemoteScreenAudioSink({ stream, volume = 100, deafened = false, sinkId = "" }) {
  const audioRef = useRef(null);
  const trackKey = liveAudioTrackKey(stream);

  // A boosted share keeps an AudioContext: close it with the element.
  useEffect(() => {
    const el = audioRef.current;
    return () => releasePlaybackGain(el);
  }, []);

  // Stream binding: only when the set of live audio tracks changes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    if (!stream || !trackKey) {
      if (el.srcObject) el.srcObject = null;
      return undefined;
    }
    // Rebind so late-arriving audio tracks are picked up (mobile).
    el.srcObject = null;
    el.srcObject = stream;
    const play = () => el.play().catch(() => {});
    play();
    const tracks = stream.getAudioTracks();
    tracks.forEach((t) => t.addEventListener?.("unmute", play));
    return () => tracks.forEach((t) => t.removeEventListener?.("unmute", play));
  }, [stream, trackKey]);

  // Level: volume slider and deafen, no rebind.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = Boolean(deafened) || !trackKey;
    applyPlaybackGain(el, screenAudioGain({ volume, deafened }));
  }, [volume, deafened, trackKey]);

  useEffect(() => {
    const el = audioRef.current;
    if (sinkId && el && typeof el.setSinkId === "function") {
      el.setSinkId(sinkId).catch(() => {});
    }
  }, [sinkId]);

  return <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} aria-hidden="true" />;
}
