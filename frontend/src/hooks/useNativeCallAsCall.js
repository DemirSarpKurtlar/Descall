import { useMemo, useSyncExternalStore } from "react";
import { getNativeCallSnapshot, nativeHangup, nativeSetMuted, subscribeNativeCall } from "../lib/iosNativeCall";
import { nativeCallAdapterKey, nativeCallAsCall } from "../lib/nativeCallAdapter";
import { useIosAudioRoute } from "./useIosAudioRoute";

/**
 * The iOS call answered on CallKit / the lock screen (runs in Swift, useCall idle)
 * as a useCall-shaped value, or null. App.jsx hands it to the full-screen
 * CallOverlay, the phone "Ada" pill, the Live Activity and Siri when no web call
 * is live, so the native call gets the same full screen, minimize / restore and
 * controls. The caller's face and name come from the friends list.
 */
export function useNativeCallAsCall(friends) {
  const snap = useSyncExternalStore(subscribeNativeCall, getNativeCallSnapshot, getNativeCallSnapshot);
  const live = useIosAudioRoute(Boolean(snap.active));
  // Dev-only visual QA (no native shell in the browser): a fake route snapshot.
  const qaRoute = import.meta.env?.DEV && typeof window !== "undefined" ? window.__DESCALL_QA_ROUTE__ || null : null;
  const iosAudioRoute = live.iosAudioRoute || qaRoute;
  const selectIosRoute = live.selectIosRoute;
  const peer = useMemo(
    () => (snap.active ? (friends || []).find((f) => String(f?.id) === String(snap.callerId)) || null : null),
    [snap.active, snap.callerId, friends]
  );
  const key = nativeCallAdapterKey(snap, peer, iosAudioRoute);
  return useMemo(
    () =>
      nativeCallAsCall(snap, {
        peer,
        route: iosAudioRoute,
        selectRoute: selectIosRoute,
        setMuted: nativeSetMuted,
        hangup: nativeHangup,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, selectIosRoute]
  );
}

export default useNativeCallAsCall;
