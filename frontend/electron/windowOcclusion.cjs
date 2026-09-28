/**
 * How many DIP a frameless window extends past the display work area.
 * A maximized frameless window on Windows is painted across the taskbar
 * even when getBounds() is clamped to the work area. 1–2px is DPI rounding.
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
 * @param {{
 *   bounds: object,
 *   workArea: object,
 *   displayBounds?: object,
 *   maximized?: boolean,
 *   treatMaximizedAsCovering?: boolean,
 * }} input
 * treatMaximizedAsCovering: Windows frameless maximize often reports work-area
 * bounds while the window still paints across the taskbar.
 */
function occlusionInsets({ bounds, workArea, displayBounds, maximized, treatMaximizedAsCovering }) {
  const empty = { bottomInset: 0, topInset: 0, leftInset: 0, rightInset: 0 };
  if (!bounds || !workArea) return empty;

  let bottom = Math.round(bounds.y + bounds.height - (workArea.y + workArea.height));
  let top = Math.round(workArea.y - bounds.y);
  let left = Math.round(workArea.x - bounds.x);
  let right = Math.round(bounds.x + bounds.width - (workArea.x + workArea.width));

  if (maximized && displayBounds) {
    const displayBottom = displayBounds.y + displayBounds.height;
    const displayRight = displayBounds.x + displayBounds.width;
    const boundsBottom = bounds.y + bounds.height;
    const boundsRight = bounds.x + bounds.width;
    const taskbarBottom = Math.round(displayBottom - (workArea.y + workArea.height));
    const taskbarTop = Math.round(workArea.y - displayBounds.y);
    const taskbarLeft = Math.round(workArea.x - displayBounds.x);
    const taskbarRight = Math.round(displayRight - (workArea.x + workArea.width));
    const fills = Boolean(treatMaximizedAsCovering) && fillsWorkArea(bounds, workArea);
    if ((fills || boundsBottom >= displayBottom - 2) && taskbarBottom > 2) bottom = Math.max(bottom, taskbarBottom);
    if ((fills || bounds.y <= displayBounds.y + 2) && taskbarTop > 2) top = Math.max(top, taskbarTop);
    if ((fills || bounds.x <= displayBounds.x + 2) && taskbarLeft > 2) left = Math.max(left, taskbarLeft);
    if ((fills || boundsRight >= displayRight - 2) && taskbarRight > 2) right = Math.max(right, taskbarRight);
  }

  return {
    bottomInset: keepInset(bottom),
    topInset: keepInset(top),
    leftInset: keepInset(left),
    rightInset: keepInset(right),
  };
}

function measureWindowOcclusion(win) {
  const empty = { bottomInset: 0, topInset: 0, leftInset: 0, rightInset: 0 };
  if (!win || (typeof win.isDestroyed === "function" && win.isDestroyed())) return empty;
  try {
    const { screen } = require("electron");
    const windowBounds = win.getBounds();
    const contentBounds = typeof win.getContentBounds === "function" ? win.getContentBounds() : null;
    const bounds = unionRect(windowBounds, contentBounds);
    const display = screen.getDisplayMatching(bounds || windowBounds);
    if (!bounds || !display?.workArea) return empty;
    const maximized = typeof win.isMaximized === "function" && win.isMaximized();
    return occlusionInsets({
      bounds,
      workArea: display.workArea,
      displayBounds: display.bounds,
      maximized,
      treatMaximizedAsCovering: maximized && process.platform === "win32",
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
};
