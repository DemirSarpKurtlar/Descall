"use strict";

/**
 * Native push for Capacitor Android devices (FCM registration tokens,
 * FIREBASE_SERVICE_ACCOUNT_JSON).
 *
 * iOS tokens live in the same device_push_tokens table but are delivered
 * directly through APNs: platform "ios" alert tokens by lib/iosAlertPush.js,
 * platform "ios_voip" PushKit tokens by lib/voipPush.js. Both are skipped here.
 * The APNs helpers are re-exported for older callers.
 */

const supabase = require("../db/supabase");
const apns = require("./apnsClient");
const { buildApnsBody } = require("./iosAlertPush");

const VOIP_PLATFORM = "ios_voip";
const IOS_ALERT_PLATFORM = "ios";
const { isApnsDeviceToken, apnsConfig, getApnsJwt, apnsTokenShouldDrop } = apns;

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

/**
 * Save a device token. `locale` ("tr" / "en") is optional and only kept for
 * iOS alert tokens (localized push text). If the locale column is missing
 * (migration not applied yet) the row is saved without it.
 */
async function upsertDeviceToken(userId, token, platform = "android", locale = null) {
  if (!userId || !token) return;
  const row = {
    user_id: userId,
    token: String(token),
    platform: String(platform || "android"),
    last_seen: new Date().toISOString(),
  };
  if (locale === "tr" || locale === "en") row.locale = locale;
  let { error } = await supabase.from("device_push_tokens").upsert(row, { onConflict: "token" });
  if (error && row.locale && /locale/i.test(String(error.message || ""))) {
    delete row.locale;
    ({ error } = await supabase.from("device_push_tokens").upsert(row, { onConflict: "token" }));
  }
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

function stringifyData(payload) {
  const data = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value == null) continue;
    data[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return data;
}

function isIosPushRow(row) {
  const platform = String(row?.platform || "");
  if (platform === VOIP_PLATFORM || platform === IOS_ALERT_PLATFORM) return true;
  // A raw APNs device token can't go through FCM.
  return isApnsDeviceToken(row?.token);
}

async function sendFcmToUsers(userIds, payload = {}) {
  const recipients = [...new Set((userIds || []).filter(Boolean))];
  if (!recipients.length) return { sent: 0 };
  const msg = getMessaging();
  if (!msg) return { sent: 0 };

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
    if (!token || seen.has(token) || isIosPushRow(row)) continue;
    seen.add(token);
    devices.push({ token, platform: String(row.platform || "") });
  }
  if (!devices.length) return { sent: 0 };

  const data = stringifyData(payload);
  const title = payload.title || "Descall";
  const body = payload.body || "";
  const isCall = String(payload.type || "").includes("call");
  let sent = 0;

  await Promise.allSettled(
    devices.map(async ({ token }) => {
      try {
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
  apnsConfig,
  getApnsJwt,
  VOIP_PLATFORM,
  IOS_ALERT_PLATFORM,
};
