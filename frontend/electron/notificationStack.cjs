'use strict';

// Pure placement rules for Electron toasts (no electron import, so the
// selftest runs in CI without installing Electron).
const { NOTIF_WIDTH, MAX_VISIBLE, SHADOW_PAD } = require('./notificationCard.cjs');

/** Gap above the first capsule (work-area top). */
const NOTIF_MARGIN = 10;
/** Gap between stacked capsules. */
const NOTIF_GAP = 12;

/** Capsule width for a work area: 480 DIPs, narrower on very small screens. */
function capsuleWidth(area, width = NOTIF_WIDTH) {
  return Math.max(300, Math.min(width, Math.floor(area.width - 24)));
}

/**
 * Pure stack layout (unit-tested). 3.0.0 (mockup 33): capsules sit at the top
 * centre of the work area and stack downwards; calls always sit on top. All
 * values are DIPs, rounded to whole DIPs so the transparent window edges stay
 * crisp at 125 % / 150 %. x / y are the window origin (capsule minus pad).
 */
function stackPositions(area, entries, { width = NOTIF_WIDTH, margin = NOTIF_MARGIN, gap = NOTIF_GAP, pad = SHADOW_PAD } = {}) {
  const w = capsuleWidth(area, width);
  const ordered = [...entries].sort((a, b) => (b.type === 'call') - (a.type === 'call'));
  let cardY = area.y + margin;
  return ordered.map((entry) => {
    const pos = {
      entry,
      x: Math.round(area.x + (area.width - w) / 2 - pad),
      y: Math.round(cardY - pad),
      width: w,
    };
    cardY += entry.height + gap;
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

module.exports = { NOTIF_MARGIN, NOTIF_GAP, capsuleWidth, stackPositions, evictionsFor };
