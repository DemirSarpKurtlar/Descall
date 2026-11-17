/**
 * Gapless call-ring loop (calls-01, polish 3.9.x).
 *
 * The ringback / ringtone used to loop through an HTMLAudioElement with
 * `loop = true`. Chromium re-seeks the element at every wrap ("seeking",
 * "waiting", "seeked"): about 105 ms of stall per cycle on top of the MP3
 * priming, so the ring stuttered at every restart. Here the ring file is
 * decoded once and played by an AudioBufferSourceNode with `loop = true`,
 * which wraps sample-accurately. The ring files hold one full cycle (phrase +
 * rest, see scripts/generate_ring_sounds.py), so the loop is the cadence.
 *
 * One short-lived AudioContext per ring, closed on stop: no context (and no
 * audio service process) is kept alive between calls.
 *
 * Falls back (onFail) to the caller's HTMLAudioElement path when Web Audio is
 * missing, the file cannot be fetched / decoded (e.g. a file:// URL Electron
 * will not fetch), or the context does not start (autoplay policy). Native
 * iOS keeps the element path: CallKit owns the audio session there and
 * suspends app AudioContexts on route changes.
 *
 * The controller exposes setSinkId(), so callAudioDevices.routeToSink() can
 * move a playing ringback to the call speaker like any media element.
 */

/** Seconds per ring cycle of the default files (scripts/generate_ring_sounds.py). */
export const RING_CYCLE_S = Object.freeze({ outgoingCall: 4.0, incomingCall: 3.0 });

/** How long a new context may take to start before we use the element instead. */
export const RING_START_TIMEOUT_MS = 500;

function isNativeIosApp() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}

function defaultContextCtor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export function webRingSupported({ Ctor = defaultContextCtor(), nativeIos = isNativeIosApp() } = {}) {
  return Boolean(Ctor) && !nativeIos;
}

/** url -> Promise<ArrayBuffer>. Bytes are cached; each context decodes its own copy. */
const bytesCache = new Map();

function loadBytes(url, fetchImpl) {
  if (!bytesCache.has(url)) {
    const p = Promise.resolve()
      .then(() => fetchImpl(url))
      .then((res) => {
        if (res && res.ok === false) throw new Error(`ring fetch ${res.status}`);
        return res.arrayBuffer();
      });
    p.catch(() => bytesCache.delete(url));
    bytesCache.set(url, p);
  }
  return bytesCache.get(url);
}

export function _resetRingLoopCacheForTests() {
  bytesCache.clear();
}

function decode(ctx, bytes) {
  // Older WebKit only has the callback form; copy, decode detaches the buffer.
  const copy = bytes.slice(0);
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(copy, resolve, reject);
      if (p && typeof p.then === "function") p.then(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function startContext(ctx, timeoutMs, setTimer, clearTimer) {
  if (ctx.state === "running") return true;
  let timer = null;
  try {
    await Promise.race([
      Promise.resolve().then(() => ctx.resume()).catch(() => {}),
      new Promise((resolve) => { timer = setTimer(resolve, timeoutMs); }),
    ]);
  } finally {
    if (timer != null) clearTimer(timer);
  }
  return ctx.state === "running";
}

/**
 * Start looping `url`. Returns a controller right away; the sound starts once
 * the file is decoded. `onFail(reason)` is called (at most once) when the Web
 * Audio path cannot play; the caller then uses its element fallback.
 */
export function startRingLoop({
  url,
  volume = 1,
  sinkId = "",
  onFail = () => {},
  onStart = () => {},
  Ctor = defaultContextCtor(),
  fetchImpl = typeof fetch === "function" ? (u) => fetch(u) : null,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  startTimeoutMs = RING_START_TIMEOUT_MS,
} = {}) {
  let stopped = false;
  let failed = false;
  let ctx = null;
  let gain = null;
  let source = null;
  let level = clampVolume(volume);
  let sink = typeof sinkId === "string" ? sinkId : "";

  const closeCtx = () => {
    const c = ctx;
    ctx = null;
    gain = null;
    if (!c) return;
    try {
      const p = c.close?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* already closed */
    }
  };

  const fail = (reason) => {
    if (failed || stopped) return;
    failed = true;
    try { source?.stop?.(); } catch { /* not started */ }
    source = null;
    closeCtx();
    try {
      onFail(reason);
    } catch {
      /* the fallback is best effort */
    }
  };

  const controller = {
    get playing() {
      return Boolean(source) && !stopped && !failed;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try { source?.stop?.(); } catch { /* not started */ }
      try { source?.disconnect?.(); } catch { /* ignore */ }
      source = null;
      closeCtx();
    },
    setVolume(v) {
      level = clampVolume(v);
      if (gain) {
        try { gain.gain.value = level; } catch { /* ignore */ }
      }
    },
    /** Same contract as HTMLMediaElement.setSinkId (routeToSink calls it). */
    setSinkId(id) {
      sink = typeof id === "string" ? id : "";
      if (ctx && typeof ctx.setSinkId === "function") {
        return Promise.resolve(ctx.setSinkId(sink)).catch(() => {});
      }
      return Promise.resolve();
    },
  };

  if (!Ctor || !fetchImpl || !url) {
    // Report on the next turn, after the caller stored the controller.
    Promise.resolve().then(() => fail(!url ? "no-url" : "unsupported"));
    return controller;
  }

  (async () => {
    try {
      ctx = new Ctor({ latencyHint: "playback" });
    } catch {
      try {
        ctx = new Ctor();
      } catch {
        fail("context");
        return;
      }
    }
    // Same turn as play(): keeps the page's user activation for resume().
    const started = startContext(ctx, startTimeoutMs, setTimer, clearTimer);
    let buffer;
    try {
      const bytes = await loadBytes(url, fetchImpl);
      if (stopped || failed || !ctx) return;
      buffer = await decode(ctx, bytes);
    } catch {
      fail("decode");
      return;
    }
    if (!(await started)) {
      fail("suspended");
      return;
    }
    if (stopped || failed || !ctx) return;
    try {
      if (sink && typeof ctx.setSinkId === "function") await ctx.setSinkId(sink).catch(() => {});
      if (stopped || failed || !ctx) return;
      gain = ctx.createGain();
      gain.gain.value = level;
      gain.connect(ctx.destination);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.connect(gain);
      node.start();
      source = node;
      onStart();
    } catch {
      fail("start");
    }
  })();

  return controller;
}

function clampVolume(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}
