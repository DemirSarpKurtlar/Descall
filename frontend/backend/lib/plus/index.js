"use strict";

/**
 * Descall+ 2.0 wiring (server.js calls init once). Small named hooks for other areas:
 *   plus.grantStreakTicket(userId, streakKey)   growth-reengage: a 30-day streak bonus ticket
 *   plus.publicWall(serverId)                   public server page (/s/<slug>) thank-you wall
 *   plus.animatedProfile.check(req, {...})      media.js / profile save: animated avatar & banner gate
 *   plus.screenCeilingFor(userId, {...})        LiveKit token payloads: the screen share ceiling
 */

const config = require("./config");
const notify = require("./notify");
const scheduler = require("./scheduler");
const fulfil = require("./payments/fulfil");
const service = require("./service");
const animatedProfile = require("./animatedProfile");

let started = false;

function init({ getIo } = {}) {
  if (started) return;
  started = true;
  fulfil.configure({
    invalidate: (userId) => notify.premiumChanged(userId, { kind: "payment" }),
    emit: (userId, payload) => notify.toUser(userId, payload),
    afterGiftPaid: async (gift) => {
      if (new Date(gift.deliver_at).getTime() <= Date.now() + 1000) await scheduler.deliverNow();
    },
  });
  try { notify.bind(getIo?.()); } catch { /* bound later by the routes */ }
  if (process.env.NODE_ENV !== "test") scheduler.start({ getIo });
}

/** Screen share ceiling for one person in one place (null when nothing limits them). */
async function screenCeilingFor(userId, { serverId = null, platform = "web" } = {}) {
  try {
    const l = await service.limitsFor(userId, { serverId, platform });
    if (!l.active) return null;
    return { height: l.screen.height, fps: l.screen.fps, locked: l.screen.locked, tier: l.tier, serverLevel: l.serverLevel };
  } catch {
    return null;
  }
}

module.exports = {
  init,
  config,
  animatedProfile,
  screenCeilingFor,
  grantStreakTicket: service.grantStreakTicket,
  publicWall: service.publicWall,
};
