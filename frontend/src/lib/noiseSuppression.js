/**
 * Advanced mic noise suppression for Descall voice (group DM + server voice).
 *
 * Pipeline (best → fallback):
 *   1) GTCRN neural suppressor
 *   2) RNNoise (SIMD WASM when available)
 *   3) Speex preprocess
 *   4) DSP high-pass + soft gate + compressor
 *
 * Browser echoCancellation + autoGainControl stay on; browser noiseSuppression
 * is disabled when a neural/Speex stage is active to avoid muddy double-NS.
 */

import {
  GtcrnWorkletNode,
  NoiseGateWorkletNode,
  RnnoiseWorkletNode,
  SpeexWorkletNode,
  loadGtcrn,
  loadRnnoise,
  loadSpeex,
} from "@sapphi-red/web-noise-suppressor";
import gtcrnWasmPath from "@sapphi-red/web-noise-suppressor/gtcrn.wasm?url";
import gtcrnWorkletPath from "@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import speexWasmPath from "@sapphi-red/web-noise-suppressor/speex.wasm?url";
import speexWorkletPath from "@sapphi-red/web-noise-suppressor/speexWorklet.js?url";
import noiseGateWorkletPath from "@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url";
import { primeVoiceActivity } from "./voiceActivity";
import {
  agcCompressorSettings,
  applyStoredMute,
  captureConstraints,
  claimVoiceAudioSession,
  gateSettings,
  readVoiceProfile,
  writeVoiceProfile,
} from "./voiceProfile.js";

/**
 * Native iOS app (Capacitor WKWebView): send the raw microphone track.
 * The WebAudio pipeline's output track comes from an AudioContext, which iOS
 * suspends/interrupts when the call audio session changes (CallKit
 * activation, route changes), the call then "connects" but sends silence.
 * iOS' own voice processing (echo cancellation + noise suppression) is on.
 * Global check so this module doesn't pull in @capacitor/core.
 */
function isNativeIosApp() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}
const ENGINE_KEY = "descall:noiseSuppressionEngine";

/** @type {AudioContext | null} */
let sharedCtx = null;
/** Wraps between dispose and the new session: the context must not be closed under them. */
let wrapsInFlight = 0;
/** @type {null | { rawStream: MediaStream, processedStream: MediaStream, nodes: any[], engine: string }} */
let activeSession = null;

export function isNoiseSuppressionEnabled() {
  if (isNativeIosApp()) return false;
  return readVoiceProfile().noiseMode !== "off";
}

export function setNoiseSuppressionEnabled(enabled) {
  return setNoiseMode(enabled ? "on" : "off") !== "off";
}

export function setNoiseMode(mode) {
  const next = writeVoiceProfile({ noiseMode: mode });
  window.dispatchEvent(
    new CustomEvent("descall:noise-suppression-changed", { detail: { enabled: next.noiseMode !== "off", mode: next.noiseMode } })
  );
  return next.noiseMode;
}

export function getNoiseSuppressionEngine() {
  return activeSession?.engine || localStorage.getItem(ENGINE_KEY) || "off";
}

export function getVoiceAudioConstraints({ deviceId } = {}) {
  return { audio: captureConstraints(readVoiceProfile(), deviceId), video: false };
}

// 3.7.15: the WASM binaries do not depend on an AudioContext, so they are loaded
// once and kept; the worklet modules belong to one context and are added again
// when a new context is created (the context is closed between voice sessions).
let wasmPromise = null;
let workletCtx = null;
let workletPromise = null;

function ensureWasm() {
  if (!wasmPromise) {
    wasmPromise = Promise.all([
      loadGtcrn({ url: gtcrnWasmPath }).catch(() => null),
      loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseSimdWasmPath }).catch(() => null),
      loadSpeex({ url: speexWasmPath }).catch(() => null),
    ]).then(([gtcrnWasm, rnnoiseWasm, speexWasm]) => ({ gtcrnWasm, rnnoiseWasm, speexWasm }))
      .catch((err) => {
        wasmPromise = null;
        throw err;
      });
  }
  return wasmPromise;
}

async function ensureAssets(ctx) {
  if (workletCtx !== ctx || !workletPromise) {
    workletCtx = ctx;
    workletPromise = Promise.allSettled([
      ctx.audioWorklet.addModule(gtcrnWorkletPath),
      ctx.audioWorklet.addModule(rnnoiseWorkletPath),
      ctx.audioWorklet.addModule(speexWorkletPath),
      ctx.audioWorklet.addModule(noiseGateWorkletPath),
    ]);
  }
  const [wasm] = await Promise.all([ensureWasm(), workletPromise]);
  return wasm;
}

