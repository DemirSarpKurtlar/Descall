'use strict';

// Gaming HUD (Ultra): clock, ping to Descall / LiveKit, call info and friends who are online.
// It never reads the game's FPS: that needs injection into the game or admin-level
// event tracing (ETW / PresentMon), both off limits (anti-cheat, privileges).
const { createHudFeature } = require('../hudFeature.cjs');
const { wrapFeature } = require('../compat.cjs');

module.exports = wrapFeature(createHudFeature({
  key: 'gaming_hud',
  kind: 'gaming',
  defaults: { corner: 'tr', width: 230 },
  heightFor: (s) => {
    const show = s.show || {};
    let h = 52;
    if (show.clock !== false) h += 20;
    if (show.ping !== false) h += 20 * ((s.ping && s.ping.livekit != null) ? 2 : 1);
    if (show.call !== false) h += 54;
    if (show.friends !== false) h += 46 + 34 * Math.max(1, Math.min(6, (s.friends || []).length));
    return h;
  },
}));
