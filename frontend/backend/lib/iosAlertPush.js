"use strict";

/**
 * Standard (alert) APNs pushes for the native iOS app: DMs, group DMs, server
 * channel messages, mentions, friend requests, group calls, and DM calls when
 * the phone has no CallKit / VoIP token (e.g. mainland China region).
 *
 * - Tokens: device_push_tokens rows with platform "ios" (the 64-hex APNs
 *   device token from @capacitor/push-notifications). "ios_voip" rows are
 *   PushKit tokens and are only used by lib/voipPush.js.
 * - Headers: apns-push-type alert, apns-topic = bundle id (com.descall.app).
 * - aps.thread-id per conversation so iOS groups notifications per chat.
 * - Custom data (type, conversationId / groupId / serverId + channelId, ...)
 *   lets the app open the right chat when the notification is tapped.
 * - Filters: DND (users.presence_status = "dnd") silences everything except
 *   calls; a phone that is open on the same chat (lib/iosPushContext.js) gets
 *   nothing; calls are not pushed to a phone that is open at all.
 *   Per-DM mute, server notification level and channel mutes are applied by
 *   the callers (socket handlers) before the recipient list reaches here.
 * - Text is localized per device (token locale, then users.language), TR first.
 * - 410 / BadDeviceToken / Unregistered / DeviceTokenNotForTopic delete the
 *   token; 429 / 5xx / network errors never do.
 * - 3.0.0 (A4): message pushes (dm, group, server-message, mention) are rich:
 *   title = sender, subtitle = "👥 group" / "# channel · server",
 *   `mutable-content: 1` + category MESSAGE so the Notification Service
 *   Extension adds the sender photo (Communication Notification), a picture
 *   thumbnail and quick actions. The full text is always sent; the lock
 *   screen preview follows the iOS "Show Previews" setting only.
 *   IOS_COMM_NOTIFICATIONS=0 turns the Communication Notification part off
 *   (the extension then keeps a standard notification with the attachment).
 */

const apns = require("./apnsClient");
const { maskProfanity } = require("./profanity");

const IOS_ALERT_PLATFORM = "ios";
const VOIP_PLATFORM = "ios_voip";
const CALL_TYPES = new Set(["call", "group-call"]);
const MESSAGE_TYPES = new Set(["dm", "group", "server-message", "mention"]);
const MESSAGE_CATEGORY = "MESSAGE";
const MAX_TITLE = 80;
const MAX_BODY = 180;
const MAX_PREVIEW = 140;
const MAX_PAYLOAD_BYTES = 4000;
const CHUNK = 150;
const CONCURRENCY = 8;

const STRINGS = {
  tr: {
    someone: "Birisi",
    newMessage: "Yeni mesaj",
    voice: "🎤 Sesli mesaj",
    media: "📎 Dosya gönderdi",
    photo: "📷 Fotoğraf",
    video: "🎬 Video",
    group: "Grup",
    mentioned: "{from} senden bahsetti",
    mentionedShort: "Senden bahsetti",
    friendTitle: "Arkadaşlık İsteği",
    friendBody: "{from} seni arkadaş olarak eklemek istiyor",
    calling: "{from} arıyor",
    voiceCall: "Sesli arama",
    videoCall: "Görüntülü arama",
    groupCallTitle: "{groupName} — Grup Araması",
    groupCallBody: "{from} grup araması başlattı",
    ownerTitle: "Sunucu sahipliği",
    antibotTitle: "Anti-bot uyarısı",
    antibotBody: "{count} hesap risk eşiğini geçti (en yüksek {topScore})",
    antibotWatchBody: "İzleme listesinde {count} yeni uyarı",
  },
  en: {
    someone: "Someone",
    newMessage: "New message",
    voice: "🎤 Voice message",
    media: "📎 Sent an attachment",
    photo: "📷 Photo",
    video: "🎬 Video",
    group: "Group",
    mentioned: "{from} mentioned you",
    mentionedShort: "Mentioned you",
    friendTitle: "Friend Request",
    friendBody: "{from} wants to add you as a friend",
    calling: "{from} is calling",
    voiceCall: "Voice call",
    videoCall: "Video call",
    groupCallTitle: "{groupName} — Group Call",
    groupCallBody: "{from} started a group call",
    ownerTitle: "Server ownership",
    antibotTitle: "Anti-bot alert",
    antibotBody: "{count} accounts crossed the risk threshold (top {topScore})",
    antibotWatchBody: "{count} new watch list alerts",
  },
};

