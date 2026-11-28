'use strict';

/**
 * Tiny raster icons for the taskbar thumbnail toolbar (no canvas, no image files): 16x16
 * glyphs (mic, mic off, headphones, headphones off, hang up). Pixels are BGRA for
 * nativeImage.createFromBitmap. Pure; windows.selftest.mjs checks the output. The unread
 * badge is free for every user now: electron/taskbarBadge.cjs.
 */

// 16x16 masks, '#' = ink.
const GLYPHS = {
  mic: [
    '................', '......####......', '.....######.....', '.....######.....', '.....######.....', '.....######.....',
    '..#..######..#..', '..#..######..#..', '..#...####...#..', '...#........#...', '....##....##....', '......####......',
    '.......##.......', '.......##.......', '.....######.....', '................',
  ],
  micOff: [
    '#...............', '.#....####......', '..#..######.....', '...#.######.....', '....#######.....', '.....######.....',
    '..#..######..#..', '..#..######..#..', '..#...#####..#..', '...#.....#..#...', '....##....##....', '......####.#....',
    '.......##....#..', '.......##.....#.', '.....######....#', '................',
  ],
  headphones: [
    '................', '.....######.....', '...##......##...', '..#..........#..', '.#............#.', '.#............#.',
    '#..............#', '#..............#', '####........####', '####........####', '####........####', '####........####',
    '####........####', '####........####', '.##..........##.', '................',
  ],
  headphonesOff: [
    '#...............', '.#...######.....', '..###......##...', '..##.........#..', '.#..#.........#.', '.#...#........#.',
    '#.....#........#', '#......#.......#', '####....#...####', '####.....#..####', '####......#.####', '####.......#####',
    '####........####', '####.........###', '.##..........##.', '...............#',
  ],
  hangup: [
    '................', '................', '................', '................', '.....######.....', '...##########...',
    '..############..', '.######..######.', '.#####....#####.', '.####......####.', '..##........##..', '................',
    '................', '................', '................', '................',
  ],
};

function bitmap(size) {
  return { size, data: Buffer.alloc(size * size * 4) };
}

function put(bmp, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= bmp.size || y >= bmp.size) return;
  const i = (y * bmp.size + x) * 4;
  bmp.data[i] = b;
  bmp.data[i + 1] = g;
  bmp.data[i + 2] = r;
  bmp.data[i + 3] = a;
}

/** Thumbnail toolbar glyph (white, or red for hang up). */
function glyph(name) {
  const mask = GLYPHS[name];
  if (!mask) return null;
  const bmp = bitmap(16);
  const color = name === 'hangup' ? [240, 71, 90, 255] : [255, 255, 255, 255];
  mask.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') put(bmp, x, y, color); }));
  return { width: 16, height: 16, data: bmp.data };
}

/** nativeImage from one of the above (electron only). */
function toNativeImage(img) {
  if (!img) return null;
  const { nativeImage } = require('electron');
  return nativeImage.createFromBitmap(img.data, { width: img.width, height: img.height });
}

module.exports = { glyph, toNativeImage, GLYPHS };
