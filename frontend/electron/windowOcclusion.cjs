/**
 * How many DIP the page's client rectangle extends past the display work area.
 * 1–2px is DPI rounding and is ignored.
 *
 * Measure the client (getContentBounds), not the HWND. On Windows a maximized
 * frameless window keeps WS_THICKFRAME, and that frame is supposed to hang
 * past the work area while Electron indents the client back out of the
 * taskbar. Counting the frame as overlap shrinks a page that is already
 * inside the work area.
 */

function keepInset(value) {
  return value > 2 ? value : 0;
}

function unionRect(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

function fillsWorkArea(bounds, workArea, slack = 2) {
  if (!bounds || !workArea) return false;
  return Math.abs(bounds.x - workArea.x) <= slack
    && Math.abs(bounds.y - workArea.y) <= slack
    && Math.abs(bounds.width - workArea.width) <= slack
    && Math.abs(bounds.height - workArea.height) <= slack;
}

/**
 * @param {{ bounds: object, workArea: object }} input
 * Insets are only the client rectangle that actually crosses the work area.
 * A maximized window whose client already equals the work area is not given
 * an invented taskbar pad.
 */
function occlusionInsets({ bounds, workArea }) {
  const empty = { bottomInset: 0, topInset: 0, leftInset: 0, rightInset: 0 };
  if (!bounds || !workArea) return empty;

  const bottom = Math.round(bounds.y + bounds.height - (workArea.y + workArea.height));
  const top = Math.round(workArea.y - bounds.y);
  const left = Math.round(workArea.x - bounds.x);
  const right = Math.round(bounds.x + bounds.width - (workArea.x + workArea.width));

  return {
    bottomInset: keepInset(bottom),
    topInset: keepInset(top),
    leftInset: keepInset(left),
    rightInset: keepInset(right),
  };
}

function clientBounds(windowBounds, contentBounds) {
  if (contentBounds && contentBounds.width > 0 && contentBounds.height > 0) return contentBounds;
  return windowBounds || null;
}

/**
 * Place a restored window's client inside the display work area.
 * Never expand a window, and never invent a maximized snap — callers must
 * skip this while the window is maximized so WS_THICKFRAME can keep the
 * client out of the taskbar.
 */
function fitBoundsToWorkArea(bounds, workArea, limits = {}) {
  const minWidthFloor = Number(limits.minWidth) > 0 ? Number(limits.minWidth) : 960;
  const minHeightFloor = Number(limits.minHeight) > 0 ? Number(limits.minHeight) : 640;
  const requestedW = Math.round(Number(bounds?.width) > 0 ? Number(bounds.width) : 1400);
  const requestedH = Math.round(Number(bounds?.height) > 0 ? Number(bounds.height) : 900);
  if (!workArea || !(workArea.width > 0) || !(workArea.height > 0)) {
    return {
      x: Number.isFinite(Number(bounds?.x)) ? Math.round(Number(bounds.x)) : undefined,
      y: Number.isFinite(Number(bounds?.y)) ? Math.round(Number(bounds.y)) : undefined,
      width: requestedW,
      height: requestedH,
      minWidth: minWidthFloor,
      minHeight: minHeightFloor,
    };
  }
  const width = Math.max(320, Math.min(requestedW, Math.round(workArea.width)));
  const height = Math.max(240, Math.min(requestedH, Math.round(workArea.height)));
  let x = Number.isFinite(Number(bounds?.x))
    ? Number(bounds.x)
    : workArea.x + (workArea.width - width) / 2;
  let y = Number.isFinite(Number(bounds?.y))
    ? Number(bounds.y)
    : workArea.y + (workArea.height - height) / 2;
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  if (x < workArea.x) x = workArea.x;
  if (y < workArea.y) y = workArea.y;
  if (x + width > right) x = right - width;
  if (y + height > bottom) y = bottom - height;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
    minWidth: Math.min(minWidthFloor, width),
    minHeight: Math.min(minHeightFloor, height),
  };
}

function measureWindowOcclusion(win) {
  const empty = { bottomInset: 0, topInset: 0, leftInset: 0, rightInset: 0 };
  if (!win || (typeof win.isDestroyed === "function" && win.isDestroyed())) return empty;
  try {
    const { screen } = require("electron");
    const windowBounds = win.getBounds();
    const contentBounds = typeof win.getContentBounds === "function" ? win.getContentBounds() : null;
    const bounds = clientBounds(windowBounds, contentBounds);
    const display = screen.getDisplayMatching(bounds || windowBounds);
    if (!bounds || !display?.workArea) return empty;
    return occlusionInsets({
      bounds,
      workArea: display.workArea,
    });
  } catch (_) {
    return empty;
  }
}

module.exports = {
  measureWindowOcclusion,
  occlusionInsets,
  fillsWorkArea,
  unionRect,
  clientBounds,
  fitBoundsToWorkArea,
};
