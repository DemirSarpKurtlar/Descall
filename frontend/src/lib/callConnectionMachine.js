/**
 * DM call link recovery (pure, timers injected — see callConnectionMachine.selftest.mjs).
 *
 * Before 2.10.107 useCall reacted to `connectionState` and
 * `iceConnectionState` separately. Each wrote its own UI state, so one ICE
 * blip produced connected → reconnecting → connecting → connected flips (the
 * remote tile was swapped out and back in on every flip), and recovery was a
 * single ICE restart per episode: if that one offer was lost because the
 * socket was down at the same moment, nothing ever retried and the call just
 * died.
 *
 * Now one machine owns it:
 *   - one link state from both RTCPeerConnection states (deriveLinkState);
 *   - "disconnected" gets a short grace to self-heal, then ICE restarts with
 *     exponential backoff (never a teardown); "failed" restarts right away;
 *   - glare avoidance: the polite peer waits a little longer, so normally
 *     only one side sends the restart offer;
 *   - a restart that comes due while the socket is down is kept and sent the
 *     moment the socket reconnects;
 *   - a network change (Wi-Fi ↔ cellular) restarts immediately;
 *   - only after GIVE_UP_MS of continuous trouble (shorter when the server
 *     says the peer's sockets are gone too) the status becomes "lost".
 */

export const DISCONNECTED_GRACE_MS = 2000;
export const POLITE_EXTRA_MS = 1200;
export const BACKOFF_MS = Object.freeze([2000, 4000, 8000, 15000]);
export const GIVE_UP_MS = 60_000;
export const GIVE_UP_PEER_OFFLINE_MS = 25_000;

/** One link state out of connectionState + iceConnectionState. */
export function deriveLinkState({ connectionState, iceConnectionState } = {}) {
  const conn = connectionState || "";
  const ice = iceConnectionState || "";
  if (conn === "closed" || ice === "closed") return "closed";
  if (conn === "failed" || ice === "failed") return "failed";
  if (conn === "connected") return "connected";
  if (!conn && (ice === "connected" || ice === "completed")) return "connected";
  if (conn === "disconnected" || ice === "disconnected") return "disconnected";
  if (conn === "connecting" || ice === "checking") return "connecting";
  if (ice === "connected" || ice === "completed") return "connected";
  return "new";
}

