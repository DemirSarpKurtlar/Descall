// Where the desktop message hover toolbar goes (pure, unit-tested).
//
// The pill is anchored to the message row's top-right, `inset` px inside the
// visible chat column. It must never cover the row header (avatar, name,
// badges, time) and never be clipped by the column. Candidates, in order:
//   1. full pill on the row's top edge (overlapping the bubble's top, Discord-like)
//   2. full pill above the row
//   3. compact pill (quick reactions folded into the emoji button) on the top edge
//   4. compact pill above the row
// (each size also tries just under the header, inside the row)
// The first candidate that fits wins; if none fits, the compact pill on the top
// edge is used (smallest footprint).
//
// All rects are viewport rects: { left, top, right, bottom }.

const intersects = (a, b, pad) =>
  a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

export function placeHoverToolbar({
  row,
  clip,
  bubble,
  obstacles = [],
  fullW,
  compactW,
  barH,
  inset = 10,
  overlap = 16,
  gap = 4,
}) {
  const right = Math.min(row.right, clip.right) - inset;
  const minLeft = clip.left + inset;
  const edgeTop = bubble.top - overlap;
  const aboveTop = row.top - barH - 4;
  // Just under the header (still inside the row, over the bubble's top-right).
  const belowTop = Math.max(edgeTop, ...obstacles.filter(Boolean).map((o) => o.bottom + gap));
  const candidates = [
    { compact: false, top: edgeTop, where: "edge" },
    { compact: false, top: aboveTop, where: "above" },
    { compact: false, top: belowTop, where: "below-header" },
    { compact: true, top: edgeTop, where: "edge" },
    { compact: true, top: aboveTop, where: "above" },
    { compact: true, top: belowTop, where: "below-header" },
  ];
  const fits = (c) => {
    const w = c.compact ? compactW : fullW;
    const rect = { left: right - w, right, top: c.top, bottom: c.top + barH };
    if (rect.left < minLeft) return null;
    if (rect.top < clip.top + 4 || rect.bottom > clip.bottom - 4) return null;
    if (obstacles.some((o) => o && intersects(rect, o, gap))) return null;
    return rect;
  };
  for (const c of candidates) {
    const rect = fits(c);
    if (rect) return { ...rect, compact: c.compact, where: c.where };
  }
  const left = Math.max(minLeft, right - compactW);
  return { left, right: left + compactW, top: belowTop, bottom: belowTop + barH, compact: true, where: "fallback" };
}
