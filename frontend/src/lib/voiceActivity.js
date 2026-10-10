/**
 * One AudioContext for every speaking ring (DM, group, server voice).
 *
 * iOS WKWebView leaves a context created after the tap in `suspended`, and
 * CallKit's audio-session activation kills a MediaStreamSource built before
 * that. primeVoiceActivity() resumes inside the user-gesture turn (it is the
 * first line of acquireVoiceMicStream, before getUserMedia awaits).
 * notifyCallAudioSession() drops those sources and resumes again when CallKit
 * reports didActivate.
 *
 * Reads are throttled to VOICE_SAMPLE_MS and skipped while every subscriber
 * is off-screen or the document is hidden. A zero-gain sink is connected only
 * on the native iOS app — Safari will not pull analyser samples unless the
 * graph reaches the destination, and gain 0 keeps the mic out of the speaker.
 */

import {
  VOICE_SAMPLE_MS,
  classifyAudioTracks,
  rmsFromTimeDomain,
} from "./voiceActivityMath";

const subscribers = new Set();
const graphs = new Map();
const streamWatchers = new Map();
const unmuteBound = new WeakSet();

let ctx = null;
let timer = 0;
let unlocked = false;
let gestureInstalled = false;

function isNativeIosApp() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}

function getCtx() {
  const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  if (!ctx || ctx.state === "closed") {
    ctx = new AC();
    ctx.addEventListener("statechange", () => {
      // A source built before the interruption stays silent after resume.
      if (ctx?.state === "running") {
        dropGraphs();
        ensureLoop();
      }
    });
  }
  return ctx;
}

function disconnectGraph(g) {
  try { g.source?.disconnect(); } catch { /* ignore */ }
  try { g.analyser?.disconnect(); } catch { /* ignore */ }
  try { g.sink?.disconnect(); } catch { /* ignore */ }
}

function dropGraphs() {
  for (const g of graphs.values()) disconnectGraph(g);
  graphs.clear();
}

function noteUnmute(track) {
  if (!track || unmuteBound.has(track) || typeof track.addEventListener !== "function") return;
  unmuteBound.add(track);
  track.addEventListener("unmute", () => {
    unmuteBound.delete(track);
    pokeVoiceActivity();
  });
}

function ensureGraph(track) {
  const existing = graphs.get(track.id);
  if (existing && existing.track === track) return existing;
  if (existing) {
    disconnectGraph(existing);
    graphs.delete(track.id);
  }
  const c = getCtx();
  if (!c || c.state !== "running" || track.muted || track.readyState !== "live") {
    if (track.muted) noteUnmute(track);
    return null;
  }
  try {
    const source = c.createMediaStreamSource(new MediaStream([track]));
    const analyser = c.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    let sink = null;
    if (isNativeIosApp()) {
      sink = c.createGain();
      sink.gain.value = 0;
      analyser.connect(sink);
      sink.connect(c.destination);
    }
    const graph = {
      track,
      source,
      analyser,
      sink,
      data: new Uint8Array(analyser.fftSize),
    };
    graphs.set(track.id, graph);
    return graph;
  } catch {
    return null;
  }
}

function readRms(graph) {
  graph.analyser.getByteTimeDomainData(graph.data);
  return rmsFromTimeDomain(graph.data);
}

function sampleAll() {
  if (!subscribers.size || (typeof document !== "undefined" && document.hidden)) {
    dropGraphs();
    stopLoop();
    return;
  }
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const seen = new Set();
  let anyVisible = false;
  for (const sub of subscribers) {
    if (sub.hidden()) continue;
    anyVisible = true;
    const tracks = sub.stream?.getAudioTracks?.() || [];
    const { audible, waiting } = classifyAudioTracks(tracks);
    if (!audible) {
      if (waiting) noteUnmute(waiting);
      sub.onRms(0, now);
      continue;
    }
    const graph = ensureGraph(audible);
    if (!graph) {
      sub.onRms(0, now);
      continue;
    }
    seen.add(audible.id);
    sub.onRms(readRms(graph), now);
  }
  for (const [id, graph] of graphs) {
    if (!seen.has(id)) {
      disconnectGraph(graph);
      graphs.delete(id);
    }
  }
  if (!anyVisible) stopLoop();
}

function ensureLoop() {
  if (timer || typeof window === "undefined") return;
  if (typeof document !== "undefined" && document.hidden) return;
  if (!subscribers.size) return;
  timer = window.setInterval(sampleAll, VOICE_SAMPLE_MS);
}

function stopLoop() {
  if (timer && typeof window !== "undefined") window.clearInterval(timer);
  timer = 0;
}

function ensureGestureUnlock() {
  if (gestureInstalled || typeof window === "undefined") return;
  gestureInstalled = true;
  const unlock = () => {
    if (!unlocked || ctx?.state === "suspended") primeVoiceActivity();
  };
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("touchend", unlock, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && unlocked) pokeVoiceActivity();
    else stopLoop();
  });
}

/**
 * Resume the shared context. Call synchronously from the tap that starts
 * the microphone, before the first await.
 */
export function primeVoiceActivity() {
  const c = getCtx();
  unlocked = true;
  ensureGestureUnlock();
  if (!c) return;
  if (c.state === "running") {
    ensureLoop();
    return;
  }
  dropGraphs();
  try {
    const pending = c.resume();
    if (pending && typeof pending.then === "function") {
      pending.then(() => ensureLoop()).catch(() => {});
    }
  } catch {
    /* a later tap or CallKit activation retries */
  }
  ensureLoop();
}

/** CallKit (or the iOS route) took the audio session. Sources from before that are dead. */
export function notifyCallAudioSession() {
  dropGraphs();
  primeVoiceActivity();
}

/** A hidden tile scrolled into view, or the app became visible. */
export function pokeVoiceActivity() {
  if (unlocked) primeVoiceActivity();
  else ensureLoop();
}

function watchStream(stream) {
  if (!stream || streamWatchers.has(stream) || typeof stream.addEventListener !== "function") return;
  const poke = () => pokeVoiceActivity();
  stream.addEventListener("addtrack", poke);
  stream.addEventListener("removetrack", poke);
  streamWatchers.set(stream, () => {
    stream.removeEventListener("addtrack", poke);
    stream.removeEventListener("removetrack", poke);
  });
}

export function subscribeVoiceActivity(stream, { hidden, onRms } = {}) {
  if (!stream || typeof onRms !== "function") return () => {};
  const sub = {
    stream,
    hidden: typeof hidden === "function" ? hidden : () => false,
    onRms,
  };
  subscribers.add(sub);
  watchStream(stream);
  ensureGestureUnlock();
  ensureLoop();
  return () => {
    subscribers.delete(sub);
    const still = [...subscribers].some((s) => s.stream === stream);
    if (!still) {
      streamWatchers.get(stream)?.();
      streamWatchers.delete(stream);
    }
    if (!subscribers.size) {
      stopLoop();
      dropGraphs();
    }
  };
}
