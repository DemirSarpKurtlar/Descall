import { useEffect, useRef } from "react";
import { voiceSessionsOf, voiceSessionsToEnd } from "../lib/voiceSessionGuard.js";

/**
 * Keeps one voice session per device: joining a server voice channel ends the DM call /
 * leaves the group call, and placing or accepting a call leaves the voice channel
 * (lib/voiceSessionGuard.js). Runs on every platform.
 */
export function useVoiceSessionGuard({ call, groupCall, serverVoice } = {}) {
  const prevRef = useRef(null);
  const latest = useRef({ call, groupCall, serverVoice });
  latest.current = { call, groupCall, serverVoice };
  const next = voiceSessionsOf({ call, groupCall, serverVoice });
  const key = `${next.dm ? 1 : 0}${next.group ? 1 : 0}${next.server ? 1 : 0}:${next.serverChannelId}`;

  useEffect(() => {
    const now = voiceSessionsOf(latest.current);
    const end = voiceSessionsToEnd(prevRef.current, now);
    prevRef.current = now;
    if (!end.length) return;
    const { call: c, groupCall: g, serverVoice: s } = latest.current;
    for (const which of end) {
      try {
        if (which === "server") s?.leave?.();
        else if (which === "dm") c?.endCall?.(c?.peer?.id);
        else if (which === "group") g?.leaveCall?.();
      } catch (err) {
        console.warn("[voice] could not end the other session:", err?.message || err);
      }
    }
  }, [key]);
}

export default useVoiceSessionGuard;