function pickLang(...candidates) {
  for (const c of candidates) {
    const v = String(c || "").toLowerCase().slice(0, 2);
    if (v === "tr" || v === "en") return v;
  }
  return "tr";
}

function fmt(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
}

const CALL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 3.0.0 (C3): ring id, kind and start time for the push tap resolver (no names). */
function callTapFields(event, kind) {
  const out = { callKind: kind };
  const uuid = String(event?.callUuid || "");
  if (CALL_UUID_RE.test(uuid)) out.callUuid = uuid.toLowerCase();
  const startedAt = Math.floor(Number(event?.startedAt) || 0);
  if (startedAt > 0) out.startedAt = startedAt;
  return out;
}

function clip(value, max) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function stringifyData(payload) {
  const data = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value == null) continue;
    data[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return data;
}

/**
 * Low-level APNs JSON body for an already-titled payload. Every non-null field
 * besides title/body/threadId is copied as top-level custom data.
 */
function buildApnsBody(payload = {}) {
  const { threadId, title: rawTitle, body: rawBody, subtitle: rawSubtitle, rich, ...rest } = payload || {};
  const title = rawTitle || "Descall";
  const body = rawBody || "";
  const isCall = String(rest.type || "").includes("call");
  const alert = { title, body };
  if (rawSubtitle) alert.subtitle = String(rawSubtitle);
  const aps = {
    alert,
    sound: "default",
  };
  if (threadId) aps["thread-id"] = String(threadId);
  if (isCall) aps.category = "INCOMING_CALL";
  else if (rich) {
    aps.category = MESSAGE_CATEGORY;
    aps["mutable-content"] = 1;
  }
  const data = stringifyData(rest);
  data.title = title;
  data.body = body;
  return { aps, ...data };
}

function previewFor(event, s) {
  const kind = String(event.previewKind || "text");
  if (kind === "voice") return s.voice;
  // Bad words are masked with *** in iOS notification text (App Review).
  const text = clip(maskProfanity(event.text), MAX_PREVIEW);
  if (kind === "media") {
    const mediaKind = String(event.mediaKind || "");
    const label = mediaKind === "image" ? s.photo : mediaKind === "video" ? s.video : "";
    if (label) return text ? `${label} · ${text}` : label;
    return text || s.media;
  }
  return text || s.newMessage;
}

/** Subtitle line under the sender: "👥 Hafta Sonu Ekibi" / "# genel · Oyun Gecesi". */
function groupSubtitle(event, s) {
  return `👥 ${clip(event.groupName, 60) || s.group}`;
}

function channelSubtitle(event) {
  const server = clip(event.serverName, 40);
  const channel = clip(event.channelName, 40);
  if (channel && server) return `# ${channel} · ${server}`;
  if (channel) return `# ${channel}`;
  return server;
}

/** Sender / media / conversation fields the Notification Service Extension reads. */
function richFields(event, from, chatKey) {
  const out = {
    rich: true,
    conv: chatKey || null,
    senderId: event.senderId || event.fromId || event.excludeUserId || null,
    senderName: from,
    senderAvatar: httpsOrNull(event.senderAvatarUrl),
  };
  const thumb = httpsOrNull(event.mediaThumbUrl);
  if (thumb && (event.mediaKind === "image" || event.mediaKind === "video")) {
    out.mediaThumb = thumb;
    out.mediaKind = event.mediaKind;
  }
  if (event.comm !== false) out.comm = "1";
  return out;
}

function httpsOrNull(value) {
  const v = String(value || "").trim();
  return /^https:\/\/[^\s]{4,1024}$/.test(v) ? v : null;
}

function channelLabel(event) {
  const server = clip(event.serverName, 40);
  const channel = clip(event.channelName, 40);
  if (server && channel) return `${server} #${channel}`;
  if (channel) return `#${channel}`;
  return server;
}

/** Chat this event belongs to ("dm:<peer>", "group:<id>", "channel:<id>") or "". */
function chatKeyFor(event = {}) {
  const type = event.type;
  if (type === "dm" || type === "call") return event.fromId ? `dm:${event.fromId}` : "";
  if (type === "group" || type === "group-call") return event.groupId ? `group:${event.groupId}` : "";
  if (type === "server-message") return event.channelId ? `channel:${event.channelId}` : "";
  if (type === "mention") {
    if (event.channelId) return `channel:${event.channelId}`;
    if (event.groupId) return `group:${event.groupId}`;
    const peer = event.dmConversationId || event.fromId;
    return peer ? `dm:${peer}` : "";
  }
  return "";
}

