/**
 * How many DIP a frameless window extends past the display work area.
 * Renderer `screen.availHeight` is unreliable when a maximized window is
 * painted under the Windows taskbar, which slices the rail user icon.
 * 1–2px is DPI rounding and is ignored.
 */
function measureWindowOcclusion(win) {
  if (!win || (typeof win.isDestroyed === "function" && win.isDestroyed())) {
    return { bottomInset: 0, topInset: 0 };
  }
  try {
    const { screen } = require("electron");
    const bounds = win.getBounds();
    const work = screen.getDisplayMatching(bounds)?.workArea;
    if (!bounds || !work) return { bottomInset: 0, topInset: 0 };
    const bottom = Math.round(bounds.y + bounds.height - (work.y + work.height));
    const top = Math.round(work.y - bounds.y);
    return {
      bottomInset: bottom > 2 ? bottom : 0,
      topInset: top > 2 ? top : 0,
    };
  } catch (_) {
    return { bottomInset: 0, topInset: 0 };
  }
}

module.exports = { measureWindowOcclusion };
