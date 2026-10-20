// Where the desktop message hover toolbar goes (pure, unit-tested).
//
// The pill is anchored to the message CARD's top-right corner (the
// .message-group row, not the hovered bubble: a grouped follow-up message must
// not pull the pill down into the middle of the card), `right` px in from the
// card's right edge (clamped to the visible chat column), overlapping the card's
// top border by `overlap` px, Discord-style. It must never cover the row header
// (avatar, name, badges, time) and never be clipped by the column. Candidates:
//   1. full pill on the card's top edge
//   2. full pill just inside the card's top (first row, no room above)
//   3. compact pill (quick reactions folded into the emoji button), same two spots
//   4. under the header, inside the card (very narrow columns)
// If none fits, the compact pill inside the card's top-right is used.
//
// All rects are viewport rects: { left, top, right, bottom }.

const intersects = (a, b, pad) =>
  a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

export function placeHoverToolbar({
  row,
  clip,
  obstacles = [],
  fullW,
  compactW,
  barH,
  inset = 12,
  overlap = 16,
  gap = 4,
}) {
  const right = Math.min(row.right - inset, clip.right - 4);
  const minLeft = Math.max(row.left, clip.left) + 4;
  const edgeTop = row.top - overlap;
  const insideTop = Math.max(row.top + 6, clip.top + 4);
  const belowTop = Math.max(insideTop, ...obstacles.filter(Boolean).map((o) => o.bottom + gap));
  const candidates = [
    { compact: false, top: edgeTop, where: "edge" },
    { compact: false, top: insideTop, where: "inside" },
    { compact: true, top: edgeTop, where: "edge" },
    { compact: true, top: insideTop, where: "inside" },
    { compact: false, top: belowTop, where: "below-header" },
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
  return { left, right: left + compactW, top: insideTop, bottom: insideTop + barH, compact: true, where: "fallback" };
}