/**
 * Localized alert + routing data for one event.
 * Returns { title, body, threadId, data, priority, expiresInSec, collapseId }.
 */
function describeEvent(event = {}, lang = "tr") {
  const s = STRINGS[pickLang(lang)];
  const from = clip(event.senderDisplayName, 48) || clip(event.fromName, 48) || s.someone;
  const type = String(event.type || "");
  const chatKey = chatKeyFor(event);
  const base = { threadId: chatKey || type || "descall", priority: 10, expiresInSec: 24 * 3600, collapseId: "" };

  if (type === "dm") {
    return {
      ...base,
      title: from,
      body: previewFor(event, s),
      data: {
        type: "dm",
        conversationId: event.fromId,
        fromId: event.fromId,
        from,
        messageId: event.messageId,
        ...richFields(event, from, chatKey),
      },
    };
  }
  if (type === "group") {
    const groupName = clip(event.groupName, 60) || s.group;
    return {
      ...base,
      title: from,
      subtitle: groupSubtitle(event, s),
      body: previewFor(event, s),
      data: {
        type: "group",
        groupId: event.groupId,
        groupName,
        from,
        messageId: event.messageId,
        ...richFields(event, from, chatKey),
      },
    };
  }
  if (type === "server-message") {
    return {
      ...base,
      title: from,
      subtitle: channelSubtitle(event) || channelLabel(event),
      body: previewFor(event, s),
      data: {
        ...richFields(event, from, chatKey),
        type: "server-message",
        serverId: event.serverId,
        channelId: event.channelId,
        serverName: clip(event.serverName, 60) || null,
        channelName: clip(event.channelName, 60) || null,
        from,
        messageId: event.messageId,
      },
    };
  }
  if (type === "mention") {
    const where = event.channelId ? channelSubtitle(event) : event.groupId ? groupSubtitle(event, s) : "";
    const preview = previewFor(event, s);
    const data = { type: "mention", from, messageId: event.messageId, ...richFields(event, from, chatKey) };
    if (event.channelId) {
      Object.assign(data, {
        serverId: event.serverId,
        channelId: event.channelId,
        serverName: clip(event.serverName, 60) || null,
        channelName: clip(event.channelName, 60) || null,
      });
    } else if (event.groupId) {
      Object.assign(data, { groupId: event.groupId, groupName: clip(event.groupName, 60) || null });
    } else {
      const peer = event.dmConversationId || event.fromId;
      Object.assign(data, { dmConversationId: peer, conversationId: peer, fromId: event.fromId });
    }
    return {
      ...base,
      title: from,
      subtitle: where ? `${where} · ${s.mentionedShort}` : s.mentionedShort,
      body: preview,
      data,
    };
  }
  if (type === "friend-request") {
    return {
      ...base,
      threadId: "friend-requests",
      priority: 5,
      title: s.friendTitle,
      body: fmt(s.friendBody, { from }),
      data: { type: "friend-request", fromId: event.fromId, from },
    };
  }
  if (type === "server-owner") {
    const serverName = clip(event.serverName, 60) || (pickLang(lang) === "en" ? "the server" : "Sunucu");
    const body = pickLang(lang) === "en"
      ? `You now own ${serverName}`
      : `${require("./trSuffix").trGenitive(serverName)} sahibi artık sensin`;
    return {
      ...base,
      threadId: event.serverId ? `server-${event.serverId}`.slice(0, 64) : "server-owner",
      priority: 5,
      title: s.ownerTitle,
      body,
      data: { type: "server-owner", serverId: event.serverId, serverName: event.serverName || null, from },
    };
  }
  if (type === "call") {
    const video = event.callType === "video";
    return {
      ...base,
      expiresInSec: 0,
      collapseId: event.fromId ? `call-${event.fromId}`.slice(0, 64) : "",
      title: fmt(s.calling, { from }),
      body: video ? s.videoCall : s.voiceCall,
      data: {
        type: "call",
        conversationId: event.fromId,
        fromId: event.fromId,
        from,
        callType: video ? "video" : "voice",
        ...callTapFields(event, "dm"),
      },
    };
  }
  if (type === "group-call") {
    const groupName = clip(event.groupName, 60) || s.group;
    return {
      ...base,
      expiresInSec: 60,
      collapseId: event.groupId ? `gcall-${event.groupId}`.slice(0, 64) : "",
      title: fmt(s.groupCallTitle, { groupName }),
      body: fmt(s.groupCallBody, { from }),
      data: {
        type: "group-call",
        groupId: event.groupId,
        groupName,
        from,
        callType: event.callType === "video" ? "video" : "voice",
        ...callTapFields(event, "group"),
      },
    };
  }
  // Admin-only DesCoin anti-bot digest (lib/descoinAntibot/alerts.js). Counts
  // only: no usernames or ids leave the server in the push.
  if (type === "admin-antibot") {
    const count = Math.max(0, Math.floor(Number(event.count) || 0));
    const topScore = Math.max(0, Math.min(100, Math.floor(Number(event.topScore) || 0)));
    return {
      ...base,
      threadId: "admin-antibot",
      collapseId: "admin-antibot",
      title: s.antibotTitle,
      body: fmt(s.antibotBody, { count: String(count), topScore: String(topScore) }),
      data: { type: "admin-antibot", count, topScore },
    };
  }
  // Admin-only watch list rule digest. Counts only.
  if (type === "admin-antibot-watch") {
    const count = Math.max(0, Math.floor(Number(event.count) || 0));
    return {
      ...base,
      threadId: "admin-antibot",
      collapseId: "admin-antibot-watch",
      title: s.antibotTitle,
      body: fmt(s.antibotWatchBody, { count: String(count) }),
      data: { type: "admin-antibot-watch", count },
    };
  }
  return null;
}

