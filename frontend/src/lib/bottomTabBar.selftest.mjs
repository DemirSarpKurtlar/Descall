// iPad stray tab bar (A3 follow-up): the phone bottom bar renders only where
// it is positioned (phone layout width or a phone-sized screen); at tablet
// widths the rail + list layout navigates, with no drawer menu / back chevron.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bottomTabBarFits, screenShortSide, PHONE_LAYOUT_QUERY } from "./bottomTabBar.js";
import { PHONE_MAX_SHORT_SIDE } from "./glassUi.js";

const cases = [
  // name, viewport width, screen w x h, want
  ["iPhone 15 portrait", 393, [393, 852], true],
  ["iPhone Pro Max landscape", 956, [440, 956], true],
  ["iPhone SE", 375, [375, 667], true],
  ["iPad 11 portrait (iPad UA)", 834, [834, 1194], false],
  ["iPad Pro 12.9 portrait", 1024, [1024, 1366], false],
  ["iPad Pro 12.9 landscape", 1366, [1024, 1366], false],
  ["iPad mini portrait", 744, [744, 1133], true],
  ["iPad Split View 1/3", 320, [1024, 1366], true],
  ["iPad Split View 1/2", 507, [1024, 1366], true],
  ["iPad Slide Over", 375, [1024, 1366], true],
  ["Android tablet landscape", 1280, [800, 1280], false],
];
for (const [name, width, [sw, sh], want] of cases) {
  const phoneLayout = width <= 768;
  const screenShort = screenShortSide({ screen: { width: sw, height: sh }, innerWidth: width, innerHeight: sh });
  assert.equal(bottomTabBarFits({ phoneLayout, screenShort }), want, name);
}
assert.equal(PHONE_LAYOUT_QUERY, "(max-width: 768px)");
assert.equal(bottomTabBarFits({ phoneLayout: false, screenShort: 0 }), false, "unknown screen at tablet width: no bar");
assert.equal(bottomTabBarFits({ phoneLayout: false, screenShort: PHONE_MAX_SHORT_SIDE }), false);
assert.equal(screenShortSide({ innerWidth: 390, innerHeight: 844 }), 390, "falls back to the viewport");

// Wiring: the bar, the native bar, the tab drag and the phone header button
// all follow the same gate.
const here = fileURLToPath(new URL(".", import.meta.url));
const layout = readFileSync(join(here, "../components/layout/AppLayout.jsx"), "utf8");
assert.match(layout, /const tabBarFits = bottomTabBarFits\(\{ phoneLayout: drawerIsPage, screenShort \}\);/);
assert.match(layout, /const showMobileTabBar = isMobile && tabBarFits && !inConversation/);
assert.match(layout, /matchMedia\?\.\(PHONE_LAYOUT_QUERY\)/);
assert.match(layout, /onMenuClick=\{tabBarFits \? openMobileDrawer : undefined\}/);
assert.match(layout, /showMobileBack=\{isMobile && inConversation && tabBarFits\}/);
assert.doesNotMatch(layout, /\{!glassShell && isMobile && \(\s*<nav className="mobile-tab-bar"/);
const chat = readFileSync(join(here, "../components/layout/ChatPanel.jsx"), "utf8");
assert.match(chat, /\{isMobile && \(showMobileBack \|\| onMenuClick\) && \(\s*<button[\s\S]{0,80}mobile-nav-btn/);

// The phone media query that positions `.mobile-tab-bar` is the same width.
const css = readFileSync(join(here, "../styles/mobile.css"), "utf8");
assert.match(css, /@media \(max-width: 768px\) \{[\s\S]*?\.mobile-tab-bar \{\s*display: flex;\s*position: fixed;/);
console.log("bottomTabBar selftest ok");
