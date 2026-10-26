// Mobile web tab bar: hidden ONLY for a focused field + a real keyboard.
// Realistic iOS 26 Safari numbers (iPhone 17 Pro Max class, 440x956 screen):
// expanded floating toolbar ~145pt incl. home indicator, compact ~68pt,
// real keyboard 300+pt, iOS 26 leaving vv short / offsetTop after dismiss.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mobileViewportBox, KB_REAL, LIFT_MAX } from "./mobileViewport.js";
import { viewportDebugWanted } from "./viewportDebug.js";

assert.equal(KB_REAL, 150);

const S = 956; // screen / lvh
const scenarios = [
  // name, input, expect {open, hideBar, lift}
  ["expanded toolbar, layout under it", { innerHeight: S, vvHeight: S - 145, fixedBottom: S, restHeight: S - 145 }, { open: false, hideBar: false, lift: 145 }],
  ["expanded toolbar, layout above it", { innerHeight: S - 145, vvHeight: S - 145, fixedBottom: S - 145, restHeight: S - 145 }, { open: false, hideBar: false, lift: 0 }],
  ["innerHeight > vv by toolbar, fixed above", { innerHeight: S, vvHeight: S - 145, fixedBottom: S - 145, restHeight: S - 145 }, { open: false, hideBar: false, lift: 0 }],
  ["compact toolbar while scrolling", { innerHeight: S, vvHeight: S - 68, fixedBottom: S, restHeight: S - 68 }, { open: false, hideBar: false, lift: 68 }],
  ["no toolbar (standalone PWA)", { innerHeight: S, vvHeight: S, fixedBottom: S, restHeight: S }, { open: false, hideBar: false, lift: 0 }],
  ["stale short vv after dismiss (iOS 26 bug)", { innerHeight: S, vvHeight: 520, offsetTop: 0, fixedBottom: S, restHeight: S - 145 }, { open: false, hideBar: false, lift: 0 }],
  ["stale offsetTop after dismiss", { innerHeight: S, vvHeight: S - 145, offsetTop: 24, fixedBottom: S, restHeight: S - 145 }, { open: false, hideBar: false, lift: 121 }],
  ["keyboard animating closed, nothing focused", { innerHeight: S, vvHeight: 500, fixedBottom: S, restHeight: S - 145 }, { open: false, hideBar: false, lift: 0 }],
  ["search focused, keyboard up", { innerHeight: S, vvHeight: 480, fixedBottom: S, restHeight: S - 145, editing: true }, { open: true, hideBar: true }],
  ["search focused, keyboard up, vv panned", { innerHeight: S, vvHeight: 480, offsetTop: 40, fixedBottom: S, restHeight: S - 145, editing: true }, { open: true, hideBar: true }],
  ["search focused, keyboard hidden (toolbar only)", { innerHeight: S, vvHeight: S - 145, fixedBottom: S, restHeight: S - 145, editing: true }, { hideBar: false }],
  ["focused, hardware keyboard shortcut bar", { innerHeight: S, vvHeight: S - 145 - 70, fixedBottom: S, restHeight: S - 145, editing: true }, { hideBar: false }],
  ["focused, no resting baseline yet, keyboard up", { innerHeight: S, vvHeight: 480, fixedBottom: S, editing: true }, { open: true, hideBar: true }],
  ["native app keyboard (plugin inset)", { innerHeight: 874, vvHeight: 874, nativeInset: 336, fixedBottom: 874 }, { open: true, hideBar: true }],
  ["native app, no keyboard", { innerHeight: 874, vvHeight: 874, fixedBottom: 874 }, { open: false, hideBar: false, lift: 0 }],
];
for (const [name, input, want] of scenarios) {
  const box = mobileViewportBox(input);
  for (const [k, v] of Object.entries(want)) assert.equal(box[k], v, `${name}: ${k}`);
  if (!box.open) assert.ok(box.height >= Math.max(input.innerHeight, input.vvHeight), `${name}: shell never cut short`);
  assert.ok(box.lift >= 0 && box.lift <= LIFT_MAX, `${name}: lift bounded`);
}

