// Tablet layout gate: one phone/desktop decision for useMobile, glass-ui and glass-desktop.
import assert from "node:assert/strict";
import { deviceFormFactor, isPhoneLayout, readDeviceLayout, PHONE_LAYOUT_MAX_WIDTH } from "./deviceLayout.js";
import { shouldEnableGlass } from "./glassUi.js";
import { shouldEnableGlassDesktop } from "./glassDesktop.js";
import { shouldShowUserVoicePanel } from "./userVoicePanel.js";

const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID_TAB = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

assert.equal(PHONE_LAYOUT_MAX_WIDTH, 768, "same breakpoint as PHONE_LAYOUT_QUERY / mobile.css");

// Form factor
assert.equal(deviceFormFactor({ userAgent: IPAD, screenShort: 820 }), "tablet", "iPad UA (iPad mini, Split View WebView)");
assert.equal(deviceFormFactor({ userAgent: MAC, maxTouchPoints: 5, screenShort: 1024 }), "tablet", "desktop-class iPad (Mac UA + touch)");
assert.equal(deviceFormFactor({ userAgent: MAC, maxTouchPoints: 0, screenShort: 900 }), "desktop", "real Mac");
assert.equal(deviceFormFactor({ userAgent: MAC, screenShort: 1024, nativePlatform: "ios" }), "tablet", "iPad app");
assert.equal(deviceFormFactor({ userAgent: IPHONE, screenShort: 430, nativePlatform: "ios" }), "phone", "iPhone app");
assert.equal(deviceFormFactor({ userAgent: IPHONE, screenShort: 0 }), "phone", "iPhone Safari before layout");
assert.equal(deviceFormFactor({ userAgent: ANDROID_TAB, screenShort: 800 }), "tablet", "Android tablet browser");
assert.equal(deviceFormFactor({ userAgent: ANDROID_TAB, screenShort: 800, nativePlatform: "android" }), "tablet", "Android tablet app");
assert.equal(deviceFormFactor({ userAgent: ANDROID_PHONE, screenShort: 412, nativePlatform: "android" }), "phone", "Android phone app");
assert.equal(deviceFormFactor({ userAgent: ANDROID_PHONE, screenShort: 412 }), "phone", "Android phone browser");
assert.equal(deviceFormFactor({ userAgent: WIN, maxTouchPoints: 10, screenShort: 1080 }), "desktop", "touch laptop stays desktop");
assert.equal(deviceFormFactor({ userAgent: IPAD, isElectron: true }), "desktop", "Electron is always desktop");

// Layout: phones always phone; tablets by window width only
assert.equal(isPhoneLayout({ formFactor: "phone", width: 932 }), true, "iPhone landscape");
assert.equal(isPhoneLayout({ formFactor: "tablet", width: 1366 }), false, "iPad Pro 12.9 landscape -> desktop");
assert.equal(isPhoneLayout({ formFactor: "tablet", width: 1024 }), false, "iPad Pro 12.9 portrait -> desktop");
assert.equal(isPhoneLayout({ formFactor: "tablet", width: 834 }), false, "iPad Pro 11 portrait -> desktop");
assert.equal(isPhoneLayout({ formFactor: "tablet", width: 981 }), false, "Split View 2/3 -> desktop");
assert.equal(isPhoneLayout({ formFactor: "tablet", width: 768 }), true, "768 is the last phone width");
assert.equal(isPhoneLayout({ formFactor: "tablet", width: 744 }), true, "iPad mini portrait -> phone");
assert.equal(isPhoneLayout({ formFactor: "tablet", width: 678 }), true, "Split View 1/2 -> phone");
assert.equal(isPhoneLayout({ formFactor: "tablet", width: 320 }), true, "Split View 1/3 / Slide Over -> phone");
assert.equal(isPhoneLayout({ formFactor: "desktop", width: 900 }), false);
assert.equal(isPhoneLayout({ formFactor: "desktop", width: 700 }), true);

const fakeWin = ({ ua = MAC, touch = 5, w, h, sw, sh, cap = null }) => ({
  innerWidth: w, innerHeight: h, screen: { width: sw, height: sh },
  navigator: { userAgent: ua, maxTouchPoints: touch },
  Capacitor: cap ? { getPlatform: () => cap, isNativePlatform: () => true } : undefined,
});
// Keyboard: iOS resizes-content shrinks the height; the layout must not flip.
const kb = readDeviceLayout(fakeWin({ w: 981, h: 430, sw: 1024, sh: 1366, cap: "ios" }));
assert.equal(kb.phoneLayout, false, "keyboard-shortened Split View 2/3 keeps the desktop layout");
assert.equal(readDeviceLayout(fakeWin({ w: 678, h: 1024, sw: 1024, sh: 1366, cap: "ios" })).phoneLayout, true);
assert.equal(readDeviceLayout(fakeWin({ ua: IPHONE, w: 932, h: 430, sw: 430, sh: 932, cap: "ios" })).phoneLayout, true);

// Glass gates agree with the layout: exactly one class per window, never both, never neither.
for (const [w, phone] of [[1366, false], [1194, false], [834, false], [744, true], [678, true], [320, true]]) {
  const ios = { isNativeIos: true, shortSide: 1024, isTablet: true, tabletPhoneLayout: phone, viewportWidth: w };
  const gu = shouldEnableGlass(ios);
  const gd = shouldEnableGlassDesktop({ isNativeIos: true, isNativeIosTablet: true, tabletPhoneLayout: phone });
  assert.equal(gu, phone, `iPad app ${w}: glass-ui only in the phone layout`);
  assert.equal(gd, !phone, `iPad app ${w}: glass-desktop only in the desktop layout`);
  const and = shouldEnableGlass({ isNativeAndroid: true, shortSide: 800, isTablet: true, tabletPhoneLayout: phone });
  const andD = shouldEnableGlassDesktop({ isNativeAndroid: true, isNativeAndroidTablet: true, tabletPhoneLayout: phone });
  assert.equal(and, phone, `Android tablet app ${w}: glass-ui`);
  assert.equal(andD, !phone, `Android tablet app ${w}: glass-desktop`);
  const web = shouldEnableGlass({ isTablet: true, tabletPhoneLayout: phone, viewportWidth: w, viewportShortSide: Math.min(w, 1024) });
  const webD = shouldEnableGlassDesktop({ tabletPhoneLayout: phone, viewportOk: !phone });
  assert.equal(web, phone, `iPad Safari ${w}: glass-ui`);
  assert.equal(webD, !phone, `iPad Safari ${w}: glass-desktop`);
}
// Kill switches still win for the tablet phone layout.
assert.equal(shouldEnableGlass({ isNativeIos: true, shortSide: 1024, isTablet: true, tabletPhoneLayout: true, override: "0" }), false);
assert.equal(shouldEnableGlassDesktop({ isNativeIos: true, isNativeIosTablet: true, tabletPhoneLayout: false, remoteFlag: false }), false);
// Electron ignores the tablet flag.
assert.equal(shouldEnableGlassDesktop({ isElectron: true, tabletPhoneLayout: true }), true);

// User + voice panel: tablet app in the desktop layout, like Electron.
assert.equal(shouldShowUserVoicePanel({ isMobile: false, glassShell: false, native: true, nativeTablet: true }), true);
assert.equal(shouldShowUserVoicePanel({ isMobile: true, glassShell: true, native: true, nativeTablet: true }), false);

console.log("deviceLayout selftest ok");
