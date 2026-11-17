/**
 * Voice room tiles = the live participants (media, speaking, streams) merged with the
 * server's seat list for the channel (server:voice:channel-state). The seat list carries
 * the real profile: name, avatar, Market 2.0 voice tile and join sound, chat cosmetics.
 * Participants that only came from a media event were placeholders ("Member", no avatar,
 * no skin), and a cosmetic equipped mid-call never reached the tile (server-voice-04 / 18).
 * Seats with no participant yet (joined a moment ago, or a listener that publishes no
 * mic) still get a tile.
 */

export const ROSTER_PROFILE_KEYS = [
  "username",
  "displayName",
  "display_name",
  "avatarUrl",
  "avatar_url",
  "equippedVoiceTile",
  "equippedJoinSound",
  "equippedAvatarFrame",
  "equippedBadge",
  "equippedTitle",
  "equippedCountry",
  "equippedSpecialBadge",
  "equippedNameEffect",
  "equippedAvatarEffect",
  "equippedChatBubble",
  "equippedPresenceFlare",
  "equippedProfileColor",
];

function profileOf(seat) {
  const out = {};
  for (const key of ROSTER_PROFILE_KEYS) {
    if (seat[key] !== undefined && seat[key] !== null && seat[key] !== "") out[key] = seat[key];
  }
  return out;
}

export function mergeVoiceRoster(participants, seats, { selfId = null } = {}) {
  const list = Array.isArray(participants) ? participants.filter((p) => p && p.id != null) : [];
  const seatList = Array.isArray(seats) ? seats.filter((s) => s && s.id != null) : [];
  if (!seatList.length) return list;
  const self = selfId != null ? String(selfId) : null;
  const byId = new Map(seatList.map((s) => [String(s.id), s]));
  const seen = new Set();
  const merged = list.map((p) => {
    const id = String(p.id);
    seen.add(id);
    const seat = byId.get(id);
    return seat ? { ...p, ...profileOf(seat) } : p;
  });
  for (const seat of seatList) {
    const id = String(seat.id);
    if (seen.has(id) || (self && id === self)) continue;
    merged.push({ ...seat, id: seat.id });
  }
  return merged;
}
