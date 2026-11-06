/**
 * Ringback of a group call you started, while the members ring.
 *
 * Before: startGroupCall looped "outgoingCall" and only an accept / join
 * stopped it. A decline (or the callee's 30 s auto-decline), a busy member,
 * nobody answering, or the server answering "join-existing" (someone else
 * started a call in the group at the same moment) left it looping until the
 * caller hung up.
 *
 * Now it ends on the first of:
 *   answered   someone accepted or joined
 *   declined   every member that was rung declined or was busy
 *   timeout    nobody answered within GROUP_RINGBACK_MS (the DM ring length)
 *   ended      the call was left / cleaned up
 * The room itself stays open (others can still join from the banner); only
 * the tone stops. Pure: sound and timers are injected (selftest).
 */

/** Same as the server's DM ring (backend/lib/callRingFanout.js RING_TIMEOUT_MS). */
export const GROUP_RINGBACK_MS = 45_000;

export function createGroupRingback({
  play = () => {},
  stop = () => {},
  onEnd = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  timeoutMs = GROUP_RINGBACK_MS,
} = {}) {
  let ringing = false;
  let pending = null; // Set of member ids still ringing, null = unknown (server rings everyone)
  let timer = null;

  function end(reason) {
    if (!ringing) return null;
    ringing = false;
    pending = null;
    if (timer != null) clearTimer(timer);
    timer = null;
    try {
      stop();
    } catch {
      /* the tone is best effort */
    }
    try {
      onEnd(reason);
    } catch {
      /* ignore listener errors */
    }
    return reason;
  }

  /** memberIds: who the server rings (myId is left out). Empty = unknown. */
  function start(memberIds = [], myId = null) {
    end("restart");
    const me = myId == null ? null : String(myId);
    const ids = (Array.isArray(memberIds) ? memberIds : [])
      .filter((id) => id != null && String(id) !== me)
      .map(String);
    pending = ids.length ? new Set(ids) : null;
    ringing = true;
    timer = setTimer(() => {
      timer = null;
      end("timeout");
    }, timeoutMs);
    try {
      play();
    } catch {
      /* ignore */
    }
  }

  function answered() {
    return end("answered");
  }

  /** A member declined or was busy. Returns "declined" when nobody is left ringing. */
  function declined(userId) {
    if (!ringing || !pending || userId == null) return null;
    pending.delete(String(userId));
    if (pending.size === 0) return end("declined");
    return null;
  }

  return {
    start,
    answered,
    declined,
    end: (reason = "ended") => end(reason),
    isRinging: () => ringing,
    pendingCount: () => (pending ? pending.size : null),
  };
}
