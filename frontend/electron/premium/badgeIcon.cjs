'use strict';

/**
 * Tiny raster icons for the taskbar (no canvas, no image files): an unread badge
 * (red disc with 1-2 digits or "9+") and 16x16 glyphs for the thumbnail toolbar
 * (mic, mic off, headphones, headphones off, hang up). Pixels are BGRA for
 * nativeImage.createFromBitmap. Pure; premium.selftest.mjs checks the output.
 */

const FONT = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
};

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

/** Overlay badge: red disc, white count. 0 -> null (no badge). */
function unreadBadge(count, size = 16) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return null;
  const text = n > 9 ? '9+' : String(n);
  const bmp = bitmap(size);
  const c = (size - 1) / 2;
  const r = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - c, y - c);
      if (d <= r - 0.5) put(bmp, x, y, [232, 64, 82, 255]);
      else if (d <= r) put(bmp, x, y, [232, 64, 82, 140]);
    }
  }
  const scale = Math.max(1, Math.floor(size / 8));
  const charW = 3 * scale;
  const gap = scale;
  const totalW = text.length * charW + (text.length - 1) * gap;
  const x0 = Math.round((size - totalW) / 2);
  const y0 = Math.round((size - 5 * scale) / 2);
  [...text].forEach((ch, i) => {
    const rows = FONT[ch];
    rows.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== '1') return;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            put(bmp, x0 + i * (charW + gap) + rx * scale + sx, y0 + ry * scale + sy, [255, 255, 255, 255]);
          }
        }
      });
    });
  });
  return { width: size, height: size, data: bmp.data, text };
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

module.exports = { unreadBadge, glyph, toNativeImage, GLYPHS };
