/**
 * stream_audio_control (Ultra), sender side: the shared screen / tab audio
 * goes through a GainNode, so the sharer can lower or mute it for everyone
 * without stopping the share. Applied to every new capture from
 * captureScreenShareStream() while the feature is entitled; with the feature
 * off (or no audio in the share) the stream is returned untouched.
 * Viewer side (local volume of a received share) lives in the bridge.
 */
import { onAudioSettings, streamAudioGains } from "./premiumAudioRuntime.js";

const live = new Set(); // { gain, ctx }

function applyAll() {
  const g = streamAudioGains();
  for (const entry of live) {
    const v = g ? g.send : 1;
    try { entry.gain.gain.setTargetAtTime(v, entry.ctx.currentTime, 0.03); } catch { entry.gain.gain.value = v; }
  }
}

try {
  onAudioSettings((key) => { if (key === "stream_audio_control" || key === "*") applyAll(); });
} catch { /* non-browser */ }

export function processScreenShareAudio(stream) {
  const gains = streamAudioGains();
  const raw = stream?.getAudioTracks?.()[0];
  if (!gains || !raw || typeof window === "undefined") return stream;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return stream;
  let ctx;
  try {
    ctx = new AC({ latencyHint: "interactive" });
    const src = ctx.createMediaStreamSource(new MediaStream([raw]));
    const gain = ctx.createGain();
    gain.gain.value = gains.send;
    const dest = ctx.createMediaStreamDestination();
    src.connect(gain);
    gain.connect(dest);
    const out = dest.stream.getAudioTracks()[0];
    try { out.contentHint = raw.contentHint || "music"; } catch { /* ignore */ }
    const entry = { gain, ctx };
    live.add(entry);
    const release = () => {
      if (!live.has(entry)) return;
      live.delete(entry);
      try { raw.stop(); } catch { /* ignore */ }
      try { ctx.close(); } catch { /* ignore */ }
    };
    // The call hooks stop the share by stopping its tracks: stop the capture too.
    const stopOut = out.stop.bind(out);
    out.stop = () => { stopOut(); release(); };
    raw.addEventListener("ended", () => { try { stopOut(); } catch { /* ignore */ } release(); });
    const videos = stream.getVideoTracks();
    videos.forEach((v) => v.addEventListener("ended", release));
    return new MediaStream([...videos, out]);
  } catch {
    try { ctx?.close(); } catch { /* ignore */ }
    return stream;
  }
}
