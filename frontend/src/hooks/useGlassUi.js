import { useSyncExternalStore } from "react";
import { isGlassUiEnabled, subscribeGlassUi } from "../lib/glassUi";

/**
 * True when the Liquid Glass UI is on (iPhone app only; see lib/glassUi.js).
 * Components branch their JSX on this; with glass off they must render exactly
 * the pre-2.9.151 tree so web / desktop / Android stay identical.
 */
export function useGlassUi() {
  return useSyncExternalStore(subscribeGlassUi, isGlassUiEnabled, () => false);
}

export default useGlassUi;
