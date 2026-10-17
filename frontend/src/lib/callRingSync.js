/**
 * Stop an incoming DM ring everywhere it is showing on this machine.
 *
 * Inputs that end a ring for this tab:
 *  - server `call:ring-ended` (answered / declined on another device, caller
 *    cancelled, missed) and the legacy answered/declined-elsewhere events;
 *  - another tab of this browser profile accepting / declining (BroadcastChannel,
 *    instant even when this tab's socket is throttled or reconnecting);
 *  - the answer to `call:ring-status` after this tab's socket reconnects (it
 *    may have slept through the ring-ended event);
 *  - a local safety timeout, so nothing can ring forever.
 */

export const RING_CHANNEL = "descall-call-ring";
/** Server ends an unanswered ring at 45 s; the local guard is a bit later. */
export const INCOMING_RING_TIMEOUT_MS = 50_000;

/** Does a ring-ended style event refer to the ring this tab shows? */
export function ringEventMatches(current = {}, event = {}) {
  if (!current || current.mode !== "incoming") return false;
  const evUuid = event.callUuid ? String(event.callUuid).toLowerCase() : "";
  const curUuid = current.callUuid ? String(current.callUuid).toLowerCase() : "";
  if (evUuid && curUuid) return evUuid === curUuid;
  const from = event.fromUserId != null ? String(event.fromUserId) : "";
  const peer = current.peerId != null ? String(current.peerId) : "";
  return Boolean(from && peer && from === peer);
}

/** Turkish copy shown when a ring stops for a reason the user did not cause here. */
export function ringEndedNotice(reason) {
  switch (reason) {
    case "answered_elsewhere":
      return "Arama başka bir cihazda yanıtlandı.";
    case "declined_elsewhere":
      return "Arama başka bir cihazda reddedildi.";
    case "missed":
      return "Cevapsız arama.";
    default:
      return "";
  }
}

/**
 * BroadcastChannel wrapper. `onMessage({ type, fromUserId, callUuid })`.
 * Falls back to a no-op where BroadcastChannel is missing (old WebKit).
 */
export function createRingChannel(onMessage, { name = RING_CHANNEL, Channel } = {}) {
  const Impl = Channel || (typeof BroadcastChannel !== "undefined" ? BroadcastChannel : null);
  if (!Impl) return { post() {}, close() {} };
  let ch = null;
  try {
    ch = new Impl(name);
  } catch {
    return { post() {}, close() {} };
  }
  ch.onmessage = (event) => {
    const data = event?.data;
    if (!data || typeof data !== "object") return;
    try {
      onMessage?.(data);
    } catch {
      /* a bad listener must not break the channel */
    }
  };
  return {
    post(type, payload = {}) {
      try {
        ch.postMessage({ type, ...payload, at: Date.now() });
      } catch {
        /* closed */
      }
    },
    close() {
      try {
        ch.close();
      } catch {
        /* ignore */
      }
    },
  };
}
