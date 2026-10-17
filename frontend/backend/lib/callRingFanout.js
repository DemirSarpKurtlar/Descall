"use strict";

/**
 * Per-ring state for DM calls and the fan-out that stops every other device
 * of the callee the moment the ring is over.
 *
 * A ring ends in exactly one way:
 *   answered_elsewhere  one of the callee's devices answered
 *   declined_elsewhere  one of the callee's devices declined
 *   cancelled           the caller hung up before an answer (or its app died)
 *   missed              nobody answered within RING_TIMEOUT_MS
 *
 * For each outcome every channel that could still be ringing is told:
 *   - Socket.IO: `call:ring-ended` to the callee's user room (minus the socket
 *     that acted), plus the legacy event older clients listen for.
 *   - iOS: a PushKit VoIP "call-end" push, so a locked / suspended / killed
 *     iPhone ends its CallKit call with the right CXCallEndedReason even when
 *     its web layer (and socket) is not running.
 *   - Web Push: a "call-ring-ended" push the service worker uses to replace
 *     the requireInteraction call notification.
 *
 * Pure module: io / pushes / timers are injected (see createRingFanout) so the
 * whole state machine runs in a selftest without a server.
 */

const RING_TIMEOUT_MS = 45_000;
/** Caller's last socket went away while ringing: cancel unless it is back by then. */
const CALLER_LOST_GRACE_MS = 12_000;

const OUTCOMES = Object.freeze(["answered_elsewhere", "declined_elsewhere", "cancelled", "missed"]);

/** CXCallEndedReason name the iOS app reports for each outcome. */
const CALLKIT_REASON = Object.freeze({
  answered_elsewhere: "answeredElsewhere",
  declined_elsewhere: "declinedElsewhere",
  cancelled: "remoteEnded",
  missed: "unanswered",
});

/** Legacy socket event (pre-2.10.107 clients) for the same outcome. */
const LEGACY_EVENT = Object.freeze({
  answered_elsewhere: "call:answered-elsewhere",
  declined_elsewhere: "call:declined-elsewhere",
  cancelled: null, // call:cancelled is already emitted by the cancel handler
  missed: "call:cancelled",
});

function isOutcome(value) {
  return OUTCOMES.includes(value);
}

