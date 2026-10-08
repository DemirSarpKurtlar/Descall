"use strict";

const webpush = require("web-push");
const supabase = require("../db/supabase");
const { sendFcmToUsers } = require("./fcm");
const { sendIosAlertToUsers } = require("./iosAlertPush");

let configured = false;

function configureWebPush() {
  if (configured) return true;

  const subject = process.env.WEB_PUSH_SUBJECT;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

async function sendWebPushToUsers(userIds, payload) {
  const recipients = [...new Set((userIds || []).filter(Boolean))];
  if (!recipients.length || !configureWebPush()) return;

  const { data: subscriptions, error } = await supabase
    .from("web_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", recipients);
  if (error) {
    console.warn("[WebPush] Could not load subscriptions:", error.message);
    return;
  }

  const body = JSON.stringify(payload);
  await Promise.allSettled((subscriptions || []).map(async (subscription) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        body,
        { TTL: 60, urgency: "high" }
      );
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await supabase
          .from("web_push_subscriptions")
          .delete()
          .eq("endpoint", subscription.endpoint);
        return;
      }
      console.warn("[WebPush] Delivery failed:", error.message);
    }
  }));
}

/** Web Push + FCM (Android) get `payload`; iOS alert tokens get `iosEvent` (localized there). */
async function deliverPush(userIds, payload = {}, iosEvent = null) {
  await Promise.allSettled([
    sendWebPushToUsers(userIds, payload),
    sendFcmToUsers(userIds, payload),
    iosEvent ? sendIosAlertToUsers(userIds, iosEvent) : Promise.resolve(),
  ]);
}

function previewKindOf(payload = {}) {
  const kind = String(payload.previewKind || "");
  return kind === "voice" || kind === "media" ? kind : "text";
}

/**
 * Group-call push notification. Thin wrapper around VAPID + FCM so native and
 * installed PWAs wake even when backgrounded.
 */
async function sendGroupCallPush(userIds, payload = {}) {
  const body = {
    type: "group-call",
    title: payload.title || "Group call",
    body: payload.body || "Someone started a group call on Descall",
    tag: payload.tag || "group-call",
    deepLink: payload.deepLink || "/",
    ...payload,
  };
  await deliverPush(userIds, body, {
    type: "group-call",
    groupId: payload.groupId,
    groupName: payload.groupName,
    fromName: payload.from,
    callType: payload.callType,
  });
}

/**
 * DM / 1:1 incoming call — wake backgrounded native + web clients. iOS phones
 * with a VoIP token ring through CallKit instead (lib/iosAlertPush.js skips them).
 */
async function sendIncomingCallPush(userIds, payload = {}) {
  const body = {
    type: "call",
    title: payload.title || "Incoming call",
    body: payload.body || "Someone is calling you on Descall",
    tag: payload.tag || "incoming-call",
    deepLink: payload.deepLink || "/",
    ...payload,
  };
  await deliverPush(userIds, body, {
    type: "call",
    fromId: payload.fromId,
    fromName: payload.from,
    callType: payload.callType,
  });
}

/** Direct message while recipient is backgrounded / offline. */
async function sendDmMessagePush(userIds, payload = {}) {
  const preview = String(payload.body || payload.text || "New message").slice(0, 140);
  const body = {
    type: "dm",
    title: payload.title || payload.from || "New message",
    body: preview,
    tag: payload.tag || `dm-${payload.fromId || "msg"}`,
    deepLink: payload.deepLink || (payload.fromId ? `/?dm=${encodeURIComponent(payload.fromId)}` : "/"),
    conversationId: payload.fromId || payload.conversationId || null,
    fromId: payload.fromId || null,
    from: payload.from || null,
    ...payload,
    body: preview,
  };
  await deliverPush(userIds, body, {
    type: "dm",
    fromId: payload.fromId,
    fromName: payload.from,
    text: payload.rawText != null ? payload.rawText : preview,
    previewKind: previewKindOf(payload),
    messageId: payload.messageId,
  });
}

/** @mention in a server channel or DM. */
async function sendMentionPush(userIds, payload = {}) {
  const preview = String(payload.body || payload.text || "mentioned you").slice(0, 140);
  const deepLink =
    payload.deepLink ||
    (payload.serverId && payload.channelId
      ? `/?server=${encodeURIComponent(payload.serverId)}&channel=${encodeURIComponent(payload.channelId)}`
      : payload.fromId
        ? `/?dm=${encodeURIComponent(payload.fromId)}`
        : "/");
  const body = {
    type: "mention",
    title: payload.title || `${payload.from || "Someone"} mentioned you`,
    body: preview,
    tag: payload.tag || `mention-${payload.messageId || payload.channelId || "x"}`,
    deepLink,
    serverId: payload.serverId || null,
    channelId: payload.channelId || null,
    messageId: payload.messageId || null,
    from: payload.from || null,
    ...payload,
    body: preview,
    deepLink,
  };
  await deliverPush(userIds, body, {
    type: "mention",
    fromId: payload.fromId,
    fromName: payload.from,
    text: payload.rawText != null ? payload.rawText : preview,
    previewKind: previewKindOf(payload),
    serverId: payload.serverId,
    serverName: payload.serverName,
    channelId: payload.channelId,
    channelName: payload.channelName,
    dmConversationId: payload.dmConversationId || (payload.serverId ? null : payload.fromId),
    messageId: payload.messageId,
  });
}

/*
 * Events below only reach the native iOS app. Web and desktop show them from
 * the live socket (notificationService); iOS needs an APNs push because the
 * app is suspended in the background.
 */

/** New group DM message. Mentioned members get sendIosGroupMentionPush instead. */
function sendGroupMessagePush(userIds, payload = {}) {
  return sendIosAlertToUsers(userIds, {
    type: "group",
    groupId: payload.groupId,
    groupName: payload.groupName,
    fromName: payload.from,
    text: payload.text,
    previewKind: previewKindOf(payload),
    messageId: payload.messageId,
    excludeUserId: payload.fromId,
  });
}

/** @mention inside a group DM. */
function sendIosGroupMentionPush(userIds, payload = {}) {
  return sendIosAlertToUsers(userIds, {
    type: "mention",
    groupId: payload.groupId,
    groupName: payload.groupName,
    fromName: payload.from,
    text: payload.text,
    previewKind: previewKindOf(payload),
    messageId: payload.messageId,
    excludeUserId: payload.fromId,
  });
}

/** New server text channel message for members whose notification level is "all". */
function sendServerMessagePush(userIds, payload = {}) {
  return sendIosAlertToUsers(userIds, {
    type: "server-message",
    serverId: payload.serverId,
    serverName: payload.serverName,
    channelId: payload.channelId,
    channelName: payload.channelName,
    fromName: payload.from,
    text: payload.text,
    previewKind: previewKindOf(payload),
    messageId: payload.messageId,
    excludeUserId: payload.fromId,
  });
}

/** Incoming friend request. */
function sendFriendRequestPush(userId, payload = {}) {
  return sendIosAlertToUsers([userId], {
    type: "friend-request",
    fromId: payload.fromId,
    fromName: payload.from,
  });
}

module.exports = {
  sendWebPushToUsers,
  sendGroupCallPush,
  sendIncomingCallPush,
  sendDmMessagePush,
  sendMentionPush,
  sendGroupMessagePush,
  sendIosGroupMentionPush,
  sendServerMessagePush,
  sendFriendRequestPush,
};