async function ensureContext() {
  if (sharedCtx && sharedCtx.state !== "closed") {
    if (sharedCtx.state === "suspended") {
      try {
        await sharedCtx.resume();
      } catch {
        /* ignore */
      }
    }
    return sharedCtx;
  }
  sharedCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 48000,
    latencyHint: "interactive",
  });
  if (sharedCtx.state === "suspended") {
    try {
      await sharedCtx.resume();
    } catch {
      /* ignore */
    }
  }
  return sharedCtx;
}

function buildDspFallback(ctx, { agc }) {
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 80;
  highpass.Q.value = 0.7;

  let compressor = null;
  if (agc) {
    const settings = agcCompressorSettings();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = settings.threshold;
    compressor.knee.value = settings.knee;
    compressor.ratio.value = settings.ratio;
    compressor.attack.value = settings.attack;
    compressor.release.value = settings.release;
  }

  return { highpass, compressor, engine: "dsp" };
}

/**
 * Wrap a raw mic MediaStream with the best available suppressor.
 * Returns a new MediaStream whose audio track is processed. Keeps raw tracks alive.
 */
export async function wrapStreamWithNoiseSuppression(rawStream) {
  if (!rawStream?.getAudioTracks?.().length) return rawStream;
  if (!isNoiseSuppressionEnabled()) return rawStream;
  if (typeof AudioWorkletNode === "undefined") return rawStream;

  wrapsInFlight += 1;
  try {
    return await wrapInto(rawStream);
  } finally {
    wrapsInFlight -= 1;
  }
}

async function wrapInto(rawStream) {
  disposeNoiseSuppressionSession({ stopRaw: false, keepContext: true });

  const ctx = await ensureContext();
  const assets = await ensureAssets(ctx).catch((err) => {
    console.warn("[NoiseSuppression] Asset load failed, using DSP fallback:", err?.message || err);
    return { gtcrnWasm: null, rnnoiseWasm: null, speexWasm: null };
  });

  const prefs = readVoiceProfile();
  const source = ctx.createMediaStreamSource(rawStream);
  const destination = ctx.createMediaStreamDestination();
  const { highpass, compressor } = buildDspFallback(ctx, { agc: prefs.autoGainControl !== false });

  /** @type {AudioNode | null} */
  let suppressor = null;
  let engine = "dsp";

  // Prefer GTCRN (newer neural model) → RNNoise → Speex
  if (assets.gtcrnWasm) {
    try {
      suppressor = new GtcrnWorkletNode(ctx, { wasmBinary: assets.gtcrnWasm, maxChannels: 1 });
      engine = "gtcrn";
    } catch (err) {
      console.warn("[NoiseSuppression] GTCRN init failed:", err?.message || err);
    }
  }
  if (!suppressor && assets.rnnoiseWasm) {
    try {
      suppressor = new RnnoiseWorkletNode(ctx, { wasmBinary: assets.rnnoiseWasm, maxChannels: 1 });
      engine = "rnnoise";
    } catch (err) {
      console.warn("[NoiseSuppression] RNNoise init failed:", err?.message || err);
    }
  }
  if (!suppressor && assets.speexWasm) {
    try {
      suppressor = new SpeexWorkletNode(ctx, { wasmBinary: assets.speexWasm, maxChannels: 1 });
      engine = "speex";
    } catch (err) {
      console.warn("[NoiseSuppression] Speex init failed:", err?.message || err);
    }
  }

  let gate = null;
  try {
    gate = new NoiseGateWorkletNode(ctx, {
      ...gateSettings(prefs.noiseMode),
      maxChannels: 1,
    });
  } catch {
    gate = null;
  }

  // mic → highpass → neural/speex → mild gate → compressor → destination
  source.connect(highpass);
  let node = highpass;
  if (suppressor) {
    node.connect(suppressor);
    node = suppressor;
  }
  if (gate) {
    node.connect(gate);
    node = gate;
  }
  if (compressor) {
    node.connect(compressor);
    node = compressor;
  }
  node.connect(destination);

  const processedStream = destination.stream;
  // Preserve mute/enable state from raw track
  const rawTrack = rawStream.getAudioTracks()[0];
  const outTrack = processedStream.getAudioTracks()[0];
  if (rawTrack && outTrack) {
    outTrack.enabled = rawTrack.enabled;
    try {
      outTrack.contentHint = "speech";
    } catch {
      /* ignore */
    }
  }

  // Keep video tracks (if any) on the outgoing stream for video calls
  const out = new MediaStream([
    ...processedStream.getAudioTracks(),
    ...rawStream.getVideoTracks(),
  ]);

  activeSession = {
    rawStream,
    processedStream: out,
    nodes: [source, highpass, suppressor, gate, compressor, destination].filter(Boolean),
    engine,
  };

  try {
    localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    /* ignore */
  }

  console.info(`[NoiseSuppression] Active engine: ${engine}`);
  return out;
}

