// Desktop/web Liquid Glass gate. Run: node src/lib/glassDesktop.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  shouldEnableGlassDesktop,
  shouldUseGlassDesktopLite,
  resolveReducedTransparency,
  shouldCountGlassFrame,
  isGlassFrameRateLow,
  reportsBucketedCores,
  GLASS_FRAME_SAMPLES,
  readGlassDesktopQuery,
  isGlassDesktopSurface,
  shouldPreviewDesktopAuth,
  nativeShellPlatform,
  initGlassDesktop,
  applyRemoteGlassDesktopFlag,
  isGlassDesktopEnabled,
  setGlassDesktopLiteManual,
  isGlassDesktopLite,
  GLASS_DESKTOP_CLASS,
  GLASS_DESKTOP_LITE_CLASS,
  GLASS_DESKTOP_OVERRIDE_KEY,
  GLASS_DESKTOP_REMOTE_KEY,
  GLASS_DESKTOP_LITE_KEY,
} from "./glassDesktop.js";

const web = { isElectron: false, viewportOk: true };

assert.equal(shouldEnableGlassDesktop(web), true, "web defaults on at desktop width");
assert.equal(shouldEnableGlassDesktop({ ...web, remoteFlag: true }), true, "remote desktopGlass turns web on");
assert.equal(shouldEnableGlassDesktop({ ...web, override: "1" }), true, "local override turns web on");
assert.equal(shouldEnableGlassDesktop({ ...web, remoteFlag: true, override: "0" }), false, "local off wins");
assert.equal(shouldEnableGlassDesktop({ ...web, buildFlag: false }), false, "build flag kills the default");
assert.equal(shouldEnableGlassDesktop({ ...web, override: "1", buildFlag: false }), false, "build flag kills it");
assert.equal(shouldEnableGlassDesktop({ ...web, viewportOk: false }), false, "narrow web stays off");
assert.equal(shouldEnableGlassDesktop({ ...web, override: "1", viewportOk: false }), false, "narrow web stays off even with the flag");
assert.equal(shouldEnableGlassDesktop({ isElectron: true, viewportOk: false }), true, "Electron defaults on without the width gate");
assert.equal(shouldEnableGlassDesktop({ isElectron: true, surfaceOk: false }), true, "Electron logout to / keeps the glass sign-in sheet");
assert.equal(shouldEnableGlassDesktop({ isElectron: true, surfaceOk: false, override: "0" }), false, "Electron kill switch still wins on /");
assert.equal(shouldEnableGlassDesktop({ isElectron: true, viewportOk: false, override: "1" }), true, "Electron ignores the width gate");
assert.equal(shouldEnableGlassDesktop({ ...web, isNativeIos: true, override: "1" }), false, "iPhone never");
// Native iPad app: wide Liquid Glass layout (was the pre-glass theme before).
assert.equal(shouldEnableGlassDesktop({ isNativeIos: true, isNativeIosTablet: true }), true, "iPad app gets glass");
assert.equal(shouldEnableGlassDesktop({ isNativeIos: true, isNativeIosTablet: true, viewportOk: false, surfaceOk: false }), true, "iPad app ignores web width / marketing gates");
assert.equal(shouldEnableGlassDesktop({ isNativeIos: true, isNativeIosTablet: true, remoteFlag: false }), false, "remote desktopGlass=false kills iPad");
assert.equal(shouldEnableGlassDesktop({ isNativeIos: true, isNativeIosTablet: true, override: "0" }), false, "local kill on iPad");
assert.equal(shouldEnableGlassDesktop({ isNativeIos: true, isNativeIosTablet: true, buildFlag: false }), false, "build kill on iPad");
assert.equal(shouldEnableGlassDesktop({ isNativeAndroid: true, isNativeIosTablet: true }), false, "Android phone app is glass-ui, not glass-desktop");
assert.equal(shouldEnableGlassDesktop({ ...web, isNativeAndroid: true, remoteFlag: true }), false, "Android phone never gets glass-desktop");
assert.equal(shouldEnableGlassDesktop({ isNativeAndroid: true, isNativeAndroidTablet: true, viewportOk: false }), true, "Android tablet app gets the wide glass layout like the iPad app");
assert.equal(shouldEnableGlassDesktop({ isNativeAndroid: true, isNativeAndroidTablet: true, remoteFlag: false }), false, "remote kill on Android tablet");
assert.equal(shouldEnableGlassDesktop({ isNativeAndroid: true, isNativeAndroidTablet: true, override: "0" }), false, "local kill on Android tablet");
assert.equal(shouldEnableGlassDesktop({ ...web, remoteFlag: false }), false, "explicit remote off");
assert.equal(shouldEnableGlassDesktop({ ...web, override: "1", surfaceOk: false }), false, "marketing pages stay off");
assert.equal(isGlassDesktopSurface("/"), false, "home is marketing");
assert.equal(isGlassDesktopSurface("/privacy"), false, "privacy page stays marketing");
assert.equal(isGlassDesktopSurface("/login"), true, "login is the auth preview");
assert.equal(isGlassDesktopSurface("/direct"), true, "app routes are in scope");
assert.equal(shouldPreviewDesktopAuth({ pathname: "/login", search: "?glass-desktop=1" }), true);
assert.equal(shouldPreviewDesktopAuth({ pathname: "/login", override: "1" }), true);
assert.equal(shouldPreviewDesktopAuth({ pathname: "/", search: "?glass-desktop=1" }), false);
assert.equal(shouldPreviewDesktopAuth({ pathname: "/register", search: "?gd=0" }), false);

