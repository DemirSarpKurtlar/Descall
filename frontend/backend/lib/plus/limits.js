"use strict";

/**
 * Pure rules: server levels from boost counts, and the effective limits for one person in one
 * place (their tier + the server's level), including the screen share ceiling.
 *
 * Owner decision (27 Nov): free = 1080p / 30, Descall+ = 1440p / 60, Ultra = 1440p / 60 source
 * quality, all admin-editable. The free limit only applies where selling is on for that platform
 * (config.salesOn), so nobody is downgraded while they cannot buy the upgrade: until then everyone
 * keeps 1440p / 60. An active share is never interrupted (clients apply a new ceiling to the next
 * share only; the server never mutes unless the admin turns screenEnforce.mute on).
 */

const config = require("./config");

const OPEN = Object.freeze({ screenHeight: 1440, screenFps: 60, uploadMb: 100, audioKbps: 128 });
// Today's hard upload cap (multer memory storage in routes/media.js). Larger tiers are shown as the
// plan's promise but uploads above this need direct-to-storage uploads (not part of this change).
const HARD_UPLOAD_MB = 100;

/** Level 0..3 for a boost count with thresholds like [2, 5, 10]. */
function levelFor(count, levels) {
  const n = Math.max(0, Number(count) || 0);
  let lv = 0;
  (levels || []).forEach((row, i) => {
    if (n >= Number(row?.boosts || Infinity)) lv = i + 1;
  });
  return lv;
}

/** Progress for the level bars: { level, count, next: {level, boosts, missing} | null, max }. */
function progressFor(count, levels) {
  const n = Math.max(0, Number(count) || 0);
  const level = levelFor(n, levels);
  const max = Number(levels?.[levels.length - 1]?.boosts || 0);
  const nextRow = levels?.[level];
  return {
    level,
    count: n,
    max,
    next: nextRow ? { level: level + 1, boosts: Number(nextRow.boosts), missing: Math.max(0, Number(nextRow.boosts) - n) } : null,
  };
}

/** Perks of a level merged (level 2 includes level 1's). */
function levelPerks(level, levels) {
  const out = {};
  for (let i = 0; i < Math.min(level, (levels || []).length); i += 1) Object.assign(out, levels[i]);
  delete out.boosts;
  return out;
}

const RES_ORDER = [480, 720, 1080, 1440];

function maxOf(a, b) {
  return Math.max(Number(a) || 0, Number(b) || 0);
}

/**
 * Effective limits for a person.
 *   plan: null | 'plus' | 'ultra'      serverLevel: 0..3      platform / userId: for salesOn
 * Returns { tier, screen: { height, fps, source, locked, reason }, uploadMb, audioKbps, active }.
 * `active` false = limits not in force here (selling off): today's open limits apply.
 */
function limitsFor({ cfg, plan = null, serverLevel = 0, platform = "web", userId = null } = {}) {
  const c = cfg || config.DEFAULTS;
  const tier = plan === "ultra" || plan === "plus" ? plan : "free";
  const active = Boolean(c.features?.qualityLimits) && config.salesOn(c, platform, userId);
  if (!active) {
    return {
      tier,
      active: false,
      screen: { height: OPEN.screenHeight, fps: OPEN.screenFps, source: tier === "ultra", locked: false, reason: null },
      uploadMb: HARD_UPLOAD_MB,
      audioKbps: OPEN.audioKbps,
      hardUploadMb: HARD_UPLOAD_MB,
    };
  }
  const t = c.tiers?.[tier] || c.tiers.free;
  const perks = levelPerks(serverLevel, c.levels);
  const height = maxOf(t.screenHeight, perks.screenHeight);
  const fps = maxOf(t.screenFps, perks.screenFps);
  const best = c.tiers.ultra || c.tiers.plus;
  const locked = height < maxOf(best.screenHeight, 0) || fps < maxOf(best.screenFps, 0);
  return {
    tier,
    active: true,
    screen: {
      height,
      fps,
      source: tier === "ultra" && Boolean(c.tiers.ultra?.sourceQuality),
      locked,
      reason: locked ? (serverLevel > 0 ? "server_level" : "tier") : null,
    },
    uploadMb: Math.min(maxOf(t.uploadMb, perks.uploadMb), HARD_UPLOAD_MB),
    planUploadMb: maxOf(t.uploadMb, perks.uploadMb),
    audioKbps: perks.hdAudio ? maxOf(t.audioKbps, 128) : t.audioKbps,
    hardUploadMb: HARD_UPLOAD_MB,
  };
}

/** "1440p" style label of a height. */
function resLabel(height) {
  return `${Number(height) || 1080}p`;
}

/** True when a published screen track is above the ceiling (with tolerance for odd capture sizes). */
function exceedsCeiling(track, ceiling, tolerance = 1.1) {
  if (!track || !ceiling) return false;
  const h = Math.min(Number(track.width) || 0, Number(track.height) || 0) || Number(track.height) || 0;
  if (!h) return false;
  return h > Number(ceiling.height) * Number(tolerance || 1.1);
}

/** The cheapest change that lifts a free person's screen to 1440p/60 in this server, for the moment card. */
function screenUpsell({ cfg, serverCount, serverLevel }) {
  const c = cfg || config.DEFAULTS;
  const prog = progressFor(serverCount, c.levels);
  const nextFor1080p60 = c.levels.findIndex((l) => Number(l.screenFps) >= 60);
  return {
    progress: prog,
    serverLevelFor60: nextFor1080p60 >= 0 ? nextFor1080p60 + 1 : null,
    missingFor60: nextFor1080p60 >= 0 ? Math.max(0, Number(c.levels[nextFor1080p60].boosts) - (Number(serverCount) || 0)) : null,
    alreadyAt: serverLevel,
  };
}

module.exports = { OPEN, HARD_UPLOAD_MB, RES_ORDER, levelFor, progressFor, levelPerks, limitsFor, resLabel, exceedsCeiling, screenUpsell };
