/**
 * Plays admin live-listen audio in the browser from raw 16 kHz PCM frames
 * relayed over the socket. Each speaker gets their own playback timeline with
 * a small jitter buffer, so overlapping speakers mix naturally and a late
 * frame never piles up latency.
 */
const JITTER_S = 0.18;
const MAX_LEAD_S = 1.2;

function toFloat32(pcm) {
  let int16 = null;
  if (pcm instanceof Int16Array) int16 = pcm;
  else if (pcm instanceof ArrayBuffer) int16 = new Int16Array(pcm.slice(0, pcm.byteLength - (pcm.byteLength % 2)));
  else if (ArrayBuffer.isView(pcm)) {
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength - (pcm.byteLength % 2));
    int16 = new Int16Array(bytes.slice().buffer);
  } else if (Array.isArray(pcm)) int16 = Int16Array.from(pcm);
  else if (pcm && Array.isArray(pcm.data)) int16 = Int16Array.from(pcm.data);
  if (!int16 || !int16.length) return null;
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i += 1) out[i] = int16[i] / 32768;
  return out;
}

export function createVoiceLivePlayer() {
  let ctx = null;
  let gain = null;
  let volume = 0.85;
  let muted = false;
  const nextAt = new Map();

  function ensure() {
    if (ctx) return ctx;
    const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return null;
    ctx = new AC();
    gain = ctx.createGain();
    gain.gain.value = muted ? 0 : volume;
    gain.connect(ctx.destination);
    return ctx;
  }

  return {
    /** Call from a user gesture so the browser allows sound. */
    resume() {
      const c = ensure();
      if (c && c.state === "suspended") return c.resume().catch(() => {});
      return Promise.resolve();
    },
    get running() {
      return Boolean(ctx && ctx.state === "running");
    },
    push(userId, pcm, sampleRate = 16000) {
      const c = ensure();
      if (!c || c.state === "closed") return false;
      const samples = toFloat32(pcm);
      if (!samples) return false;
      const buffer = c.createBuffer(1, samples.length, sampleRate || 16000);
      buffer.copyToChannel ? buffer.copyToChannel(samples, 0) : buffer.getChannelData(0).set(samples);
      const key = String(userId || "");
      const now = c.currentTime;
      let at = nextAt.get(key) || 0;
      if (at < now || at - now > MAX_LEAD_S) at = now + JITTER_S;
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      src.start(at);
      nextAt.set(key, at + buffer.duration);
      return true;
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (gain) gain.gain.value = muted ? 0 : volume;
    },
    setMuted(m) {
      muted = Boolean(m);
      if (gain) gain.gain.value = muted ? 0 : volume;
    },
    reset() {
      nextAt.clear();
    },
    close() {
      nextAt.clear();
      try {
        ctx?.close();
      } catch {
        /* ignore */
      }
      ctx = null;
      gain = null;
    },
  };
}
