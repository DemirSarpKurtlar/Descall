// Liquid Glass gate + native display mapping (2.9.151). Run: node src/lib/glassUi.selftest.mjs
import assert from "node:assert/strict";
import {
  shouldEnableGlass,
  isNativeIosShell,
  initGlassUi,
  applyRemoteGlassFlag,
  isGlassUiEnabled,
  GLASS_CLASS,
  GLASS_REMOTE_KEY,
  GLASS_OVERRIDE_KEY,
} from "./glassUi.js";
import { deviceTier, liteReasons, isJanky, statusBarStyleFor } from "./glassDisplay.js";

const phone = { isNativeIos: true, shortSide: 440 };

// ── Gate: iPhone app only ──
assert.equal(shouldEnableGlass(phone), true, "iPhone app → glass");
assert.equal(shouldEnableGlass({ ...phone, isNativeIos: false }), false, "web without a viewport stays off");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 390, viewportShortSide: 390 }), true, "phone web defaults on");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 430, viewportShortSide: 430 }), true, "430px web on");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 844, viewportShortSide: 390 }), true, "phone landscape web on");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 800, viewportShortSide: 800 }), false, "desktop window under 960 but not phone-like stays off");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 1024, viewportShortSide: 768 }), false, "desktop width is not glass-ui");
assert.equal(shouldEnableGlass({ isNativeIos: false, isElectron: true, viewportWidth: 390, viewportShortSide: 390 }), false, "Electron stays on glass-desktop");
assert.equal(shouldEnableGlass({ isNativeIos: false, isNativeAndroid: true, viewportWidth: 390, viewportShortSide: 390 }), false, "Android app never");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 390, viewportShortSide: 390, webRemoteFlag: false }), false, "desktopGlass remote kills phone web");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 390, viewportShortSide: 390, webOverride: "0" }), false, "descall:glass-desktop=0 kills phone web");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 390, viewportShortSide: 390, override: "0" }), false, "descall:glass=0 kills phone web");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 390, viewportShortSide: 390, webBuildFlag: false }), false, "VITE_GLASS_DESKTOP=0 kills phone web");
assert.equal(shouldEnableGlass({ isNativeIos: false, viewportWidth: 390, viewportShortSide: 390, buildFlag: false }), false, "VITE_GLASS_UI=0 kills phone web");
assert.equal(
  shouldEnableGlass({ isNativeIos: false, viewportWidth: 390, viewportShortSide: 390, webOverride: "1", webRemoteFlag: false }),
  true,
  "local on beats a remote kill on phone web"
);
assert.equal(shouldEnableGlass({ ...phone, isElectron: true }), false, "Electron → never");
assert.equal(shouldEnableGlass({ ...phone, shortSide: 744 }), false, "iPad → not yet (mockups are iPhone)");
assert.equal(shouldEnableGlass({ ...phone, shortSide: 0 }), false, "unknown screen → off");
assert.equal(shouldEnableGlass({ ...phone, shortSide: 375 }), true, "small iPhone → glass");
assert.equal(shouldEnableGlass({ ...phone, buildFlag: false }), false, "VITE_GLASS_UI=0 kills it");
assert.equal(shouldEnableGlass({ ...phone, remoteFlag: false }), false, "remote iosGlass=false kills it");
assert.equal(shouldEnableGlass({ ...phone, override: "0" }), false, "local override off");
assert.equal(shouldEnableGlass({ ...phone, remoteFlag: false, override: "1" }), true, "QA override on");
assert.equal(shouldEnableGlass({ isNativeIos: false, shortSide: 440, override: "1" }), false, "override never enables glass off iOS");

// ── Capacitor detection ──
const capWin = (platform, native = true) => ({ Capacitor: { getPlatform: () => platform, isNativePlatform: () => native } });
assert.equal(isNativeIosShell(capWin("ios")), true);
assert.equal(isNativeIosShell(capWin("android")), false);
assert.equal(isNativeIosShell(capWin("ios", false)), false, "Capacitor web build is not the app");
assert.equal(isNativeIosShell({}), false);
assert.equal(isNativeIosShell(null), false);

