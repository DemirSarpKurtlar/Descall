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
assert.match(src, /setActive\(Boolean\(res\?\.shown\)\)/, "active only after show() confirms");
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

console.log("nativeGlassTabBar.selftest ok");
