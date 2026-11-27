import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mobileViewportBox } from "./mobileViewport.js";

const phone = { innerHeight: 844, vvHeight: 844, offsetTop: 0, editing: false };
const closed = mobileViewportBox(phone);
assert.equal(closed.open, false);
assert.equal(closed.top, 0);
assert.equal(closed.height, 844);

const typing = mobileViewportBox({
  innerHeight: 844,
  vvHeight: 430,
  offsetTop: 0,
  editing: true,
});
assert.equal(typing.open, true);
assert.equal(typing.height, 430);
assert.equal(typing.top, 0);
assert.equal(typing.gap, 414);

// Keyboard covers the web view and the visual viewport does not shrink.
const overlay = mobileViewportBox({
  innerHeight: 844,
  vvHeight: 844,
  offsetTop: 0,
  editing: true,
  nativeInset: 336,
});
assert.equal(overlay.open, true);
assert.equal(overlay.gap, 336);
assert.equal(overlay.height, 508);
assert.equal(overlay.top, 0);

// Viewport already shrank by the same amount, do not lift twice.
const both = mobileViewportBox({
  innerHeight: 844,
  vvHeight: 508,
  offsetTop: 0,
  editing: true,
  nativeInset: 336,
});
assert.equal(both.gap, 336);
assert.equal(both.height, 508);

const panned = mobileViewportBox({
  innerHeight: 844,
  vvHeight: 844,
  offsetTop: 320,
  editing: true,
});
assert.equal(panned.open, true);
assert.equal(panned.top, 320);
assert.equal(panned.height, 524);
assert.equal(panned.gap, 0);
assert.equal(closed.gap, 0);

const stuck = mobileViewportBox({
  innerHeight: 844,
  vvHeight: 430,
  offsetTop: 280,
  editing: false,
});
assert.equal(stuck.open, false);
assert.equal(stuck.top, 0);
assert.equal(stuck.height, 844);

const tinyPan = mobileViewportBox({
  innerHeight: 844,
  vvHeight: 830,
  offsetTop: 8,
  editing: false,
});
assert.equal(tinyPan.open, false);
assert.equal(tinyPan.top, 0);
assert.equal(tinyPan.height, 844);

// iOS reported an innerHeight that shrank with the keyboard (== visual
// viewport). Without the measured fixed box this read as "no keyboard" and
// left the composer at the layout bottom, behind the keys.
const shrunkInner = mobileViewportBox({
  innerHeight: 508,
  vvHeight: 508,
  offsetTop: 0,
  editing: true,
  fixedBottom: 844,
});
assert.equal(shrunkInner.open, true);
assert.equal(shrunkInner.gap, 336);
assert.equal(shrunkInner.height, 508);

// Same, with iOS panning the visual viewport down while focusing.
const shrunkPanned = mobileViewportBox({
  innerHeight: 508,
  vvHeight: 508,
  offsetTop: 60,
  editing: true,
  fixedBottom: 844,
});
assert.equal(shrunkPanned.open, true);
assert.equal(shrunkPanned.top, 60);
assert.equal(shrunkPanned.gap, 276); // 844 - 508 - 60: composer bottom = vv bottom
assert.equal(shrunkPanned.height, 508);

// innerHeight off by the Safari toolbar: lift from the real fixed bottom.
const toolbar = mobileViewportBox({
  innerHeight: 794,
  vvHeight: 508,
  offsetTop: 0,
  editing: true,
  fixedBottom: 844,
});
assert.equal(toolbar.gap, 336);

// Closed keyboard: the measured box never makes the shell taller or opens it.
const closedMeasured = mobileViewportBox({
  innerHeight: 844,
  vvHeight: 844,
  offsetTop: 0,
  editing: true,
  fixedBottom: 844,
});
assert.equal(closedMeasured.open, false);
assert.equal(closedMeasured.height, 844);

// Safari 26 on iPhone, nothing focused: the fixed box runs on under the
// floating toolbar (fixed bottom 874) while innerHeight and the visual
// viewport stop above it (726). That strip is the toolbar, not a keyboard:
// the keyboard must not count as open (it hid the tab bar and cut the shell).
for (const [inner, vvh] of [[726, 726], [794, 726], [726, 700]]) {
  const safariToolbar = mobileViewportBox({ innerHeight: inner, vvHeight: vvh, offsetTop: 0, editing: false, fixedBottom: 874 });
  assert.equal(safariToolbar.open, false, `toolbar strip is not a keyboard (${inner}/${vvh})`);
  assert.equal(safariToolbar.height, inner);
  assert.equal(safariToolbar.gap, 0);
}
// Nothing focused never opens on web, whatever the geometry (iOS 26 leaves a
// short visual viewport after dismiss, Safari's expanded toolbar is ~145pt).
// That path hid the tab bar on a real iPhone after #268.
assert.equal(mobileViewportBox({ innerHeight: 844, vvHeight: 500, editing: false, fixedBottom: 874 }).open, false);
assert.equal(mobileViewportBox({ innerHeight: 956, vvHeight: 811, editing: false, fixedBottom: 956 }).hideBar, false);
// Native app: the UIKit inset still opens it without focus.
assert.equal(mobileViewportBox({ innerHeight: 844, vvHeight: 844, editing: false, nativeInset: 336, fixedBottom: 844 }).open, true);

