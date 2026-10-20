/**
 * Participant tile lifecycle for DM and group calls — pure, unit-tested.
 *
 * One tile element per participant id for the whole call. Connection
 * trouble is a STATE of that tile (dim + blur + spinner overlay), never a
 * different element: the old DM slot swapped participant ↔ placeholder via
 * AnimatePresence mode="wait", so every ICE blip remounted the tile (avatar
 * flash, video re-attach, layout jump). Only a real leave removes the tile.
 */
import { SPRINGS, framerSpring, REDUCED_MOTION_FADE } from "./fluid/springs.js";

/** Leaver's tile fade + scale out. */
export const TILE_LEAVE_MS = 380;
/** "Arama sona erdi" pill appears after the leaver's tile has mostly gone. */
export const CALL_END_PILL_DELAY_MS = 260;
/** The whole overlay fades out from here until CALL_ENDING_MS (useCall). */
export const CALL_END_FADE_AT_MS = 650;

/**
 * DM remote tile phase.
 * hidden | connecting | live | reconnecting | leaving
 *  - connecting: answered, media not flowing yet (first time only)
 *  - live: media has flowed at least once and the link is fine
 *  - reconnecting: the link is in trouble AFTER it was live — same tile, overlay
 *  - leaving: the call ended — exit transition, then hidden
 */
export function dmTilePhase({ mode, hasPeer, everLive, status, ending }) {
  if (ending) return hasPeer || everLive ? "leaving" : "hidden";
  if (mode !== "active" || !hasPeer) return "hidden";
  const troubled = status === "reconnecting" || status === "lost" || status === "disconnected";
  if (!everLive) return "connecting";
  return troubled ? "reconnecting" : "live";
}

/** Map useCall's peerConnectionState / quality to the debouncer vocabulary. */
export function dmRawStatus({ mode, peerConnectionState, remoteMediaReady, connectionQuality }) {
  if (mode !== "active") return "connecting";
  if (peerConnectionState === "ended") return "connected";
  if (peerConnectionState === "disconnected" || connectionQuality === "failed") return "lost";
  if (peerConnectionState === "reconnecting") return "reconnecting";
  if (!remoteMediaReady) return "connecting";
  return "connected";
}

/** Group tile: is this participant's link in trouble right now? */
export function groupTileTroubled(participant) {
  if (!participant) return false;
  const s = participant.connectionState || participant.peerConnectionState || null;
  const q = participant.connectionQuality || null;
  return (
    s === "reconnecting" ||
    s === "disconnected" ||
    s === "failed" ||
    q === "reconnecting" ||
    q === "failed"
  );
}

/** Should the reconnect overlay show? Debounced status in, boolean out. */
export function showReconnectOverlay(phaseOrStatus) {
  return phaseOrStatus === "reconnecting" || phaseOrStatus === "lost";
}

/**
 * framer-motion variants for a participant grid cell (`cell`, opacity +
 * blur — grid cells must stay transform-free) and its inner wrapper
 * (`inner`, scale). Apple-style: critically damped springs; leaving = fade +
 * slight scale-down with a soft blur; reduced motion = plain crossfade
 * (apple-design.md §14).
 */
export function tileMotion({ reduced = false } = {}) {
  if (reduced) {
    return {
      cell: {
        enter: { opacity: 0 },
        shown: { opacity: 1, transition: REDUCED_MOTION_FADE },
        leave: { opacity: 0, transition: REDUCED_MOTION_FADE },
      },
      inner: { enter: {}, shown: {}, leave: {} },
    };
  }
  const leaveSpring = framerSpring({ dampingRatio: 1, response: (TILE_LEAVE_MS / 1000) * 0.8 });
  return {
    cell: {
      enter: { opacity: 0, filter: "blur(6px)" },
      shown: { opacity: 1, filter: "blur(0px)", transition: framerSpring(SPRINGS.materialize) },
      leave: {
        opacity: 0,
        filter: "blur(6px)",
        transition: { type: "tween", duration: TILE_LEAVE_MS / 1000, ease: [0.4, 0, 0.2, 1] },
      },
    },
    inner: {
      enter: { scale: 0.94 },
      shown: { scale: 1, transition: framerSpring(SPRINGS.materialize) },
      leave: { scale: 0.9, transition: leaveSpring },
    },
  };
}

/** Reads prefers-reduced-motion safely (SSR / old WebViews). */
export function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/**
 * Status chip under the DM peer's name (2.13.6): derived from the same
 * debounced phase as the tile, so it can never say "Bağlandı" while the tile
 * is reconnecting (or the other way round).
 */
export function dmChipStatus(phase, connectionStatus) {
  if (phase === "reconnecting" || connectionStatus === "reconnecting") return "reconnecting";
  if (connectionStatus === "lost" || connectionStatus === "disconnected") return "disconnected";
  return "connected";
}
