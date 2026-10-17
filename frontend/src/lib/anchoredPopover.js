/**
 * Placement for a popover anchored under a header button (2.10.109).
 * Pure so it can be tested in Node (anchoredPopover.selftest.mjs).
 *
 * The popover hangs under the anchor, right edges aligned (header actions sit
 * on the right), clamped to the viewport with `margin` on both sides, and
 * grows from the anchor (transform-origin at the anchor's centre).
 */
export function computeAnchoredPopover({
  anchor,
  viewportWidth,
  viewportHeight,
  preferredWidth = 360,
  gap = 8,
  margin = 12,
  minHeight = 160,
  maxHeight = 480,
} = {}) {
  const vw = Math.max(0, Number(viewportWidth) || 0);
  const vh = Math.max(0, Number(viewportHeight) || 0);
  // Phones: a sheet-width popover (edge to edge minus margins) reads better
  // than a 360px card floating off-centre.
  const room = Math.max(0, vw - margin * 2);
  const width = room < preferredWidth + 48 ? room : preferredWidth;
  if (!anchor) {
    return { top: margin, left: Math.max(margin, vw - margin - width), width, maxHeight: Math.max(minHeight, Math.min(maxHeight, vh - margin * 2)), originX: width, placement: "fallback" };
  }
  const top = Math.round(anchor.bottom + gap);
  // Right-align with the anchor, then clamp inside the viewport.
  let left = Math.round(anchor.right - width);
  left = Math.min(left, vw - margin - width);
  left = Math.max(left, margin);
  const available = vh - top - margin;
  const height = Math.max(Math.min(minHeight, available), Math.min(maxHeight, available));
  const anchorCenter = anchor.left + (anchor.right - anchor.left) / 2;
  const originX = Math.round(Math.min(width, Math.max(0, anchorCenter - left)));
  return { top, left, width, maxHeight: Math.max(0, height), originX, placement: "below" };
}

/** True when a pointer/click target is outside every given element. */
export function isOutside(target, ...elements) {
  if (!target) return true;
  return elements.every((el) => !el || (el !== target && !(typeof el.contains === "function" && el.contains(target))));
}
