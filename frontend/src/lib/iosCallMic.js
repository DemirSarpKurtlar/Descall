/**
 * Native iOS app: keep the DM call microphone actually sending audio.
 *
 * WKWebView's getUserMedia capture runs in WebKit's media process. When
 * CallKit activates the app's audio session at call priority while that
 * capture is already running (call answered from the CallKit banner while
 * the app was open, or the web UI answering after CallKit), WebKit's capture
 * is interrupted: the track stays "live" (often `muted`) and the peer hears
 * silence while the connection looks perfect. WebKit doesn't resume it by
 * itself because the interruption never "ends" during the call.
 *
 * Recovery, in order of cost:
 *   1. ask WebKit to un-mute capture (WKWebView.setMicrophoneCaptureState)
 *   2. capture a fresh microphone track and RTCRtpSender.replaceTrack it
 *   3. stop every capture first (restarts WebKit's capture unit), then 2.
 * Triggers: CallKit's didActivate after capture started, the track's `mute`
 * / unexpected `ended`, and outbound stats showing zero microphone energy.
 * One non-personal Sentry diagnostic per call when silence is detected.
 *
 * Pure (dependencies injected) so it runs in Node selftests.
 */

const MAX_REFRESHES = 4;
const ACTIVATION_SETTLE_MS = 350;
const READY_POLL_MS = 250;
const READY_POLL_TRIES = 20;
const MUTE_GRACE_MS = 700;
const STATS_FAST_MS = 3_000;
const STATS_SLOW_MS = 10_000;
const STATS_FAST_WINDOW_MS = 60_000;
const SILENT_SAMPLES = 3;

export function findMicSender(pc, oldTrack, screenAudioSender) {
  if (!pc) return null;
  const senders = typeof pc.getSenders === "function" ? pc.getSenders() : [];
  const notScreen = (s) => s && s !== screenAudioSender;
  if (oldTrack) {
    const exact = senders.find((s) => notScreen(s) && s.track === oldTrack);
    if (exact) return exact;
  }
  const byKind = senders.find((s) => notScreen(s) && s.track?.kind === "audio");
  if (byKind) return byKind;
  const transceivers = typeof pc.getTransceivers === "function" ? pc.getTransceivers() : [];
  const tr = transceivers.find(
    (t) => t && !t.stopped && notScreen(t.sender) && t.receiver?.track?.kind === "audio"
  );
  return tr?.sender || null;
}

