/**
 * Keeps the DM call's remote <audio> element actually playing the peer's
 * microphone (2.10.113, "iOS'taki birini arayınca ona sesim gitmiyor").
 *
 * Root cause on iOS (WKWebView): WebKit renders a remote WebRTC track that is
 * attached to a media element through an audio unit on the app's shared
 * AVAudioSession. Two things reset that renderer while the element keeps
 * reporting `paused === false`, so `play()` is a no-op and the callee hears
 * nothing:
 *   - the element's srcObject was reassigned back and forth (the hook attached
 *     a mic-only stream, the overlay re-attached the full remote stream on
 *     every render that changed it), each assignment restarting playback;
 *   - CallKit activating the session and the microphone guard's full capture
 *     restart (always taken on calls answered from CallKit, i.e. incoming
 *     calls) reconfigure the session after the remote track was attached.
 * Outgoing calls from iOS were fine: CallKit activates before any remote track
 * exists. So only the callee side lost the caller's voice.
 *
 * The keeper:
 *   attach(reason)  set srcObject only when the set of live tracks changed;
 *   rebind(reason)  force a fresh srcObject (new renderer) + play(), used after
 *                   CallKit didActivate, a mic capture restart, a route change;
 *   kick(reason)    play() when paused (pause/stalled events, watchdog);
 * and never unmutes while deafened. Pure (dependencies injected) for selftests.
 */

const WATCHDOG_MS = 2000;

function trackKey(tracks) {
  return tracks
    .map((t) => t?.id || "")
    .filter(Boolean)
    .sort()
    .join(",");
}

export function liveAudioTracks(stream) {
  const list = stream?.getAudioTracks?.() || [];
  return list.filter((t) => t && t.readyState !== "ended");
}

export function createRemoteAudioKeeper({
  getElement,
  getTracks,
  isActive = () => true,
  isDeafened = () => false,
  makeStream = (tracks) => new MediaStream(tracks),
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
  log = () => {},
  now = () => Date.now(),
} = {}) {
  const s = {
    key: "",
    element: null,
    attachedAt: 0,
    rebinds: 0,
    kicks: 0,
    watchdog: null,
    detachEvents: null,
  };

  function play(el, reason) {
    try {
      const p = el.play?.();
      if (p && typeof p.catch === "function") {
        p.catch((err) => log("remote audio play refused", reason, err?.name || String(err)));
      }
    } catch (err) {
      log("remote audio play threw", reason, err?.name || String(err));
    }
  }

  function applyMute(el) {
    const deaf = Boolean(isDeafened());
    if (el.muted !== deaf) el.muted = deaf;
  }

  function bindEvents(el) {
    if (s.element === el) return;
    s.detachEvents?.();
    s.element = el;
    s.key = "";
    if (typeof el?.addEventListener !== "function") {
      s.detachEvents = null;
      return;
    }
    const onStop = (event) => {
      if (!isActive() || isDeafened()) return;
      if (!el.srcObject) return;
      if (event?.type === "pause" || el.paused) kick(event?.type || "event");
    };
    const types = ["pause", "stalled", "suspend", "emptied"];
    types.forEach((type) => el.addEventListener(type, onStop));
    s.detachEvents = () => types.forEach((type) => el.removeEventListener?.(type, onStop));
  }

  /** @returns {"none"|"cleared"|"attached"|"unchanged"} */
  function attach(reason = "attach") {
    const el = getElement?.();
    if (!el) return "none";
    bindEvents(el);
    const tracks = (getTracks?.() || []).filter((t) => t && t.readyState !== "ended");
    const key = trackKey(tracks);
    if (!tracks.length) {
      if (el.srcObject) el.srcObject = null;
      s.key = "";
      return "cleared";
    }
    const current = el.srcObject;
    const currentKey = current ? trackKey(liveAudioTracks(current)) : "";
    if (key === s.key && currentKey === key) {
      applyMute(el);
      if (el.paused && isActive() && !isDeafened()) kick(`${reason}-paused`);
      return "unchanged";
    }
    el.srcObject = makeStream(tracks);
    s.key = key;
    s.attachedAt = now();
    applyMute(el);
    play(el, reason);
    log("remote audio attached", { reason, tracks: tracks.length });
    return "attached";
  }

  function rebind(reason = "rebind") {
    const el = getElement?.();
    if (!el) return false;
    bindEvents(el);
    const tracks = (getTracks?.() || []).filter((t) => t && t.readyState !== "ended");
    if (!tracks.length) return false;
    s.rebinds += 1;
    try {
      el.srcObject = null;
    } catch {
      /* ignore */
    }
    el.srcObject = makeStream(tracks);
    s.key = trackKey(tracks);
    s.attachedAt = now();
    applyMute(el);
    play(el, reason);
    log("remote audio rebound", { reason, n: s.rebinds });
    return true;
  }

  function kick(reason = "kick") {
    const el = getElement?.();
    if (!el || !el.srcObject || !isActive() || isDeafened()) return false;
    if (!el.paused) return false;
    s.kicks += 1;
    play(el, reason);
    if (s.kicks <= 5 || s.kicks % 20 === 0) log("remote audio resumed", { reason, n: s.kicks });
    return true;
  }

  function start() {
    if (s.watchdog != null) return;
    s.watchdog = setTimer(() => {
      if (!isActive()) return;
      attach("watchdog");
    }, WATCHDOG_MS);
  }

  function stop() {
    if (s.watchdog != null) clearTimer(s.watchdog);
    s.watchdog = null;
  }

  function reset() {
    stop();
    s.detachEvents?.();
    s.detachEvents = null;
    s.element = null;
    s.key = "";
    s.attachedAt = 0;
    s.rebinds = 0;
    s.kicks = 0;
  }

  return {
    attach,
    rebind,
    kick,
    start,
    stop,
    reset,
    attachedAt: () => s.attachedAt,
    stats: () => ({ rebinds: s.rebinds, kicks: s.kicks, attachedAt: s.attachedAt }),
  };
}

