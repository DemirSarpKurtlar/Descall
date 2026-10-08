"use strict";

/**
 * PushKit VoIP pushes for incoming DM calls on native iOS (CallKit).
 *
 * - Tokens live in device_push_tokens with platform "ios_voip" (registered by
 *   the iOS app's PKPushRegistry, see frontend/src/lib/iosCallKit.js).
 * - Same APNs auth key / JWT / HTTP/2 transport as the alert pushes
 *   (lib/apnsClient.js; team-scoped key, so it can send VoIP pushes), but
 *   topic "<bundle>.voip" and apns-push-type "voip".
 * - apns-expiration 0: APNs delivers now or drops the push. A ring that
 *   arrives late is useless and would make the phone ring for a dead call.
 * - Only RING pushes are sent. iOS must report a CallKit call for every VoIP
 *   push, so cancel / answered-elsewhere / declined-elsewhere are delivered
 *   over the socket instead (the app reconnects as soon as it is woken).
 * - Production APNs host unless APNS_VOIP_USE_SANDBOX=true (TestFlight and
 *   App Store builds get production tokens).
 */

const { http2Transport, apnsHost } = require("./apnsClient");

const MAX_NAME = 64;
const MAX_URL = 512;

function clip(value, max) {
  const text = String(value == null ? "" : value).trim();
  return text.length > max ? text.slice(0, max) : text;
}

function voipTopic(cfg) {
  return `${cfg.bundleId}.voip`;
}

function voipHost() {
  return apnsHost("APNS_VOIP_USE_SANDBOX");
}

/** Small JSON payload (VoIP pushes are capped at 5 KB). No aps block is needed. */
function buildVoipPayload(call = {}) {
  const avatar = clip(call.callerAvatar, MAX_URL);
  const video = call.video === true || call.callType === "video";
  const payload = {
    type: "call",
    callUuid: clip(call.callUuid, 64),
    callerId: clip(call.callerId, 64),
    callerName: clip(call.callerName, MAX_NAME) || "Descall",
    callerAvatar: /^https:\/\//i.test(avatar) ? avatar : "",
    video,
    callType: video ? "video" : "voice",
    conversationId: clip(call.conversationId || call.callerId, 64),
    sentAt: new Date().toISOString(),
  };
  // Lets the phone report "answered on the lock screen" / "couldn't join"
  // for this one ring while its web layer is suspended (lib/voipStatus.js).
  const statusUrl = clip(call.statusUrl, MAX_URL);
  if (call.statusToken && call.calleeId && /^https:\/\//i.test(statusUrl)) {
    payload.calleeId = clip(call.calleeId, 64);
    payload.statusToken = clip(call.statusToken, 128);
    payload.statusUrl = statusUrl;
  }
  return payload;
}

function buildVoipHeaders(cfg, token, jwtToken) {
  return {
    ":method": "POST",
    ":path": `/3/device/${token}`,
    authorization: `bearer ${jwtToken}`,
    "apns-topic": voipTopic(cfg),
    "apns-push-type": "voip",
    "apns-priority": "10",
    "apns-expiration": "0",
  };
}

function createVoipPusher(deps = {}) {
  const fcm = deps.fcm || require("./fcm");
  const getDb = deps.getDb || (() => require("../db/supabase"));
  const transport = deps.transport || http2Transport;
  const log = deps.log || console;

  async function loadVoipTokens(userId) {
    const { data, error } = await getDb()
      .from("device_push_tokens")
      .select("token, platform")
      .eq("user_id", userId)
      .eq("platform", fcm.VOIP_PLATFORM);
    if (error) {
      log.warn("[VoIP] load tokens failed:", error.message);
      return [];
    }
    const seen = new Set();
    const tokens = [];
    for (const row of data || []) {
      const token = String(row?.token || "").trim();
      if (!fcm.isApnsDeviceToken(token) || seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }
    return tokens;
  }

  async function dropToken(token) {
    const { error } = await getDb().from("device_push_tokens").delete().eq("token", token);
    if (error) log.warn("[VoIP] token cleanup failed:", error.message);
  }

  /** Ring every iOS VoIP token of `userId`. Never throws. */
  async function sendIncomingCallVoip(userId, call = {}) {
    const result = { sent: 0, dropped: 0, failed: 0, skipped: false };
    try {
      if (!userId || !call.callUuid) return { ...result, skipped: true };
      const cfg = fcm.apnsConfig();
      const tokens = await loadVoipTokens(userId);
      if (!tokens.length) return result;
      if (!cfg) {
        log.warn("[VoIP] APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY not set — VoIP ring skipped");
        return { ...result, skipped: true };
      }
      const { signVoipStatus, voipStatusUrl } = require("./voipStatus");
      const body = JSON.stringify(
        buildVoipPayload({
          ...call,
          calleeId: userId,
          statusToken: signVoipStatus(call.callUuid, userId),
          statusUrl: voipStatusUrl(),
        })
      );
      const host = voipHost();
      const jwtToken = fcm.getApnsJwt(cfg);
      await Promise.allSettled(
        tokens.map(async (token) => {
          try {
            const res = await transport({ host, headers: buildVoipHeaders(cfg, token, jwtToken), body });
            if (res.status === 200) {
              result.sent += 1;
              return;
            }
            if (fcm.apnsTokenShouldDrop(res.status, res.body)) {
              result.dropped += 1;
              await dropToken(token);
              return;
            }
            result.failed += 1;
            log.warn("[VoIP] send failed:", res.status, clip(res.body, 200));
          } catch (err) {
            result.failed += 1;
            log.warn("[VoIP] send error:", err?.message || err);
          }
        })
      );
    } catch (err) {
      log.warn("[VoIP] ring failed:", err?.message || err);
    }
    return result;
  }

  return { sendIncomingCallVoip, loadVoipTokens };
}

let defaultPusher = null;
function sendIncomingCallVoip(userId, call) {
  if (!defaultPusher) defaultPusher = createVoipPusher();
  return defaultPusher.sendIncomingCallVoip(userId, call);
}

module.exports = {
  buildVoipPayload,
  buildVoipHeaders,
  voipTopic,
  voipHost,
  createVoipPusher,
  sendIncomingCallVoip,
};
