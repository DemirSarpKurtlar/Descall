import { isNativeIOS } from "./platform";

/**
 * Light impact haptic in the iOS app (Capacitor Haptics → UIImpactFeedbackGenerator).
 * Web, PWA and Electron: no-op. The plugin is loaded lazily so the web bundle
 * never pays for it; primeHaptics() loads it ahead of time so a later
 * hapticLight() reaches the native side in the same frame as the visual.
 */
let plugin = null;
let loading = null;

export function primeHaptics() {
  if (!isNativeIOS()) return Promise.resolve(null);
  if (!loading) {
    loading = import("@capacitor/haptics")
      .then((mod) => {
        plugin = mod;
        return mod;
      })
      .catch(() => null); /* plugin missing in an old shell — silently skip */
  }
  return loading;
}

export function hapticLight() {
  if (!isNativeIOS()) return;
  const fire = (mod) => {
    try {
      mod?.Haptics.impact({ style: mod.ImpactStyle.Light })?.catch?.(() => {});
    } catch {
      /* ignore */
    }
  };
  if (plugin) fire(plugin);
  else primeHaptics().then(fire);
}
