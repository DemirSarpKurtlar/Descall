import { useEffect, useRef, useState } from "react";
import { createStatusDebouncer } from "../lib/callConnectionMachine";
import { TILE_LEAVE_MS, dmRawStatus, dmTilePhase } from "../lib/callTileState";

export const DM_PARTICIPANT_EXIT_MS = TILE_LEAVE_MS;

export function deriveDmConnectionStatus({
  mode,
  peerConnectionState,
  remoteMediaReady,
  connectionQuality,
}) {
  if (mode !== "active") return null;
  if (peerConnectionState === "disconnected" || connectionQuality === "failed") {
    return "disconnected";
  }
  if (peerConnectionState === "reconnecting") return "reconnecting";
  if (!remoteMediaReady) return "connecting";
  return "connected";
}

const STATUS_LABEL = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  lost: "Reconnecting…",
  disconnected: "Disconnected",
};

export function getConnectionStatusLabel(status) {
  return status ? STATUS_LABEL[status] || null : null;
}

/**
 * DM remote tile: one stable tile per peer for the whole call.
 * - Status is debounced (700 ms in, 500 ms out) so a short ICE blip never
 *   flashes "Yeniden bağlanıyor…".
 * - Once media has flowed, trouble is the "reconnecting" phase of the same
 *   tile (overlay), never the connecting placeholder again.
 * - `ending` (useCall's hang-up transition) flips the phase to "leaving":
 *   the slot unmounts inside AnimatePresence, which plays the exit.
 */
export function useDmRemoteParticipant({
  peer,
  mode,
  remoteMediaReady,
  peerConnectionState,
  connectionQuality,
  ending = null,
}) {
  const debouncerRef = useRef(null);
  if (!debouncerRef.current) debouncerRef.current = createStatusDebouncer({ initial: "connecting" });
  const [status, setStatus] = useState("connecting");
  const [everLive, setEverLive] = useState(false);
  const snapshotRef = useRef(null);
  const peerId = peer?.id ?? null;

  if (peer) snapshotRef.current = peer;

  // New call / new peer: fresh state.
  useEffect(() => {
    if (mode === "active" && peerId) return;
    if (ending) return;
    debouncerRef.current = createStatusDebouncer({ initial: "connecting" });
    setStatus("connecting");
    setEverLive(false);
    snapshotRef.current = null;
  }, [mode, peerId, ending]);

  useEffect(() => {
    if (mode === "active" && peerId && remoteMediaReady && !ending) setEverLive(true);
  }, [mode, peerId, remoteMediaReady, ending]);

  const raw = dmRawStatus({ mode, peerConnectionState, remoteMediaReady, connectionQuality });
  useEffect(() => {
    const d = debouncerRef.current;
    const now = Date.now();
    setStatus(d.push(raw, now));
    const wait = d.pendingMs(now);
    if (wait == null) return undefined;
    const timer = setTimeout(() => setStatus(d.tick(Date.now())), wait + 10);
    return () => clearTimeout(timer);
  }, [raw]);

  const phase = dmTilePhase({
    mode,
    hasPeer: Boolean(peer || snapshotRef.current),
    everLive,
    status,
    ending,
  });

  const displayPeer = peer || snapshotRef.current;
  // "leaving" unmounts the slot at once; the grid's AnimatePresence plays the
  // exit (fade + scale + blur) and springs the local tile into the free space.
  const showSlot = Boolean(displayPeer) && phase !== "hidden" && phase !== "leaving";

  return {
    showSlot,
    displayPeer,
    phase,
    connectionStatus: status,
    isMediaReady: everLive,
  };
}
