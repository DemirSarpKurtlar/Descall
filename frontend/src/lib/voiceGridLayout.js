/**
 * Server voice room grid (components/servers/ServerVoicePanel.jsx).
 *
 * Up to 9 people the CSS bands (is-1 … is-9) size the tiles. From 10 people
 * on ("is-many") the old rule was a flex basis of 148px capped at 220px: with
 * 20 people on a 1440x900 desktop that gave 7 small columns using half the
 * room height, and a last row with wider tiles than the rows above.
 * fitVoiceGrid picks the column count that gives the largest equal tiles that
 * fit the room; when even the minimum tile does not fit, it keeps tiles at a
 * readable width and the grid scrolls (phones, short windows).
 */

export const VOICE_GRID_FIT_FROM = 10;
export const VOICE_TILE_MIN = 140;
export const VOICE_TILE_MAX = 360;
const ASPECT = 4 / 3;

export function gridBand(count) {
  if (count <= 1) return "is-1";
  if (count === 2) return "is-2";
  if (count <= 4) return "is-4";
  if (count <= 6) return "is-6";
  if (count <= 9) return "is-9";
  return "is-many";
}

export function avatarSizeFor(count, compact, tileWidth = 0) {
  if (compact) return 52;
  if (count <= 1) return 112;
  if (count === 2) return 88;
  if (count <= 4) return 72;
  // Fitted grids: a big tile gets the 4-up avatar, a narrow one a smaller one
  // so the avatar never runs into the name pill.
  if (tileWidth >= 260) return 72;
  if (tileWidth > 0 && tileWidth < 150) return 48;
  return 56;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Best equal-tile layout for `count` tiles in a width x height room.
 * Returns null when there is nothing to lay out (no size yet), otherwise
 * { columns, rows, tileWidth, flowWidth, scroll }.
 */
export function fitVoiceGrid({
  count,
  width,
  height,
  gap = 12,
  padding = 16,
  aspect = ASPECT,
  minTile = VOICE_TILE_MIN,
  maxTile = VOICE_TILE_MAX,
} = {}) {
  const n = Math.floor(num(count, 0));
  const w = num(width, 0);
  const h = num(height, 0);
  if (n < 1 || w <= 0 || h <= 0) return null;
  const g = Math.max(0, num(gap, 12));
  const p = Math.max(0, num(padding, 16));
  const innerW = Math.max(0, w - 2 * p);
  const innerH = Math.max(0, h - 2 * p);
  const tileForWidth = (cols) => (innerW - (cols - 1) * g) / cols;

  let best = null;
  for (let cols = 1; cols <= n; cols += 1) {
    const rows = Math.ceil(n / cols);
    const byWidth = tileForWidth(cols);
    const byHeight = ((innerH - (rows - 1) * g) / rows) * aspect;
    const tile = Math.min(byWidth, byHeight, maxTile);
    // Strictly larger wins, so ties keep fewer columns (fuller rows).
    if (!best || tile > best.tile + 0.5) best = { cols, rows, tile };
  }

  let { cols, rows, tile } = best;
  let scroll = false;
  if (tile < minTile) {
    // Nothing fits on one screen: as many readable columns as the width
    // allows, and the grid scrolls vertically.
    scroll = true;
    cols = Math.max(1, Math.min(n, Math.floor((innerW + g) / (minTile + g))));
    rows = Math.ceil(n / cols);
    tile = Math.min(tileForWidth(cols), maxTile);
  }
  const tileWidth = Math.max(1, Math.floor(tile));
  return {
    columns: cols,
    rows,
    tileWidth,
    flowWidth: Math.ceil(cols * tileWidth + (cols - 1) * g + 2 * p),
    scroll,
  };
}

export function sameVoiceGridFit(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.columns === b.columns && a.tileWidth === b.tileWidth && a.flowWidth === b.flowWidth && a.scroll === b.scroll;
}
