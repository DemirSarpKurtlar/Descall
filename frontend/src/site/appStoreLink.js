/** App Store id of the iOS app (also in public/invite-preview.js and index.html; selftests keep them equal). */
export const APP_STORE_ID = "6820558264";

/** Public App Store listing for the iOS app. */
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/**
 * iOS Smart App Banner for indexable marketing pages (Safari only). Not on the noindex app
 * shells (the Pages worker removes it there) and never in the native app (strip-smart-banner.mjs).
 */
export const SMART_APP_BANNER_META = `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}" />`;

/** True for iPhone / iPod / iPad (iPadOS reports a Mac UA with touch). */
export function isAppleMobileUa(ua, maxTouchPoints = 0) {
  const s = String(ua || "");
  if (/iPhone|iPod|iPad/i.test(s)) return true;
  return /Macintosh/i.test(s) && Number(maxTouchPoints) > 1;
}
