import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TAB_SYMBOLS,
  badgeLabel,
  nativeTabsPayload,
  badgesPayload,
  barStyleFor,
  barCovered,
  useNativeGlassTabBar,
  loadPluginBox,
  nativeBarInUse,
} from "./nativeGlassTabBar.js";

// Same six tabs as the web bar, each with an SF Symbol.
for (const id of ["chat", "groups", "servers", "friends", "activity", "calls"]) assert.ok(TAB_SYMBOLS[id], id);

assert.equal(badgeLabel(0), "");
assert.equal(badgeLabel(undefined), "");
assert.equal(badgeLabel(3), "3");
assert.equal(badgeLabel("7"), "7");
assert.equal(badgeLabel(150), "99+");

const items = [
  { id: "chat", label: "Sohbetler" },
  { id: "friends", label: "Arkadaşlar" },
  { id: "x-new" },
  null,
];
assert.deepEqual(nativeTabsPayload(items, { chat: 2, friends: 0 }), [
  { id: "chat", title: "Sohbetler", symbol: TAB_SYMBOLS.chat, badge: "2" },
  { id: "friends", title: "Arkadaşlar", symbol: TAB_SYMBOLS.friends, badge: "" },
  { id: "x-new", title: "x-new", symbol: "circle", badge: "" },
]);
assert.deepEqual(badgesPayload(items, { friends: 120 }), { chat: "", friends: "99+", "x-new": "" });
assert.equal(barStyleFor(" light"), "light");
assert.equal(barStyleFor("dark"), "dark");
assert.equal(barStyleFor(""), "dark");

// Cover check: anything but the bar at its centre line = covered.
const child = {};
const bar = { contains: (n) => n === child };
const rect = { left: 0, right: 400, top: 800, height: 60, width: 400 };
assert.equal(barCovered(bar, rect, () => child), false);
assert.equal(barCovered(bar, rect, () => bar), false);
assert.equal(barCovered(bar, rect, (x) => (x > 300 ? {} : child)), true, "sheet over one edge");
assert.equal(barCovered(bar, { ...rect, width: 0, height: 0 }, () => bar), true, "display:none bar");
assert.equal(barCovered(null, rect, () => bar), true);

// Web / no plugin: the hook never touches the plugin and reports inactive.
const src = readFileSync(new URL("./nativeGlassTabBar.js", import.meta.url), "utf8");
assert.match(src, /if \(!isIosApp\(\)\) return undefined;/);
assert.match(src, /const shown = Boolean\(res\?\.shown\);\s*setActive\(shown\);\s*setEngaged\(shown\);/, "active / engaged only after show() confirms");

// 3.0.0 iPhone: long-pressing a server hid the native bar for the menu and the
// old web bar flashed under the scrim and after closing. While the native bar
// is in use (confirmed once, not given up on), stepping aside keeps the web bar
// hidden; only a failed show()/update() brings it back.
assert.equal(nativeBarInUse({ wanted: true, active: true, engaged: true }), true, "on screen");
assert.equal(nativeBarInUse({ wanted: true, active: false, engaged: true }), true, "hidden for a menu / sheet / keyboard, or show() pending");
assert.equal(nativeBarInUse({ wanted: true, active: false, engaged: false }), false, "never shown / show() failed: web bar");
assert.equal(nativeBarInUse({ wanted: false, active: false, engaged: true }), false, "no plugin or a screen without the bar");
assert.equal(nativeBarInUse(), false);
assert.match(src, /return inUse;\s*\}\s*$/, "the hook reports in-use, not only on-screen");
assert.match(src, /classList\.toggle\(NATIVE_TABBAR_CLASS, inUse\)/);
{
  const hideBranch = src.match(/if \(!show\) \{([\s\S]*?)return undefined;/)?.[1] || "";
  assert.ok(hideBranch.includes("plugin.hide"), "native bar still hides while covered");
  assert.ok(!/setEngaged\(false\)/.test(hideBranch), "a cover must not hand the screen back to the web bar");
}
assert.match(src, /!res\?\.available/);
assert.equal(typeof useNativeGlassTabBar, "function");

// The web bar is only hidden by `.is-native` (never by platform guesses),
// and AppLayout always renders it when the tab bar is shown.
const css = readFileSync(new URL("../styles/glass/shell.css", import.meta.url), "utf8");
const hideRules = css.match(/^[^{}]*\.g-tabbar[^{}]*\{[^}]*(opacity:\s*0|display:\s*none|visibility:\s*hidden)[^}]*\}/gm) || [];
for (const rule of hideRules) {
  const sel = rule.split("{")[0];
  assert.ok(/is-native|kb-bar-hidden/.test(sel), `unexpected web tab bar hide rule: ${sel.trim()}`);
}
const shell = readFileSync(new URL("../components/layout/glass/GlassShell.jsx", import.meta.url), "utf8");
assert.match(shell, /nativeActive \? " is-native" : ""/);
const layout = readFileSync(new URL("../components/layout/AppLayout.jsx", import.meta.url), "utf8");
assert.match(layout, /nativeActive=\{nativeTabBarActive\}/);
assert.match(layout, /<GlassTabBar[\s\S]*?\/>/);

