'use strict';

/**
 * Main window size, position and maximized state across launches (polish pass: every
 * launch used to open a centred 1400×900 window). Pure helpers, tested by
 * windowState.selftest.mjs; main.cjs does the file and BrowserWindow work.
 */

const { fitBoundsToWorkArea } = require('./windowOcclusion.cjs');

const WINDOW_STATE_FILE = 'window-state.json';

/** Saved JSON → { x, y, width, height, maximized } or null. */
function parseWindowState(text) {
  let raw;
  try { raw = JSON.parse(String(text || '')); } catch (_) { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const n = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  const x = n(raw.x); const y = n(raw.y); const width = n(raw.width); const height = n(raw.height);
  if (x === null || y === null || !(width > 0) || !(height > 0)) return null;
  return { x, y, width, height, maximized: raw.maximized === true };
}

/**
 * Bounds to restore on the display that holds the saved window's centre, fitted into its
 * work area (a monitor that is gone, or a smaller one, never leaves the window off screen).
 * null → fall back to the default centred size.
 */
function pickRestoreBounds(saved, displays, limits = {}) {
  if (!saved) return null;
  const cx = saved.x + saved.width / 2;
  const cy = saved.y + saved.height / 2;
  const list = (Array.isArray(displays) ? displays : []).filter((d) => d && d.workArea && d.workArea.width > 0);
  const overlap = (a) => Math.max(0, Math.min(saved.x + saved.width, a.x + a.width) - Math.max(saved.x, a.x))
    * Math.max(0, Math.min(saved.y + saved.height, a.y + a.height) - Math.max(saved.y, a.y));
  // The display under the centre; else the one the window overlaps most (taller than the screen).
  let host = list.find(({ workArea: a }) => cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height);
  if (!host) {
    let best = 0;
    for (const d of list) { const o = overlap(d.workArea); if (o > best) { best = o; host = d; } }
  }
  if (!host) return null;
  return { ...fitBoundsToWorkArea(saved, host.workArea, limits), maximized: saved.maximized };
}

/** What to write for a window: its normal (restored) bounds plus the maximized flag. */
function serializeWindowState({ normalBounds, maximized }) {
  const b = normalBounds || {};
  if (!(b.width > 0) || !(b.height > 0)) return null;
  return JSON.stringify({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height), maximized: Boolean(maximized) });
}

module.exports = { WINDOW_STATE_FILE, parseWindowState, pickRestoreBounds, serializeWindowState };
