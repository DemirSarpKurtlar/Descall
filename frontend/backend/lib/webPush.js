"use strict";

const webpush = require("web-push");
const supabase = require("../db/supabase");
const { sendFcmToUsers } = require("./fcm");
const { sendIosAlertToUsers } = require("./iosAlertPush");
const { bt, pickLang } = require("./i18n");
const pushPreview = require("./pushPreview");
const { isAllowedPushEndpoint } = require("./pushEndpoint");

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
  const recipients = require("./bannedRecipients").withoutBanned([...new Set((userIds || []).filter(Boolean))]);
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
    // Rows saved before the endpoint allow-list: never send to them, drop them instead.
    if (!isAllowedPushEndpoint(subscription.endpoint)) {
      await supabase.from("web_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      return;
    }
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

/**
 * Rahatsız etme (presence_status "dnd") silences Web Push and Android pushes like it
 * already silences iOS alerts (lib/iosAlertPush.js): everything except calls, so a
 * ring and its "ring ended" still arrive (polish world-social-11). A failed lookup
 * keeps everyone (same as before).
 */
async function withoutDndRecipients(userIds, payload = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length || String(payload?.type || "").includes("call")) return ids;
  try {
    const { data, error } = await supabase.from("users").select("id, presence_status").in("id", ids);
    if (error || !Array.isArray(data)) return ids;
    const dnd = new Set(data.filter((r) => String(r.presence_status || "") === "dnd").map((r) => r.id));
    return dnd.size ? ids.filter((id) => !dnd.has(id)) : ids;
  } catch {
    return ids;
  }
}

/** Web Push only, localized per recipient. */
async function sendLocalizedWebPush(userIds, payload = {}) {
  userIds = await withoutDndRecipients(userIds, payload);
  if (!userIds.length) return;
  if (!payload.i18n) return sendWebPushToUsers(userIds, payload);
  const groups = await groupByLanguage(userIds);
  await Promise.allSettled([...groups].map(([lang, ids]) => sendWebPushToUsers(ids, renderPayload(payload, lang))));
}

/** Web Push + FCM (Android) get `payload`; iOS alert tokens get `iosEvent` (localized there). */
async function deliverPush(userIds, payload = {}, iosEvent = null) {
  // iOS applies DND itself (iosAlertPush); Web Push and FCM get the filtered list.
  const webIds = await withoutDndRecipients(userIds, payload);
  const groups = !webIds.length ? new Map() : payload.i18n ? await groupByLanguage(webIds) : new Map([[null, webIds]]);
  await Promise.allSettled([
    ...[...groups].flatMap(([lang, ids]) => {
      const p = lang ? renderPayload(payload, lang) : payload;
      return [sendWebPushToUsers(ids, p), sendFcmToUsers(ids, p)];
    }),
    iosEvent ? sendIosAlertToUsers(userIds, iosEvent) : Promise.resolve(),
  ]);
}

/**
 * Messaging phase 5: recipients with "Mesaj önizlemesi" off (users.push_preview)
 * get `send` with the text stripped (lib/pushPreview.js); the rest get it as is.
 */
async function withPreviewSplit(userIds, payload, send) {
  let show = userIds || [];
  let hide = [];
  try {
    ({ show, hide } = await pushPreview.splitByPreview(userIds));
  } catch {
    /* unknown: as before */
  }
  await Promise.allSettled([
    show.length ? send(show, payload) : null,
    hide.length ? send(hide, pushPreview.stripPreview(payload)) : null,
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

/**
 * Growth 3B: recipients in their quiet hours who chose "messages quiet too" get the push
 * without sound (lib/reengage/quietMessages.js); everyone else as before.
 */
async function withQuietSplit(userIds, payload, send) {
  let loud = userIds || [];
  let quiet = [];
  try {
    ({ loud, quiet } = await require("./reengage/quietMessages").split(userIds, payload.fromId || payload.excludeUserId || null));
  } catch {
    /* unknown: as before */
  }
  await Promise.allSettled([
    loud.length ? send(loud, payload) : null,
    quiet.length ? send(quiet, { ...payload, silent: true, quiet: true }) : null,
  ]);
}

/**
 * Growth 3B notification center types: "Bahsetmeler" (mentions) and "Okunmamış" (server
 * messages) switched off drop those pushes for that account. Unknown settings keep everyone.
 */
async function withTypeOn(userIds, typeKey) {
  const ids = userIds || [];
  try {
    const settings = await require("./reengage/store").getSettingsMany(ids);
    return ids.filter((id) => settings.get(String(id))?.types?.[typeKey] !== false);
  } catch {
    return ids;
  }
}

/** Direct message while recipient is backgrounded / offline. */
function sendDmMessagePush(userIds, payload = {}) {
  return withPreviewSplit(userIds, payload, (ids, p) => withQuietSplit(ids, p, deliverDmMessagePush));
}

async function deliverDmMessagePush(userIds, payload = {}) {
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
    ...(payload.quiet ? { quiet: true } : {}),
  });
}

/** @mention in a server channel or DM. */
async function sendMentionPush(userIds, payload = {}) {
  const ids = await withTypeOn(userIds, "mentions");
  if (!ids.length) return;
  return withPreviewSplit(ids, payload, (list, p) => withQuietSplit(list, p, deliverMentionPush));
}

async function deliverMentionPush(userIds, payload = {}) {
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
    ...(payload.quiet ? { quiet: true } : {}),
  });
}