export function createCallRecovery({
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  restart = () => {},
  onStatus = () => {},
  onLost = () => {},
  polite = false,
  disconnectedGraceMs = DISCONNECTED_GRACE_MS,
  politeExtraMs = POLITE_EXTRA_MS,
  backoffMs = BACKOFF_MS,
  giveUpMs = GIVE_UP_MS,
  giveUpPeerOfflineMs = GIVE_UP_PEER_OFFLINE_MS,
} = {}) {
  let link = "new";
  let everConnected = false;
  let socketConnected = true;
  let peerOnline = true;
  let troubleSince = null;
  let attempt = 0;
  let restartTimer = null;
  let lostTimer = null;
  let pendingRestart = false;
  // A network change restarts even while the pc still reports "connected":
  // the old candidate pair is gone, ICE just hasn't noticed yet.
  let forced = false;
  let status = "connecting";
  let disposed = false;
  let lost = false;

  function setStatus(next) {
    if (next === status) return;
    status = next;
    onStatus(next);
  }

  function clearRestart() {
    if (restartTimer != null) clearTimer(restartTimer);
    restartTimer = null;
  }

  function clearLost() {
    if (lostTimer != null) clearTimer(lostTimer);
    lostTimer = null;
  }

  function armLost() {
    clearLost();
    if (troubleSince == null || lost) return;
    const limit = peerOnline ? giveUpMs : giveUpPeerOfflineMs;
    const wait = Math.max(0, troubleSince + limit - now());
    lostTimer = setTimer(() => {
      lostTimer = null;
      if (disposed || link === "connected" || lost) return;
      lost = true;
      clearRestart();
      setStatus("lost");
      onLost();
    }, wait);
  }

  function fire() {
    restartTimer = null;
    if (disposed || lost || link === "closed") return;
    if (link === "connected" && !forced) return;
    if (!socketConnected) {
      // The offer could not reach the peer now; send it on reconnect.
      pendingRestart = true;
      return;
    }
    pendingRestart = false;
    const wasForced = forced;
    forced = false;
    const n = attempt;
    attempt += 1;
    try {
      restart({ attempt: n, forced: wasForced });
    } catch {
      /* the next backoff step retries */
    }
    // Still connected after a forced restart: nothing to back off from.
    if (link === "connected") return;
    schedule(backoffMs[Math.min(n, backoffMs.length - 1)]);
  }

  function schedule(delay) {
    clearRestart();
    if (disposed || lost) return;
    restartTimer = setTimer(fire, Math.max(0, delay + (polite ? politeExtraMs : 0)));
  }

  function enterTrouble(kind) {
    if (troubleSince == null) troubleSince = now();
    if (everConnected) setStatus("reconnecting");
    armLost();
    if (restartTimer == null && !pendingRestart) {
      schedule(kind === "failed" ? 0 : disconnectedGraceMs);
    } else if (kind === "failed" && attempt === 0) {
      schedule(0);
    }
  }

  function update({ connectionState, iceConnectionState } = {}) {
    if (disposed) return status;
    link = deriveLinkState({ connectionState, iceConnectionState });
    if (link === "connected") {
      everConnected = true;
      troubleSince = null;
      attempt = 0;
      lost = false;
      clearLost();
      if (!forced) {
        pendingRestart = false;
        clearRestart();
      }
      setStatus("connected");
    } else if (link === "disconnected" || link === "failed") {
      enterTrouble(link);
    } else if (link === "connecting" || link === "new") {
      // A restart in progress keeps the "reconnecting" face; first connect says connecting.
      if (!everConnected) setStatus("connecting");
    } else if (link === "closed") {
      clearRestart();
      clearLost();
    }
    return status;
  }

  function socketChanged(connected) {
    socketConnected = Boolean(connected);
    if (disposed || !socketConnected) return;
    if (pendingRestart && (link !== "connected" || forced)) {
      clearRestart();
      fire();
    }
  }

  /** Wi-Fi ↔ cellular / back online: the old candidate pair is dead, restart now. */
  function networkChanged() {
    if (disposed || lost || link === "closed") return;
    if (troubleSince == null && link !== "connected") troubleSince = now();
    if (everConnected && link !== "connected") setStatus("reconnecting");
    if (link !== "connected") armLost();
    attempt = 0;
    forced = true;
    // No polite delay here: both sides may change network; a glare is
    // resolved by perfect negotiation (rollback on the polite side).
    clearRestart();
    restartTimer = setTimer(fire, 0);
  }

  function setPeerOnline(online) {
    peerOnline = Boolean(online);
    if (troubleSince != null) armLost();
  }

  function dispose() {
    disposed = true;
    clearRestart();
    clearLost();
  }

  return {
    update,
    socketChanged,
    networkChanged,
    setPeerOnline,
    dispose,
    _state: () => ({ link, status, attempt, pendingRestart, troubleSince, lost, socketConnected, peerOnline, forced }),
  };
}

/**
 * Debounce a flapping status for display: "reconnecting" (and "lost") only
 * shows once it has lasted `enterMs`; going back to "connected" waits
 * `exitMs` of stability. Pure: feed it (status, now), read `.value`.
 */
export function createStatusDebouncer({ enterMs = 700, exitMs = 500, initial = "connecting" } = {}) {
  let shown = initial;
  let raw = initial;
  let rawSince = 0;
  return {
    push(next, now) {
      if (next !== raw) {
        raw = next;
        rawSince = now;
      }
      return this.tick(now);
    },
    tick(now) {
      if (raw === shown) return shown;
      const age = now - rawSince;
      const troubled = raw === "reconnecting" || raw === "lost";
      if (raw === "lost" && shown === "reconnecting") shown = raw; // escalate at once
      else if (troubled && age >= enterMs) shown = raw;
      else if (!troubled && (shown === "reconnecting" || shown === "lost") && age >= exitMs) shown = raw;
      else if (!troubled && shown !== "reconnecting" && shown !== "lost") shown = raw;
      return shown;
    },
    /** ms until the shown value could change (for a timer), or null. */
    pendingMs(now) {
      if (raw === shown) return null;
      const troubled = raw === "reconnecting" || raw === "lost";
      return Math.max(0, (troubled ? enterMs : exitMs) - (now - rawSince));
    },
    get value() {
      return shown;
    },
  };
}
