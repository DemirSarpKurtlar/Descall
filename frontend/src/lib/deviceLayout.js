/**
 * One layout decision for every surface: "phone" (glass-ui shell, bottom tab
 * bar, list and conversation as separate screens) or "desktop" (glass-desktop
 * shell: nav rail, list column, main pane, side panels), the same one
 * Electron and Tauri render.
 *
 * Before this, three gates decided it separately and disagreed on tablets:
 *   - useMobile: any iPad / Android / "tablet" user agent was mobile at every
 *     width (iPad mini, Split View and Android tablet WebViews send that UA),
 *   - glassDesktop / glassUi: native iPad / Android tablet by the *screen*
 *     short side, which never changes with Split View or Stage Manager,
 *   - CSS: (max-width: 768px) for the phone layout.
 * A 744 pt iPad mini portrait or a Split View window got html.glass-desktop
 * with the phone tree (rail + list drawer floating over a dimmed pane and the
 * classic tab bar), a 1194 pt iPad landscape with an iPad UA got the desktop
 * tree marked .is-mobile.
 *
 * Now a phone is always the phone layout. A touch tablet (iPad app, iPad
 * Safari with either UA, Android tablet app or browser) follows its window
 * width with the CSS breakpoint: up to 768 px the phone layout, wider the
 * desktop layout. Width only: the iOS / Android keyboard shrinks the layout
 * viewport height (interactive-widget=resizes-content), and a layout that
 * flipped when the keyboard opened would lose the composer. Rotation, Split
 * View and Stage Manager resizes all fire `resize`, so every gate re-reads.
 *
 * Dependency-free (window.Capacitor, like lib/entryShell.js).
 */

/** Same breakpoint as PHONE_LAYOUT_QUERY and styles/mobile.css `(max-width: 768px)`. */
export const PHONE_LAYOUT_MAX_WIDTH = 768;
/** Every iPhone's short screen side is < 600 pt, every iPad's is >= 744 pt; Android tablets >= 600 dp. */
export const TABLET_MIN_SHORT_SIDE = 600;

/**
 * "phone" | "tablet" | "desktop" for the device, independent of the window size.
 * nativePlatform: "ios" | "android" | null (Capacitor shell).
 */
export function deviceFormFactor({
  userAgent = "",
  maxTouchPoints = 0,
  screenShort = 0,
  nativePlatform = null,
  isElectron = false,
} = {}) {
  if (isElectron) return "desktop";
  const ua = String(userAgent || "");
  const short = Number(screenShort) || 0;
  const smallScreen = short > 0 && short < TABLET_MIN_SHORT_SIDE;
  if (nativePlatform === "ios" || nativePlatform === "android") {
    if (short <= 0) return /iPad/.test(ua) || (/Android/i.test(ua) && !/Mobile/.test(ua)) ? "tablet" : "phone";
    return smallScreen ? "phone" : "tablet";
  }
  // iPad first: its UA also carries "Mobile/15E148".
  if (/iPad/.test(ua)) return "tablet";
  if (/iPhone|iPod/.test(ua)) return "phone";
  if (/Android/i.test(ua)) {
    // Android browsers on tablets drop "Mobile" from the UA; a small screen wins either way.
    if (smallScreen) return "phone";
    return /Mobile/.test(ua) && !(short >= TABLET_MIN_SHORT_SIDE) ? "phone" : "tablet";
  }
  // iPadOS Safari and WKWebView "desktop website" mode: Mac UA with touch points.
  if (/Macintosh/.test(ua) && Number(maxTouchPoints) > 1) return smallScreen ? "phone" : "tablet";
  if (/webOS|BlackBerry|IEMobile|Opera Mini|Windows Phone/i.test(ua)) return "phone";
  if (/\bMobile\b/.test(ua) && smallScreen) return "phone";
  return "desktop";
}

/**
 * True when the window gets the phone layout. Phones always; tablets and
 * desktop browsers up to PHONE_LAYOUT_MAX_WIDTH (desktop keeps its pre-2026
 * useMobile rule).
 */
export function isPhoneLayout({ formFactor = "desktop", width = 0 } = {}) {
  if (formFactor === "phone") return true;
  const w = Number(width) || 0;
  return w > 0 && w <= PHONE_LAYOUT_MAX_WIDTH;
}

function nativePlatformOf(win) {
  try {
    const cap = win && win.Capacitor;
    if (!cap || typeof cap.getPlatform !== "function") return null;
    if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return null;
    const p = cap.getPlatform();
    return p === "ios" || p === "android" ? p : null;
  } catch {
    return null;
  }
}

function isElectronWindow(win) {
  try {
    if (win?.electronAPI) return true;
    return /Electron\//.test(win?.navigator?.userAgent || "");
  } catch {
    return false;
  }
}

/** Screen short side in CSS px (falls back to the window when the screen is unknown). */
export function screenShortSideOf(win) {
  const scr = win?.screen || {};
  const w = Number(scr.width) || Number(win?.innerWidth) || 0;
  const h = Number(scr.height) || Number(win?.innerHeight) || 0;
  return Math.min(w, h);
}

/** Device facts plus the layout for the current window. */
export function readDeviceLayout(win = typeof window !== "undefined" ? window : null) {
  if (!win) return { formFactor: "desktop", width: 0, phoneLayout: false, tablet: false };
  const nav = win.navigator || {};
  const formFactor = deviceFormFactor({
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
    screenShort: screenShortSideOf(win),
    nativePlatform: nativePlatformOf(win),
    isElectron: isElectronWindow(win),
  });
  const width = Number(win.innerWidth) || 0;
  return { formFactor, width, phoneLayout: isPhoneLayout({ formFactor, width }), tablet: formFactor === "tablet" };
}
