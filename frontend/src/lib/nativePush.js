import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { API_BASE_URL } from "../config/api";
import { getToken } from "./storage";
import { getLocale } from "../i18n/runtime";

/**
 * Native push (Capacitor @capacitor/push-notifications).
 *
 * - Android: FCM token, permission asked at startup (unchanged).
 * - iOS: raw APNs device token, platform "ios" (backend lib/iosAlertPush.js).
 *   Permission is never asked at startup; the app asks after login
 *   (IosPushPermissionPrompt / notification settings). The token is uploaded
 *   with the app language so push text matches the app (TR / EN).
 *   "Message notifications" off in settings removes this iPhone's token.
 * - Notification taps are queued until the signed-in app is ready, so a tap
 *   that cold-starts the app still opens the right chat.
 */

const IS_NATIVE = typeof window !== "undefined" && Capacitor.isNativePlatform();
const IS_IOS = IS_NATIVE && Capacitor.getPlatform() === "ios";
const IOS_TOKEN_KEY = "descall.iosAlertToken";

function pushAllowedHere() {
  return IS_NATIVE;
}

let listenersAttached = false;
let lastToken = null;
let uploadedFor = "";
let tapConsumerReady = false;
const pendingTaps = [];

function readStoredIosToken() {
  try {
    return window.localStorage?.getItem(IOS_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function storeIosToken(value) {
  try {
    if (value) window.localStorage?.setItem(IOS_TOKEN_KEY, value);
    else window.localStorage?.removeItem(IOS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function messageNotificationsEnabled() {
  try {
    const raw =
      localStorage.getItem("descall_user_settings") || localStorage.getItem("descall_settings") || "{}";
    return JSON.parse(raw)?.msgNotifications !== false;
  } catch {
    return true;
  }
}

function emitNotificationAction(detail) {
  window.dispatchEvent(new CustomEvent("descall:notification-click", { detail }));
  if (detail.action === "answer" || detail.action === "accept" || detail.action === "join") {
    window.dispatchEvent(new CustomEvent("descall:call-action", { detail: { ...detail, action: "accept" } }));
  }
  if (detail.action === "decline") {
    window.dispatchEvent(new CustomEvent("descall:call-action", { detail: { ...detail, action: "decline" } }));
  }
}

function dispatchNotificationAction(payload = {}) {
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const pick = (key) => payload[key] ?? data[key];
  const detail = {
    ...data,
    ...payload,
    type: pick("type") || "call",
    action: pick("action") || "open",
    fromId: pick("fromId") || pick("conversationId"),
    from: pick("from"),
    conversationId: pick("conversationId") || pick("fromId"),
    dmConversationId: pick("dmConversationId"),
    groupId: pick("groupId"),
    groupName: pick("groupName"),
    serverId: pick("serverId"),
    channelId: pick("channelId"),
    serverName: pick("serverName"),
    channelName: pick("channelName"),
    callType: pick("callType") || "voice",
    deepLink: pick("deepLink"),
  };
  delete detail.data;
  delete detail.aps;
  if (!tapConsumerReady) {
    pendingTaps.push(detail);
    if (pendingTaps.length > 5) pendingTaps.shift();
    return;
  }
  emitNotificationAction(detail);
}

/** The signed-in app can route taps now (flushes taps that arrived earlier). */
export function setNativeTapConsumerReady(ready) {
  tapConsumerReady = Boolean(ready);
  if (!tapConsumerReady) return;
  const queued = pendingTaps.splice(0, pendingTaps.length);
  queued.forEach((detail) => emitNotificationAction(detail));
}

async function deleteServerToken(authToken, token) {
  if (!authToken || !token) return;
  try {
    await fetch(`${API_BASE_URL}/api/web-push/fcm-token`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* best effort */
  }
}

async function uploadFcmToken(token) {
  const auth = getToken();
  if (!auth || !token) return false;
  lastToken = token;
  if (IS_IOS) storeIosToken(token);
  if (IS_IOS && !messageNotificationsEnabled()) {
    // Settings → Notifications → Message notifications is off on this iPhone.
    uploadedFor = "";
    await deleteServerToken(auth, token);
    return false;
  }
  const platform = Capacitor.getPlatform?.() || "android";
  const locale = IS_IOS ? (getLocale() === "en" ? "en" : "tr") : undefined;
  const key = `${auth}|${token}|${locale || ""}`;
  if (uploadedFor === key) return true;
  const response = await fetch(`${API_BASE_URL}/api/web-push/fcm-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, platform, ...(locale ? { locale } : {}) }),
  });
  if (!response.ok) throw new Error(`FCM token upload failed (${response.status})`);
  uploadedFor = key;
  if (IS_IOS) {
    window.dispatchEvent(new CustomEvent("descall:ios-push-token", { detail: { token } }));
  }
  return true;
}

function ensureListeners() {
  if (listenersAttached || !IS_NATIVE) return;
  listenersAttached = true;

  PushNotifications.addListener("registration", (token) => {
    const value = token?.value || token;
    if (!value) return;
    uploadFcmToken(value).catch((err) => {
      console.warn("[NativePush] token upload failed:", err?.message || err);
    });
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.warn("[NativePush] registration error:", error?.error || error);
  });

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    // Foreground delivery — route into in-app handlers when it's a call.
    const data = notification?.data || {};
    if (data.type === "call" || data.type === "group-call") {
      dispatchNotificationAction({ ...data, action: data.action || "open" });
    }
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    const data = event?.notification?.data || {};
    const actionId = event?.actionId;
    const action =
      actionId === "accept" || actionId === "answer" || actionId === "JOIN"
        ? "answer"
        : actionId === "decline" || actionId === "DECLINE"
          ? "decline"
          : IS_IOS
            ? "open"
            : data.action || "open";
    dispatchNotificationAction({ ...data, action });
  });

  if (IS_IOS) {
    // Push text follows the app language: re-upload when it changes.
    window.addEventListener("descall:locale", () => {
      if (lastToken) uploadFcmToken(lastToken).catch(() => {});
    });
  }
}

function normalizePermission(receive) {
  if (receive === "granted" || receive === "denied") return receive;
  return "prompt";
}

/** Current OS permission: "granted" | "denied" | "prompt" (null off-native). */
export async function getNativePushPermission() {
  if (!pushAllowedHere()) return null;
  try {
    const permission = await PushNotifications.checkPermissions();
    return normalizePermission(permission?.receive);
  } catch {
    return null;
  }
}

/** Ask for permission (shows the OS dialog when not decided yet), then register. */
export async function requestNativePushPermission() {
  if (!pushAllowedHere()) return null;
  ensureListeners();
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") return normalizePermission(permission.receive);
  await PushNotifications.register();
  return "granted";
}

/**
 * App startup. Android keeps asking right away; iOS only attaches listeners
 * (so a tap that launched the app is not lost) and registers when the user
 * already allowed notifications. Returns the permission state.
 */
export async function initNativePush() {
  if (!pushAllowedHere()) return null;
  if (!IS_IOS) return requestNativePushPermission();
  ensureListeners();
  const permission = await getNativePushPermission();
  if (permission === "granted" && getToken()) {
    PushNotifications.register().catch(() => {});
  }
  return permission;
}

/** Re-upload last/known token after login. */
export async function syncNativePushToken() {
  if (!pushAllowedHere()) return false;
  ensureListeners();
  try {
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") return false;
    await PushNotifications.register();
    if (lastToken) await uploadFcmToken(lastToken);
    return true;
  } catch (err) {
    console.warn("[NativePush] sync failed:", err?.message || err);
    return false;
  }
}

/** On logout: stop notifications on this device for the account being signed out. */
export async function unregisterNativePushToken(authToken) {
  if (!pushAllowedHere()) return;
  const token = lastToken || (IS_IOS ? readStoredIosToken() : "");
  uploadedFor = "";
  if (!authToken || !token) return;
  await deleteServerToken(authToken, token);
}

/** This iPhone's APNs alert token (empty until registered). */
export function getIosAlertToken() {
  if (!IS_IOS) return "";
  return lastToken || readStoredIosToken();
}

export function isNativePushPlatform() {
  return pushAllowedHere();
}

export function isNativeIosPush() {
  return IS_IOS;
}
