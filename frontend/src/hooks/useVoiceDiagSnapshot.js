import { useEffect, useRef } from "react";
import { getIceConfigStatus, getLivePeerConnections } from "../lib/iceConfig";
import { getNoiseSuppressionDiagnostics, getNoiseSuppressionOutputTrack } from "../lib/noiseSuppression";
import { captureVoiceDiagnostics } from "../lib/voiceDiagnostics";

export const VOICE_DIAG_INTERVAL_MS = 4000;

/**
 * Voice diagnostic snapshot for call feedback (lib/voiceDiagnostics.js) in
 * mesh calls: group calls and server voice. Every 4 s while `active`, over
 * every live peer connection (default: every RTCPeerConnection this tab has
 * open, see iceConfig.trackPeerConnection). The last snapshot outlives the
 * call, so a "my voice keeps cutting" report filed right after hanging up
 * still carries the engine, fallback, levels and uplink loss.
 *
 * DM calls have their own snapshot in useCall (single pc, kind "dm").
 */
export function useVoiceDiagSnapshot({ active, kind, muted, getPeers, getLocalTrack } = {}) {
  const live = useRef({ muted, getPeers, getLocalTrack });
  live.current = { muted, getPeers, getLocalTrack };
  useEffect(() => {
    if (!active) return undefined;
    const take = () => {
      const { muted: uiMuted, getPeers: peers, getLocalTrack: track } = live.current;
      let pcs = [];
      try {
        pcs = (peers ? peers() : getLivePeerConnections()) || [];
      } catch {
        pcs = [];
      }
      let localTrack = null;
      try {
        localTrack = (track ? track() : null) || getNoiseSuppressionOutputTrack() || null;
      } catch {
        localTrack = null;
      }
      void captureVoiceDiagnostics({
        pcs,
        localTrack,
        uiMuted: typeof uiMuted === "boolean" ? uiMuted : undefined,
        ns: getNoiseSuppressionDiagnostics(),
        ice: getIceConfigStatus(),
        kind,
      }).catch(() => {});
    };
    take();
    const id = setInterval(take, VOICE_DIAG_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, kind]);
}
