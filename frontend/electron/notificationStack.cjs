'use strict';

// Pure placement rules for Electron toasts (no electron import, so the
// selftest runs in CI without installing Electron).
const { NOTIF_WIDTH, MAX_VISIBLE, SHADOW_PAD } = require('./notificationCard.cjs');

const NOTIF_MARGIN = 12;

/**
 * Pure stack layout (unit-tested). Cards stack down from the top-right of
 * the work area; calls always sit on top. All values are DIPs, so the stack
 * is identical at any DPI; positions are rounded to whole DIPs to keep the
 * transparent window edges crisp at 125 % / 150 %.
 */
function stackPositions(area, entries, { width = NOTIF_WIDTH, margin = NOTIF_MARGIN, pad = SHADOW_PAD } = {}) {
  const ordered = [...entries].sort((a, b) => (b.type === 'call') - (a.type === 'call'));
  let cardY = area.y + margin;
  return ordered.map((entry) => {
    const pos = {
      entry,
      x: Math.round(area.x + area.width - width - margin - pad),
      y: Math.round(cardY - pad),
    };
    cardY += entry.height + margin;
    return pos;
  });
}

/**
 * Which toasts to dismiss so that at most `max` are visible after adding
 * one more. Oldest non-call toasts go first; calls are never evicted.
 */
function evictionsFor(entries, max = MAX_VISIBLE) {
  const overflow = entries.length + 1 - max;
  if (overflow <= 0) return [];
  return entries.filter((e) => e.type !== 'call').slice(0, overflow);
}

module.exports = { NOTIF_MARGIN, stackPositions, evictionsFor };
