'use strict';

/**
 * Unread badge on the app icon, for every user (owner request: "like Discord"). Windows: a
 * red disc with a white bold count ("9+" above 9) as the taskbar overlay icon, drawn at the
 * display's scale factor (16 px at 100 %, 32 px at 200 %); macOS: the dock badge; Linux:
 * app.setBadgeCount (launchers that support it). No badge at 0.
 *
 * The count is the page's own unread total (DMs + groups, the tray panel's "Messages"
 * badge), sent with the tray state as badgeCount (src/hooks/useDesktopTray.js); the page
 * sends 0 when the user turned the badge off (Settings > Desktop app) or is signed out.
 * Descall+ taskbar_plus only adds the thumbnail call buttons now; this is the one owner of
 * the overlay icon.
 *
 * The raster is pure and has a Rust twin (desktop/crates/descall-shell/src/taskbar_badge.rs):
 * same geometry, same sampling, no trigonometry at run time, so both shells draw the same
 * pixels (taskbarBadge.selftest.mjs and the Rust test pin the same checksums).
 */

const zlib = require('zlib');

const RED = [242, 63, 67];
const WHITE = [255, 255, 255];
/** Samples per pixel along each axis (16 per pixel). */
const SS = 4;

// cos / sin of k * 15 degrees, k = 0..23 (angles grow clockwise: y points down). Literal
// values, so JS and Rust use the very same numbers.
const COS15 = [
  1, 0.9659258262890683, 0.8660254037844387, 0.7071067811865476, 0.5, 0.25881904510252074,
  0, -0.25881904510252074, -0.5, -0.7071067811865476, -0.8660254037844387, -0.9659258262890683,
  -1, -0.9659258262890683, -0.8660254037844387, -0.7071067811865476, -0.5, -0.25881904510252074,
  0, 0.25881904510252074, 0.5, 0.7071067811865476, 0.8660254037844387, 0.9659258262890683,
];
const sin15 = (k) => COS15[(((k - 6) % 24) + 24) % 24];
const cos15 = (k) => COS15[((k % 24) + 24) % 24];

/** Elliptical arc in glyph units, from a0 to a1 (degrees, multiples of 15, a1 > a0). */
function arc(cx, cy, rx, ry, a0, a1) {
  const pts = [];
  for (let a = a0; a <= a1; a += 15) {
    const k = a / 15;
    pts.push([cx + rx * cos15(k), cy + ry * sin15(k)]);
  }
  return pts;
}

/**
 * Centre lines of each glyph: polylines in a box where u = 0..1 runs from the left to the
 * right stroke centre and v = 0..1 from the top to the bottom one. `r` is the corner radius
 * (in v units) that keeps the bowls round for the glyph's aspect.
 */
function glyphLines(ch, r) {
  const join = (...parts) => parts.flat();
  switch (ch) {
    case '0':
      return [join(arc(0.5, r, 0.5, r, 180, 360), arc(0.5, 1 - r, 0.5, r, 0, 180), [[0, r]])];
    case '1':
      return [[[0.08, 0.24], [0.5, 0], [0.5, 1]]];
    case '2':
      return [join(arc(0.5, r, 0.5, r, 180, 390), [[0, 1], [1, 1]])];
    case '3':
      return [join(arc(0.5, 0.25, 0.46, 0.25, 195, 450), arc(0.5, 0.75, 0.5, 0.25, 270, 525))];
    case '4':
      return [[[0.75, 1], [0.75, 0], [0, 0.68], [1, 0.68]]];
    case '5':
      return [join([[1, 0], [0.06, 0], [0.02, 0.46]], arc(0.48, 0.68, 0.52, 0.32, 240, 495))];
    case '6':
      return [join(arc(0.5, 0.68, 0.5, 0.32, 180, 540)), join([[0, 0.68]], arc(0.56, 0.5, 0.56, 0.5, 180, 285))];
    case '7':
      return [[[0, 0], [1, 0], [0.34, 1]]];
    case '8':
      return [join(arc(0.5, 0.24, 0.42, 0.24, 0, 360)), join(arc(0.5, 0.73, 0.5, 0.27, 0, 360))];
    case '9':
      return glyphLines('6', r).map((line) => line.map(([u, v]) => [1 - u, 1 - v]));
    case '+':
      return [[[0, 0.5], [1, 0.5]], [[0.5, 0.5 - r], [0.5, 0.5 + r]]];
    default:
      return [];
  }
}

const round = (x) => Math.floor(x + 0.5);

/** "3", "9+" (Discord shows 9+ above nine). "" for 0. */
function badgeText(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return '';
  return n > 9 ? '9+' : String(n);
}

/** Overlay size in device pixels for a display scale factor (16 px at 100 %). */
function badgeSize(scaleFactor) {
  const s = Number(scaleFactor);
  return Math.max(16, Math.min(64, round(16 * (Number.isFinite(s) && s > 0 ? s : 1))));
}

/**
 * Text box at `size` px: glyph width / height, stroke, gap, origin. Whole pixels (and a
 * whole-pixel stroke up to 24 px), so the straight strokes land on pixel edges at 16 px.
 */
function layout(text, size) {
  const two = text.length > 1;
  let gh = round(size * (two ? 0.5 : 0.6));
  let gw = round(size * (two ? 0.31 : 0.38));
  let sw = size * (two ? 0.125 : 0.14);
  if (size <= 24) sw = Math.max(2, round(sw));
  let gap = two ? Math.max(1, round(size * 0.06)) : 0;
  if ((size - gh) % 2) gh += 1;
  const total = () => text.length * gw + (text.length - 1) * gap;
  if ((size - total()) % 2) {
    if (two) gap += 1;
    else gw += 1;
  }
  return { gw, gh, sw, gap, x0: (size - total()) / 2, y0: (size - gh) / 2 };
}