/*
 * Events below only reach the native iOS app. Web and desktop show them from
 * the live socket (notificationService); iOS needs an APNs push because the
 * app is suspended in the background.
 */

/** New group DM message. Mentioned members get sendIosGroupMentionPush instead. */
function sendGroupMessagePush(userIds, payload = {}) {
  return withPreviewSplit(userIds, payload, (ids, p) => withQuietSplit(ids, p, deliverGroupMessagePush));
}

function deliverGroupMessagePush(userIds, payload = {}) {
  return sendIosAlertToUsers(userIds, {
    type: "group",
    groupId: payload.groupId,
    groupName: payload.groupName,
    fromName: payload.from,
    text: payload.text,
    previewKind: previewKindOf(payload),
    messageId: payload.messageId,
    excludeUserId: payload.fromId,
    ...(payload.quiet ? { quiet: true } : {}),
  });
}

/** @mention inside a group DM. */
function sendIosGroupMentionPush(userIds, payload = {}) {
  return withPreviewSplit(userIds, payload, deliverIosGroupMentionPush);
}

function deliverIosGroupMentionPush(userIds, payload = {}) {
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
async function sendServerMessagePush(userIds, payload = {}) {
  const ids = await withTypeOn(userIds, "unread");
  if (!ids.length) return;
  return withPreviewSplit(ids, payload, (list, p) => withQuietSplit(list, p, deliverServerMessagePush));
}

function deliverServerMessagePush(userIds, payload = {}) {
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
    ...(payload.namesByLang ? { namesByLang: payload.namesByLang } : {}),
    ...(payload.quiet ? { quiet: true } : {}),
  });
}

/** Message request from someone who is not a friend yet. No message body is stored. */
async function sendMessageRequestPush(userId, payload = {}) {
  const shown = await pushPreview.previewEnabled(userId).catch(() => true);
  return deliverMessageRequestPush(userId, shown ? payload : pushPreview.stripPreview(payload));
}

function deliverMessageRequestPush(userId, payload = {}) {
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

/**
 * Incoming friend request. iOS alert as before; web push + Android (FCM) too
 * (re-engagement item 4: those devices used to get nothing while the app was closed).
 */
async function sendFriendRequestPush(userId, payload = {}) {
  const fromRef = payload.from ? String(payload.from).slice(0, 64) : { key: "push.someone" };
  const web = {
    type: "friend-request",
    tag: `friend-request-${payload.fromId || userId}`,
    deepLink: "/friends",
    fromId: payload.fromId || null,
    from: payload.from || null,
    i18n: { title: ref("push.friendTitle"), body: ref("push.friendBody", { from: fromRef }) },
  };
  await deliverPush([userId], web, {
    type: "friend-request",
    fromId: payload.fromId,
    fromName: payload.from,
  });
}

/**
 * "El salla" (wave) from a friend's widget (lib/friendWave.js). Web push, Android and iOS;
 * the tap opens the DM with that friend. One notification per friend (same tag / collapse id).
 */
async function sendFriendWavePush(userId, payload = {}) {
  const fromRef = payload.from ? String(payload.from).slice(0, 64) : { key: "push.someone" };
  const web = {
    type: "friend-wave",
    tag: `friend-wave-${payload.fromId || userId}`,
    deepLink: "/friends",
    fromId: payload.fromId || null,
    from: payload.from || null,
    i18n: { title: ref("push.waveTitle"), body: ref("push.waveBody", { from: fromRef }) },
  };
  await deliverPush([userId], web, {
    type: "friend-wave",
    fromId: payload.fromId,
    fromName: payload.from,
  });
}

/**
 * Growth 3B people pushes: text rendered per recipient language by `build(lang)`
 * (lib/reengage/copy.js), faces as the notification icon, action buttons. Web Push +
 * Android get the web payload; iOS gets `ios` with `texts` for every language (the
 * Notification Service Extension adds the face as a Communication Notification).
 * Returns the recipient ids it tried.
 */
async function sendPeoplePush(userIds, build) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const copy = require("./reengage/copy");
  const webIds = await withoutDndRecipients(ids, {});
  const groups = webIds.length ? await groupByLanguage(webIds) : new Map();
  const texts = {};
  for (const l of copy.LANGS) {
    const b = build(l);
    texts[l] = { title: String(b.web.title || "").slice(0, 120), body: String(b.web.body || "").slice(0, 240) };
  }
  const iosBase = build("tr").ios || null;
  await Promise.allSettled([
    ...[...groups].flatMap(([lang, group]) => {
      const p = build(lang).web;
      return [sendWebPushToUsers(group, p), sendFcmToUsers(group, p)];
    }),
    iosBase ? sendIosAlertToUsers(ids, { ...iosBase, texts }) : Promise.resolve(),
  ]);
  return ids;
}

