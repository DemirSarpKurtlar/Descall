/**
 * Socket.IO never reconnects on its own after the server closed the socket on
 * purpose ("io server disconnect": the admin restart drain in
 * backend/lib/systemRestart.js, a maintenance or ban kick). `socket.active`
 * turns false, so the resume watchdog (socketResume.js) also leaves it alone
 * and the app stayed offline until a reload.
 *
 * This brings it back: one `socket.connect()` after a jittered delay, so a
 * whole drain batch does not stampede the new process. A server that keeps
 * kicking right away backs off (1.5 s, 3 s, 6 s ... 30 s). A ban or
 * maintenance answer then arrives on the new handshake and shows its screen.
 * Nothing is revived without a session token (logout, maintenance clears it).
 */

export const REVIVE_BASE_MS = 1_500;
export const REVIVE_MAX_MS = 30_000;
export const REVIVE_JITTER_MS = 3_500;
/** A connection that lived this long resets the backoff. */
export const REVIVE_STABLE_MS = 30_000;

export function reviveDelayMs(attempt, rand = Math.random) {
  const n = Math.max(0, Math.floor(Number(attempt) || 0));
  const base = Math.min(REVIVE_MAX_MS, REVIVE_BASE_MS * 2 ** n);
  return Math.round(base + rand() * REVIVE_JITTER_MS);
}

export function installServerDisconnectRevive(socket, opts = {}) {
  if (!socket || typeof socket.on !== "function") return { dispose() {} };
  const canRevive = opts.canRevive || (() => true);
  const now = opts.now || (() => Date.now());
  const rand = opts.rand || Math.random;
  const setT = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearT = opts.clearTimeout || ((id) => clearTimeout(id));
  const log = opts.log || ((...a) => console.info("[socket-revive]", ...a));

  let attempt = 0;
  let connectedAt = 0;
  let timer = null;
  let disposed = false;

  const cancel = () => {
    if (timer != null) clearT(timer);
    timer = null;
  };
  const onConnect = () => {
    cancel();
    connectedAt = now();
  };
  const onDisconnect = (reason) => {
    if (connectedAt && now() - connectedAt >= REVIVE_STABLE_MS) attempt = 0;
    connectedAt = 0;
    if (reason !== "io server disconnect" || disposed) return;
    cancel();
    const delay = reviveDelayMs(attempt, rand);
    attempt += 1;
    log(`server closed the socket, reconnecting in ${delay} ms`);
    timer = setT(() => {
      timer = null;
      if (disposed || socket.connected || socket.active) return;
      if (!canRevive()) return;
      socket.connect();
    }, delay);
  };

  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  if (socket.connected) connectedAt = now();

  return {
    dispose() {
      disposed = true;
      cancel();
      socket.off?.("connect", onConnect);
      socket.off?.("disconnect", onDisconnect);
    },
  };
}
