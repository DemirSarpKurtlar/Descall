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
assert.match(hook, /fixedBottom: readFixedBottom\(probe\)/);
assert.match(swift, /__descallNativeKeyboard/);
assert.match(composer, /onScroll/);
assert.match(css, /html\.glass-ui\.kb-open \.app-root\.g-shell\.in-conversation \.composer-container \{\s*bottom: calc\(var\(--kb-gap, 0px\) \+ 8px\);/);
assert.match(css, /overflow: hidden !important;/);
assert.match(composer, /e\.target\.scrollTop = 0/);
assert.match(swift, /FormAccessory/);
assert.match(swift, /viewDidAppear/);

console.log("mobileViewport.selftest ok");
