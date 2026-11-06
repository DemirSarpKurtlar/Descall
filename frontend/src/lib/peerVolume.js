/**
 * Playback level of the person on the other end of a DM call (0..2, 1 = 100%).
 *
 * Before (useCall): the level lived in a ref that was only overwritten when the
 * new peer had a remembered level. A peer you never adjusted inherited the
 * previous call's level: turn friend A down to 30% (or mute them), hang up,
 * call friend B, and B played at 30% (or silent) while the menu showed 100%.
 * Nothing reset it at the end of a call either.
 *
 * Now every peer starts from their own remembered level, else 100%.
 */
import { clampGain, readParticipantGain, writeParticipantGain } from "./voiceProfile.js";

export function createPeerVolume({ read = readParticipantGain, write = writeParticipantGain } = {}) {
  let level = 1;
  let last = 1; // level to restore on unmute

  return {
    /** A call with `peerId` starts (null = no call): their remembered level, else 100%. */
    forPeer(peerId) {
      const stored = peerId == null ? null : read(peerId);
      level = stored == null ? 1 : clampGain(stored);
      last = level > 0 ? level : 1;
      return level;
    },
    /** The user moved the slider: applied now and remembered for this peer. */
    set(peerId, volume) {
      const safe = clampGain(volume);
      if (safe > 0) last = safe;
      level = safe;
      if (peerId != null) write(peerId, safe);
      return safe;
    },
    /** Mute remembers the level, unmute restores it. */
    toggleMute(peerId) {
      return this.set(peerId, level > 0.001 ? 0 : last || 1);
    },
    level: () => level,
    lastAudible: () => last,
    reset() {
      level = 1;
      last = 1;
    },
  };
}
