/**
 * Server voice link recovery (voice-drops, Nov 2026). Pure helpers used by
 * hooks/useServerVoice.js; tested by serverVoiceRecovery.selftest.mjs.
 *
 * - A socket reconnect re-takes the same seat (`server:voice:joined` with
 *   `rejoin`): the roster is merged, never replaced, so remote screen shares,
 *   cameras and audio streams survive, and no join sound plays.
 * - Mesh peers heal with ICE restarts (2 / 4 / 8 / 15 s) instead of being
 *   dropped from the roster when the peer connection fails.
 * - An offer from a brand-new remote peer connection (other DTLS fingerprint)
 *   replaces the old one; reusing the dead connection added ~6.5 s of silence.
 */

/** Media and local-only fields a rejoin must keep on an existing roster entry. */
export const REJOIN_KEEP_FIELDS = Object.freeze([
  "stream",
  "cameraStream",
  "screenStream",
  "cameraAnnounced",
  "hasAudio",
  "linkTrouble",
]);

/**
 * Roster after a rejoin: the server list decides who is there; entries we
 * already had keep their media. People who left during the outage are dropped.
 */
export function mergeRejoinRoster(prev, others) {
  const list = Array.isArray(others) ? others : [];
  const byId = new Map((Array.isArray(prev) ? prev : []).map((p) => [String(p?.id), p]));
  return list
    .filter((u) => u && u.id != null)
    .map((u) => {
      const existing = byId.get(String(u.id));
      if (!existing) return { ...u, hasAudio: true };
      const next = { ...existing, ...u, id: existing.id };
      for (const key of REJOIN_KEEP_FIELDS) {
        if (existing[key] !== undefined) next[key] = existing[key];
      }
      // A share we still receive stays on screen even if the seat payload lags.
      if (existing.screenStream && existing.isScreenSharing) next.isScreenSharing = true;
      if (next.hasAudio === undefined) next.hasAudio = true;
      return next;
    });
}

/** All `a=fingerprint:` values of an SDP, sorted (one per transport). */
export function sdpFingerprints(sdp) {
  if (typeof sdp !== "string") return [];
  const out = [];
  for (const line of sdp.split(/\r\n|\n/)) {
    const m = line.match(/^a=fingerprint:\s*(\S+)\s+(\S+)/i);
    if (m) out.push(`${m[1].toLowerCase()} ${m[2].toUpperCase()}`);
  }
  return [...new Set(out)].sort();
}

/**
 * True when `offerSdp` comes from a different remote RTCPeerConnection than the
 * one `currentRemoteSdp` described (new certificate). An ICE restart or a
 * renegotiation of the same connection keeps the fingerprint.
 */
export function isNewRemoteSession(currentRemoteSdp, offerSdp) {
  const before = sdpFingerprints(currentRemoteSdp);
  const after = sdpFingerprints(offerSdp);
  if (!before.length || !after.length) return false;
  return before.join("|") !== after.join("|");
}

/**
 * Perfect negotiation roles: exactly one side of a pair is polite. The polite
 * side rolls back its own offer on glare; the impolite side ignores the other.
 */
export function isPoliteSide(myId, peerId) {
  return String(myId ?? "") > String(peerId ?? "");
}

export const ICE_RESTART_DELAYS_MS = Object.freeze([2000, 4000, 8000, 15000]);
/** After this long in trouble the connection is rebuilt from scratch. */
export const PEER_REBUILD_AFTER_MS = 60_000;
/** A `disconnected` link gets this long to come back by itself first. */
export const DISCONNECTED_GRACE_MS = 2500;

/** Delay before ICE restart attempt `attempt` (0-based); the last one repeats. */
export function iceRestartDelay(attempt) {
  const i = Math.max(0, Math.min(ICE_RESTART_DELAYS_MS.length - 1, Number(attempt) || 0));
  return ICE_RESTART_DELAYS_MS[i];
}

/**
 * What to do when a mesh peer connection changes state.
 * Returns one of:
 *   { action: "healthy" }                        connected again: reset
 *   { action: "wait" }                           nothing to do yet
 *   { action: "restart", delayMs }               ICE restart after delayMs
 *   { action: "rebuild" }                        close it and build a new one
 * `politeDelayMs` staggers the two sides so they rarely restart at once.
 */
