/**
 * Screen companion identities (iOS whole-screen sharing, docs/ios-screen-share.md).
 *
 * The iPhone / iPad app publishes a ReplayKit broadcast through a second
 * LiveKit participant, `<userId>:screen` (minted by
 * GET /api/webrtc/livekit-screen-token, backend/lib/screenCompanion.js).
 * Every client maps that participant onto its owner: its tracks are the
 * owner's screen share, it is never a member tile, speaker or quality badge.
 */

export const SCREEN_COMPANION_SUFFIX = ":screen";

export function screenCompanionIdentity(userId) {
  const uid = String(userId == null ? "" : userId).trim();
  if (!uid || uid.includes(":")) return null;
  return `${uid}${SCREEN_COMPANION_SUFFIX}`;
}

/**
 * LiveKit identity -> { userId, companion }.
 *   "u1"         -> { userId: "u1", companion: null }
 *   "u1:screen"  -> { userId: "u1", companion: "screen" }
 * Anything malformed keeps its identity as-is (never maps onto someone else).
 */
export function parseLiveKitIdentity(identity) {
  const value = String(identity == null ? "" : identity);
  if (!value) return { userId: null, companion: null };
  if (value.endsWith(SCREEN_COMPANION_SUFFIX)) {
    const owner = value.slice(0, -SCREEN_COMPANION_SUFFIX.length);
    if (owner && !owner.includes(":")) return { userId: owner, companion: "screen" };
  }
  return { userId: value, companion: null };
}

export function isScreenCompanionIdentity(identity) {
  return parseLiveKitIdentity(identity).companion === "screen";
}

/** Active speaker ids without companions (a screen broadcast never "speaks"). */
export function speakerIdsWithoutCompanions(identities) {
  const out = [];
  for (const identity of identities || []) {
    if (!identity || isScreenCompanionIdentity(identity)) continue;
    out.push(String(identity));
  }
  return out;
}

/**
 * How a subscribed LiveKit track is routed:
 *   { userId, role, ignore }
 * Companion tracks are always the owner's screen (video and any audio).
 * The local user's own companion is ignored (no self-subscription: sharing the
 * whole screen into itself would be a mirror loop and wasted bandwidth).
 */
export function routeLiveKitTrack({ identity, classifiedRole, myUserId } = {}) {
  const { userId, companion } = parseLiveKitIdentity(identity);
  if (!userId) return { userId: null, role: null, ignore: true };
  if (companion === "screen") {
    const mine = myUserId != null && String(myUserId) === userId;
    return { userId, role: "screen", ignore: mine, companion: true };
  }
  return { userId, role: classifiedRole || null, ignore: false, companion: false };
}
