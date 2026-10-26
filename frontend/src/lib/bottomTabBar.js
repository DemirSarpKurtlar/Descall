/**
 * Where the phone bottom tab bar may render.
 *
 * `.mobile-tab-bar` is only positioned (fixed, docked to the bottom) inside the
 * phone media query (styles/mobile.css, max-width: 768px); the glass bar is
 * iPhone-only (glassUi.js, short side < PHONE_MAX_SHORT_SIDE). An iPad with an
 * iPad UA is `isMobile` (useMobile UA test) but at 1024px it gets the tablet
 * layout (rail + list + main, appstore ipad13 mockups) where the rail is the
 * navigation. Rendering the bar there left an unpositioned grid item stretched
 * over the whole app root, eating every tap. Mac-UA iPads (iPadOS Safari,
 * Capacitor WKWebView) are not `isMobile` at that width and never had a bar.
 *
 * The bar fits on the phone layout width, or on any phone-sized screen (an
 * iPhone in landscape stays as before).
 */
import { PHONE_MAX_SHORT_SIDE } from "./glassUi.js";

export const PHONE_LAYOUT_QUERY = "(max-width: 768px)";

export function screenShortSide(win = typeof window !== "undefined" ? window : null) {
  const scr = win?.screen || {};
  const w = Number(scr.width) || Number(win?.innerWidth) || 0;
  const h = Number(scr.height) || Number(win?.innerHeight) || 0;
  return Math.min(w, h);
}

export function bottomTabBarFits({ phoneLayout = false, screenShort = 0 } = {}) {
  if (phoneLayout) return true;
  const s = Number(screenShort) || 0;
  return s > 0 && s < PHONE_MAX_SHORT_SIDE;
}
