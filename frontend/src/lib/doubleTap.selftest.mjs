// Selftest: double-tap detector thresholds + text hit testing.
import assert from "node:assert/strict";
import { createDoubleTapDetector, DOUBLE_TAP_MS, TAP_SLOP_PX, isIgnoredTapTarget, pointIsOverText, hasTextSelection } from "./doubleTap.js";

const tap = (d, x, y, t, dur = 60) => { d.down(x, y, t); return d.up(x, y, t + dur); };

{
  const d = createDoubleTapDetector();
  assert.equal(tap(d, 100, 100, 0), false);
  assert.equal(tap(d, 102, 101, 180), true, "two quick taps fire");
  // the pair is consumed: a third tap starts a new sequence
  assert.equal(tap(d, 102, 101, 330), false);
}
{
  const d = createDoubleTapDetector();
  tap(d, 100, 100, 0);
  assert.equal(tap(d, 100, 100, 60 + DOUBLE_TAP_MS + 1), false, "too slow");
}
{
  const d = createDoubleTapDetector();
  tap(d, 100, 100, 0);
  assert.equal(tap(d, 100 + TAP_SLOP_PX * 3 + 1, 100, 150), false, "second tap too far away");
}
{
  const d = createDoubleTapDetector();
  // a drag (scroll / swipe-to-reply) is not a tap
  d.down(100, 100, 0); d.move(100, 100 + TAP_SLOP_PX); d.up(100, 100 + TAP_SLOP_PX, 50);
  assert.equal(tap(d, 100, 100, 120), false);
  assert.equal(tap(d, 100, 100, 240), true);
}
{
  const d = createDoubleTapDetector();
  d.down(100, 100, 0);
  assert.equal(d.up(100 + TAP_SLOP_PX, 100, 40), false, "moved during the tap");
  tap(d, 100, 100, 100);
  d.cancel();
  assert.equal(tap(d, 100, 100, 200), false, "cancel resets");
}
{
  const d = createDoubleTapDetector();
  d.down(100, 100, 0);
  assert.equal(d.up(100, 100, 700), false, "a long press is not a tap");
}

// ignore selector
{
  const el = (sel) => ({ nodeType: 1, closest: (s) => (s.split(",").map((x) => x.trim()).includes(sel) ? {} : null) });
  assert.equal(isIgnoredTapTarget(el("button")), true);
  assert.equal(isIgnoredTapTarget(el(".message-reactions")), true);
  assert.equal(isIgnoredTapTarget(el("img")), true);
  assert.equal(isIgnoredTapTarget(el("div")), false);
  assert.equal(isIgnoredTapTarget(null), false);
  // text nodes resolve to their parent element
  assert.equal(isIgnoredTapTarget({ nodeType: 3, parentElement: el("a") }), true);
}

// pointIsOverText with a fake document
{
  const nodes = [
    { nodeValue: "hello world", rects: [{ left: 10, right: 90, top: 10, bottom: 30 }] },
    { nodeValue: "   ", rects: [{ left: 0, right: 500, top: 0, bottom: 500 }] },
  ];
  let i = 0;
  let cur = null;
  const doc = {
    createTreeWalker: () => ({ nextNode: () => (i < nodes.length ? nodes[i++] : null) }),
    createRange: () => ({ selectNodeContents: (n) => { cur = n; }, getClientRects: () => cur.rects }),
  };
  assert.equal(pointIsOverText({}, 50, 20, doc), true, "on the word");
  i = 0;
  assert.equal(pointIsOverText({}, 120, 40, doc), false, "padding / empty area (whitespace nodes ignored)");
  assert.equal(pointIsOverText(null, 1, 1, doc), false);
}

// selection check
{
  assert.equal(hasTextSelection({ getSelection: () => ({ rangeCount: 1, isCollapsed: false, toString: () => "word" }) }), true);
  assert.equal(hasTextSelection({ getSelection: () => ({ rangeCount: 1, isCollapsed: true, toString: () => "" }) }), false);
  assert.equal(hasTextSelection({ getSelection: () => { throw new Error("x"); } }), false);
  assert.equal(hasTextSelection(null), false);
}

console.log("doubleTap selftest: ok");
