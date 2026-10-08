"use strict";

/**
 * PushKit VoIP pushes for incoming DM calls on native iOS (CallKit).
 *
 * - Tokens live in device_push_tokens with platform "ios_voip" (registered by
 *   the iOS app's PKPushRegistry, see frontend/src/lib/iosCallKit.js).
 * - Same APNs auth key / JWT as lib/fcm.js (team-scoped key, so it can send
 *   VoIP pushes), but topic "<bundle>.voip" and apns-push-type "voip".
 * - apns-expiration 0: APNs delivers now or drops the push. A ring that
 *   arrives late is useless and would make the phone ring for a dead call.
 * - Only RING pushes are sent. iOS must report a CallKit call for every VoIP
 *   push, so cancel / answered-elsewhere / declined-elsewhere are delivered
 *   over the socket instead (the app reconnects as soon as it is woken).
 * - Production APNs host unless APNS_VOIP_USE_SANDBOX=true (TestFlight and
 *   App Store builds get production tokens).
 */

const http2 = require("http2");

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
  return String(process.env.APNS_VOIP_USE_SANDBOX || "").toLowerCase() === "true"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
}

/** Small JSON payload (VoIP pushes are capped at 5 KB). No aps block is needed. */
function buildVoipPayload(call = {}) {
  const avatar = clip(call.callerAvatar, MAX_URL);
  const video = call.video === true || call.callType === "video";
  return {
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

/** Default HTTP/2 transport, same shape as lib/fcm.js sendApns. */
function http2Transport({ host, headers, body }) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`);
    const fail = (err) => {
      client.close();
      reject(err);
    };
    client.on("error", fail);
    const req = client.request(headers);
    let status = 0;
    let responseBody = "";
    req.on("response", (h) => {
      status = Number(h[":status"] || 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      resolve({ status, body: responseBody });
    });
    req.on("error", fail);
    req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.end(body);
  });
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
      const body = JSON.stringify(buildVoipPayload(call));
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
