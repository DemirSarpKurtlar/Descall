import { useCallback, useEffect, useSyncExternalStore } from "react";
import { IOS_NATIVE } from "../lib/iosCallKit";
import {
  getIosAudioRouteSnapshot,
  refreshIosAudioRoute,
  selectIosAudioRoute,
  subscribeIosAudioRoute,
} from "../lib/iosAudioRoute";

const noopSubscribe = () => () => {};
const getNull = () => null;

/**
 * Native iOS AVAudioSession routes (receiver / speaker / Bluetooth / headset)
 * for the in-call device menus (lib/callDeviceMenus.js), shared by DM, group
 * and server voice hooks. Group calls and voice channels used to fall back to
 * enumerateDevices() rows there, which WKWebView leaves empty and whose
 * setSinkId does nothing: picking the earpiece in a voice channel did nothing.
 * Inert (null) off native iOS.
 */
export function useIosAudioRoute(active = true) {
  const snap = useSyncExternalStore(
    IOS_NATIVE ? subscribeIosAudioRoute : noopSubscribe,
    IOS_NATIVE ? getIosAudioRouteSnapshot : getNull,
    IOS_NATIVE ? getIosAudioRouteSnapshot : getNull
  );
  useEffect(() => {
    if (IOS_NATIVE && active) void refreshIosAudioRoute();
  }, [active]);
  const selectIosRoute = useCallback((id) => {
    void selectIosAudioRoute(id);
  }, []);
  return { iosAudioRoute: IOS_NATIVE ? snap : null, selectIosRoute };
}