export function createMicGuard({
  getPc,
  getLocalStream,
  getScreenAudioSender = () => null,
  isCallOngoing,
  getContext = () => ({}),
  getUserMedia,
  audioConstraints = () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }),
  reactivateCapture = async () => null,
  getDiagnostics = async () => null,
  report = () => {},
  onUnrecoverable = () => {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = () => {},
}) {
  let generation = 0;
  let s = fresh();
  function fresh() {
    generation += 1;
    return {
      captureStartedAt: 0,
      refreshes: 0,
      inFlight: false,
      retired: new WeakSet(),
      watched: new WeakSet(),
      timers: new Set(),
      monitorTimer: null,
      monitorStartedAt: 0,
      silentSamples: 0,
      lastEnergy: null,
      statsRefreshDone: false,
      unrecoverableSent: false,
      reported: new Set(),
      generation,
    };
  }

  function later(fn, ms) {
    const gen = s.generation;
    const id = setTimer(() => {
      s.timers.delete(id);
      if (gen === s.generation) fn();
    }, ms);
    s.timers.add(id);
    return id;
  }

  function currentTrack() {
    return getLocalStream()?.getAudioTracks?.()[0] || null;
  }

  function trackState(track) {
    return track
      ? { readyState: track.readyState, muted: Boolean(track.muted), enabled: Boolean(track.enabled) }
      : { readyState: "none", muted: false, enabled: false };
  }

  async function reportOnce(kind, extra = {}) {
    if (s.reported.has(kind)) return;
    s.reported.add(kind);
    let native = null;
    try {
      native = await getDiagnostics();
    } catch {
      native = null;
    }
    try {
      report(kind, {
        area: "ios_call_audio",
        ...getContext(),
        ...extra,
        refreshes: s.refreshes,
        track: trackState(currentTrack()),
        native,
      });
    } catch {
      /* diagnostics never break the call */
    }
  }

  /** getUserMedia started for this call (startCall / acceptIncoming). */
  function noteCaptureStart() {
    if (!s.captureStartedAt) s.captureStartedAt = now();
  }

  function whenReady(fn, tries = READY_POLL_TRIES) {
    if (!isCallOngoing()) return;
    if (getPc() && currentTrack()) return fn();
    if (tries <= 0) return;
    later(() => whenReady(fn, tries - 1), READY_POLL_MS);
  }

  /** CallKit activated the audio session (didActivate). */
  function onAudioSessionActivated() {
    log("audio session activated", { captureStarted: Boolean(s.captureStartedAt) });
    // Capture that starts after this point runs in the CallKit session: fine.
    if (!s.captureStartedAt) return;
    later(() => whenReady(() => void refresh("callkit-activate")), ACTIVATION_SETTLE_MS);
  }

  function watchTrack(track) {
    if (!track || s.watched.has(track) || typeof track.addEventListener !== "function") return;
    s.watched.add(track);
    track.addEventListener("mute", () => {
      log("mic track muted");
      later(() => {
        if (track.muted && track === currentTrack() && isCallOngoing()) void refresh("track-muted");
      }, MUTE_GRACE_MS);
    });
    track.addEventListener("unmute", () => log("mic track unmuted"));
    track.addEventListener("ended", () => {
      if (s.retired.has(track)) return;
      log("mic track ended unexpectedly");
      later(() => {
        if (track === currentTrack() && isCallOngoing()) void refresh("track-ended");
      }, 200);
    });
  }

  async function capture() {
    const stream = await getUserMedia({ audio: audioConstraints(), video: false });
    const track = stream?.getAudioTracks?.()[0] || null;
    if (track) {
      try {
        track.contentHint = "speech";
      } catch {
        /* ignore */
      }
    }
    return { stream, track };
  }

  function retire(track) {
    if (!track) return;
    s.retired.add(track);
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }

  /**
   * Replace the call's microphone track. Resolves true when a new (or
   * resumed) track is in place.
   */
  async function refresh(reason = "manual", { force = false } = {}) {
    if (s.inFlight || !isCallOngoing()) return false;
    if (!force && s.refreshes >= MAX_REFRESHES) return false;
    const pc = getPc();
    const local = getLocalStream();
    if (!pc || !local) return false;
    const old = currentTrack();
    const sender = findMicSender(pc, old, getScreenAudioSender());
    if (!sender) return false;
    const gen = s.generation;
    s.inFlight = true;
    s.refreshes += 1;
    const wasEnabled = old ? old.enabled !== false : true;
    let created = null;
    try {
      const resumed = await reactivateCapture();
      if (old && old.readyState === "live" && old.muted && resumed?.micReactivated) {
        await wait(300);
        if (!old.muted) {
          log("mic resumed by WebKit", { reason });
          return true;
        }
      }
      // Fresh capture next to the old one.
      try {
        created = await capture();
      } catch (err) {
        log("fresh capture failed", err?.name || err?.message);
        created = null;
      }
      if (!created?.track || created.track.muted || created.track.readyState !== "live") {
        // Same interrupted capture unit: stop all capture, then start over.
        created?.stream?.getTracks?.().forEach((t) => retire(t));
        retire(old);
        await wait(250);
        created = await capture();
      }
      if (gen !== s.generation || !isCallOngoing()) {
        created?.stream?.getTracks?.().forEach((t) => retire(t));
        return false;
      }
      const track = created?.track;
      if (!track) throw new Error("no-audio-track");
      track.enabled = wasEnabled;
      await sender.replaceTrack(track);
      if (old) {
        if (old.readyState !== "ended") retire(old);
        try {
          local.removeTrack(old);
        } catch {
          /* ignore */
        }
      }
      local.addTrack(track);
      watchTrack(track);
      log("mic refreshed", { reason, muted: Boolean(track.muted) });
      return true;
    } catch (err) {
      log("mic refresh failed", reason, err?.name || err?.message);
      void reportOnce("ios_call_mic_refresh_failed", { reason, error: String(err?.name || "Error") });
      if (s.refreshes < MAX_REFRESHES) {
        later(() => void refresh("retry"), 1_200);
      } else if (!s.unrecoverableSent) {
        s.unrecoverableSent = true;
        onUnrecoverable("refresh-failed");
      }
      return false;
    } finally {
      if (gen === s.generation) s.inFlight = false;
    }
  }

  function pickStats(report, track) {
    let source = null;
    let outbound = null;
    report?.forEach?.((st) => {
      if (st.type === "media-source" && st.kind === "audio") {
        if (!source || (track && st.trackIdentifier === track.id)) source = st;
      } else if (st.type === "outbound-rtp" && (st.kind === "audio" || st.mediaType === "audio")) {
        if (!outbound || (source && st.mediaSourceId === source.id)) outbound = st;
      }
    });
    return { source, outbound };
  }

  async function sample() {
    const pc = getPc();
    const track = currentTrack();
    if (!pc || !track || typeof pc.getStats !== "function" || s.inFlight) return;
    if (!track.enabled || track.readyState !== "live") {
      s.silentSamples = 0;
      s.lastEnergy = null;
      return;
    }
    let stats;
    try {
      stats = pickStats(await pc.getStats(), track);
    } catch {
      return;
    }
    const energy = typeof stats.source?.totalAudioEnergy === "number" ? stats.source.totalAudioEnergy : null;
    const level = typeof stats.source?.audioLevel === "number" ? stats.source.audioLevel : null;
    const zeroEnergy = energy != null && s.lastEnergy != null && energy === s.lastEnergy && !level;
    s.lastEnergy = energy;
    const silent = Boolean(track.muted) || zeroEnergy;
    s.silentSamples = silent ? s.silentSamples + 1 : 0;
    if (s.silentSamples < SILENT_SAMPLES) return;
    s.silentSamples = 0;
    const why = track.muted ? "track-muted" : "zero-energy";
    void reportOnce("ios_call_mic_silent", {
      reason: why,
      energyAvailable: energy != null,
      packetsSent: Number(stats.outbound?.packetsSent || 0),
    });
    if (!s.statsRefreshDone) {
      s.statsRefreshDone = true;
      void refresh(`silent-${why}`);
    } else if (why === "track-muted" && s.refreshes >= 2 && !s.unrecoverableSent) {
      s.unrecoverableSent = true;
      onUnrecoverable("still-muted");
    }
  }

  function scheduleSample() {
    const elapsed = now() - s.monitorStartedAt;
    const gen = s.generation;
    s.monitorTimer = setTimer(async () => {
      if (gen !== s.generation || s.monitorTimer == null) return;
      await sample();
      if (gen === s.generation && s.monitorTimer != null && isCallOngoing()) scheduleSample();
    }, elapsed < STATS_FAST_WINDOW_MS ? STATS_FAST_MS : STATS_SLOW_MS);
  }

  function startMonitoring() {
    if (s.monitorTimer != null) return;
    s.monitorStartedAt = now();
    s.silentSamples = 0;
    s.lastEnergy = null;
    scheduleSample();
  }

  function stopMonitoring() {
    if (s.monitorTimer != null) clearTimer(s.monitorTimer);
    s.monitorTimer = null;
  }

  /** Call ended: forget everything (pending timers become no-ops). */
  function reset() {
    stopMonitoring();
    s.timers.forEach((id) => clearTimer(id));
    s = fresh();
  }

  return {
    noteCaptureStart,
    onAudioSessionActivated,
    watchTrack,
    refresh,
    startMonitoring,
    stopMonitoring,
    reset,
    _state: () => s,
  };
}

/**
 * getUserMedia for a call on native iOS: a capture requested right as
 * CallKit activates the audio session can fail with NotReadableError /
 * AbortError; retry briefly instead of ending the call.
 */
export async function withCaptureRetry(fn, { retries = 2, delayMs = 700, wait = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const name = err?.name || "";
      if (name !== "NotReadableError" && name !== "AbortError" && name !== "TrackStartError") throw err;
      log("capture retry", name, attempt + 1);
      if (attempt < retries) await wait(delayMs);
    }
  }
  throw lastErr;
}