function buildAlertRequest(event, lang) {
  const d = describeEvent(event, lang);
  if (!d) return null;
  const body = buildApnsBody({
    ...d.data,
    title: clip(d.title, MAX_TITLE),
    subtitle: d.subtitle ? clip(d.subtitle, MAX_TITLE) : undefined,
    body: clip(d.body, MAX_BODY),
    threadId: d.threadId,
  });
  // APNs rejects bodies over 4 KB: drop the optional rich extras first.
  for (const key of ["mediaThumb", "mediaKind", "senderAvatar"]) {
    if (Buffer.byteLength(JSON.stringify(body)) <= MAX_PAYLOAD_BYTES) break;
    delete body[key];
  }
  return { body, priority: d.priority, expiresInSec: d.expiresInSec, collapseId: d.collapseId };
}

function buildAlertHeaders(cfg, token, jwtToken, req, nowMs = Date.now()) {
  const headers = {
    ":method": "POST",
    ":path": `/3/device/${token}`,
    authorization: `bearer ${jwtToken}`,
    "apns-topic": cfg.bundleId,
    "apns-push-type": "alert",
    "apns-priority": String(req.priority === 5 ? 5 : 10),
    "apns-expiration": req.expiresInSec > 0 ? String(Math.floor(nowMs / 1000) + req.expiresInSec) : "0",
  };
  if (req.collapseId) headers["apns-collapse-id"] = req.collapseId;
  return headers;
}

function commEnabled(env = process.env) {
  return String(env.IOS_COMM_NOTIFICATIONS ?? "1").trim() !== "0";
}

function messageTableFor(event = {}) {
  const type = event.type;
  if (type === "dm") return "dm_messages";
  if (type === "group") return "group_messages";
  if (type === "server-message") return "server_messages";
  if (type === "mention") return event.channelId ? "server_messages" : event.groupId ? "group_messages" : "dm_messages";
  return "";
}

function mediaKindOf(row = {}) {
  const t = String(row.media_type || "").toLowerCase();
  const mime = String(row.mime_type || "").toLowerCase();
  if (t === "voice" || t === "audio") return "voice";
  if (t === "image" || t === "gif" || mime.startsWith("image/")) return "image";
  if (t === "video" || mime.startsWith("video/")) return "video";
  return "file";
}

