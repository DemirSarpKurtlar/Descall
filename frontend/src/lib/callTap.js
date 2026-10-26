/**
 * 3.0.0 (C3): what a tap on a call notification does. Pure (unit-tested in
 * callTap.selftest.mjs / resolveCallTap.selftest.mjs).
 *
 *  DM ring:
 *   - this device already shows the ring from that caller  → "accept" (connects directly)
 *   - already in the call with that peer                    → "open-call"
 *   - push older than the ring window (60 s)               → "ended" ("Arama sona erdi" + "Geri ara")
 *   - otherwise (cold start, offer not here yet)            → "await-ring": open the DM, ask the
 *     server for the ring and accept as soon as the offer arrives; "ended" if it never does.
 *  Group call (never auto-joins on a body tap):
 *   - a live call banner for that group                     → "group-join" (the "Aramaya katıl" card)
 *   - push older than GROUP_CALL_FRESH_MS without a banner  → "group-ended"
 *   - otherwise                                              → "group-await" (banner may still be loading)
 */

export const DM_RING_WINDOW_MS = 60_000;
export const GROUP_CALL_FRESH_MS = 3 * 60 * 60 * 1000;
export const CALL_TAP_ACTION = "call-tap";

function str(value) {
  return value == null ? "" : String(value);
}

export function callTapKind(data = {}) {
  const kind = str(data.callKind);
  if (kind === "dm" || kind === "group") return kind;
  const type = str(data.type);
  if (type === "call") return "dm";
  if (type === "group-call") return "group";
  return "";
}

/** A body tap (not an Answer / Decline / Join button) on a call notification. */
export function isCallTap(data = {}) {
  return Boolean(callTapKind(data)) && str(data.action) === CALL_TAP_ACTION;
}

export function resolveCallTap({
  data = {},
  now = Date.now(),
  dm = {},
  groupBanner = null,
  groupIncoming = null,
} = {}) {
  const kind = callTapKind(data);
  const callType = str(data.callType) === "video" ? "video" : "voice";
  const startedAt = Number(data.startedAt) || 0;
  const age = startedAt > 0 ? Math.max(0, now - startedAt) : null;

  if (kind === "dm") {
    const peerId = str(data.fromId || data.conversationId);
    if (!peerId) return { action: "none" };
    const callUuid = str(data.callUuid).toLowerCase() || null;
    const sameUuid = !callUuid || !dm.callUuid || str(dm.callUuid).toLowerCase() === callUuid;
    const samePeer = str(dm.peerId) === peerId;
    if (samePeer && dm.mode === "incoming" && sameUuid) return { action: "accept", kind, peerId, callType, callUuid };
    if (samePeer && (dm.mode === "active" || dm.mode === "outgoing")) return { action: "open-call", kind, peerId, callType, callUuid };
    if (age != null && age > DM_RING_WINDOW_MS) return { action: "ended", kind, peerId, callType, callUuid };
    return { action: "await-ring", kind, peerId, callType, callUuid };
  }

  if (kind === "group") {
    const groupId = str(data.groupId);
    if (!groupId) return { action: "none" };
    const base = { kind, groupId, groupName: str(data.groupName) || null, callType };
    if (groupIncoming && str(groupIncoming.groupId) === groupId) return { action: "group-join", ...base, source: "incoming" };
    if (groupBanner && str(groupBanner.groupId) === groupId) return { action: "group-join", ...base, source: "banner" };
    if (age != null && age > GROUP_CALL_FRESH_MS) return { action: "group-ended", ...base };
    return { action: "group-await", ...base };
  }

  return { action: "none" };
}

/** Map a push action id / payload to the tap action (nativePush + service worker). */
export function notificationTapAction({ actionId = "", data = {}, ios = false } = {}) {
  const id = str(actionId);
  if (id === "accept" || id === "answer" || id === "JOIN") return "answer";
  if (id === "decline" || id === "DECLINE") return "decline";
  if (callTapKind(data)) return CALL_TAP_ACTION;
  return ios ? "open" : str(data.action) || "open";
}