/**
 * Capture mic with optimized constraints and apply suppression when enabled.
 */
export async function acquireVoiceMicStream(extraConstraints = {}) {
  // Same turn as the tap, before getUserMedia yields. iOS will not resume
  // an AudioContext created later from the speaking-ring effect.
  claimVoiceAudioSession();
  primeVoiceActivity();
  const base = getVoiceAudioConstraints({
    deviceId: extraConstraints?.audio?.deviceId?.exact || extraConstraints?.deviceId,
  });
  const constraints = {
    ...base,
    ...extraConstraints,
    audio:
      typeof extraConstraints.audio === "object"
        ? { ...base.audio, ...extraConstraints.audio }
        : base.audio,
    video: extraConstraints.video ?? false,
  };

  const raw = await navigator.mediaDevices.getUserMedia(constraints);
  // Capture can suspend the context (CallKit / route change). Try again now
  // that the mic exists; didActivate retries if this one is ignored.
  primeVoiceActivity();
  try {
    raw.getAudioTracks().forEach((t) => {
      try {
        t.contentHint = "speech";
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }

  let stream = raw;
  if (isNoiseSuppressionEnabled()) {
    try {
      stream = await wrapStreamWithNoiseSuppression(raw);
    } catch (err) {
      console.warn("[NoiseSuppression] Wrap failed, using raw mic:", err?.message || err);
    }
  }
  if (extraConstraints.applyStoredMute !== false) applyStoredMute(stream);
  return stream;
}

/** Raw capture track behind the processed (noise-suppressed) one, if any. */
export function getNoiseSuppressionRawTrack() {
  return activeSession?.rawStream?.getAudioTracks?.()?.[0] || null;
}

export function disposeNoiseSuppressionSession({ stopRaw = true, keepContext = false } = {}) {
  if (!activeSession) return;
  const { rawStream, nodes } = activeSession;
  for (const node of nodes) {
    try {
      node.disconnect?.();
    } catch {
      /* ignore */
    }
    try {
      node.destroy?.();
    } catch {
      /* ignore */
    }
  }
  if (stopRaw && rawStream) {
    try {
      rawStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
  }
  activeSession = null;
  if (!keepContext) suspendIdleContext();
}

/** Sync mute flag onto both processed + raw tracks. */
export function setNoiseSuppressedTrackEnabled(enabled) {
  const on = Boolean(enabled);
  if (activeSession?.processedStream) {
    activeSession.processedStream.getAudioTracks().forEach((t) => {
      t.enabled = on;
    });
  }
  if (activeSession?.rawStream) {
    activeSession.rawStream.getAudioTracks().forEach((t) => {
      t.enabled = on;
    });
  }
}

/**
 * Warm the noise-suppression files so a voice join is quick, WITHOUT creating an
 * AudioContext (3.7.15 idle CPU / RAM): a live context keeps Chromium's audio
 * render thread and the whole Audio Service process (~70 MB) up all session,
 * even with no call. WASM is loaded into memory; worklet scripts go into the
 * HTTP cache. The context is created on the first voice session.
 */
export function preloadNoiseSuppression() {
  if (!isNoiseSuppressionEnabled()) return;
  ensureWasm().catch(() => {});
  if (typeof fetch === "function") {
    for (const url of [gtcrnWorkletPath, rnnoiseWorkletPath, speexWorkletPath, noiseGateWorkletPath]) {
      fetch(url).catch(() => {});
    }
  }
}

/**
 * Close the shared context when no voice session uses it, so the Audio Service
 * process can go away between calls (a suspended context still keeps it).
 */
export function suspendIdleContext() {
  if (activeSession || wrapsInFlight > 0 || !sharedCtx || sharedCtx.state === "closed") return;
  const ctx = sharedCtx;
  sharedCtx = null;
  workletCtx = null;
  workletPromise = null;
  try {
    const p = ctx.close();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* ignore */
  }
}
