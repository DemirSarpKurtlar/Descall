/** Pure voice-activity math. The audio graph lives in voiceActivity.js. */

/** ~25 fps. Analyser reads stay in this window so a call tile is not a 60 fps loop. */
export const VOICE_SAMPLE_MS = 40;

export function rmsFromTimeDomain(data) {
  const n = data?.length || 0;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

/** 0–1 envelope used by the speaking ring. */
export function smoothLevel(prev, target) {
  const t = Math.max(0, Math.min(1, Number(target) || 0));
  return (Number(prev) || 0) * 0.82 + t * 0.18;
}

/**
 * Live mic/remote track the analyser is allowed to read.
 * A disabled track is a user mute (stay silent). A muted-but-enabled track is
 * WebKit holding capture until the audio session is up — the caller waits.
 */
export function classifyAudioTracks(tracks) {
  const list = (Array.isArray(tracks) ? tracks : []).filter(
    (t) => t && t.kind !== "video" && t.readyState === "live"
  );
  const enabled = list.filter((t) => t.enabled !== false);
  return {
    audible: enabled.find((t) => !t.muted) || null,
    waiting: enabled.find((t) => t.muted) || null,
  };
}

/**
 * Hysteresis gate. Needs attackMs above the on-threshold to open and
 * releaseMs below the off-threshold to close, so a single sample cannot flap.
 */
export function createSpeakingGate({
  onThreshold = 0.02,
  offThreshold,
  attackMs = 90,
  releaseMs = 220,
} = {}) {
  const onT = onThreshold;
  const offT = typeof offThreshold === "number" ? offThreshold : Math.max(0.008, onT * 0.55);
  let speaking = false;
  let aboveSince = 0;
  let belowSince = 0;
  let smoothed = 0;

  return {
    reset() {
      speaking = false;
      aboveSince = 0;
      belowSince = 0;
      smoothed = 0;
    },
    push(rms, now) {
      smoothed = smoothed * 0.72 + (Number(rms) || 0) * 0.28;
      if (!speaking) {
        if (smoothed > onT) {
          if (!aboveSince) aboveSince = now;
          if (now - aboveSince >= attackMs) {
            speaking = true;
            belowSince = 0;
          }
        } else {
          aboveSince = 0;
        }
      } else if (smoothed < offT) {
        if (!belowSince) belowSince = now;
        if (now - belowSince >= releaseMs) {
          speaking = false;
          aboveSince = 0;
        }
      } else {
        belowSince = 0;
      }
      return speaking;
    },
  };
}
