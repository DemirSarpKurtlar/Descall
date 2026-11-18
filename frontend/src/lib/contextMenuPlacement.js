/**
 * Place a pointer-opened context menu inside the viewport (server voice member menu).
 * Opens at the pointer, flips above it when it does not fit below, then shifts so the
 * whole menu stays on screen. A menu taller than the viewport gets `maxHeight` and
 * scrolls instead of running off the bottom (owner report, Nov 2026: "Taşı..." list cut off).
 */
export function placeContextMenu({ x = 0, y = 0, width = 0, height = 0, viewportWidth = 0, viewportHeight = 0, margin = 8 } = {}) {
  const vw = Math.max(0, Number(viewportWidth) || 0);
  const vh = Math.max(0, Number(viewportHeight) || 0);
  const w = Math.max(0, Number(width) || 0);
  const maxHeight = Math.max(0, vh - margin * 2);
  const h = Math.min(Math.max(0, Number(height) || 0), maxHeight);
  const px = Number(x) || 0;
  const py = Number(y) || 0;

  let left = px;
  if (left + w > vw - margin) left = px - w;
  left = Math.max(margin, Math.min(left, vw - w - margin));

  let top = py;
  let flipped = false;
  if (top + h > vh - margin) {
    const roomBelow = vh - margin - py;
    const roomAbove = py - margin;
    if (roomAbove >= h || roomAbove > roomBelow) {
      top = py - h;
      flipped = true;
    }
  }
  top = Math.max(margin, Math.min(top, vh - h - margin));
  return { left: Math.round(left), top: Math.round(top), maxHeight: Math.round(maxHeight), flipped };
}
