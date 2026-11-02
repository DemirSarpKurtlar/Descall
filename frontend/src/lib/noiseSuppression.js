/**
 * Advanced mic noise suppression for Descall voice (group DM + server voice).
 *
 * Pipeline (best → fallback; Firefox and devices that measured overload start
 * lower, see pickSuppressorOrder in micFailsafe.js):
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
import { getLivePeerConnections } from "./iceConfig.js";
import { createSilenceWatchdog, pickSuppressorOrder, rms, swapToRawTrack } from "./micFailsafe.js";
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
/** 3.7.28: lightest engine that kept up on this device ("rnnoise" | "dsp"), set after measured overload. */
const ENGINE_CAP_KEY = "descall:noiseSuppressionEngineCap";

/**
 * Firefox runs the GTCRN worklet ~8-12x slower than Chromium (offline render
 * bench, e2e/voice-crackle/bench.mjs) and on weaker machines it cannot keep up
 * with the render quantum: clicks / "cızırtı". Firefox starts at RNNoise.
 */
export function isFirefoxBrowser(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  return /\bFirefox\/\d+/.test(String(ua || ""));
}

function readEngineCap() {
  try {
    return localStorage.getItem(ENGINE_CAP_KEY) || null;
  } catch {
    return null;
  }
}

function writeEngineCap(cap) {
  try {
    localStorage.setItem(ENGINE_CAP_KEY, cap);
  } catch {
    /* ignore */
  }
}

/** @type {AudioContext | null} */
let sharedCtx = null;
/** Wraps between dispose and the new session: the context must not be closed under them. */
let wrapsInFlight = 0;
/** @type {null | { rawStream: MediaStream, processedStream: MediaStream, processedTrack: MediaStreamTrack | null, nodes: any[], engine: string, watchdog?: any, onState?: any, ctx?: AudioContext, readRaw?: () => number, readOut?: () => number, fallback?: string | null }} */
let activeSession = null;
/** Why the last session sends the raw mic ("context-suspended", "processed-silent", …), for diagnostics. */
let lastFallbackReason = null;
export const MIC_FALLBACK_EVENT = "descall:mic-fallback";

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
  // Browser noise suppression stays on whenever our pipeline does not run
  // (native iOS, no AudioWorklet): never send a raw capture without any NS.
  const pipeline = isNoiseSuppressionEnabled() && typeof AudioWorkletNode !== "undefined";
  return { audio: captureConstraints(readVoiceProfile(), deviceId, { pipeline }), video: false };
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

function createContext() {
  const Ctor = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!Ctor) return null;
  try {
    // 3.7.28: Firefox resamples every 44.1 kHz device into a forced 48 kHz
    // context (extra cost, artifacts): use the device rate there.
    return isFirefoxBrowser()
      ? new Ctor({ latencyHint: "interactive" })
      : new Ctor({ sampleRate: 48000, latencyHint: "interactive" });
  } catch {
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
}

/**
 * 3.7.27: create / resume the shared context SYNCHRONOUSLY, in the same turn as
 * the call / answer tap. Before this the context was created after `await
 * getUserMedia`, outside the user gesture; Chrome / Safari then kept it
 * "suspended" (resume() rejected or never settled, and the error was
 * swallowed), so a live, enabled, unmuted but SILENT track was sent: "ses
 * gitmiyor, izin verilmiş olsa bile".
 */
export function primeNoiseSuppressionContext() {
  if (!isNoiseSuppressionEnabled()) return null;
  if (typeof AudioWorkletNode === "undefined") return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = createContext();
    workletCtx = null;
    workletPromise = null;
  }
  if (sharedCtx && sharedCtx.state !== "running") {
    try {
      const p = sharedCtx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* checked again after wrapping */
    }
  }
  return sharedCtx;
}

