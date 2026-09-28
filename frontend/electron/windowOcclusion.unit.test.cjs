const test = require("node:test");
const assert = require("node:assert/strict");
const { occlusionInsets, fillsWorkArea, unionRect } = require("./windowOcclusion.cjs");

const display = { x: 0, y: 0, width: 1920, height: 1080 };
const work = { x: 0, y: 0, width: 1920, height: 1040 };

test("a window that stops at the work area has no inset", () => {
  const insets = occlusionInsets({
    bounds: { x: 0, y: 0, width: 1920, height: 1040 },
    workArea: work,
    displayBounds: display,
    maximized: false,
  });
  assert.equal(insets.bottomInset, 0);
});

test("maximized frameless bounds that cover the taskbar report the taskbar height", () => {
  const insets = occlusionInsets({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: work,
    displayBounds: display,
    maximized: true,
  });
  assert.equal(insets.bottomInset, 40);
});

test("a work-area window marked maximized is not padded unless Windows is covering the taskbar", () => {
  const insets = occlusionInsets({
    bounds: work,
    workArea: work,
    displayBounds: display,
    maximized: true,
  });
  assert.equal(insets.bottomInset, 0);
});

test("Windows maximized frameless bounds that only report the work area still cover the taskbar", () => {
  const insets = occlusionInsets({
    bounds: work,
    workArea: work,
    displayBounds: display,
    maximized: true,
    treatMaximizedAsCovering: true,
  });
  assert.equal(insets.bottomInset, 40);
  assert.equal(insets.topInset, 0);
});

test("a top taskbar does not add a bottom inset", () => {
  const topWork = { x: 0, y: 48, width: 1920, height: 1032 };
  const insets = occlusionInsets({
    bounds: topWork,
    workArea: topWork,
    displayBounds: display,
    maximized: true,
    treatMaximizedAsCovering: true,
  });
  assert.equal(insets.bottomInset, 0);
  assert.equal(insets.topInset, 48);
});

test("content bounds taller than the window bounds still count as overlap", () => {
  const merged = unionRect(
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 0, y: 0, width: 1920, height: 1080 }
  );
  const insets = occlusionInsets({
    bounds: merged,
    workArea: work,
    displayBounds: display,
    maximized: false,
  });
  assert.equal(insets.bottomInset, 40);
});

test("fillsWorkArea allows a 2px DPI slop", () => {
  assert.equal(fillsWorkArea({ x: 0, y: 1, width: 1921, height: 1039 }, work), true);
  assert.equal(fillsWorkArea({ x: 100, y: 100, width: 1400, height: 900 }, work), false);
});