/**
 * Inbound audio telemetry from getStats(): packets, decoded samples, level.
 * Returns null when there is no audio inbound-rtp entry yet.
 */
export function pickInboundAudio(report) {
  let best = null;
  report?.forEach?.((st) => {
    if (st?.type !== "inbound-rtp") return;
    if (st.kind !== "audio" && st.mediaType !== "audio") return;
    if (!best || Number(st.packetsReceived || 0) > Number(best.packetsReceived || 0)) best = st;
  });
  if (!best) return null;
  return {
    packetsReceived: Number(best.packetsReceived || 0),
    bytesReceived: Number(best.bytesReceived || 0),
    packetsLost: Number(best.packetsLost || 0),
    audioLevel: typeof best.audioLevel === "number" ? Number(best.audioLevel.toFixed(4)) : null,
    totalSamplesReceived: Number(best.totalSamplesReceived || 0),
    concealedSamples: Number(best.concealedSamples || 0),
    jitter: typeof best.jitter === "number" ? Number(best.jitter.toFixed(4)) : null,
    codecId: best.codecId || "",
  };
}

/**
 * What the inbound probe should do with one sample.
 *  "wait"     nothing yet, keep sampling
 *  "flowing"  packets arrive and the element plays
 *  "resume"   packets arrive but the element is paused → kick it
 *  "missing"  no inbound audio packets after the grace period → report
 */
export function inboundAudioVerdict({ inbound, elapsedMs, elementPaused, hasElement, graceMs = 8000 } = {}) {
  const packets = Number(inbound?.packetsReceived || 0);
  if (packets > 0) {
    if (hasElement && elementPaused) return "resume";
    return "flowing";
  }
  return elapsedMs >= graceMs ? "missing" : "wait";
}
