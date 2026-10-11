// Desktop/web Liquid Glass gate. Run: node src/lib/glassDesktop.selftest.mjs
import assert from "node:assert/strict";
import {
  shouldEnableGlassDesktop,
  shouldUseGlassDesktopLite,
  readGlassDesktopQuery,
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

assert.equal(shouldEnableGlassDesktop(web), false, "web stays off without a flag");
assert.equal(shouldEnableGlassDesktop({ ...web, remoteFlag: true }), true, "remote desktopGlass turns web on");
assert.equal(shouldEnableGlassDesktop({ ...web, override: "1" }), true, "local override turns web on");
assert.equal(shouldEnableGlassDesktop({ ...web, remoteFlag: true, override: "0" }), false, "local off wins");
assert.equal(shouldEnableGlassDesktop({ ...web, override: "1", buildFlag: false }), false, "build flag kills it");
assert.equal(shouldEnableGlassDesktop({ ...web, override: "1", viewportOk: false }), false, "narrow web stays off");
assert.equal(shouldEnableGlassDesktop({ isElectron: true, viewportOk: false, override: "1" }), true, "Electron ignores the width gate");
assert.equal(shouldEnableGlassDesktop({ ...web, isNativeIos: true, override: "1" }), false, "iPhone never");
assert.equal(shouldEnableGlassDesktop({ ...web, isNativeAndroid: true, remoteFlag: true }), false, "Android never");
assert.equal(shouldEnableGlassDesktop({ ...web, remoteFlag: false }), false, "explicit remote off");

assert.equal(readGlassDesktopQuery("?glass-desktop=1"), "1");
assert.equal(readGlassDesktopQuery("?gd=0"), "0");
assert.equal(readGlassDesktopQuery("?glass=desktop"), null);
assert.equal(readGlassDesktopQuery(""), null);

assert.equal(shouldUseGlassDesktopLite({}), false, "a fast machine stays glassy");
assert.equal(shouldUseGlassDesktopLite({ cores: 4 }), true, "4 cores → lite");
assert.equal(shouldUseGlassDesktopLite({ cores: 4, manual: "0" }), false, "manual off beats the CPU trigger");
assert.equal(shouldUseGlassDesktopLite({ manual: "1" }), true, "manual on");
assert.equal(shouldUseGlassDesktopLite({ reducedTransparency: true, manual: "0" }), true, "reduced transparency wins");
assert.equal(shouldUseGlassDesktopLite({ forcedColors: true, manual: "0" }), true, "forced colors wins");
assert.equal(shouldUseGlassDesktopLite({ fpsLow: true }), true, "slow frames → lite");

const cap = (platform, native = true) => ({
  Capacitor: { getPlatform: () => platform, isNativePlatform: () => native },
});
assert.equal(nativeShellPlatform(cap("ios")), "ios");
assert.equal(nativeShellPlatform(cap("android")), "android");
assert.equal(nativeShellPlatform(cap("ios", false)), null);
assert.equal(nativeShellPlatform({}), null);

function fakeWindow({ platform = null, width = 1440, store = {}, search = "" } = {}) {
  const classes = new Set();
  const win = {
    innerWidth: width,
    navigator: { hardwareConcurrency: 8 },
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
assert.equal(initGlassDesktop(off), false);
assert.ok(!off._classes.has(GLASS_DESKTOP_CLASS), "class stays off");

const qa = fakeWindow({ search: "?glass-desktop=1" });
assert.equal(initGlassDesktop(qa), true, "query param enables glass");
assert.ok(qa._classes.has(GLASS_DESKTOP_CLASS));
assert.equal(qa._store[GLASS_DESKTOP_OVERRIDE_KEY], "1", "query is remembered");
assert.equal(isGlassDesktopEnabled(), true);

const ios = fakeWindow({ platform: "ios", search: "?glass-desktop=1" });
assert.equal(initGlassDesktop(ios), false);
assert.ok(!ios._classes.has(GLASS_DESKTOP_CLASS), "iOS app never gets the desktop class");

const android = fakeWindow({ platform: "android", store: { [GLASS_DESKTOP_REMOTE_KEY]: "1" } });
assert.equal(initGlassDesktop(android), false);

const cached = fakeWindow({ store: { [GLASS_DESKTOP_REMOTE_KEY]: "1" } });
assert.equal(initGlassDesktop(cached), true, "cached remote on is respected");
assert.equal(applyRemoteGlassDesktopFlag(false, cached), false, "remote kill switch");
assert.equal(cached._store[GLASS_DESKTOP_REMOTE_KEY], "0");
assert.ok(!cached._classes.has(GLASS_DESKTOP_CLASS));
assert.equal(applyRemoteGlassDesktopFlag(undefined, cached), false, "non-boolean is ignored");

const forced = fakeWindow({ store: { [GLASS_DESKTOP_OVERRIDE_KEY]: "1", [GLASS_DESKTOP_LITE_KEY]: "1" } });
assert.equal(initGlassDesktop(forced), true);
assert.equal(isGlassDesktopLite(), true);
assert.ok(forced._classes.has(GLASS_DESKTOP_LITE_CLASS));
assert.equal(setGlassDesktopLiteManual(false, forced), false);
assert.equal(forced._store[GLASS_DESKTOP_LITE_KEY], "0");
assert.ok(!forced._classes.has(GLASS_DESKTOP_LITE_CLASS));

const narrow = fakeWindow({ width: 800, search: "?gd=1" });
assert.equal(initGlassDesktop(narrow), false, "phone-width web ignores the flag");

console.log("glassDesktop.selftest.mjs ok");