/** Resolve true once `ctx` runs, false after `timeoutMs` (resume rejected / ignored). */
export async function resumeContext(ctx, timeoutMs = 600) {
  if (!ctx) return false;
  if (ctx.state === "running") return true;
  if (ctx.state === "closed") return false;
  let timer = null;
  try {
    await Promise.race([
      Promise.resolve().then(() => ctx.resume()).catch(() => {}),
      new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return ctx.state === "running";
}

async function ensureContext() {
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = createContext();
    workletCtx = null;
    workletPromise = null;
  }
  if (!sharedCtx) throw new Error("AudioContext unavailable");
  await resumeContext(sharedCtx);
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

const SUPPRESSORS = {
  gtcrn: (ctx, a) => a.gtcrnWasm && new GtcrnWorkletNode(ctx, { wasmBinary: a.gtcrnWasm, maxChannels: 1 }),
  rnnoise: (ctx, a) => a.rnnoiseWasm && new RnnoiseWorkletNode(ctx, { wasmBinary: a.rnnoiseWasm, maxChannels: 1 }),
  speex: (ctx, a) => a.speexWasm && new SpeexWorkletNode(ctx, { wasmBinary: a.speexWasm, maxChannels: 1 }),
};

/** First engine of `engines` that loads; none → plain DSP chain. */
function createSuppressor(ctx, assets, engines) {
  for (const engine of engines) {
    try {
      const node = SUPPRESSORS[engine]?.(ctx, assets);
      if (node) return { suppressor: node, engine };
    } catch (err) {
      console.warn(`[NoiseSuppression] ${engine} init failed:`, err?.message || err);
    }
  }
  return { suppressor: null, engine: "dsp" };
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

  const order = pickSuppressorOrder({ firefox: isFirefoxBrowser(), cap: readEngineCap() });
  const { suppressor, engine } = createSuppressor(ctx, assets, order.engines);
  const engineReason = order.reason;

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

  // Level meters for the failsafe: raw mic vs what actually leaves the chain.
  const rawMeter = makeMeter(ctx, source);
  const outMeter = makeMeter(ctx, node);

  activeSession = {
    rawStream,
    processedStream: out,
    processedTrack: outTrack || null,
    nodes: [source, highpass, suppressor, gate, compressor, destination, rawMeter?.node, outMeter?.node].filter(Boolean),
    engine,
    engineReason,
    underruns: 0,
    suppressor,
    gateNode: gate,
    chainIn: highpass,
    chainOut: gate || compressor || destination,
    ctx,
    readRaw: rawMeter ? rawMeter.read : () => 0,
    readOut: outMeter ? outMeter.read : () => 0,
    fallback: null,
  };
  lastFallbackReason = null;

  // The tap is over by now. If the context still does not run, the processed
  // track would be silent from the first frame: send the raw mic instead.
  if (!(await resumeContext(ctx, 400))) {
    console.warn(`[NoiseSuppression] AudioContext ${ctx.state}, sending the raw mic`);
    lastFallbackReason = "context-not-running";
    disposeNoiseSuppressionSession({ stopRaw: false, keepContext: true });
    return rawStream;
  }
  armFailsafe(activeSession);

  try {
    localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    /* ignore */
  }

  console.info(`[NoiseSuppression] Active engine: ${engine}`);
  return out;
}

function makeMeter(ctx, from) {
  try {
    const node = ctx.createAnalyser();
    node.fftSize = 1024;
    from.connect(node);
    const buf = new Float32Array(node.fftSize);
    return {
      node,
      read: () => {
        node.getFloatTimeDomainData(buf);
        return rms(buf);
      },
    };
  } catch {
    return null;
  }
}

/**
 * statechange (suspended / interrupted mid-call: device change, OS audio
 * interruption, sleep) → resume; if the context does not come back, or the
 * processed output stays silent while the raw mic has signal, switch every
 * sender to the raw mic (watchdog in micFailsafe.js).
 */
function armFailsafe(session) {
  const { ctx } = session;
  const watchdog = createSilenceWatchdog({
    readRaw: session.readRaw,
    readOut: session.readOut,
    isEnabled: () => Boolean(session.processedTrack?.enabled),
    getCtxState: () => ctx.state,
    tryResume: () => { void resumeContext(ctx, 800); },
    onFallback: (reason) => { void fallbackToRawMic(reason); },
    readClock: () => ctx.currentTime,
    onUnderrun: (count) => { session.underruns = count; },
    onOverload: () => { void downgradeEngine(session); },
  });
  session.watchdog = watchdog;
  session.onState = () => {
    if (activeSession !== session) return;
    if (ctx.state === "running" || ctx.state === "closed") return;
    void resumeContext(ctx, 800).then((ok) => {
      if (!ok && activeSession === session && !session.fallback) void fallbackToRawMic("context-suspended");
    });
  };
  try {
    ctx.addEventListener?.("statechange", session.onState);
  } catch {
    /* the watchdog still sees the state */
  }
  watchdog.start();
}

/**
 * Give up on the processed track: the raw mic goes on the local stream and on
 * every live sender (DM, group and server voice peers), mute state kept.
 */
export async function fallbackToRawMic(reason = "manual") {
  const session = activeSession;
  if (!session || session.fallback) return false;
  const oldRaw = session.rawStream?.getAudioTracks?.()[0];
  const processedTrack = session.processedTrack;
  if (!oldRaw || !processedTrack || oldRaw.readyState === "ended") return false;
  session.fallback = reason;
  lastFallbackReason = reason;
  session.watchdog?.stop();
  // Levels at the moment we gave up (the meters go away with the graph).
  try {
    session.lastRawRms = Number(session.readRaw?.()) || 0;
    session.lastOutRms = Number(session.readOut?.()) || 0;
  } catch {
    /* ignore */
  }
  // 3.7.28: the raw capture was opened with browser noise suppression OFF (our
  // pipeline did it): sent as is it hisses. Re-open it with the browser's own
  // NS / echo cancellation / AGC; keep the old one if that fails.
  const rawTrack = await reacquireProcessedRawTrack(oldRaw);
  const switched = await swapToRawTrack({
    stream: session.processedStream,
    processedTrack,
    rawTrack,
    peers: getLivePeerConnections(),
  });
  if (activeSession !== session) {
    if (rawTrack !== oldRaw) try { rawTrack.stop(); } catch { /* ignore */ }
    return false;
  }
  if (rawTrack !== oldRaw) {
    session.rawStream = new MediaStream([rawTrack, ...(session.rawStream?.getVideoTracks?.() || [])]);
    try { oldRaw.stop(); } catch { /* ignore */ }
  }
  // The processed graph (and its neural worklet) must not keep burning CPU.
  teardownGraph(session);
  try { processedTrack.stop(); } catch { /* ignore */ }
  session.engine = "raw-fallback";
  console.warn(`[NoiseSuppression] ${reason}: switched ${switched} sender(s) to the raw mic`);
  try {
    window.dispatchEvent(new CustomEvent(MIC_FALLBACK_EVENT, { detail: { reason, switched } }));
  } catch {
    /* ignore */
  }
  return true;
}

/** Same device, browser NS + EC + AGC on. Falls back to applyConstraints, then the old track. */
async function reacquireProcessedRawTrack(oldRaw) {
  const browserNs = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  let deviceId;
  try {
    deviceId = oldRaw.getSettings?.().deviceId;
  } catch {
    deviceId = undefined;
  }
  try {
    const audio = {
      ...captureConstraints(readVoiceProfile(), deviceId, { pipeline: false }),
      ...browserNs,
      googNoiseSuppression: true,
      googEchoCancellation: true,
      googAutoGainControl: true,
    };
    const s = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    const t = s.getAudioTracks()[0];
    if (t) {
      try { t.contentHint = "speech"; } catch { /* ignore */ }
      t.enabled = oldRaw.enabled;
      return t;
    }
  } catch (err) {
    console.warn("[NoiseSuppression] raw re-capture failed:", err?.name || err?.message || err);
  }
  try {
    await oldRaw.applyConstraints?.(browserNs);
  } catch {
    /* the old raw track is still better than silence */
  }
  return oldRaw;
}

function teardownGraph(session) {
  for (const node of session.nodes || []) {
    try { node.disconnect?.(); } catch { /* ignore */ }
    try { node.destroy?.(); } catch { /* ignore */ }
  }
  session.nodes = [];
  session.readRaw = () => 0;
  session.readOut = () => 0;
}

/**
 * Measured overload (render clock falling behind, see micFailsafe.js): step
 * down GTCRN → RNNoise → DSP for this session and remember it on this device.
 */
async function downgradeEngine(session) {
  if (activeSession !== session || session.fallback) return false;
  const next = session.engine === "gtcrn" ? "rnnoise" : session.engine === "dsp" ? null : "dsp";
  if (!next) return false;
  writeEngineCap(next);
  console.warn(`[NoiseSuppression] ${session.engine} cannot keep up (${session.underruns} underruns), switching to ${next}`);
  const assets = await ensureWasm().catch(() => ({}));
  if (activeSession !== session || session.fallback || !session.chainIn || !session.chainOut) return false;
  const { suppressor, engine } = next === "dsp" ? { suppressor: null, engine: "dsp" } : createSuppressor(session.ctx, assets, [next]);
  try {
    if (session.suppressor) {
      session.chainIn.disconnect(session.suppressor);
      session.suppressor.disconnect();
      session.suppressor.destroy?.();
      session.nodes = session.nodes.filter((n) => n !== session.suppressor);
    }
    if (suppressor) {
      session.chainIn.connect(suppressor);
      suppressor.connect(session.chainOut);
      session.nodes.push(suppressor);
    } else {
      session.chainIn.connect(session.chainOut);
    }
  } catch (err) {
    console.warn("[NoiseSuppression] engine switch failed:", err?.message || err);
    return false;
  }
  session.suppressor = suppressor;
  session.engine = engine;
  session.engineReason = "overload";
  try { localStorage.setItem(ENGINE_KEY, engine); } catch { /* ignore */ }
  return true;
}

/** Snapshot for the voice diagnostics (no personal data). */
export function getNoiseSuppressionDiagnostics() {
  const s = activeSession;
  let rawRms = null;
  let outRms = null;
  try {
    if (s?.readRaw && s.ctx?.state === "running") rawRms = Number(s.readRaw().toFixed(5));
    if (s?.readOut && s.ctx?.state === "running" && !s.fallback) outRms = Number(s.readOut().toFixed(5));
    if (s?.fallback) {
      rawRms = s.lastRawRms != null ? Number(s.lastRawRms.toFixed(5)) : null;
      outRms = s.lastOutRms != null ? Number(s.lastOutRms.toFixed(5)) : null;
    }
  } catch {
    /* ignore */
  }
  let captureSampleRate = null;
  try {
    captureSampleRate = s?.rawStream?.getAudioTracks?.()[0]?.getSettings?.().sampleRate ?? null;
  } catch {
    /* ignore */
  }
  return {
    enabled: isNoiseSuppressionEnabled(),
    engine: s?.engine || (lastFallbackReason ? "raw-fallback" : "off"),
    audioContextState: sharedCtx ? sharedCtx.state : "none",
    fallback: s?.fallback || lastFallbackReason || null,
    rawRms,
    processedRms: outRms,
    contextSampleRate: s?.ctx?.sampleRate ?? sharedCtx?.sampleRate ?? null,
    captureSampleRate,
    underruns: s?.underruns ?? null,
    engineReason: s?.engineReason || null,
  };
}

/**
 * Capture mic with optimized constraints and apply suppression when enabled.
 */
export async function acquireVoiceMicStream(extraConstraints = {}) {
  // Same turn as the tap, before getUserMedia yields. iOS will not resume
  // an AudioContext created later from the speaking-ring effect.
  claimVoiceAudioSession();
  primeVoiceActivity();
  primeNoiseSuppressionContext();
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

/** The audio track the session currently sends (raw after a fallback). */
export function getNoiseSuppressionOutputTrack() {
  return activeSession?.processedStream?.getAudioTracks?.()?.[0] || null;
}

/** Raw capture track behind the processed (noise-suppressed) one, if any. */
export function getNoiseSuppressionRawTrack() {
  return activeSession?.rawStream?.getAudioTracks?.()?.[0] || null;
}

export function disposeNoiseSuppressionSession({ stopRaw = true, keepContext = false } = {}) {
  if (!activeSession) return;
  const { rawStream, nodes } = activeSession;
  try {
    activeSession.watchdog?.stop();
    if (activeSession.onState) activeSession.ctx?.removeEventListener?.("statechange", activeSession.onState);
  } catch {
    /* ignore */
  }
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
