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

/**
 * 3.7.28: silence is judged relative to the raw mic, not with fixed levels.
 * The old rule (raw ≥ 0.002 and processed ≤ 0.0002) fired on quiet rooms
 * whose steady background (≈ -54 dBFS) the suppressor rightly removed, then
 * sent the raw, un-suppressed mic: hiss / "cızırtı".
 *
 * "Speech-like" raw: ≥ 6 dB over its own slow noise floor (or loud, ≥ -40 dBFS),
 * and above an absolute floor (-70 dBFS). "Swallowed": processed output more
 * than 40 dB below raw. 3 s of speech-like + swallowed ticks → fallback.
 */
export const RAW_ABS_MIN = 0.0003;
export const RAW_LOUD = 0.01;
export const SPEECH_OVER_FLOOR = 2; // 6 dB
export const OUT_BELOW_RAW = 0.01; // 40 dB
/** Kept for older callers: rough -54 / -74 dBFS reference points. */
export const RAW_SIGNAL_MIN = 0.002;
export const OUT_SILENT_MAX = 0.0002;
export const SILENCE_WINDOW_MS = 3000;
export const SUSPENDED_MS = 1500;
export const TICK_MS = 250;
/**
 * Render clock behind the wall clock by more than this (accumulated since the
 * last anchor) = one underrun. Accumulated, so the render callback's own
 * chunking jitter (10-40 ms) never adds up, a graph that keeps missing
 * quanta does. The first WARMUP_MS (worklet compile, device start) are skipped.
 */
export const UNDERRUN_LAG_S = 0.05;
export const WARMUP_MS = 2000;
/** This many underruns within OVERLOAD_WINDOW_MS → the engine cannot keep up. */
export const OVERLOAD_UNDERRUNS = 4;
export const OVERLOAD_WINDOW_MS = 10000;

/**
 * Suppressor order for this device. Firefox runs GTCRN far slower than
 * Chromium, so it starts at RNNoise; a device that measured overload before
 * starts at its saved cap ("rnnoise" or "dsp" = no neural stage).
 */
export function pickSuppressorOrder({ firefox = false, cap = null } = {}) {
  if (cap === "dsp") return { engines: [], reason: "overload-cap" };
  if (cap === "rnnoise") return { engines: ["rnnoise", "speex"], reason: "overload-cap" };
  if (firefox) return { engines: ["rnnoise", "speex"], reason: "firefox" };
  return { engines: ["gtcrn", "rnnoise", "speex"], reason: "default" };
}

/**
 * Watches one processed-mic session. Calls `onFallback(reason)` once, when
 *   - the context is not "running" for SUSPENDED_MS and resume() did not help
 *     ("context-suspended"), or
 *   - speech-like raw signal is swallowed (processed > 40 dB below raw) for
 *     SILENCE_WINDOW_MS in total within that run ("processed-silent").
 * Muted (track disabled) time never counts.
 * With `readClock` (AudioContext.currentTime, seconds) it also counts render
 * underruns (the audio clock falling behind the wall clock: the graph, e.g. a
 * neural worklet, cannot keep up) → `onUnderrun(total)`, and once
 * OVERLOAD_UNDERRUNS land within OVERLOAD_WINDOW_MS → `onOverload(total)`.
 */
export function createSilenceWatchdog({
  readRaw,
  readOut,
  isEnabled = () => true,
  getCtxState = () => "running",
  tryResume = () => {},
  onFallback = () => {},
  readClock = null,
  onUnderrun = () => {},
  onOverload = () => {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
  windowMs = SILENCE_WINDOW_MS,
  suspendedMs = SUSPENDED_MS,
  tickMs = TICK_MS,
  rawAbsMin = RAW_ABS_MIN,
  rawLoud = RAW_LOUD,
  speechOverFloor = SPEECH_OVER_FLOOR,
  outBelowRaw = OUT_BELOW_RAW,
} = {}) {
  let silentMs = 0;
  let lastTick = null;
  let suspendedSince = null;
  let fired = false;
  let timer = null;
  let floor = null;
  let underruns = 0;
  let recentUnderruns = [];
  let clockRef = null; // { wall, audio }
  let runningSince = null;
  let last = { raw: 0, out: 0, state: "running", floor: 0, underruns: 0 };

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

  function checkClock(t) {
    if (!readClock) return;
    const audio = Number(readClock());
    if (!Number.isFinite(audio)) return;
    if (runningSince == null) runningSince = t;
    if (t - runningSince < WARMUP_MS) return;
    if (!clockRef) {
      clockRef = { wall: t, audio };
      return;
    }
    const lag = (t - clockRef.wall) / 1000 - (audio - clockRef.audio);
    if (lag > UNDERRUN_LAG_S) {
      underruns += 1;
      recentUnderruns.push(t);
      try { onUnderrun(underruns); } catch { /* ignore */ }
      // Re-anchor: count each stall once.
      clockRef = { wall: t, audio };
      recentUnderruns = recentUnderruns.filter((x) => t - x <= OVERLOAD_WINDOW_MS);
      if (recentUnderruns.length >= OVERLOAD_UNDERRUNS) {
        recentUnderruns = [];
        try { onOverload(underruns); } catch { /* ignore */ }
      }
    } else if (lag < 0) {
      // Clock ahead (a chunk landed early): re-anchor, never count it.
      clockRef = { wall: t, audio };
    }
  }

  function step() {
    if (fired) return null;
    const t = now();
    const dt = lastTick == null ? tickMs : Math.min(t - lastTick, tickMs * 4);
    lastTick = t;
    const state = getCtxState();
    last.state = state;
    if (state === "closed") {
      stop();
      return null;
    }
    if (state !== "running") {
      clockRef = null;
      runningSince = null;
      if (suspendedSince == null) {
        suspendedSince = t;
        tryResume();
      }
      if (t - suspendedSince >= suspendedMs) fire("context-suspended");
      return last;
    }
    suspendedSince = null;
    checkClock(t);
    if (!isEnabled()) {
      silentMs = 0;
      return last;
    }
    const raw = Number(readRaw()) || 0;
    const out = Number(readOut()) || 0;
    // Slow noise floor: falls at once, rises ~2 % per tick.
    if (floor == null || raw < floor) floor = raw;
    else floor += (raw - floor) * 0.02;
    const speechLike = raw >= rawAbsMin && (raw >= rawLoud || raw >= floor * speechOverFloor);
    const swallowed = out < raw * outBelowRaw;
    last = { raw, out, state, floor, underruns };
    if (speechLike && swallowed) {
      silentMs += dt;
      if (silentMs >= windowMs) fire("processed-silent");
    } else if (speechLike && !swallowed) {
      silentMs = 0;
    }
    // Not speech-like (quiet room, steady noise): keep the count as it is.
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

  return { start, stop, step, get fired() { return fired; }, get underruns() { return underruns; }, last: () => ({ ...last }) };
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
