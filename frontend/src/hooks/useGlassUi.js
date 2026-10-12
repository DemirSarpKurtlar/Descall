import { useSyncExternalStore } from "react";
import { isGlassUiEnabled, subscribeGlassUi } from "../lib/glassUi";

/**
 * True when the Liquid Glass phone UI is on (native iPhone, or mobile web
 * under 960px when desktop glass is allowed). See lib/glassUi.js.
 * Components branch their JSX on this; with glass off they must render the
 * classic tree so desktop, Android, and iPad stay identical.
 */
export function useGlassUi() {
  return useSyncExternalStore(subscribeGlassUi, isGlassUiEnabled, () => false);
}

export default useGlassUi;
