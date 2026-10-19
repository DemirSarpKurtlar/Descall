/** Public App Store listing for the iOS app. */
export const APP_STORE_URL = "https://apps.apple.com/app/id6820558264";

/** True for iPhone / iPod / iPad (iPadOS reports a Mac UA with touch). */
export function isAppleMobileUa(ua, maxTouchPoints = 0) {
  const s = String(ua || "");
  if (/iPhone|iPod|iPad/i.test(s)) return true;
  return /Macintosh/i.test(s) && Number(maxTouchPoints) > 1;
}