// Fail-safe sweep: with nothing focused and no native inset, no geometry at all
// can hide the bar or open the keyboard layout.
for (let inner = 500; inner <= 1000; inner += 25)
  for (let vvh = 300; vvh <= inner; vvh += 25)
    for (const fixed of [0, inner, 1000])
      for (const top of [0, 24, 200]) {
        const b = mobileViewportBox({ innerHeight: inner, vvHeight: vvh, offsetTop: top, fixedBottom: fixed, restHeight: inner });
        assert.equal(b.hideBar, false, `${inner}/${vvh}/${fixed}/${top}`);
        assert.equal(b.open, false);
      }

// Hook wiring: kb-bar-hidden is driven by hideBar, the lift is published,
// the resting baseline is only sampled with nothing focused.
const here = fileURLToPath(new URL(".", import.meta.url));
const hook = readFileSync(join(here, "../hooks/useMobileKeyboard.js"), "utf8");
assert.match(hook, /classList\.toggle\("kb-bar-hidden", Boolean\(box\.hideBar\)\)/);
assert.match(hook, /--g-vv-lift/);
assert.match(hook, /if \(!editing && !nativeKeyboardInset && vvH > rest\.h\)/);
assert.match(hook, /restHeight: rest\.h/);

// Every CSS rule anywhere that hides the tab bar must be one of the allowed
// switches: the real keyboard (kb-bar-hidden), the confirmed native bar
// (is-native), or a settings sub page.
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (n.endsWith(".css")) out.push(p);
  }
  return out;
}
const allowed = /kb-bar-hidden|is-native|g-settings:not\(\.g-settings-menu\)|in-conversation/;
const bad = [];
for (const file of walk(join(here, "../styles"))) {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/([^{}]*\.(?:g-tabbar|mobile-tab-bar)(?![\w-])[^{}]*)\{([^}]*)\}/g)) {
    const [, sel, body] = m;
    if (!/display:\s*none|visibility:\s*hidden|opacity:\s*0(?![.\d])|translateY\(1\d\d%\)/.test(body)) continue;
    for (const part of sel.split(",").filter((s) => /\.(g-tabbar|mobile-tab-bar)(?![\w-])/.test(s))) {
      // Bare `.mobile-tab-bar` is the legacy desktop default (shown again by the phone media query).
      if (part.trim() === ".mobile-tab-bar") continue;
      if (!(allowed.test(part) || /\.g-tab(-|bar\s+\.)/.test(part))) bad.push(`${file.split("/styles/")[1]}: ${part.trim()}`);
    }
  }
}
assert.deepEqual(bad, [], "unexpected tab bar hide rules");
const shellCss = readFileSync(join(here, "../styles/glass/shell.css"), "utf8");
assert.match(shellCss, /--g-bar-bottom: max\(12px, calc\(env\(safe-area-inset-bottom, 0px\) - 10px\), calc\(var\(--g-vv-lift, 0px\) \+ 8px\)\);/);
assert.doesNotMatch(shellCss, /html\.glass-ui\.kb-open \.g-tabbar/);
const overlay = readFileSync(join(here, "../styles/overlay.css"), "utf8");
assert.doesNotMatch(overlay, /\.g-tabbar\)\s*\{\s*z-index:\s*0/, "scrims never sink the bar under the list");

// Native glass bar hides with the real keyboard only, and only on iOS native.
const native = readFileSync(join(here, "nativeGlassTabBar.js"), "utf8");
assert.match(native, /kb-bar-hidden/);
assert.doesNotMatch(native, /"kb-open"/);
assert.match(native, /isNativePlatform\?\.\(\) && cap\.getPlatform\?\.\(\) === "ios"/);

// Service worker cannot serve stale bundles and activates new versions now.
const sw = readFileSync(join(here, "../../public/sw.js"), "utf8");
assert.doesNotMatch(sw, /addEventListener\("fetch"/);
assert.match(sw, /skipWaiting\(\)/);
assert.match(sw, /clients\.claim\(\)/);

// Debug readout toggle.
const mem = new Map();
const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
assert.equal(viewportDebugWanted("", store), false);
assert.equal(viewportDebugWanted("?vpdebug=1", store), true);
assert.equal(viewportDebugWanted("", store), true);
assert.equal(viewportDebugWanted("?a=1&vpdebug=0", store), false);
assert.equal(viewportDebugWanted("", store), false);

console.log("webTabBarVisibility.selftest ok");
