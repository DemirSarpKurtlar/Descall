"use strict";

const webpush = require("web-push");
const supabase = require("../db/supabase");
const { sendFcmToUsers } = require("./fcm");
const { sendIosAlertToUsers } = require("./iosAlertPush");
const { bt, pickLang } = require("./i18n");

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

/*
 * Localized web / FCM text. A payload may carry `i18n: { title: { key, vars }, body: { key, vars } }`
 * (keys of backend/i18n/<locale>.js); each recipient then gets the text in their
 * users.language (live locale with a catalog, else Turkish). Literal title / body
 * fields (user content such as a message preview) are sent as they are.
 */
const PUSH_FALLBACK_LANG = "tr";

function ref(key, vars) {
  return vars ? { key, vars } : { key };
}

/** payload.i18n refs, plus `defaults` for the props the caller left empty. */
function withDefaults(payload = {}, defaults = {}) {
  const i18n = { ...(payload.i18n || {}) };
  for (const [prop, r] of Object.entries(defaults)) {
    if (!i18n[prop] && !payload[prop]) i18n[prop] = r;
  }
  return i18n;
}

/** Payload with its i18n refs rendered in `lang` (the i18n field itself is dropped). */
function renderPayload(payload, lang) {
  const { i18n, ...rest } = payload || {};
  if (!i18n) return rest;
  for (const [prop, r] of Object.entries(i18n)) {
    if (r && r.key) rest[prop] = bt(lang, r.key, r.vars);
  }
  return rest;
}

/** Recipients grouped by push language: Map<lang, userIds>. */
async function groupByLanguage(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const groups = new Map();
  if (!ids.length) return groups;
  let rows = [];
  try {
    const { data } = await supabase.from("users").select("id, language").in("id", ids);
    rows = data || [];
  } catch {
    rows = [];
  }
  const langOf = new Map(rows.map((r) => [r.id, r.language]));
  for (const id of ids) {
    const lang = pickLang([langOf.get(id)], PUSH_FALLBACK_LANG);
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang).push(id);
  }
  return groups;
}

/** Web Push only, localized per recipient. */
async function sendLocalizedWebPush(userIds, payload = {}) {
  if (!payload.i18n) return sendWebPushToUsers(userIds, payload);
  const groups = await groupByLanguage(userIds);
  await Promise.allSettled([...groups].map(([lang, ids]) => sendWebPushToUsers(ids, renderPayload(payload, lang))));
}

