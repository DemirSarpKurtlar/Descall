/**
 * GIF grids (chat GiphyPicker + profile media picker): masonry packing by each GIF's REAL
 * aspect ratio (GIPHY width/height). A CSS grid row is as tall as its tallest cell, which
 * left uneven holes under shorter GIFs; square cells cropped every GIF. Here every GIF goes
 * to the currently shortest column (stable, keeps GIPHY's order as far as possible), so the
 * columns end within one GIF of each other and the gaps are one constant value.
 */

/** height / width of a GIPHY rendition (or a picker tile), clamped only against broken data. */
export function gifRatio(item) {
  if (!item) return 1;
  const w = Number(item.width);
  const h = Number(item.height);
  if (!(w > 0) || !(h > 0)) return 1;
  // 1:6 .. 6:1 only guards against corrupt metadata; real GIFs keep their true shape.
  return Math.min(6, Math.max(1 / 6, h / w));
}

/** GIPHY gif object -> the rendition used for the chat grid thumbnail (url + size). */
export function giphyThumb(gif) {
  const im = gif?.images || {};
  const r = im.fixed_width_small || im.fixed_width || im.fixed_height_small || im.preview_gif || im.original || {};
  return { url: r.url || "", width: Number(r.width) || 0, height: Number(r.height) || 0 };
}

/**
 * Split items into `count` columns, each item into the shortest column so far.
 * `gap` is in units of column width (gap px / column px) so it matches the rendered layout.
 * @returns {Array<Array<{item:any, ratio:number, index:number}>>}
 */
export function masonryColumns(items, count, ratioOf = gifRatio, gap = 0) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const cols = Array.from({ length: n }, () => []);
  const heights = new Array(n).fill(0);
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const ratio = ratioOf(item);
    let best = 0;
    for (let c = 1; c < n; c += 1) if (heights[c] < heights[best] - 1e-9) best = c;
    cols[best].push({ item, ratio, index });
    heights[best] += ratio + (cols[best].length > 1 ? gap : 0);
  });
  return cols;
}

/** Column count for a grid of `width` px: about `target` px per column, never under `min`. */
export function masonryColumnCount(width, { target = 130, min = 2, max = 5 } = {}) {
  const w = Number(width);
  if (!(w > 0)) return min;
  return Math.max(min, Math.min(max, Math.round(w / target)));
}
