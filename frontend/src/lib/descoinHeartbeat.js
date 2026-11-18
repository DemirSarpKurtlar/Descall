/**
 * Client helper: emit descoin:heartbeat while in an active call and speaking
 * (or screensharing). Server validates against its own call state.
 */

import { markCallContextSeen } from "./callCoinPrefs.js";

const INTERVAL_MS = 16_000;
/** The mic level is sampled this often between beats (was: one frame at the beat). */
export const SAMPLE_MS = 250;
/** Share of voiced samples in a beat window that counts as "speaking". */
export const SPEAKING_RATIO = 0.12;
const LEVEL_THRESHOLD = 12;

/**
 * Pure: did this window hold enough speech? Speech has pauses between words and
 * sentences, so one frame at the beat missed real talkers about half the time, and
 * push-to-talk users almost always (server-voice-10).
 */
export function windowSpeaking(voiced, total, ratio = SPEAKING_RATIO) {
  if (!(total > 0)) return false;
  return voiced / total >= ratio;
}

function createSpeakingDetector(stream) {
  if (!stream || typeof AudioContext === "undefined") {
    return { level: () => 0, stop: () => {} };
  }
  try {
    const ctx = new AudioContext();
    // Created from a timer, not a click: autoplay rules can leave it suspended, and a
    // suspended analyser reads zeros forever.
    if (ctx.state === "suspended") ctx.resume?.().catch?.(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let stopped = false;
    return {
      level: () => {
        if (stopped) return 0;
        if (ctx.state === "suspended") ctx.resume?.().catch?.(() => {});
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        return sum / data.length;
      },
      stop: () => {
        stopped = true;
        try {
          source.disconnect();
          analyser.disconnect();
          ctx.close();
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return { level: () => 0, stop: () => {} };
  }
}

/**
 * @param {object} opts
 * @param {() => any} opts.getSocket
 * @param {() => MediaStream|null} opts.getLocalStream
 * @param {() => boolean} opts.isActive
 * @param {() => boolean} opts.isScreenSharing
 * @param {() => ({ context: 'dm'|'group'|'server', peerId?: string, groupId?: string, channelId?: string })} opts.getContext
 */
export function startDesCoinHeartbeat({
  getSocket,
  getLocalStream,
  isActive,
  isScreenSharing,
  getContext,
}) {
  let detector = null;
  let lastStream = null;
  let voiced = 0;
  let samples = 0;

  // Sample the mic through the whole beat window. A null stream (muted, or push-to-talk
  // released) counts as silence but keeps the detector, so PTT presses inside the window
  // still count.
  const sample = () => {
    if (!isActive?.()) return;
    const stream = getLocalStream?.() || null;
    if (stream && stream !== lastStream) {
      detector?.stop?.();
      detector = createSpeakingDetector(stream);
      lastStream = stream;
    }
    samples += 1;
    if (stream && detector && detector.level() > LEVEL_THRESHOLD) voiced += 1;
  };

  const tick = () => {
    if (!isActive?.()) return;
    const socket = getSocket?.();
    const speaking = windowSpeaking(voiced, samples);
    voiced = 0;
    samples = 0;
    if (!socket?.connected) return;
    const ctx = getContext?.() || {};
    if (!ctx.context) return;
    // This device is in the call: its end-of-call DesCoin summary may show here.
    markCallContextSeen(ctx);

    const screensharing = Boolean(isScreenSharing?.());

    if (speaking) {
      socket.emit("descoin:heartbeat", {
        ...ctx,
        type: "voice",
        speaking: true,
      });
    }
    if (screensharing) {
      socket.emit("descoin:heartbeat", {
        ...ctx,
        type: "screenshare",
        speaking: false,
      });
    }
  };

  const sampler = setInterval(sample, SAMPLE_MS);
  const id = setInterval(tick, INTERVAL_MS);
  // First tick shortly after join so users see earn feedback quickly.
  const boot = setTimeout(tick, 2_500);

  return () => {
    try {
      const ctx = getContext?.();
      if (ctx?.context) markCallContextSeen(ctx);
    } catch {
      /* ignore */
    }
    clearInterval(id);
    clearInterval(sampler);
    clearTimeout(boot);
    detector?.stop?.();
    detector = null;
    lastStream = null;
  };
}
