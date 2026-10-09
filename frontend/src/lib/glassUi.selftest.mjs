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
assert.equal(shouldEnableGlass({ ...phone, isNativeIos: false }), false, "web / Android → never");
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
function fakeWindow({ platform = "ios", w = 440, h = 956, store = {} } = {}) {
  const classes = new Set();
  return {
    ...capWin(platform),
    screen: { width: w, height: h },
    innerWidth: w,
    innerHeight: h,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
    },
    document: { documentElement: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) } } },
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