export function peerLinkDecision({
  state,
  troubleSinceMs = null,
  nowMs = Date.now(),
  attempt = 0,
  polite = false,
  politeDelayMs = 1500,
} = {}) {
  if (state === "connected") return { action: "healthy" };
  if (state === "new" || state === "connecting" || state === "closed") return { action: "wait" };
  if (state !== "disconnected" && state !== "failed") return { action: "wait" };
  if (troubleSinceMs != null && nowMs - troubleSinceMs >= PEER_REBUILD_AFTER_MS) return { action: "rebuild" };
  const base = state === "disconnected" && attempt === 0 ? DISCONNECTED_GRACE_MS : iceRestartDelay(attempt);
  return { action: "restart", delayMs: base + (polite ? politeDelayMs : 0) };
}

/** Telemetry result for a session that ended because the server dropped it. */
export function dropResultFor(reason) {
  const r = String(reason || "").toLowerCase();
  if (!r) return "dropped";
  if (/^(kick|kicked|ban|banned)$/.test(r)) return "kicked";
  if (r === "afk") return "afk";
  if (r === "timeout") return "timedout";
  return "dropped";
}

/** Short lowercase token for telemetry (no digits, no ids). */
export function dropReasonToken(reason) {
  const s = String(reason || "").toLowerCase().replace(/[^a-z_-]/g, "").slice(0, 32);
  return /^[a-z][a-z_-]*$/.test(s) ? s : "unknown";
}

/* ---------------------------------------------------- LiveKit (SFU) drops (server-voice-06) */

/** livekit-client DisconnectReason numbers used below. */
export const LK_REASON = Object.freeze({
  CLIENT_INITIATED: 1,
  DUPLICATE_IDENTITY: 2,
  PARTICIPANT_REMOVED: 4,
  ROOM_DELETED: 5,
  ROOM_CLOSED: 10,
});

/**
 * What to do when the LiveKit room disconnects while we still hold the seat:
 *   "none"         we left on purpose
 *   "other-device" the same account connected elsewhere: leave locally
 *   "rejoin-later" removed / room gone: give a moderator force-disconnect a
 *                  moment to arrive first, then re-take the seat
 *   "rejoin"       network / server trouble: re-take the seat (new token) now
 */
export function liveKitDropAction(reason) {
  const r = Number(reason);
  if (r === LK_REASON.CLIENT_INITIATED) return "none";
  if (r === LK_REASON.DUPLICATE_IDENTITY) return "other-device";
  if (r === LK_REASON.PARTICIPANT_REMOVED || r === LK_REASON.ROOM_DELETED || r === LK_REASON.ROOM_CLOSED) return "rejoin-later";
  return "rejoin";
}

export const LIVEKIT_RETRY_WINDOW_MS = 120_000;
export const LIVEKIT_RETRY_MAX = 3;

/** Retry budget: at most LIVEKIT_RETRY_MAX re-joins per window. Returns the kept attempts and whether one more is allowed. */
export function liveKitRetryBudget(attempts, nowMs = Date.now()) {
  const kept = (Array.isArray(attempts) ? attempts : []).filter((t) => nowMs - t < LIVEKIT_RETRY_WINDOW_MS);
  return { kept, allowed: kept.length < LIVEKIT_RETRY_MAX };
}

/* ------------------------------------------- user-facing reasons (server-voice-22 / -25) */

/** svoice.* key telling the user why the server took them out of voice. */
export function dropMessageKey(reason, { byUserId = null } = {}) {
  const r = String(reason || "").toLowerCase();
  if (r === "other_device") return "svoice.dropOtherDevice";
  if (r === "timeout") return "svoice.dropTimeout";
  if (r === "kick" || r === "kicked") return "svoice.dropKick";
  if (r === "ban" || r === "banned") return "svoice.dropBan";
  if (r === "channel_deleted") return "svoice.dropChannelDeleted";
  if (r === "server_deleted") return "svoice.dropServerDeleted";
  if (r === "disconnected") return "svoice.dropConnection";
  if (r === "afk") return "svoice.dropAfk";
  if (r === "not_member" || r === "no_access" || r === "missing_permission") return "svoice.dropNoAccess";
  if (r === "livekit_lost") return "svoice.mediaLost";
  if (!r && byUserId) return "svoice.dropByMod";
  return "callui.voice.disconnected";
}

/** svoice.* key for a force-move (AFK or a moderator); null when nothing needs saying. */
export function moveMessageKey(reason, { byUserId = null } = {}) {
  if (String(reason || "").toLowerCase() === "afk") return "svoice.movedAfk";
  if (byUserId) return "svoice.movedByMod";
  return null;
}

/** Why an unmute is refused: AFK channel, no SPEAK, or a moderator's server mute. */
export function unmuteDeniedKey({ afkChannel = false, canSpeak = true, modMuted = false } = {}) {
  if (afkChannel) return "svoice.unmuteAfk";
  if (!modMuted && canSpeak === false) return "svoice.unmuteNoSpeak";
  return "svoice.unmuteServerMuted";
}