assert.equal(readGlassDesktopQuery("?glass-desktop=1"), "1");
assert.equal(readGlassDesktopQuery("?gd=0"), "0");
assert.equal(readGlassDesktopQuery("?glass=desktop"), null);
assert.equal(readGlassDesktopQuery(""), null);

assert.equal(resolveReducedTransparency({ media: true }), true, "web trusts the media query");
assert.equal(
  resolveReducedTransparency({ isElectron: true, media: true, native: false }),
  false,
  "Electron ignores a stuck reduce query"
);
assert.equal(
  resolveReducedTransparency({ isElectron: true, media: false, native: true }),
  false,
  "Windows DWM transparency off must not flatten in-page glass"
);
assert.equal(
  resolveReducedTransparency({ isElectron: true, media: true, native: true }),
  false,
  "Electron does not drop blur when both transparency signals say reduce"
);
assert.equal(shouldCountGlassFrame({ hidden: true, deltaMs: 16 }), false, "hidden frames do not count");
assert.equal(shouldCountGlassFrame({ hidden: false, deltaMs: 800 }), false, "a stall is not a slow GPU");
assert.equal(shouldCountGlassFrame({ hidden: false, deltaMs: 16 }), true, "a visible frame counts");
assert.equal(shouldCountGlassFrame({ hidden: false, deltaMs: 0 }), false, "the first timestamp is a baseline");
const main = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../electron/main.cjs"), "utf8");
assert.match(main, /disable-features',\s*'CalculateNativeWinOcclusion'/);
assert.match(main, /Frameless windows are often marked occluded/);
assert.equal(shouldUseGlassDesktopLite({}), false, "a fast machine stays glassy");
assert.equal(shouldUseGlassDesktopLite({ cores: 4 }), true, "4 cores → lite");
assert.equal(shouldUseGlassDesktopLite({ cores: 4, manual: "0" }), false, "manual off beats the CPU trigger");
assert.equal(shouldUseGlassDesktopLite({ manual: "1" }), true, "manual on");
assert.equal(shouldUseGlassDesktopLite({ reducedTransparency: true, manual: "0" }), true, "reduced transparency wins");
assert.equal(shouldUseGlassDesktopLite({ forcedColors: true, manual: "0" }), true, "forced colors wins");
assert.equal(shouldUseGlassDesktopLite({ fpsLow: true }), true, "slow frames → lite");

// iPad: WebKit reports 4 for every device under 8 cores (NavigatorBase.cpp),
// so "4" is a bucket, not a slow machine. Native iPad + iPad Safari stay glassy.
const IPAD_SAFARI_UA = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WKWEBVIEW_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const ELECTRON_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Descall/3.9.0 Chrome/138.0.0.0 Electron/37.0.0 Safari/537.36";
assert.equal(reportsBucketedCores({ isNativeIos: true }), true, "native iOS shell is WebKit");
assert.equal(reportsBucketedCores({ userAgent: IPAD_SAFARI_UA, maxTouchPoints: 5 }), true, "iPad Safari (mobile UA)");
assert.equal(reportsBucketedCores({ userAgent: MAC_SAFARI_UA, maxTouchPoints: 5 }), true, "iPadOS desktop-class Safari (Mac UA + touch)");
assert.equal(reportsBucketedCores({ userAgent: WKWEBVIEW_UA, maxTouchPoints: 5 }), true, "WKWebView (no Safari token)");
assert.equal(reportsBucketedCores({ userAgent: MAC_SAFARI_UA, maxTouchPoints: 0 }), true, "Mac Safari is WebKit too");
assert.equal(reportsBucketedCores({ userAgent: CHROME_UA }), false, "Chrome reports real cores");
assert.equal(reportsBucketedCores({ userAgent: ELECTRON_UA, isElectron: true }), false, "Electron reports real cores");
assert.equal(reportsBucketedCores({ userAgent: ELECTRON_UA }), false, "Electron UA alone is Chromium");
assert.equal(shouldUseGlassDesktopLite({ cores: 4, coresReliable: false }), false, "iPad's bucketed 4 is not a slow machine");
assert.equal(shouldUseGlassDesktopLite({ cores: 4, coresReliable: true }), true, "a real 4-core Chromium machine still goes lite");
assert.equal(shouldUseGlassDesktopLite({ cores: 4, coresReliable: false, fpsLow: true }), true, "iPad keeps the measured low-fps fallback");
assert.equal(shouldUseGlassDesktopLite({ cores: 4, coresReliable: false, reducedTransparency: true }), true, "iPad Reduce Transparency still drops blur");
assert.equal(shouldUseGlassDesktopLite({ cores: 4, coresReliable: false, manual: "1" }), true, "Settings › Görünüm still forces lite on iPad");

// Frame verdict: median of visible frames, not a 45-frame mean.
const frames = (n, ms) => Array.from({ length: n }, () => ms);
assert.equal(isGlassFrameRateLow(frames(GLASS_FRAME_SAMPLES, 16.7)), false, "60 Hz is fast");
assert.equal(isGlassFrameRateLow(frames(GLASS_FRAME_SAMPLES, 8.3)), false, "120 Hz ProMotion is fast");
assert.equal(isGlassFrameRateLow(frames(GLASS_FRAME_SAMPLES, 33.4)), false, "Low Power Mode 30 fps stays glass");
assert.equal(isGlassFrameRateLow(frames(GLASS_FRAME_SAMPLES, 55)), true, "a sustained ~18 fps is slow");
assert.equal(isGlassFrameRateLow(frames(20, 60)), false, "too few samples is no verdict");
assert.equal(
  isGlassFrameRateLow([...frames(60, 16.7), ...frames(30, 90)]),
  false,
  "boot long tasks (a third of the frames at 90 ms) do not latch lite"
);
assert.equal(isGlassFrameRateLow(frames(GLASS_FRAME_SAMPLES, 400)), false, "stalls (hidden WKWebView) are not frames");

const cap = (platform, native = true) => ({
  Capacitor: { getPlatform: () => platform, isNativePlatform: () => native },
});
assert.equal(nativeShellPlatform(cap("ios")), "ios");
assert.equal(nativeShellPlatform(cap("android")), "android");
assert.equal(nativeShellPlatform(cap("ios", false)), null);
assert.equal(nativeShellPlatform({}), null);

function fakeWindow({ platform = null, width = 1440, height = 900, store = {}, search = "", cores = 8, ua = "", touch = 0 } = {}) {
  const classes = new Set();
  const win = {
    innerWidth: width,
    innerHeight: height,
    navigator: { hardwareConcurrency: cores, userAgent: ua, maxTouchPoints: touch },
    location: { href: `https://descall.com/login${search}`, search, pathname: "/login", hash: "" },
    history: {
      state: null,
      replaceState(_state, _title, next) {
        win.location.search = String(next).includes("?") ? `?${String(next).split("?")[1]}` : "";
      },
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
    },
    document: {
      documentElement: {
        classList: {
          toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
          contains: (c) => classes.has(c),
        },
      },
    },
    addEventListener() {},
    matchMedia() {
      return { matches: false, addEventListener() {} };
    },
    _classes: classes,
    _store: store,
  };
  if (platform) Object.assign(win, cap(platform));
  return win;
}

const off = fakeWindow();
assert.equal(initGlassDesktop(off), true, "desktop web defaults on");
assert.ok(off._classes.has(GLASS_DESKTOP_CLASS), "class is on without a query");

const killed = fakeWindow({ store: { [GLASS_DESKTOP_OVERRIDE_KEY]: "0" } });
assert.equal(initGlassDesktop(killed), false);
assert.ok(!killed._classes.has(GLASS_DESKTOP_CLASS), "local 0 still kills the default");

const qa = fakeWindow({ search: "?glass-desktop=1" });
assert.equal(initGlassDesktop(qa), true, "query param enables glass");
assert.ok(qa._classes.has(GLASS_DESKTOP_CLASS));
assert.equal(qa._store[GLASS_DESKTOP_OVERRIDE_KEY], "1", "query is remembered");
assert.equal(isGlassDesktopEnabled(), true);

const ios = fakeWindow({ platform: "ios", width: 440, height: 956, search: "?glass-desktop=1" });
assert.equal(initGlassDesktop(ios), false);
assert.ok(!ios._classes.has(GLASS_DESKTOP_CLASS), "iPhone app never gets the desktop class");

for (const [w, h] of [[820, 1180], [1180, 820], [1133, 744], [1366, 1024]]) {
  const ipad = fakeWindow({ platform: "ios", width: w, height: h });
  assert.equal(initGlassDesktop(ipad), true, `iPad app ${w}x${h} gets Liquid Glass`);
  assert.ok(ipad._classes.has(GLASS_DESKTOP_CLASS));
}
// iPad mini portrait (744) is the phone layout (html.glass-ui), never the
// desktop class on top of the phone tree (lib/deviceLayout.js).
{
  const mini = fakeWindow({ platform: "ios", width: 744, height: 1133 });
  assert.equal(initGlassDesktop(mini), false, "iPad mini portrait takes the phone layout");
  assert.ok(!mini._classes.has(GLASS_DESKTOP_CLASS));
}

// Native iPad with WebKit's bucketed core count: full glass, not gd-lite.
for (const [w, h] of [[1194, 834], [834, 1194], [1180, 820], [820, 1180]]) {
  const ipad = fakeWindow({ platform: "ios", width: w, height: h, cores: 4, ua: WKWEBVIEW_UA, touch: 5 });
  assert.equal(initGlassDesktop(ipad), true);
  assert.ok(!ipad._classes.has(GLASS_DESKTOP_LITE_CLASS), `iPad app ${w}x${h} with 4 reported cores stays frosted`);
  assert.equal(setGlassDesktopLiteManual(true, ipad), true, "Settings › Görünüm forces lite on the iPad app");
  assert.ok(ipad._classes.has(GLASS_DESKTOP_LITE_CLASS));
}
for (const ua of [IPAD_SAFARI_UA, MAC_SAFARI_UA]) {
  const safari = fakeWindow({ width: 1180, height: 820, cores: 4, ua, touch: 5 });
  assert.equal(initGlassDesktop(safari), true, "iPad Safari gets glass-desktop");
  assert.ok(!safari._classes.has(GLASS_DESKTOP_LITE_CLASS), "iPad Safari with 4 reported cores stays frosted");
}
const slowPc = fakeWindow({ cores: 4, ua: CHROME_UA });
assert.equal(initGlassDesktop(slowPc), true);
assert.ok(slowPc._classes.has(GLASS_DESKTOP_LITE_CLASS), "a real 4-core Chrome PC keeps the CPU fallback");

const android = fakeWindow({ platform: "android", width: 412, height: 915, store: { [GLASS_DESKTOP_REMOTE_KEY]: "1" } });
assert.equal(initGlassDesktop(android), false, "Android phone app stays off glass-desktop (it is glass-ui)");
const androidTab = fakeWindow({ platform: "android", width: 1280, height: 800, store: { [GLASS_DESKTOP_REMOTE_KEY]: "1" } });
assert.equal(initGlassDesktop(androidTab), true, "Android tablet app gets glass-desktop");

const cachedOff = fakeWindow({ store: { [GLASS_DESKTOP_REMOTE_KEY]: "0" } });
assert.equal(initGlassDesktop(cachedOff), false, "cached remote off still kills the default");

const fresh = fakeWindow();
assert.equal(initGlassDesktop(fresh), true, "a later window can default on");
assert.equal(applyRemoteGlassDesktopFlag(undefined, cachedOff), false, "failed features read keeps cached remote 0");
assert.equal(applyRemoteGlassDesktopFlag(null, cachedOff), false, "null features read keeps cached remote 0");
assert.equal(cachedOff._store[GLASS_DESKTOP_REMOTE_KEY], "0", "failed read does not rewrite the cache");
assert.ok(!cachedOff._classes.has(GLASS_DESKTOP_CLASS), "failed read does not turn the class on");

const live = fakeWindow();
assert.equal(initGlassDesktop(live), true);
live._store[GLASS_DESKTOP_REMOTE_KEY] = "0";
assert.equal(applyRemoteGlassDesktopFlag(undefined, live), false, "failed read re-applies an out-of-band remote 0");
assert.equal(live._store[GLASS_DESKTOP_REMOTE_KEY], "0");
assert.ok(!live._classes.has(GLASS_DESKTOP_CLASS));

const plain = fakeWindow();
assert.equal(initGlassDesktop(plain), true);
assert.equal(applyRemoteGlassDesktopFlag(undefined, plain), true, "failed read with no cache keeps the default");
assert.equal(plain._store[GLASS_DESKTOP_REMOTE_KEY], undefined, "failed read does not invent a remote bit");

const cached = fakeWindow({ store: { [GLASS_DESKTOP_REMOTE_KEY]: "1" } });
assert.equal(initGlassDesktop(cached), true, "cached remote on is respected");
assert.equal(applyRemoteGlassDesktopFlag(false, cached), false, "remote kill switch");
assert.equal(cached._store[GLASS_DESKTOP_REMOTE_KEY], "0");
assert.ok(!cached._classes.has(GLASS_DESKTOP_CLASS));
assert.equal(applyRemoteGlassDesktopFlag(undefined, cached), false, "failed read does not clear a remote kill");
assert.equal(cached._store[GLASS_DESKTOP_REMOTE_KEY], "0");

const forced = fakeWindow({ store: { [GLASS_DESKTOP_OVERRIDE_KEY]: "1", [GLASS_DESKTOP_LITE_KEY]: "1" } });
assert.equal(initGlassDesktop(forced), true);
assert.equal(isGlassDesktopLite(), true);
assert.ok(forced._classes.has(GLASS_DESKTOP_LITE_CLASS));
assert.equal(setGlassDesktopLiteManual(false, forced), false);
assert.equal(forced._store[GLASS_DESKTOP_LITE_KEY], "0");
assert.ok(!forced._classes.has(GLASS_DESKTOP_LITE_CLASS));

const narrow = fakeWindow({ width: 390, height: 844, search: "?gd=1" });
assert.equal(initGlassDesktop(narrow), false, "phone-width web ignores the flag");
const landscape = fakeWindow({ width: 852, height: 393, search: "?gd=1" });
assert.equal(initGlassDesktop(landscape), false, "phone landscape stays on glass-ui");
// 2.10.114: a ~900×930 browser window matched neither glass gate.
const tablet = fakeWindow({ width: 900, height: 930 });
assert.equal(initGlassDesktop(tablet), true, "900×930 web window gets glass-desktop");
assert.ok(tablet._classes.has(GLASS_DESKTOP_CLASS));

console.log("glassDesktop.selftest.mjs ok");