/** https avatar, else null (web push icons must be fetchable by the browser). */
function faceUrl(face) {
  const u = String(face?.avatar || "");
  return /^https:\/\/[^\s]{4,1024}$/.test(u) ? u : null;
}

/**
 * Re-engagement: "<friend> is in voice in <server>" (lib/reengage.js decides who
 * gets it). Web push, Android and iOS; the tap opens the voice channel, the buttons
 * join (or join muted). Growth 3B: faces (icon = the friend), several people in the
 * title, the account's main button first.
 */
async function sendFriendVoicePush(userIds, payload = {}) {
  const copy = require("./reengage/copy");
  const faces = Array.isArray(payload.faces) ? payload.faces.slice(0, 4) : [];
  const names = faces.map((f) => String(f.name || "").slice(0, 32)).filter(Boolean);
  if (!names.length && payload.friendName) names.push(String(payload.friendName).slice(0, 32));
  const deepLink =
    payload.serverId && payload.channelId
      ? `/servers/${encodeURIComponent(payload.serverId)}/${encodeURIComponent(payload.channelId)}`
      : "/servers";
  const server = String(payload.serverName || "").slice(0, 60);
  const channel = String(payload.channelName || "").slice(0, 60) || "voice";
  const quietFirst = payload.primary === "quiet_join";
  const build = (lang) => {
    const others = names.slice(1, 3).join(", ");
    const title = copy.voiceTitle(lang, names, payload.total);
    const body = others
      ? copy.rt(lang, "push.voiceWhereWith", { server: server || "Descall", channel, others })
      : copy.rt(lang, "push.voiceWhere", { server: server || "Descall", channel });
    const join = { action: "rg_join", title: copy.rt(lang, "push.join") };
    const quiet = { action: "rg_quiet", title: copy.rt(lang, "push.quietJoin") };
    return {
      web: {
        type: "friend-voice",
        title,
        body,
        icon: faceUrl(faces[0]),
        faces: faces.map((f) => ({ name: f.name, avatar: faceUrl(f) })),
        tag: `friend-voice-${payload.channelId || "x"}`,
        deepLink,
        serverId: payload.serverId || null,
        channelId: payload.channelId || null,
        serverName: server || null,
        channelName: channel,
        channelType: "voice",
        fromId: payload.friendId || null,
        rgKind: payload.rgKind || null,
        actions: quietFirst ? [quiet, join] : [join, quiet],
      },
      ios: {
        type: "friend-voice",
        fromId: payload.friendId,
        fromName: payload.friendName,
        senderAvatarUrl: faceUrl(faces[0]),
        serverId: payload.serverId,
        serverName: payload.serverName,
        channelId: payload.channelId,
        channelName: payload.channelName,
        rgKind: payload.rgKind || null,
        primary: quietFirst ? "quiet_join" : "join",
      },
    };
  };
  return sendPeoplePush(userIds, build);
}

/**
 * Growth 3B pushes that are not "in voice": a friend calls you back (day 7), a shared
 * streak nudge, a console campaign message, and the silent "withdrawn" replacement
 * after a recall. `p` = { type, fromId, fromName, avatar, deepLink, tag, rgKind, rgToken,
 * texts(lang) -> { title, body }, actions(lang) -> [{ action, title }], extra }.
 */