/** Stroke segments in pixels: [x1, y1, x2, y2] for every glyph of `text`. */
function segments(text, size) {
  const L = layout(text, size);
  const cw = L.gw - L.sw;
  const chh = L.gh - L.sw;
  const r = Math.min(0.5, (cw / 2) / chh);
  const out = [];
  [...text].forEach((ch, i) => {
    const ox = L.x0 + i * (L.gw + L.gap) + L.sw / 2;
    const oy = L.y0 + L.sw / 2;
    for (const line of glyphLines(ch, r)) {
      for (let j = 1; j < line.length; j += 1) {
        out.push([ox + line[j - 1][0] * cw, oy + line[j - 1][1] * chh, ox + line[j][0] * cw, oy + line[j][1] * chh]);
      }
    }
  });
  return { segs: out, half: L.sw / 2 };
}

function nearSegment(px, py, segs, half2) {
  for (let i = 0; i < segs.length; i += 1) {
    const [x1, y1, x2, y2] = segs[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const ex = px - (x1 + t * dx);
    const ey = py - (y1 + t * dy);
    if (ex * ex + ey * ey <= half2) return true;
  }
  return false;
}

/**
 * The badge as straight RGBA, `size` x `size`, or null for 0 (no badge).
 * { width, height, data: Buffer (RGBA), text }
 */
function renderBadge(count, size = 16) {
  const text = badgeText(count);
  if (!text) return null;
  const S = Math.max(8, Math.min(256, Math.floor(Number(size) || 16)));
  const { segs, half } = segments(text, S);
  const half2 = half * half;
  const c = S / 2;
  const r2 = c * c;
  const data = Buffer.alloc(S * S * 4);
  const N = SS * SS;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      let disc = 0;
      let ink = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        const py = y + (sy + 0.5) / SS;
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x + (sx + 0.5) / SS;
          const dx = px - c;
          const dy = py - c;
          if (dx * dx + dy * dy > r2) continue;
          disc += 1;
          if (nearSegment(px, py, segs, half2)) ink += 1;
        }
      }
      if (!disc) continue;
      const i = (y * S + x) * 4;
      for (let k = 0; k < 3; k += 1) data[i + k] = round((WHITE[k] * ink + RED[k] * (disc - ink)) / disc);
      data[i + 3] = round((255 * disc) / N);
    }
  }
  return { width: S, height: S, data, text };
}

/** RGBA -> BGRA copy (nativeImage.createFromBitmap). */
function toBgra(rgba) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = rgba[i + 2];
    out[i + 2] = rgba[i];
  }
  return out;
}

/** FNV-1a 32 over the pixels: the cross-shell checksum the selftests pin. */
function checksum(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 1) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---- PNG (previews, docs) ------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** RGBA image -> PNG bytes. */
function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- controller (main process) -------------------------------------------------------------

/** Dock text on macOS (the dock has room for more than the overlay). */
function dockText(n) {
  return n ? (n > 99 ? '99+' : String(n)) : '';
}

/**
 * @param {object} o
 * @param {object} o.electron                 { app, nativeImage, screen }
 * @param {() => BrowserWindow|null} o.getWindow
 * @param {(n:number) => string} [o.describe] overlay description for screen readers
 * @param {object} [o.log]
 * @param {string} [o.platform]
 */
function createTaskbarBadge({ electron, getWindow, describe = (n) => String(n), log = console, platform = process.platform }) {
  let count = 0;
  let lastKey = null;
  const images = new Map();

  function scaleFor(win) {
    try {
      return electron.screen.getDisplayMatching(win.getBounds()).scaleFactor;
    } catch (_) {
      return 1;
    }
  }

  function image(n, size) {
    const text = badgeText(n);
    const key = `${text}|${size}`;
    if (!images.has(key)) {
      const img = renderBadge(n, size);
      images.set(key, electron.nativeImage.createFromBitmap(toBgra(img.data), { width: img.width, height: img.height }));
    }
    return images.get(key);
  }

  function apply(force) {
    const n = count;
    try {
      if (platform === 'win32') {
        const win = getWindow();
        if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
        const size = n ? badgeSize(scaleFor(win)) : 0;
        const key = `${n}|${size}`;
        if (!force && key === lastKey) return;
        lastKey = key;
        win.setOverlayIcon(n ? image(n, size) : null, n ? describe(n) : '');
      } else {
        const key = String(n);
        if (!force && key === lastKey) return;
        lastKey = key;
        if (platform === 'darwin') electron.app.dock?.setBadge(dockText(n));
        else electron.app.setBadgeCount(n);
      }
    } catch (err) {
      lastKey = null;
      log?.warn?.('[taskbar] badge failed:', err?.message || err);
    }
  }

  return {
    /** New unread count from the page (already 0 when the badge is off). */
    set(n) {
      const next = Math.max(0, Math.min(99999, Math.floor(Number(n) || 0)));
      if (next === count && lastKey !== null) return;
      count = next;
      apply(false);
    },
    /** Again on the current button: shown from the tray (the new taskbar button has no overlay). */
    refresh() {
      if (count) apply(true);
    },
    /** The window may sit on a display with another scale factor: redrawn when the size changes. */
    rescale() {
      if (count) apply(false);
    },
    get count() {
      return count;
    },
  };
}

module.exports = { badgeText, badgeSize, layout, renderBadge, toBgra, checksum, encodePng, dockText, createTaskbarBadge };
