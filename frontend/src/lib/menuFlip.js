/**
 * Whether a menu that normally opens below an anchor should open above it instead.
 * The usable bottom is the lowest of: the scroll list's bottom, the top of a composer that
 * floats over the list (only composers below the anchor count), and the viewport.
 * Flip only when the menu does not fit below and fits above; when neither side fits, use
 * the side with more room.
 */
export function shouldFlipMenuUp({ bar, list, menuHeight, composerTops = [], viewportHeight = Infinity, gap = 6, margin = 8 }) {
  if (!bar || !list || !(menuHeight > 0)) return false;
  let bottom = Math.min(list.bottom, viewportHeight);
  for (const top of composerTops) {
    if (Number.isFinite(top) && top > bar.bottom && top < bottom) bottom = top;
  }
  const top = Math.max(list.top, 0);
  const below = bottom - margin - (bar.bottom + gap);
  const above = bar.top - gap - (top + margin);
  if (below >= menuHeight) return false;
  if (above >= menuHeight) return true;
  return above > below;
}
