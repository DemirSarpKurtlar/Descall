import { useEffect, useState, useSyncExternalStore } from "react";
import { effectiveLevel, getPrefsSnapshot, prefKey, subscribePrefs } from "../lib/notifyPrefs";

/**
 * 'all' | 'mentions' | 'none' for one chat (messaging phase 4), live: it also
 * flips back when a timed mute runs out.
 */
export default function useNotifyLevel(convType, convId) {
  const pref = useSyncExternalStore(subscribePrefs, () => (convId ? getPrefsSnapshot()[prefKey(convType, convId)] || null : null), () => null);
  const [now, setNow] = useState(() => Date.now());
  const until = pref?.mutedUntil ? Date.parse(pref.mutedUntil) : NaN;
  useEffect(() => {
    if (!Number.isFinite(until) || until <= Date.now()) return undefined;
    const id = setTimeout(() => setNow(Date.now()), Math.min(until - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [until]);
  return effectiveLevel(pref, now);
}
