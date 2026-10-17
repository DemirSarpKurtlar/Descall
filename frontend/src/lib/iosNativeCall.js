/**
 * Native iOS DM call (answered on the CallKit screen while the app was in the
 * background, locked or killed). The audio runs in Swift (DescallNativeCall);
 * this module mirrors its state for the in-app card and forwards the card's
 * buttons. Inert on web, Electron and Android.
 */
import { IOS_NATIVE, callKitPlugin, tapCallKitEvents } from "./iosCallKit";
import { createNativeCallStore } from "./iosNativeCallState";

const store = createNativeCallStore();

export const getNativeCallSnapshot = store.get;
export const subscribeNativeCall = store.subscribe;
export const isNativeCallActive = () => store.get().active;

export function refreshNativeCall() {
  if (!IOS_NATIVE || typeof callKitPlugin.getNativeCall !== "function") return Promise.resolve(store.get());
  return callKitPlugin
    .getNativeCall()
    .then((res) => {
      if (res?.lastMetrics && Object.keys(res.lastMetrics).length) {
        console.info("[NativeCall] last call metrics", res.lastMetrics);
      }
      return store.set(res);
    })
    .catch(() => store.get());
}

export function nativeHangup() {
  const s = store.get();
  if (!IOS_NATIVE || !s.active) return Promise.resolve();
  return callKitPlugin.nativeHangup({ uuid: s.uuid }).catch(() => {});
}

export function nativeSetMuted(muted) {
  const s = store.get();
  if (!IOS_NATIVE || !s.active) return Promise.resolve();
  return callKitPlugin.nativeSetMuted({ uuid: s.uuid, muted: Boolean(muted) }).catch(() => {});
}

if (IOS_NATIVE) {
  tapCallKitEvents((name, data) => {
    if (name === "nativeCall") {
      store.set(data);
      if (data?.metrics?.answerToAudioMs != null) {
        console.info("[NativeCall] time-to-audio", data.metrics.answerToAudioMs, "ms", data.metrics);
      }
    } else if (name === "reset") {
      store.set(null);
    }
  });
  void refreshNativeCall();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void refreshNativeCall();
    });
  }
}
