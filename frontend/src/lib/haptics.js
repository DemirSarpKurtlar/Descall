import { isNativeIOS } from "./platform";

/**
 * Light impact haptic in the iOS app (Capacitor Haptics → UIImpactFeedbackGenerator).
 * Web, PWA and Electron: no-op. The plugin is loaded lazily so the web bundle
 * never pays for it.
 */
export async function hapticLight() {
  if (!isNativeIOS()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* plugin missing in an old shell — silently skip */
  }
}
