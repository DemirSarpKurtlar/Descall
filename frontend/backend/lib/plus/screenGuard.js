"use strict";

/**
 * Server side of the screen share ceiling (owner decision 27 Nov: free 1080p / 30, Descall+ 1440p / 60,
 * only where Descall+ is on sale for that platform). Clients get the ceiling with their LiveKit token
 * and cap the NEXT share (an active share is never interrupted). This guard runs on LiveKit's
 * track_published webhook: a screen track above the ceiling (a modified client) is recorded in the
 * paywall funnel ("ceiling_exceeded"), the person's sockets are told to re-apply the cap, and only if
 * the admin turned config.screenEnforce.mute on is the track muted on the SFU.
 */

const config = require("./config");
const limits = require("./limits");

const platforms = new Map(); // `${userId}:${channelId}` -> platform seen at token time

function rememberPlatform(userId, channelId, platform) {
  if (!userId || !channelId) return;
  platforms.set(`${userId}:${channelId}`, config.normalizePlatform(platform));
  if (platforms.size > 20000) platforms.delete(platforms.keys().next().value);
}

function isScreenSource(src) {
  if (src === "SCREEN_SHARE" || src === "screen_share") return true;
  try {
    const { TrackSource } = require("livekit-server-sdk");
    return src === TrackSource.SCREEN_SHARE;
  } catch {
    return src === 3;
  }
}

/** Pure decision for tests: { action: 'ok' | 'notify' | 'mute', ceiling }. */
function judge({ track, ceiling, cfg }) {
  if (!track || !ceiling || !isScreenSource(track.source)) return { action: "ok" };
  const c = cfg || config.DEFAULTS;
  if (!limits.exceedsCeiling(track, ceiling, c.screenEnforce?.tolerance || 1.1)) return { action: "ok" };
  if (c.screenEnforce?.mute) return { action: "mute" };
  return { action: c.screenEnforce?.notify === false ? "ok" : "notify" };
}

async function onTrackPublished({ channelId, identity, track, room }) {
  try {
    const raw = String(identity || "");
    const isCompanion = raw.endsWith(":screen");
    const userId = isCompanion ? raw.slice(0, -7) : raw;
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
    const cfg = await config.load();
    const platform = isCompanion ? "ios" : platforms.get(`${userId}:${channelId}`) || "web";
    const serverId = require("../../runtime/sharedState").activeServerVoiceCalls.get(String(channelId))?.serverId || null;
    const l = await require("./service").limitsFor(userId, { serverId: serverId ? String(serverId) : null, platform });
    if (!l.active) return { action: "ok" };
    const verdict = judge({ track, ceiling: { height: l.screen.height, fps: l.screen.fps }, cfg });
    if (verdict.action === "ok") return verdict;
    require("./paywall").track(userId, { moment: "screen_quality", action: "ceiling_exceeded", platform, serverId, meta: { w: Number(track?.width) || 0, h: Number(track?.height) || 0 } });
    require("./notify").toUser(userId, { kind: "screen_ceiling", height: l.screen.height, fps: l.screen.fps, channelId });
    if (verdict.action === "mute" && track?.sid) {
      try {
        const { RoomServiceClient } = require("livekit-server-sdk");
        const host = String(process.env.LIVEKIT_URL || "").replace(/^ws/i, "http");
        const svc = new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
        await svc.mutePublishedTrack(room, raw, track.sid, true);
      } catch {
        /* best effort */
      }
    }
    return verdict;
  } catch {
    return null;
  }
}

module.exports = { judge, onTrackPublished, rememberPlatform, isScreenSource };
