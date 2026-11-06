/**
 * The participant pinned in the voice UI (ServerVoicePanel / CallOverlay), so
 * the Ultra per-user volume hotkeys know whose volume to change.
 */
let pinned = null;

export function setPinnedVoiceUser(userId) {
  pinned = userId == null || userId === "" ? null : String(userId);
}

export function getPinnedVoiceUser() {
  return pinned;
}
