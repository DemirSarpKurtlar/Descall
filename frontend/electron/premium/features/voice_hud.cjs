'use strict';

// Voice HUD (Ultra): who is in the voice session and who is speaking, click-through, always on top.
const { createHudFeature } = require('../hudFeature.cjs');
const { wrapFeature } = require('../compat.cjs');

module.exports = wrapFeature(createHudFeature({
  key: 'voice_hud',
  kind: 'voice',
  defaults: { corner: 'tl', width: 220 },
  heightFor: (s) => 58 + 34 * Math.max(1, Math.min(10, (s.members || []).length)),
}));
