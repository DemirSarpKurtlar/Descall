/**
 * Mic failsafe (3.7.27): the noise-suppressed track must never be sent silent.
 *
 * "Ses gitmiyor" (web, also with the mic permission granted): the processed
 * track comes out of an AudioContext. When that context stays "suspended"
 * (created outside the user gesture, resume() rejected, an audio-device or
 * OS interruption) or a stage of the chain swallows everything (a noise gate
 * too strict for a quiet mic), the track stays live / enabled / unmuted but
 * carries zero samples, and the other side hears nothing.
 *
 * Pure parts (timers and readers injected) so micFailsafe.selftest.mjs can
 * drive them:
 *   - createSilenceWatchdog: decides when to give up on the processed track;
 *   - swapToRawTrack: puts the raw mic track on the outgoing stream and on
 *     every RTCRtpSender that was sending the processed one.
 */

/** RMS of a Float32 time-domain buffer. */
export function rms(buf) {
  if (!buf || !buf.length) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/** Raw mic louder than this counts as "the user is making sound" (≈ -54 dBFS). */
export const RAW_SIGNAL_MIN = 0.002;
/** Processed output quieter than this counts as silent (≈ -74 dBFS). */
export const OUT_SILENT_MAX = 0.0002;
export const SILENCE_WINDOW_MS = 3000;
export const SUSPENDED_MS = 1500;
export const TICK_MS = 250;

/**
 * Watches one processed-mic session. Calls `onFallback(reason)` once, when
 *   - the context is not "running" for SUSPENDED_MS and resume() did not help
 *     ("context-suspended"), or
 *   - the raw mic has signal while the processed output is ~0 for
 *     SILENCE_WINDOW_MS in total within that run ("processed-silent").
 * Muted (track disabled) time never counts.
 */
export function createSilenceWatchdog({
  readRaw,
  readOut,
  isEnabled = () => true,
  getCtxState = () => "running",
  tryResume = () => {},
  onFallback = () => {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
  windowMs = SILENCE_WINDOW_MS,
  suspendedMs = SUSPENDED_MS,
  tickMs = TICK_MS,
  rawMin = RAW_SIGNAL_MIN,
  outMax = OUT_SILENT_MAX,
} = {}) {
  let silentSince = null;
  let suspendedSince = null;
  let fired = false;
  let timer = null;
  let last = { raw: 0, out: 0, state: "running" };

  function fire(reason) {
    if (fired) return;
    fired = true;
    stop();
    try {
      onFallback(reason);
    } catch {
      /* the caller logs */
    }
  }

  function step() {
    if (fired) return null;
    const t = now();
    const state = getCtxState();
    last.state = state;
    if (state === "closed") {
      stop();
      return null;
    }
    if (state !== "running") {
      silentSince = null;
      if (suspendedSince == null) {
        suspendedSince = t;
        tryResume();
      }
      if (t - suspendedSince >= suspendedMs) fire("context-suspended");
      return last;
    }
    suspendedSince = null;
    if (!isEnabled()) {
      silentSince = null;
      return last;
    }
    const raw = Number(readRaw()) || 0;
    const out = Number(readOut()) || 0;
    last = { raw, out, state };
    if (raw >= rawMin && out <= outMax) {
      if (silentSince == null) silentSince = t;
      if (t - silentSince >= windowMs) fire("processed-silent");
    } else if (out > outMax) {
      silentSince = null;
    }
    // raw quiet + out quiet: nobody is talking, keep the window as it is.
    return last;
  }

  function start() {
    if (timer != null || fired) return;
    timer = setTimer(step, tickMs);
  }

  function stop() {
    if (timer != null) clearTimer(timer);
    timer = null;
  }

  return { start, stop, step, get fired() { return fired; }, last: () => ({ ...last }) };
}

/**
 * Put `rawTrack` where `processedTrack` was: on `stream` (the MediaStream the
 * call hooks hold as their local stream) and on every sender of `peers`.
 * Keeps the mute state (enabled) of the processed track.
 * Returns the number of senders switched.
 */
export async function swapToRawTrack({ stream, processedTrack, rawTrack, peers = [] }) {
  if (!rawTrack || !processedTrack || rawTrack === processedTrack) return 0;
  rawTrack.enabled = processedTrack.enabled;
  try {
    if (stream && stream.getAudioTracks().includes(processedTrack)) {
      stream.removeTrack(processedTrack);
      if (!stream.getAudioTracks().includes(rawTrack)) stream.addTrack(rawTrack);
    }
  } catch {
    /* the senders below are what the peer hears */
  }
  let switched = 0;
  for (const pc of peers) {
    if (!pc || pc.signalingState === "closed" || pc.connectionState === "closed") continue;
    let senders = [];
    try {
      senders = pc.getSenders();
    } catch {
      continue;
    }
    for (const sender of senders) {
      if (sender?.track !== processedTrack) continue;
      try {
        await sender.replaceTrack(rawTrack);
        switched += 1;
      } catch {
        /* sender gone with its pc */
      }
    }
  }
  return switched;
}
