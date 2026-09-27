"use strict";

/**
 * Native push for Capacitor devices.
 * Android tokens are FCM registration tokens (FIREBASE_SERVICE_ACCOUNT_JSON).
 * iOS Capacitor push registration returns a 64-hex APNs device token. Those
 * are delivered with the same device_push_tokens table and the same payload
 * shape, via APNs HTTP/2 when APNS_KEY_ID, APNS_TEAM_ID, and APNS_PRIVATE_KEY
 * are set. FCM messages also include an apns block so an iOS FCM token (if
 * one is ever stored) still reaches APNs through Firebase.
 */

const http2 = require("http2");
const jwt = require("jsonwebtoken");
const supabase = require("../db/supabase");

let messaging = null;
let initAttempted = false;

function getMessaging() {
  if (initAttempted) return messaging;
  initAttempted = true;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      console.warn("[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not set — native push disabled");
      return null;
    }
    const admin = require("firebase-admin");
    const cred = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    }
    messaging = admin.messaging();
  } catch (err) {
    console.warn("[FCM] init failed:", err?.message || err);
    messaging = null;
  }
  return messaging;
}

async function upsertDeviceToken(userId, token, platform = "android") {
  if (!userId || !token) return;
  const { error } = await supabase.from("device_push_tokens").upsert(
    {
      user_id: userId,
      token: String(token),
      platform: String(platform || "android"),
      last_seen: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) throw error;
}

async function removeDeviceToken(userId, token) {
  if (!userId || !token) return;
  await supabase
    .from("device_push_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("token", token);
}

function isApnsDeviceToken(token) {
  return /^[0-9a-f]{64}$/i.test(String(token || "").trim());
}

function apnsConfig() {
  const keyId = String(process.env.APNS_KEY_ID || "").trim();
  const teamId = String(process.env.APNS_TEAM_ID || "").trim();
  const rawKey = String(process.env.APNS_PRIVATE_KEY || "");
  if (!keyId || !teamId || !rawKey.trim()) return null;
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return {
    keyId,
    teamId,
    privateKey,
    bundleId: String(process.env.APNS_BUNDLE_ID || "com.descall.app").trim(),
    sandbox: String(process.env.APNS_USE_SANDBOX || "").toLowerCase() === "true",
  };
}

let apnsJwt = "";
let apnsJwtIat = 0;
let apnsJwtKeyId = "";
let apnsMissingWarned = false;

function warnApnsMissing() {
  if (apnsMissingWarned) return;
  apnsMissingWarned = true;
  console.warn("[APNs] APNS_KEY_ID, APNS_TEAM_ID, or APNS_PRIVATE_KEY not set — iOS device tokens will not be delivered");
}

function getApnsJwt(cfg) {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && apnsJwtKeyId === cfg.keyId && now - apnsJwtIat < 50 * 60) return apnsJwt;
  apnsJwt = jwt.sign({ iss: cfg.teamId, iat: now }, cfg.privateKey, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: cfg.keyId },
  });
  apnsJwtIat = now;
  apnsJwtKeyId = cfg.keyId;
  return apnsJwt;
}

function stringifyData(payload) {
  const data = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value == null) continue;
    data[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return data;
}

function buildApnsBody(payload = {}) {
  const title = payload.title || "Descall";
  const body = payload.body || "";
  const isCall = String(payload.type || "").includes("call");
  const aps = {
    alert: { title, body },
    sound: "default",
  };
  if (isCall) aps.category = "INCOMING_CALL";
  const data = stringifyData(payload);
  data.title = title;
  data.body = body;
  return { aps, ...data };
}

function apnsTokenShouldDrop(status, responseBody) {
  if (status === 410) return true;
  return status === 400 && /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/i.test(String(responseBody || ""));
}

function sendApns(token, payload) {
  const cfg = apnsConfig();
  if (!cfg) {
    warnApnsMissing();
    return Promise.resolve({ skipped: true, status: 0, body: "" });
  }
  const isCall = String(payload.type || "").includes("call");
  const host = cfg.sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const body = JSON.stringify(buildApnsBody(payload));
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`);
    const fail = (err) => {
      client.close();
      reject(err);
    };
    client.on("error", fail);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${getApnsJwt(cfg)}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": isCall ? "0" : "3600",
    });
    let status = 0;
    let responseBody = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      resolve({ skipped: false, status, body: responseBody });
    });
    req.on("error", fail);
    req.end(body);
  });
}

async function sendFcmToUsers(userIds, payload = {}) {
  const recipients = [...new Set((userIds || []).filter(Boolean))];
  const msg = getMessaging();
  if (!recipients.length) return { sent: 0 };

  const { data: rows, error } = await supabase
    .from("device_push_tokens")
    .select("token, user_id, platform")
    .in("user_id", recipients);
  if (error) {
    console.warn("[FCM] load tokens failed:", error.message);
    return { sent: 0 };
  }

  const seen = new Set();
  const devices = [];
  for (const row of rows || []) {
    const token = String(row?.token || "").trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    devices.push({ token, platform: String(row.platform || "") });
  }
  if (!devices.length) return { sent: 0 };
  const hasApnsToken = devices.some((device) => isApnsDeviceToken(device.token));
  if (!msg && !hasApnsToken) return { sent: 0 };
  if (hasApnsToken && !apnsConfig()) warnApnsMissing();
  if (!msg && !apnsConfig()) return { sent: 0 };

  const data = stringifyData(payload);
  const title = payload.title || "Descall";
  const body = payload.body || "";
  const isCall = String(payload.type || "").includes("call");
  let sent = 0;

  await Promise.allSettled(
    devices.map(async ({ token }) => {
      try {
        if (isApnsDeviceToken(token)) {
          const result = await sendApns(token, payload);
          if (result.skipped) return;
          if (result.status === 200) {
            sent += 1;
            return;
          }
          if (apnsTokenShouldDrop(result.status, result.body)) {
            await supabase.from("device_push_tokens").delete().eq("token", token);
            return;
          }
          console.warn("[APNs] send failed:", result.status);
          return;
        }

        if (!msg) return;
        await msg.send({
          token,
          notification: { title, body },
          data,
          android: {
            priority: "high",
            notification: {
              channelId: isCall ? "incoming_calls" : "descall_default",
              priority: "high",
              defaultSound: true,
              defaultVibrateTimings: true,
            },
          },
          apns: {
            headers: {
              "apns-priority": "10",
              "apns-push-type": "alert",
            },
            payload: {
              aps: {
                sound: "default",
                ...(isCall ? { category: "INCOMING_CALL" } : {}),
              },
            },
          },
        });
        sent += 1;
      } catch (err) {
        const code = err?.errorInfo?.code || err?.code || "";
        if (
          String(code).includes("registration-token-not-registered") ||
          String(code).includes("invalid-registration-token")
        ) {
          await supabase.from("device_push_tokens").delete().eq("token", token);
          return;
        }
        console.warn("[FCM] send failed:", err?.message || err);
      }
    })
  );

  return { sent };
}

module.exports = {
  getMessaging,
  upsertDeviceToken,
  removeDeviceToken,
  sendFcmToUsers,
  isApnsDeviceToken,
  buildApnsBody,
  apnsTokenShouldDrop,
};
