// Where the desktop message hover toolbar goes (pure, unit-tested).
//
// The pill sits directly ABOVE the hovered bubble: `gap` px over its top edge,
// left-aligned to the bubble's left edge (right-aligned to the bubble's right
// edge when the left-aligned pill would overflow the visible chat column).
// It never covers the row header (avatar, name, badges, time) or the floating
// conversation header, and is never clipped. Candidates, in order:
//   1. full pill above the bubble, left-aligned        ("above")
//   2. full pill above the bubble, right-aligned       ("above-right")
//   3. compact pill (quick reactions folded) at 1 / 2
//   4. "above-beside-header": first bubble under the header: same height,
//      slid right past the name/badges/date (header and text both visible)
//   5. "edge": the bubble is the first under the header and there is no room
//      above it, so the pill straddles the bubble's top edge, left-aligned,
//      starting just under the header (header stays visible; it still reads
//      as sitting on top of the bubble).
// Horizontal position is always clamped inside the column.
//
// All rects are viewport rects: { left, top, right, bottom }.

const intersects = (a, b, pad) =>
  a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

export function placeHoverToolbar({
  bubble,
  clip,
  obstacles = [],
  fullW,
  compactW,
  barH,
  gap = 6,
  inset = 4,
}) {
  const minLeft = clip.left + inset;
  const maxRight = clip.right - inset;
  const aboveTop = bubble.top - gap - barH;
  const xFor = (w, align) => {
    let left = align === "left" ? bubble.left : bubble.right - w;
    if (left + w > maxRight) left = maxRight - w;
    if (left < minLeft) left = minLeft;
    return left;
  };
  const rectFor = (w, align, top) => {
    const left = xFor(w, align);
    return { left, right: left + w, top, bottom: top + barH };
  };
  const ok = (r) =>
    r.right <= maxRight + 0.5 && r.left >= minLeft - 0.5 &&
    r.top >= clip.top + inset && r.bottom <= clip.bottom - inset &&
    !obstacles.some((o) => o && intersects(r, o, 2));
  const tries = [
    [false, "left", "above"], [false, "right", "above-right"],
    [true, "left", "above"], [true, "right", "above-right"],
  ];
  for (const [compact, align, where] of tries) {
    const fitsLeft = bubble.left + (compact ? compactW : fullW) <= maxRight;
    if (align === "left" && !fitsLeft) continue;
    const r = rectFor(compact ? compactW : fullW, align, aboveTop);
    if (ok(r)) return { ...r, compact, where };
  }
  // First bubble under the header: same row above the bubble, slid right past
  // the name/badges/date so the header stays visible and the text is not covered.
  for (const compact of [false, true]) {
    const w = compact ? compactW : fullW;
    const band = { top: aboveTop, bottom: aboveTop + barH };
    const blockers = obstacles.filter((o) => o && o.top < band.bottom + 2 && o.bottom > band.top - 2 && o.right > bubble.left - 200);
    const left = Math.max(bubble.left, ...blockers.map((o) => o.right + 8));
    const r = { left, right: left + w, top: aboveTop, bottom: aboveTop + barH };
    if (ok(r)) return { ...r, compact, where: "above-beside-header" };
  }
  // No room above: straddle the bubble's top edge just under the header.
  const floor = Math.max(clip.top + inset, ...obstacles.filter(Boolean)
    .filter((o) => o.bottom <= bubble.top + 2 && o.right > bubble.left - 200)
    .map((o) => o.bottom + gap));
  const top = Math.min(Math.max(aboveTop, floor), clip.bottom - inset - barH);
  for (const compact of [false, true]) {
    const w = compact ? compactW : fullW;
    const r = rectFor(w, bubble.left + w <= maxRight ? "left" : "right", top);
    if (r.left >= minLeft - 0.5) return { ...r, compact, where: "edge" };
  }
  const r = rectFor(compactW, "left", top);
  return { ...r, compact: true, where: "edge" };
}
