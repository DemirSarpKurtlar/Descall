const test = require("node:test");
const assert = require("node:assert/strict");
const { occlusionInsets, fillsWorkArea, clientBounds, fitBoundsToWorkArea } = require("./windowOcclusion.cjs");

const work = { x: 0, y: 0, width: 1920, height: 1040 };

test("a client that stops at the work area has no inset", () => {
  const insets = occlusionInsets({
    bounds: { x: 0, y: 0, width: 1920, height: 1040 },
    workArea: work,
  });
  assert.equal(insets.bottomInset, 0);
  assert.equal(insets.topInset, 0);
});

test("a maximized window whose client already fills the work area is not padded", () => {
  const insets = occlusionInsets({
    bounds: work,
    workArea: work,
  });
  assert.equal(insets.bottomInset, 0);
});

test("a client that reaches the monitor bottom reports the taskbar height", () => {
  const insets = occlusionInsets({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: work,
  });
  assert.equal(insets.bottomInset, 40);
});

test("a top taskbar is a top inset only when the client crosses it", () => {
  const topWork = { x: 0, y: 48, width: 1920, height: 1032 };
  const inside = occlusionInsets({ bounds: topWork, workArea: topWork });
  assert.equal(inside.bottomInset, 0);
  assert.equal(inside.topInset, 0);

  const covering = occlusionInsets({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: topWork,
  });
  assert.equal(covering.topInset, 48);
  assert.equal(covering.bottomInset, 0);
});

test("the client rect is measured, not the HWND frame hanging past it", () => {
  const frame = { x: -8, y: -8, width: 1936, height: 1056 };
  const client = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(clientBounds(frame, client), client);
  const insets = occlusionInsets({ bounds: clientBounds(frame, client), workArea: work });
  assert.equal(insets.bottomInset, 0);
  assert.equal(insets.topInset, 0);
});

test("dpi slop of 2px is not an inset", () => {
  const insets = occlusionInsets({
    bounds: { x: -1, y: -1, width: 1922, height: 1042 },
    workArea: work,
  });
  assert.equal(insets.bottomInset, 0);
  assert.equal(insets.topInset, 0);
  assert.equal(insets.leftInset, 0);
  assert.equal(insets.rightInset, 0);
});

test("a 1400×900 window is centered inside a roomy work area", () => {
  const fitted = fitBoundsToWorkArea({ width: 1400, height: 900 }, work, { minWidth: 1200, minHeight: 700 });
  assert.equal(fitted.width, 1400);
  assert.equal(fitted.height, 900);
  assert.equal(fitted.x, 260);
  assert.equal(fitted.y, 70);
  assert.equal(fitted.minWidth, 1200);
  assert.equal(fitted.minHeight, 700);
});

test("a window taller than a scaled laptop work area shrinks to fit", () => {
  const laptop = { x: 0, y: 0, width: 1536, height: 824 };
  const fitted = fitBoundsToWorkArea({ width: 1400, height: 900 }, laptop, { minWidth: 1200, minHeight: 700 });
  assert.equal(fitted.width, 1400);
  assert.equal(fitted.height, 824);
  assert.equal(fitted.y, 0);
  assert.equal(fitted.minHeight, 700);
  assert.ok(fitted.y + fitted.height <= laptop.height);
});

test("a window hanging past the taskbar is pulled back up", () => {
  const fitted = fitBoundsToWorkArea(
    { x: 100, y: 400, width: 1400, height: 800 },
    work,
    { minWidth: 1200, minHeight: 700 },
  );
  assert.equal(fitted.height, 800);
  assert.equal(fitted.y, 240);
  assert.equal(fitted.y + fitted.height, work.y + work.height);
});

test("minimum size cannot exceed a short work area", () => {
  const short = { x: 10, y: 20, width: 1100, height: 640 };
  const fitted = fitBoundsToWorkArea({ width: 1400, height: 900 }, short, { minWidth: 1200, minHeight: 700 });
  assert.equal(fitted.width, 1100);
  assert.equal(fitted.height, 640);
  assert.equal(fitted.x, 10);
  assert.equal(fitted.y, 20);
  assert.equal(fitted.minWidth, 1100);
  assert.equal(fitted.minHeight, 640);
});

test("fillsWorkArea allows a 2px DPI slop", () => {
  assert.equal(fillsWorkArea({ x: 0, y: 1, width: 1921, height: 1039 }, work), true);
  assert.equal(fillsWorkArea({ x: 100, y: 100, width: 1400, height: 900 }, work), false);
});
