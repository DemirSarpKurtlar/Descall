/** Custom title bar height. Keep in sync with titlebar.css --electron-titlebar-h. */
export const ELECTRON_TITLEBAR_H = 40;

/**
 * Height of the app column under the custom title bar.
 *
 * Only a real overflow counts: innerHeight taller than the screen work area,
 * which is the client still painting across a bottom taskbar. A top taskbar
 * is not a bottom inset. 1–2px is DPI rounding.
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