// ── init + remote kill switch on a fake window ──
function fakeWindow({ platform = "ios", native = true, w = 440, h = 956, store = {} } = {}) {
  const classes = new Set();
  return {
    ...capWin(platform, native),
    screen: { width: w, height: h },
    innerWidth: w,
    innerHeight: h,
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
          remove: (...names) => names.forEach((c) => classes.delete(c)),
        },
      },
    },
    _classes: classes,
    _store: store,
  };
}
const win = fakeWindow();
assert.equal(initGlassUi(win), true);
assert.ok(win._classes.has(GLASS_CLASS), "html.glass-ui set before first paint");
assert.equal(applyRemoteGlassFlag(false, win), false, "remote off → class removed");
assert.ok(!win._classes.has(GLASS_CLASS));
assert.equal(win._store[GLASS_REMOTE_KEY], "0", "remote value cached for next cold start");
assert.equal(applyRemoteGlassFlag(undefined, win), false, "older server without the flag changes nothing");
const next = fakeWindow({ store: { [GLASS_REMOTE_KEY]: "0" } });
assert.equal(initGlassUi(next), false, "cached kill switch respected on boot");
assert.equal(applyRemoteGlassFlag(true, next), true);
assert.equal(isGlassUiEnabled(), true);
const qa = fakeWindow({ store: { [GLASS_OVERRIDE_KEY]: "0" } });
assert.equal(initGlassUi(qa), false, "local override off");
const androidWin = fakeWindow({ platform: "android" });
assert.equal(initGlassUi(androidWin), false);
assert.ok(!androidWin._classes.has(GLASS_CLASS), "Android never gets the class");
const phoneWeb = fakeWindow({ platform: "web", native: false, w: 390, h: 844 });
assert.equal(initGlassUi(phoneWeb), true, "phone web boots glass-ui");
assert.ok(phoneWeb._classes.has(GLASS_CLASS));
phoneWeb._store["descall:glass-desktop-remote"] = "0";
assert.equal(initGlassUi(phoneWeb), false, "cached desktopGlass kill wins on the next phone-web boot");
assert.ok(!phoneWeb._classes.has(GLASS_CLASS));

// ── Device tier / lite material ──
assert.equal(deviceTier("iPhone10,3"), "low", "iPhone X (A11)");
assert.equal(deviceTier("iPhone9,1"), "low");
assert.equal(deviceTier("iPhone11,8"), "mid", "XR (A12)");
assert.equal(deviceTier("iPhone13,2"), "mid", "12 (A14)");
assert.equal(deviceTier("iPhone14,5"), "high", "13 (A15)");
assert.equal(deviceTier("iPhone18,2"), "high");
assert.equal(deviceTier("x86_64"), "high", "simulator / unknown");
assert.deepEqual(liteReasons({}), []);
assert.deepEqual(liteReasons({ lowPower: true }), ["lowPower"]);
assert.deepEqual(liteReasons({ thermal: "fair" }), []);
assert.deepEqual(liteReasons({ thermal: "serious" }), ["thermal"]);
assert.deepEqual(liteReasons({ thermal: "critical", tier: "low", jank: true }), ["thermal", "device", "jank"]);
assert.equal(isJanky(Array(200).fill(16.7)), false, "smooth 60 Hz");
assert.equal(isJanky(Array(119).fill(50)), false, "too few samples");
assert.equal(isJanky([...Array(170).fill(16.7), ...Array(30).fill(40)]), true, "15 % slow frames → lite");
assert.equal(isJanky([...Array(190).fill(8.3), ...Array(10).fill(40)]), false, "5 % slow frames ok");

// ── Status bar follows the theme scheme ──
assert.equal(statusBarStyleFor("light"), "dark", "light theme → black status bar content");
assert.equal(statusBarStyleFor(" dark"), "light");
assert.equal(statusBarStyleFor(""), "light");

console.log("glassUi.selftest ok");
