/**
 * Blur-in / blur-out for framer-motion variants, skipped in the Android app.
 *
 * Animating `filter` is not composited: the Android System WebView repaints
 * the element (and re-runs any backdrop blur under it) on the main thread for
 * every frame. Android keeps the same spring on transform / opacity only;
 * iOS, web and desktop keep the blur.
 */
export function isNativeAndroidMotion(doc = typeof document !== "undefined" ? document : null) {
  try {
    return Boolean(doc?.documentElement?.classList?.contains("native-android"));
  } catch {
    return false;
  }
}

/** `{ filter: "blur(Npx)" }`, or `{}` in the Android app. */
export function motionBlur(px, doc) {
  return isNativeAndroidMotion(doc) ? {} : { filter: `blur(${px}px)` };
}