// iOS 26 app (owner's screenshot, iPhone Pro Max 932pt, keyboard 347pt):
// interactive-widget=resizes-content shrinks the layout viewport itself, so
// innerHeight, the visual viewport and the fixed box all end at the keyboard
// top (585), while UIKit still reports the full 347pt overlap against the
// unchanged WKWebView frame. Taking it off again left a 238pt shell: the
// composer floated mid screen over an empty keyboard-sized band and the list
// slid behind the header.
const resized = { innerHeight: 585, vvHeight: 585, offsetTop: 0, editing: true, nativeInset: 347, fixedBottom: 585 };
for (const fullHeight of [932, 0]) {
  const box = mobileViewportBox({ ...resized, fullHeight: fullHeight || 932 });
  assert.equal(box.open, true);
  assert.equal(box.hideBar, true, "native keyboard still hides the tab bar");
  assert.equal(box.height, 585, "shell ends at the keyboard top, not one keyboard higher");
  assert.equal(box.gap, 0, "fixed box already ends at the keyboard: no extra lift");
  assert.equal(box.kb, 0);
}
// The keyboard animation starts (native note first) before WebKit resized:
// same end position, the full overlap is still inside the layout.
const preResize = mobileViewportBox({ innerHeight: 932, vvHeight: 932, editing: true, nativeInset: 347, fixedBottom: 932, fullHeight: 932 });
assert.equal(preResize.height, 585);
assert.equal(preResize.gap, 347);
// Half way: the layout shrank 200 of the 347.
const halfway = mobileViewportBox({ innerHeight: 732, vvHeight: 732, editing: true, nativeInset: 347, fixedBottom: 732, fullHeight: 932 });
assert.equal(halfway.height, 585);
assert.equal(halfway.gap, 147);
// iPad split view: web view 700pt tall in a 1024pt screen, layout shrank.
const ipadSplit = mobileViewportBox({ innerHeight: 400, vvHeight: 400, editing: true, nativeInset: 300, fixedBottom: 400, fullHeight: 700 });
assert.equal(ipadSplit.height, 400);
assert.equal(ipadSplit.gap, 0);
// Without fullHeight nothing changes (old app builds, web).
assert.equal(mobileViewportBox({ ...resized }).height, 238, "documents the old double count when the full height is unknown");
// Keyboard reported while nothing is focused (field inside a shadow root):
// still measured from the fixed box, not a shrunk innerHeight.
const unfocused = mobileViewportBox({ innerHeight: 508, vvHeight: 508, editing: false, nativeInset: 336, fixedBottom: 844, fullHeight: 844 });
assert.equal(unfocused.gap, 336);
assert.equal(unfocused.height, 508);

// No measurement (0) falls back to innerHeight, as before.
assert.deepEqual(
  mobileViewportBox({ innerHeight: 844, vvHeight: 430, editing: true, fixedBottom: 0 }),
  mobileViewportBox({ innerHeight: 844, vvHeight: 430, editing: true }),
);

const hook = readFileSync(new URL("../hooks/useMobileKeyboard.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles/glass/chat.css", import.meta.url), "utf8");
const composer = readFileSync(new URL("../components/chat/MessageComposer.jsx", import.meta.url), "utf8");
const swift = readFileSync(new URL("../../ios/App/App/DescallBridgeViewController.swift", import.meta.url), "utf8");
assert.match(hook, /--kb-gap/);
assert.match(hook, /__descallNativeKeyboard/);
assert.match(hook, /const fixedBottom = readFixedBottom\(probe\)/);
assert.match(hook, /fullHeight: nativeViewHeight \|\| rest\.layout/);
assert.match(swift, /__descallNativeKeyboard\(\\\(px\), \\\(viewHeight\)\)/);
assert.match(swift, /__descallNativeKeyboard/);
// A2 §4.4: the field auto-grows (5 lines iPhone / 8 iPad) and scrolls inside;
// the old one-line scrollTop=0 lock is gone, Enter key shows "Gönder".
assert.doesNotMatch(composer, /e\.target\.scrollTop = 0/);
assert.match(composer, /enterKeyHint="send"/);
assert.match(composer, /--composer-grow/);
assert.match(css, /html\.glass-ui\.kb-open \.app-root\.g-shell\.in-conversation \.composer-container \{\s*bottom: calc\(var\(--kb-gap, 0px\) \+ 8px\);/);
assert.match(css, /html\.glass-ui\.kb-open \.giphy-overlay\.g-giphy-scrim \{\s*padding-bottom: calc\(var\(--kb-gap, 0px\) \+ 8px\);/, "GIF sheet ends on the keyboard");
assert.match(css, /overscroll-behavior: contain;/, "the grown field scrolls inside without chaining to the list");
assert.match(swift, /FormAccessory/);
assert.match(swift, /if frame\.maxY < webView\.bounds\.maxY - 1 \{ return 0 \}/, "an undocked iPad keyboard lifts nothing");
assert.match(swift, /viewDidAppear/);

// Bottom sheets with text fields end on the keyboard (--kb-gap: the strip it
// covers when the web view keeps its full height; --vv-height: what is left).
for (const [file, scrim, sheet] of [
  ["../components/groups/GroupSheet.css", /html\.kb-open \.gs-scrim \{ padding-bottom: var\(--kb-gap, 0px\); \}/, /html\.kb-open \.gs-sheet \{[^}]*var\(--vv-height, 100dvh\)/],
  ["../styles/new-create.css", /html\.glass-ui\.kb-open \.add-modal-backdrop\.nc-scrim\.g-add-scrim \{\s*padding-bottom: var\(--kb-gap, 0px\);/, /html\.kb-open \.nc-sheet\.is-phone \{[^}]*var\(--vv-height, 100dvh\)/],
  ["../components/settings/UsernameChangeModal.css", /html\.kb-open \.un-overlay \{\s*padding-bottom: var\(--kb-gap, 0px\);/, /html\.kb-open \.un-modal \{[^}]*var\(--vv-height, 100dvh\)/],
]) {
  const text = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.match(text, scrim, `${file}: scrim lifts by --kb-gap`);
  assert.match(text, sheet, `${file}: sheet caps at the visible height`);
}

console.log("mobileViewport.selftest ok");
