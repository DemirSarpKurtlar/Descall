/**
 * Foreground "resume" watchdog for the app socket.
 *
 * After a phone is locked / the app is suspended, the Socket.IO connection is
 * often a zombie: `socket.connected` is still true, but the server already
 * dropped it (missed pongs) or the TCP path is gone. Socket.IO only notices
 * when its ping timer (pingInterval + pingTimeout = 45 s) fires, and a socket
 * that did notice may be sitting in a reconnect backoff (up to 30 s). Anything
 * emitted in the meantime (call:resume-pending, call:answer) is lost — that is
 * what made "unlock → open Descall → join the call" take 10 s+.
 *
 * On foreground we therefore:
 *  - reconnect immediately (no backoff) if the socket is down;
 *  - reconnect immediately if no server ping arrived for longer than the
 *    server's ping interval (the server certainly pinged us → we missed it);
 *  - otherwise, if the page was actually frozen (iOS suspends the WebView;
 *    a 1 s heartbeat shows the gap), probe with an acked `app:ping` and
 *    reconnect if neither the ack nor any other packet arrives in time.
 *    A page that kept running while hidden (desktop tab, iOS in a call with
 *    background audio) had its own ping timer running: no probe, so a slow
 *    network can never kick a live voice session off the server.
 *
 * Sockets the app disconnected on purpose (logout, transport swap) are never
 * revived: `socket.active` is false for those.
 */

const DEFAULT_PING_INTERVAL_MS = 25_000;
const PING_GRACE_MS = 5_000;
const PROBE_TIMEOUT_MS = 1_500;
const TICK_MS = 1_000;
const FROZEN_GAP_MS = 4_000;
const OPENING_PATIENCE_MS = 3_000;
const DEBOUNCE_MS = 400;

export function installSocketResumeWatchdog(socket, opts = {}) {
  if (!socket || typeof window === "undefined" || typeof document === "undefined") {
    return { ensureFresh: () => false, dispose() {} };
  }
  const now = opts.now || (() => Date.now());
  const log = opts.log || ((...a) => console.info("[socket-resume]", ...a));
  const onForceReconnect = opts.onForceReconnect || null;

  let lastRxAt = now();
  let lastTickAt = now();
  let frozenGapMs = 0; // longest heartbeat gap since the last foreground check
  let attemptStartedAt = now();
  let lastCheckAt = 0;
  let probing = false;
  let disposed = false;
  let boundEngine = null;

  const markRx = () => {
    lastRxAt = now();
  };
  const bindEngine = () => {
    const engine = socket.io?.engine;
    if (!engine || engine === boundEngine) return;
    boundEngine = engine;
    // Any inbound engine packet (ping, message, …) proves the path is alive.
    engine.on?.("packet", markRx);
  };
  const onConnect = () => {
    markRx();
    bindEngine();
  };
  const onAttempt = () => {
    attemptStartedAt = now();
  };
  const tick = setInterval(() => {
    const t = now();
    frozenGapMs = Math.max(frozenGapMs, t - lastTickAt);
    lastTickAt = t;
  }, TICK_MS);
  socket.on("connect", onConnect);
  socket.io?.on?.("ping", markRx);
  socket.io?.on?.("open", bindEngine);
  socket.io?.on?.("reconnect_attempt", onAttempt);
  bindEngine();

  const pingIntervalMs = () => {
    const v = Number(socket.io?.engine?._pingInterval);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_PING_INTERVAL_MS;
  };

  function forceReconnect(reason) {
    if (disposed || !socket.active) return;
    log(`reconnecting now (${reason})`);
    attemptStartedAt = now();
    try {
      onForceReconnect?.(reason);
    } catch {
      /* ignore */
    }
    // disconnect() + connect() drops the dead engine and resets the backoff,
    // so the new handshake starts right away. socket.active must be restored
    // by connect() — the caller still owns this socket.
    socket.disconnect();
    socket.connect();
  }

  /**
   * Make sure the socket is (about to be) usable. Synchronous decisions
   * (down / stale) reconnect immediately; a soft check probes in the background.
   */
  function ensureFresh(reason = "check") {
    if (disposed || !socket.active) return false;
    const t = now();
    if (!socket.connected) {
      const engineState = socket.io?.engine?.readyState;
      const reconnecting = Boolean(socket.io?._reconnecting);
      const opening = engineState === "opening" && !reconnecting;
      // A handshake that just started will finish sooner than a new one.
      if (opening && t - attemptStartedAt < OPENING_PATIENCE_MS) return true;
      forceReconnect(`${reason}: socket down`);
      return true;
    }
    const silentMs = t - lastRxAt;
    if (silentMs > pingIntervalMs() + PING_GRACE_MS) {
      forceReconnect(`${reason}: no server ping for ${Math.round(silentMs / 1000)}s`);
      return true;
    }
    // The visibility event can run before the heartbeat catches up.
    const gap = Math.max(frozenGapMs, t - lastTickAt);
    if (gap < FROZEN_GAP_MS || probing) return true;
    probing = true;
    const sentAt = t;
    let settled = false;
    const finish = (alive) => {
      if (settled) return;
      settled = true;
      probing = false;
      clearInterval(rxWatch);
      if (!alive && socket.connected) forceReconnect(`${reason}: probe timed out`);
    };
    // Any packet after the probe also counts (covers servers without app:ping).
    const rxWatch = setInterval(() => {
      if (lastRxAt > sentAt) finish(true);
    }, 100);
    try {
      socket.timeout(PROBE_TIMEOUT_MS).emit("app:ping", (err) => finish(!err || lastRxAt > sentAt));
    } catch {
      finish(true);
    }
    return true;
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") return;
    onForeground("visible");
  }
  function onForeground(src) {
    const t = now();
    if (t - lastCheckAt < DEBOUNCE_MS) return;
    lastCheckAt = t;
    ensureFresh(src);
    frozenGapMs = 0;
    lastTickAt = t;
  }
  const onResume = () => onForeground("resume");
  const onOnline = () => onForeground("online");

  // Capture on window so this runs before document-level visibility handlers
  // (e.g. the CallKit bridge's resume request) — they then see the real state.
  window.addEventListener("visibilitychange", onVisibility, true);
  document.addEventListener("resume", onResume); // Capacitor native resume
  window.addEventListener("online", onOnline);

  return {
    ensureFresh,
    dispose() {
      disposed = true;
      clearInterval(tick);
      window.removeEventListener("visibilitychange", onVisibility, true);
      document.removeEventListener("resume", onResume);
      window.removeEventListener("online", onOnline);
      socket.off("connect", onConnect);
      socket.io?.off?.("ping", markRx);
      socket.io?.off?.("open", bindEngine);
      socket.io?.off?.("reconnect_attempt", onAttempt);
      boundEngine?.off?.("packet", markRx);
    },
  };
}
