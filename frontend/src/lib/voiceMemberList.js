/**
 * Who the server sidebar lists under a voice channel.
 *
 * The list used to be voiceMembers.slice(0, 12) with nothing after it: in a
 * 20-person channel the count badge said 20 but 8 people were silently
 * missing, possibly including you. Collapsed, it now shows `limit` rows (you
 * are always one of them) and a "+N more" row; expanded, everyone.
 */

export const VOICE_LIST_COLLAPSED = 12;

export function visibleVoiceMembers(members, { limit = VOICE_LIST_COLLAPSED, expanded = false, pinId = null } = {}) {
  const list = Array.isArray(members) ? members.filter((m) => m && m.id != null) : [];
  const cap = Math.max(1, Math.floor(Number(limit) || VOICE_LIST_COLLAPSED));
  if (expanded || list.length <= cap) return { shown: list, hiddenCount: 0 };
  let shown = list.slice(0, cap);
  if (pinId != null) {
    const pin = String(pinId);
    if (!shown.some((m) => String(m.id) === pin)) {
      const pinned = list.find((m) => String(m.id) === pin);
      if (pinned) shown = [...list.slice(0, cap - 1), pinned];
    }
  }
  return { shown, hiddenCount: list.length - shown.length };
}