/** Private refs (sb://media-private/...) become short-lived signed URLs. */
function publicUrl(value) {
  if (!value) return null;
  try {
    const out = require("./privateMedia").rewriteOutgoing(String(value));
    return httpsOrNull(out);
  } catch {
    return httpsOrNull(value);
  }
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function runPool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function createIosAlertPusher(deps = {}) {
  const getDb = deps.getDb || (() => require("../db/supabase"));
  const transport = deps.transport || apns.http2Transport;
  const context = deps.context || require("./iosPushContext");
  const getConfig = deps.apnsConfig || apns.apnsConfig;
  const getJwt = deps.getApnsJwt || apns.getApnsJwt;
  const log = deps.log || console;
  const now = deps.now || (() => Date.now());
  let missingWarned = false;
  let localeColumn = true;

  async function loadTargets(userIds) {
    const rows = [];
    for (const ids of chunk(userIds, CHUNK)) {
      const run = (cols) =>
        getDb()
          .from("device_push_tokens")
          .select(cols)
          .eq("platform", IOS_ALERT_PLATFORM)
          .in("user_id", ids);
      let res = await run(localeColumn ? "token, user_id, locale" : "token, user_id");
      if (res.error && localeColumn && /locale/i.test(String(res.error.message || ""))) {
        localeColumn = false;
        res = await run("token, user_id");
      }
      if (res.error) {
        log.warn("[APNs] load iOS tokens failed:", res.error.message);
        continue;
      }
      rows.push(...(res.data || []));
    }
    const seen = new Set();
    const targets = [];
    for (const row of rows) {
      const token = String(row?.token || "").trim();
      if (!apns.isApnsDeviceToken(token) || seen.has(token)) continue;
      seen.add(token);
      targets.push({ token, userId: row.user_id, locale: row.locale || null });
    }
    return targets;
  }

  async function loadUserMeta(userIds, senderId = "") {
    const meta = new Map();
    for (const ids of chunk(userIds, CHUNK)) {
      const { data, error } = await getDb()
        .from("users")
        .select("id, presence_status, language, blocked_users")
        .in("id", ids);
      if (error) {
        log.warn("[APNs] load user prefs failed:", error.message);
        continue;
      }
      for (const row of data || []) {
        meta.set(row.id, {
          dnd: String(row.presence_status || "") === "dnd",
          language: row.language || null,
          // Recipient blocked the sender: no notification from them.
          blocksSender: Boolean(senderId) && Array.isArray(row.blocked_users) && row.blocked_users.includes(senderId),
        });
      }
    }
    return meta;
  }

  async function usersWithVoipTokens(userIds) {
    const out = new Set();
    for (const ids of chunk(userIds, CHUNK)) {
      const { data, error } = await getDb()
        .from("device_push_tokens")
        .select("user_id")
        .eq("platform", VOIP_PLATFORM)
        .in("user_id", ids);
      if (error) {
        // Unknown: assume VoIP rang, so CallKit and a banner don't double up.
        ids.forEach((id) => out.add(id));
        continue;
      }
      (data || []).forEach((r) => out.add(r.user_id));
    }
    return out;
  }

  /**
   * Sender photo / display name and a picture thumbnail for message pushes.
   * One lookup per event (not per device); any failure keeps the plain push.
   */
  async function loadRichContext(event) {
    try {
      return await lookupRich(event);
    } catch (err) {
      log.warn("[APNs] rich lookup failed:", err?.message || err);
      return { comm: commEnabled() };
    }
  }

  async function lookupRich(event) {
    const out = { comm: commEnabled() };
    const senderId = String(event.fromId || event.excludeUserId || "");
    const db = getDb();
    const tasks = [];
    if (senderId) {
      tasks.push(
        db
          .from("users")
          .select("id, avatar_url, display_name")
          .eq("id", senderId)
          .maybeSingle()
          .then(({ data }) => {
            if (!data) return;
            out.senderId = senderId;
            out.senderAvatarUrl = publicUrl(data.avatar_url);
            if (data.display_name) out.senderDisplayName = String(data.display_name);
          })
      );
    }
    const table = messageTableFor(event);
    if (table && event.messageId && String(event.previewKind || "") === "media") {
      const cols = table === "dm_messages" ? "id, media_url, media_type, mime_type" : "id, media_url, media_type";
      tasks.push(
        db
          .from(table)
          .select(cols)
          .eq("id", String(event.messageId))
          .maybeSingle()
          .then(({ data }) => {
            if (!data?.media_url) return;
            const kind = mediaKindOf(data);
            if (kind !== "image" && kind !== "video") return;
            out.mediaKind = kind;
            if (kind === "image") out.mediaThumbUrl = publicUrl(data.media_url);
          })
      );
    }
    await Promise.all(tasks.map((t) => Promise.resolve(t).catch((err) => log.warn("[APNs] rich lookup failed:", err?.message || err))));
    return out;
  }

  async function dropToken(token) {
    const { error } = await getDb().from("device_push_tokens").delete().eq("token", token);
    if (error) log.warn("[APNs] token cleanup failed:", error.message);
  }

  /** Send `event` to every iOS alert token of `userIds`. Never throws. */
  async function sendToUsers(userIds, event = {}) {
    const result = { sent: 0, dropped: 0, failed: 0, suppressed: 0, skipped: false };
    try {
      const exclude = event.excludeUserId ? String(event.excludeUserId) : "";
      const recipients = [...new Set((userIds || []).filter(Boolean).map(String))].filter((id) => id !== exclude);
      if (!recipients.length || !describeEvent(event, "tr")) return { ...result, skipped: true };

      const targets = await loadTargets(recipients);
      if (!targets.length) return result;
      const cfg = getConfig();
      if (!cfg) {
        if (!missingWarned) {
          missingWarned = true;
          log.warn("[APNs] APNS_KEY_ID, APNS_TEAM_ID, or APNS_PRIVATE_KEY not set — iOS alert pushes skipped");
        }
        return { ...result, skipped: true };
      }

      const isCall = CALL_TYPES.has(event.type);
      const targetUsers = [...new Set(targets.map((t) => t.userId))];
      const senderId = String(event.fromId || event.excludeUserId || "");
      const meta = await loadUserMeta(targetUsers, senderId);
      const voipUsers = event.type === "call" ? await usersWithVoipTokens(targetUsers) : new Set();
      const chatKey = chatKeyFor(event);
      const at = now();
      const richEvent = MESSAGE_TYPES.has(event.type) ? { ...event, ...(await loadRichContext(event)) } : event;

      const deliver = targets.filter((t) => {
        const m = meta.get(t.userId);
        if (m?.blocksSender) return false;
        if (!isCall && m?.dnd) return false;
        // DM calls ring through PushKit/CallKit; a banner would duplicate it.
        if (voipUsers.has(t.userId)) return false;
        if (isCall ? context.isForeground(t.token, t.userId, at) : context.isViewing(t.token, t.userId, chatKey, at)) {
          result.suppressed += 1;
          return false;
        }
        return true;
      });
      if (!deliver.length) return result;

      const host = apns.apnsHost("APNS_USE_SANDBOX");
      const jwtToken = getJwt(cfg);
      const byLang = new Map();
      await runPool(deliver, CONCURRENCY, async (t) => {
        const lang = pickLang(t.locale, meta.get(t.userId)?.language);
        if (!byLang.has(lang)) byLang.set(lang, buildAlertRequest(richEvent, lang));
        const req = byLang.get(lang);
        try {
          const res = await transport({
            host,
            headers: buildAlertHeaders(cfg, t.token, jwtToken, req, at),
            body: JSON.stringify(req.body),
          });
          if (res.status === 200) {
            result.sent += 1;
            return;
          }
          if (apns.apnsTokenShouldDrop(res.status, res.body)) {
            result.dropped += 1;
            await dropToken(t.token);
            return;
          }
          result.failed += 1;
          log.warn("[APNs] alert send failed:", res.status, clip(res.body, 160), apns.tokenTail(t.token));
        } catch (err) {
          result.failed += 1;
          log.warn("[APNs] alert send error:", err?.message || err);
        }
      });
    } catch (err) {
      log.warn("[APNs] alert push failed:", err?.message || err);
    }
    return result;
  }

  /** Subset of `userIds` that has at least one iOS alert token (cheap pre-filter for big fan-outs). */
  async function usersWithAlertTokens(userIds) {
    const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
    if (!ids.length) return new Set();
    const targets = await loadTargets(ids);
    return new Set(targets.map((t) => String(t.userId)));
  }

  return { sendToUsers, loadTargets, usersWithAlertTokens };
}

let defaultPusher = null;
function getDefaultPusher() {
  if (!defaultPusher) defaultPusher = createIosAlertPusher();
  return defaultPusher;
}
function sendIosAlertToUsers(userIds, event) {
  return getDefaultPusher().sendToUsers(userIds, event);
}
function usersWithIosAlertTokens(userIds) {
  return getDefaultPusher().usersWithAlertTokens(userIds);
}

module.exports = {
  MESSAGE_CATEGORY,
  MESSAGE_TYPES,
  commEnabled,
  mediaKindOf,
  messageTableFor,
  IOS_ALERT_PLATFORM,
  VOIP_PLATFORM,
  STRINGS,
  pickLang,
  buildApnsBody,
  describeEvent,
  chatKeyFor,
  buildAlertRequest,
  buildAlertHeaders,
  createIosAlertPusher,
  sendIosAlertToUsers,
  usersWithIosAlertTokens,
};
