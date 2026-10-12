// Desktop/web Liquid Glass gate. Run: node src/lib/glassDesktop.selftest.mjs
import assert from "node:assert/strict";
import {
  shouldEnableGlassDesktop,
  shouldUseGlassDesktopLite,
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
assert.equal(shouldEnableGlassDesktop({ isElectron: true, viewportOk: false, override: "1" }), true, "Electron ignores the width gate");
assert.equal(shouldEnableGlassDesktop({ ...web, isNativeIos: true, override: "1" }), false, "iPhone never");
assert.equal(shouldEnableGlassDesktop({ ...web, isNativeAndroid: true, remoteFlag: true }), false, "Android never");
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

const ios = fakeWindow({ platform: "ios", search: "?glass-desktop=1" });
assert.equal(initGlassDesktop(ios), false);
assert.ok(!ios._classes.has(GLASS_DESKTOP_CLASS), "iOS app never gets the desktop class");

const android = fakeWindow({ platform: "android", store: { [GLASS_DESKTOP_REMOTE_KEY]: "1" } });
assert.equal(initGlassDesktop(android), false);

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

const narrow = fakeWindow({ width: 800, search: "?gd=1" });
assert.equal(initGlassDesktop(narrow), false, "phone-width web ignores the flag");

console.log("glassDesktop.selftest.mjs ok");