// Native side: iOS 26 gate, registered, and the bar is a real UITabBar.
const swiftView = readFileSync(new URL("../../ios/App/App/DescallGlassTabBarView.swift", import.meta.url), "utf8");
const swiftPlugin = readFileSync(new URL("../../ios/App/App/DescallGlassTabBarPlugin.swift", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../../ios/App/App/DescallBridgeViewController.swift", import.meta.url), "utf8");
const pbx = readFileSync(new URL("../../ios/App/App.xcodeproj/project.pbxproj", import.meta.url), "utf8");
assert.match(swiftView, /@available\(iOS 26\.0, \*\)\npublic final class DescallGlassTabBarView/);
assert.match(swiftView, /public let tabBar = UITabBar\(\)/);
assert.match(swiftView, /glass\.isInteractive = interactive/);
assert.match(swiftPlugin, /jsName = "DescallGlassTabBar"/);
assert.match(swiftPlugin, /guard #available\(iOS 26\.0, \*\) else \{\s*call\.resolve\(\["shown": false/);
assert.match(bridge, /registerPluginInstance\(glassTabBarPlugin\)/);
assert.equal((pbx.match(/DescallGlassTabBarPlugin\.swift in Sources/g) || []).length, 2);
assert.equal((pbx.match(/DescallGlassTabBarView\.swift in Sources/g) || []).length, 2);

// Capacitor plugin proxies answer every property, `then` included (with a
// method wrapper that never calls back for a method the plugin lacks).
// Resolving a promise with the proxy itself therefore never settles; that
// kept the native bar off in 2.13.11. The loader must box it.
function fakeCapacitorProxy() {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === "$$typeof") return undefined;
      return () => Promise.reject(new Error(`"${String(prop)}" not implemented`)).catch(() => {});
    },
  });
}
const fakeCore = async () => ({ registerPlugin: () => fakeCapacitorProxy() });
const settle = (p) => Promise.race([p.then(() => "settled", () => "settled"), new Promise((r) => setTimeout(() => r("hung"), 200))]);
assert.equal(await settle(fakeCore().then(({ registerPlugin }) => registerPlugin("X"))), "hung", "fake proxy reproduces the thenable trap");
const boxed = await loadPluginBox(fakeCore);
assert.ok(boxed && boxed.plugin, "loader resolves { plugin } instead of hanging");
assert.deepEqual(await loadPluginBox(async () => { throw new Error("no core"); }), { plugin: null });
assert.doesNotMatch(src, /\.then\(\(\{ registerPlugin \}\) => registerPlugin\(/, "never resolve a promise with a plugin proxy");

console.log("nativeGlassTabBar.selftest ok");
