import { Capacitor } from "@capacitor/core";

/** True inside the native Capacitor iOS app (not iOS Safari / PWA). */
export function isNativeIOS() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}