function createRingFanout(deps = {}) {
  const {
    emitToUserRoom, // (userId, event, payload, exceptSocketId?) => void
    emitToUser, // (userId, event, payload) => void (caller side)
    sendVoipEnd = async () => {}, // (calleeId, { callUuid, reason, callerId })
    sendWebPushEnd = async () => {}, // (calleeId, { callUuid, outcome, callerId, callerName })
    onMissed = async () => {}, // (ring) => finalize history
    onCallerLost = async () => {}, // (ring) => finalize history as cancelled/missed
    hasLiveSockets = () => true, // (userId) => boolean
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
    now = () => Date.now(),
    log = console,
    ringTimeoutMs = RING_TIMEOUT_MS,
    callerLostGraceMs = CALLER_LOST_GRACE_MS,
  } = deps;

  /** callUuid → ring */
  const rings = new Map();

  function key(callerId, calleeId) {
    return `${callerId}->${calleeId}`;
  }

  function findByPair(callerId, calleeId) {
    for (const ring of rings.values()) {
      if (ring.callerId === callerId && ring.calleeId === calleeId) return ring;
    }
    return null;
  }

  function clearTimers(ring) {
    if (ring.timeout) clearTimer(ring.timeout);
    if (ring.lostTimer) clearTimer(ring.lostTimer);
    ring.timeout = null;
    ring.lostTimer = null;
  }

  /**
   * A fresh ring went out. Re-sending the same ring (same callUuid) keeps one
   * record and restarts nothing but the bookkeeping.
   */
  function ringStarted({ callUuid, callerId, calleeId, callerName = "" } = {}) {
    if (!callUuid || !callerId || !calleeId) return null;
    const existing = rings.get(callUuid);
    if (existing) {
      existing.callerName = callerName || existing.callerName;
      return existing;
    }
    // A new ring for the same pair replaces a stale one silently.
    const stale = findByPair(callerId, calleeId);
    if (stale) {
      clearTimers(stale);
      rings.delete(stale.callUuid);
    }
    const ring = {
      callUuid,
      callerId,
      calleeId,
      callerName,
      startedAt: now(),
      state: "ringing",
      timeout: null,
      lostTimer: null,
      key: key(callerId, calleeId),
    };
    ring.timeout = setTimer(() => {
      if (rings.get(callUuid) !== ring || ring.state !== "ringing") return;
      endRing(ring, "missed");
      // call:declined is what every caller client (old and new) already ends
      // an outgoing ring on; `reason` lets 2.10.107+ say "Yanıt yok".
      emitToUser?.(callerId, "call:declined", { fromUserId: calleeId, callUuid, reason: "no_answer" });
      Promise.resolve(onMissed(ring)).catch((err) => log.warn?.("[Ring] missed finalize failed:", err?.message || err));
    }, ringTimeoutMs);
    rings.set(callUuid, ring);
    return ring;
  }

  /**
   * Stop the ring on every channel. Idempotent: the second outcome for the
   * same ring is ignored (first one wins), so an answer racing a cancel can
   * never send two different reasons to the phone.
   * @returns {object|null} the plan that was executed (for tests / logs)
   */
  function endRing(ring, outcome, { exceptSocketId = null } = {}) {
    if (!ring || ring.state !== "ringing" || !isOutcome(outcome)) return null;
    ring.state = outcome;
    clearTimers(ring);
    rings.delete(ring.callUuid);
    const payload = {
      fromUserId: ring.callerId,
      callUuid: ring.callUuid,
      reason: outcome,
    };
    emitToUserRoom(ring.calleeId, "call:ring-ended", payload, exceptSocketId);
    const legacy = LEGACY_EVENT[outcome];
    if (legacy) {
      emitToUserRoom(ring.calleeId, legacy, { fromUserId: ring.callerId, callUuid: ring.callUuid }, exceptSocketId);
    }
    const plan = {
      calleeId: ring.calleeId,
      callerId: ring.callerId,
      callUuid: ring.callUuid,
      outcome,
      callKitReason: CALLKIT_REASON[outcome],
      exceptSocketId,
    };
    Promise.resolve(
      sendVoipEnd(ring.calleeId, { callUuid: ring.callUuid, reason: CALLKIT_REASON[outcome], callerId: ring.callerId })
    ).catch((err) => log.warn?.("[Ring] VoIP end failed:", err?.message || err));
    Promise.resolve(
      sendWebPushEnd(ring.calleeId, {
        callUuid: ring.callUuid,
        outcome,
        callerId: ring.callerId,
        callerName: ring.callerName,
      })
    ).catch((err) => log.warn?.("[Ring] web push end failed:", err?.message || err));
    return plan;
  }

  function endRingByPair(callerId, calleeId, outcome, opts) {
    return endRing(findByPair(callerId, calleeId), outcome, opts);
  }

  function endRingByUuid(callUuid, outcome, opts) {
    return endRing(rings.get(callUuid), outcome, opts);
  }

  /** The caller's last socket disconnected. Cancel its rings after a grace. */
  function callerSocketsGone(callerId) {
    for (const ring of rings.values()) {
      if (ring.callerId !== callerId || ring.state !== "ringing" || ring.lostTimer) continue;
      ring.lostTimer = setTimer(() => {
        ring.lostTimer = null;
        if (rings.get(ring.callUuid) !== ring || ring.state !== "ringing") return;
        if (hasLiveSockets(callerId)) return;
        endRing(ring, "cancelled");
        emitToUserRoom(ring.calleeId, "call:cancelled", { fromUserId: callerId, callUuid: ring.callUuid });
        Promise.resolve(onCallerLost(ring)).catch((err) =>
          log.warn?.("[Ring] caller-lost finalize failed:", err?.message || err)
        );
      }, callerLostGraceMs);
    }
  }

  /** The caller reconnected: keep its rings. */
  function callerSocketsBack(callerId) {
    for (const ring of rings.values()) {
      if (ring.callerId === callerId && ring.lostTimer) {
        clearTimer(ring.lostTimer);
        ring.lostTimer = null;
      }
    }
  }

  function getRing(callUuid) {
    return rings.get(callUuid) || null;
  }

  function ringingFor(callerId, calleeId) {
    return findByPair(callerId, calleeId);
  }

  function size() {
    return rings.size;
  }

  function reset() {
    for (const ring of rings.values()) clearTimers(ring);
    rings.clear();
  }

  return {
    ringStarted,
    endRing,
    endRingByPair,
    endRingByUuid,
    callerSocketsGone,
    callerSocketsBack,
    getRing,
    ringingFor,
    size,
    reset,
  };
}

module.exports = {
  RING_TIMEOUT_MS,
  CALLER_LOST_GRACE_MS,
  OUTCOMES,
  CALLKIT_REASON,
  LEGACY_EVENT,
  createRingFanout,
};
