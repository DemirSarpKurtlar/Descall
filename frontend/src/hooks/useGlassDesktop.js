import { useSyncExternalStore } from "react";
import {
  isGlassDesktopEnabled,
  isGlassDesktopLite,
  subscribeGlassDesktop,
} from "../lib/glassDesktop";

/** True when desktop/web Liquid Glass is on. See lib/glassDesktop.js. */
export function useGlassDesktop() {
  return useSyncExternalStore(subscribeGlassDesktop, isGlassDesktopEnabled, () => false);
}

/** True when blur is replaced by a solid tint (low-performance mode). */
export function useGlassDesktopLite() {
  return useSyncExternalStore(subscribeGlassDesktop, isGlassDesktopLite, () => false);
}
