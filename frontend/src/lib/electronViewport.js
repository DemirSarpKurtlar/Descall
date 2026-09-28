/** Custom title bar height. Keep in sync with titlebar.css --electron-titlebar-h. */
export const ELECTRON_TITLEBAR_H = 40;

/**
 * Height of the app column under the custom title bar.
 *
 * On Windows a frameless window often maximizes to the full monitor, so
 * innerHeight includes the strip hidden behind the taskbar (~40px). That
 * strip cuts the nav-rail user icon in half. Shrink the content box so it
 * ends at the visible work area. A top taskbar is not a bottom inset.
 * Overlaps of 1–2px are DPI rounding and are ignored.
 */
export function electronContentBox(metrics) {
  const innerH = Number(metrics?.innerHeight) || 0;
  const availH = Number(metrics?.availHeight);
  const avail = Number.isFinite(availH) && availH > 0 ? availH : innerH;
  const taskbarOnTop = Number(metrics?.availTop) > 0;
  const overlap = Math.round(innerH - avail);
  const bottomInset = !taskbarOnTop && overlap > 2 ? overlap : 0;
  return {
    bottomInset,
    contentH: Math.max(0, innerH - ELECTRON_TITLEBAR_H - bottomInset),
  };
}
