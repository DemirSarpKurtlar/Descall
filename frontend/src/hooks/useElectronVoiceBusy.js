import { useEffect } from "react";
import { deriveVoiceBusy, publishVoiceBusy } from "../lib/voiceBusy";

/**
 * Tells the Electron main process whether a voice session is in progress so
 * a downloaded update is not installed mid-call. No-ops on web and iOS
 * (Capacitor), where `window.electronAPI` is absent.
 *
 * Busy is true for a DM call (incoming ring, outgoing, active), a group call
 * (in the call or incoming ring), and a server voice/stage channel (joined
 * or still connecting). Main resets the flag if this renderer crashes or
 * reloads; `beforeunload` also clears it so a reload cannot leave a stale
 * "busy" that blocks updates forever.
 */
export function useElectronVoiceBusy({ call, groupCall, serverVoice } = {}) {
  const busy = deriveVoiceBusy({ call, groupCall, serverVoice });

  useEffect(() => {
    publishVoiceBusy(busy);
    if (typeof window === "undefined" || !window.electronAPI?.isElectron) return undefined;
    try {
      window.electronAPI.setVoiceBusy?.(busy);
    } catch {
      /* bridge gone */
    }
    return undefined;
  }, [busy]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI?.isElectron) return undefined;
    const clear = () => {
      publishVoiceBusy(false);
      try {
        window.electronAPI.setVoiceBusy?.(false);
      } catch {
        /* bridge gone */
      }
    };
    window.addEventListener("beforeunload", clear);
    return () => {
      window.removeEventListener("beforeunload", clear);
      clear();
    };
  }, []);
}

export default useElectronVoiceBusy;