/** Web Push + FCM (Android) get `payload`; iOS alert tokens get `iosEvent` (localized there). */
async function deliverPush(userIds, payload = {}, iosEvent = null) {
  const groups = payload.i18n ? await groupByLanguage(userIds) : new Map([[null, userIds]]);
  await Promise.allSettled([
    ...[...groups].flatMap(([lang, ids]) => {
      const p = lang ? renderPayload(payload, lang) : payload;
      return [sendWebPushToUsers(ids, p), sendFcmToUsers(ids, p)];
    }),
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
    tag: payload.tag || "group-call",
    deepLink: payload.deepLink || "/",
    ...payload,
    i18n: withDefaults(payload, { title: ref("push.groupCall"), body: ref("push.groupCallDefaultBody") }),
  };
  await deliverPush(userIds, body, {
    type: "group-call",
    groupId: payload.groupId,
    groupName: payload.groupName,
    fromName: payload.from,
    callType: payload.callType,
    callUuid: payload.callUuid,
    callKind: "group",
    startedAt: payload.startedAt,
  });
}

/**
 * DM / 1:1 incoming call — wake backgrounded native + web clients. iOS phones
 * with a VoIP token ring through CallKit instead (lib/iosAlertPush.js skips them).
 */
async function sendIncomingCallPush(userIds, payload = {}) {
  const body = {
    type: "call",
    tag: payload.tag || "incoming-call",
    deepLink: payload.deepLink || "/",
    ...payload,
    i18n: withDefaults(payload, { title: ref("push.incomingCall"), body: ref("push.incomingCallBody") }),
  };
  await deliverPush(userIds, body, {
    type: "call",
    fromId: payload.fromId,
    fromName: payload.from,
    callType: payload.callType,
    callUuid: payload.callUuid,
    callKind: "dm",
    startedAt: payload.startedAt,
  });
}

/**
 * The DM ring is over (answered / declined on another device, caller
 * cancelled, missed). Web Push only: the service worker replaces the
 * requireInteraction "arıyor" card that has the same tag (call-<callerId>)
 * with a quiet result card, so a closed tab's notification can't ring on
 * forever. Every push must show something (Safari revokes silent pushers),
 * hence a replacement instead of a bare close. Native apps stop through
 * their own channels (socket, VoIP end push).
 */
async function sendCallRingEndedPush(userIds, payload = {}) {
  const outcome = String(payload.outcome || "cancelled");
  const name = String(payload.callerName || "").slice(0, 64) || "Descall";
  const missed = outcome === "missed" || outcome === "cancelled";
  const body = {
    type: "call-ring-ended",
    outcome,
    title: missed ? null : name,
    tag: payload.callerId ? `call-${payload.callerId}` : "incoming-call",
    fromId: payload.callerId || null,
    callUuid: payload.callUuid || null,
    deepLink: payload.callerId ? `/?dm=${encodeURIComponent(payload.callerId)}` : "/",
    i18n: {
      ...(missed ? { title: ref("push.missedCallFrom", { name }) } : {}),
      body: ref(
        outcome === "answered_elsewhere"
          ? "push.answeredElsewhere"
          : outcome === "declined_elsewhere"
            ? "push.declinedElsewhere"
            : "push.missedCallBody"
      ),
    },
  };
  await sendLocalizedWebPush(userIds, body);
}

/** Direct message while recipient is backgrounded / offline. */
async function sendDmMessagePush(userIds, payload = {}) {
  const literal = String(payload.body || payload.text || "").slice(0, 140);
  const preview = literal || bt("en", "push.newMessage");
  const body = {
    type: "dm",
    title: payload.title || payload.from || null,
    tag: payload.tag || `dm-${payload.fromId || "msg"}`,
    deepLink: payload.deepLink || (payload.fromId ? `/?dm=${encodeURIComponent(payload.fromId)}` : "/"),
    conversationId: payload.fromId || payload.conversationId || null,
    fromId: payload.fromId || null,
    from: payload.from || null,
    ...payload,
    body: literal || null,
    i18n: withDefaults({ ...payload, title: payload.title || payload.from, body: literal }, { title: ref("push.newMessage"), body: ref("push.newMessage") }),
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
  const literal = String(payload.body || payload.text || "").slice(0, 140);
  const preview = literal || bt("en", "push.mentionedShort");
  const deepLink =
    payload.deepLink ||
    (payload.serverId && payload.channelId
      ? `/?server=${encodeURIComponent(payload.serverId)}&channel=${encodeURIComponent(payload.channelId)}`
      : payload.fromId
        ? `/?dm=${encodeURIComponent(payload.fromId)}`
        : "/");
  const body = {
    type: "mention",
    tag: payload.tag || `mention-${payload.messageId || payload.channelId || "x"}`,
    deepLink,
    serverId: payload.serverId || null,
    channelId: payload.channelId || null,
    messageId: payload.messageId || null,
    from: payload.from || null,
    ...payload,
    body: literal || null,
    deepLink,
    i18n: withDefaults({ ...payload, body: literal }, {
      title: payload.from ? ref("push.mentioned", { from: payload.from }) : ref("push.mentionedShort"),
      body: ref("push.mentionedShort"),
    }),
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

/** Message request from someone who is not a friend yet. No message body is stored. */
function sendMessageRequestPush(userId, payload = {}) {
  const preview = payload.preview ? String(payload.preview).slice(0, 140) : "";
  const fromRef = payload.from ? String(payload.from) : { key: "push.someone" };
  const body = preview || bt("en", "push.messageRequestBody", { from: fromRef });
  void sendLocalizedWebPush([userId], {
    title: payload.from ? `${payload.from}` : null,
    body: preview || null,
    tag: `dm-request-${payload.fromId || userId}`,
    data: { type: "message-request", fromId: payload.fromId || null },
    i18n: {
      ...(payload.from ? {} : { title: ref("push.messageRequestTitle") }),
      ...(preview ? {} : { body: ref("push.messageRequestBody", { from: fromRef }) }),
    },
  });
  return sendIosAlertToUsers([userId], {
    type: "message-request",
    fromId: payload.fromId,
    fromName: payload.from,
    text: body,
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
  sendCallRingEndedPush,
  sendWebPushToUsers,
  sendGroupCallPush,
  sendIncomingCallPush,
  sendDmMessagePush,
  sendMentionPush,
  sendGroupMessagePush,
  sendIosGroupMentionPush,
  sendServerMessagePush,
  sendFriendRequestPush,
  sendMessageRequestPush,
};