async function sendGrowthPush(userIds, p = {}) {
  const build = (lang) => {
    const t = p.texts ? p.texts(lang) : { title: "Descall", body: "" };
    return {
      web: {
        type: p.type,
        title: t.title,
        body: t.body,
        icon: faceUrl({ avatar: p.avatar }),
        tag: p.tag || `rg-${p.type}`,
        deepLink: p.deepLink || "/",
        fromId: p.fromId || null,
        from: p.fromName || null,
        conversationId: p.fromId || null,
        rgKind: p.rgKind || null,
        rgToken: p.rgToken || null,
        ackUrl: p.ackUrl || null,
        silent: Boolean(p.silent),
        actions: p.actions ? p.actions(lang) : [],
        ...(p.extra || {}),
      },
      ios: {
        type: p.type,
        fromId: p.fromId || null,
        fromName: p.fromName || null,
        senderAvatarUrl: faceUrl({ avatar: p.avatar }),
        collapse: p.tag || null,
        rgKind: p.rgKind || null,
        silent: Boolean(p.silent),
        deepLink: p.deepLink || "/",
        ...(p.extra || {}),
      },
    };
  };
  return sendPeoplePush(userIds, build);
}

/** Sunucu Ağı alert kinds -> push.* body key (lib/nodeKeys/monitor.js). */
const NODE_ALERT_BODY = Object.freeze({ pcDown: "push.nodesPcDown", kvFull: "push.nodesKvFull", kvDown: "push.nodesKvDown", render90: "push.nodesRender90", test: "push.nodesTest", bootstrap: "push.nodesBootstrap" });

/**
 * Sunucu Ağı (hybrid server) alert to the owner's phones: PC dropped, Key Value full or
 * unreachable, Render memory at 90 %, the PC fetched the node settings (bootstrap), or a test. Web push, Android and iOS; kind and a
 * percent only, the tap opens the admin panel.
 */
async function sendAdminNodesPush(userIds, alert = {}) {
  const kind = alert.kind === "kvFull" && alert.reason === "down" ? "kvDown" : String(alert.kind || "");
  const bodyKey = NODE_ALERT_BODY[kind];
  if (!bodyKey) return;
  const pct = Math.max(0, Math.min(100, Math.round(Number(alert.vars?.pct) || 0)));
  const web = {
    type: "admin-nodes",
    tag: `admin-nodes-${kind}`,
    deepLink: "/admin/panel",
    i18n: { title: ref("push.nodesTitle"), body: ref(bodyKey, { pct }) },
  };
  await deliverPush(userIds, web, { type: "admin-nodes", kind, pct });
}

/**
 * Performans: a release regression to the owner's phones (web push, Android, iOS). Numbers
 * only (version, platform, metric, p75 before / after); the tap opens Performans.
 */
const PERF_METRIC = Object.freeze({ lcp: "LCP", inp: "INP", cls: "CLS", fcp: "FCP", ttfb: "TTFB", msglist: "FML", voicejoin: "VJ", appstart: "AS" });
const PERF_PLATFORM = Object.freeze({ web: "Web", ios: "iOS", android: "Android", electron: "Electron", tauri: "Tauri" });
async function sendAdminPerfPush(userIds, alert = {}) {
  const fmt = require("./perfModel").fmtValue;
  const vars = {
    version: String(alert.version || "").slice(0, 24),
    platform: PERF_PLATFORM[alert.platform] || "",
    metric: PERF_METRIC[alert.metric] || "",
    pct: Math.max(0, Math.round(Number(alert.deltaPct) || 0)),
    from: fmt(alert.metric, Number(alert.prevP75)),
    to: fmt(alert.metric, Number(alert.curP75)),
  };
  const web = {
    type: "admin-perf",
    tag: `admin-perf-${String(alert.key || "").slice(0, 60)}`,
    deepLink: "/admin/panel?tab=perf",
    i18n: { title: ref("push.perfTitle"), body: ref("push.perfBody", vars) },
  };
  await deliverPush(userIds, web, { type: "admin-perf", ...vars });
}

module.exports = {
  withoutDndRecipients,
  sendAdminNodesPush,
  sendAdminPerfPush,
  withPreviewSplit,
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
  sendFriendWavePush,
  sendFriendVoicePush,
  sendGrowthPush,
  sendPeoplePush,
  sendMessageRequestPush,
};
