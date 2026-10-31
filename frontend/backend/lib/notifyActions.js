"use strict";

/**
 * 3.0.0 (A4): actions taken straight from an iOS notification, without
 * opening the app: quick reply, the five quick reactions, "mark as read",
 * plus the short thread preview the expanded notification shows.
 *
 * Auth: a scoped notify token (signNotifyToken). It is NOT a session JWT:
 * it is signed with a key derived from JWT_SECRET plus a fixed label and
 * carries its own audience, so it can never pass requireAuth / socketAuth,
 * and a session JWT can never pass here. It still names the session it was
 * minted from (`sid`), so signing that session out kills it too.
 *
 * Group and server channel replies run the real socket handlers
 * (registerGroupHandlers / registerServerChannelHandlers) on a virtual
 * socket, so membership, permissions, slow mode, rules, timeouts, unread
 * bumps, mentions and pushes are exactly the in-app ones. DM replies mirror
 * the text path of `dm:send` (socket/handlers.js) with the same shared state.
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const NOTIFY_AUDIENCE = "descall-notify-actions";
const NOTIFY_SCOPE = "notify";
const TOKEN_TTL_S = 72 * 3600;
const QUICK_REACTIONS = Object.freeze(["❤️", "😂", "👍", "😮", "😢"]);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THREAD_LIMIT = 3;
const THREAD_TEXT_MAX = 160;
const REPLY_TIMEOUT_MS = 15000;

class NotifyActionError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

function notifyKey(secret = process.env.JWT_SECRET) {
  if (!secret) throw new Error("JWT_SECRET missing");
  return crypto.createHmac("sha256", String(secret)).update("descall/notify-actions/v1").digest();
}

/** Scoped token for notification actions. `sid` must be the minting session. */
function signNotifyToken({ userId, sid } = {}, { secret, ttlSec = TOKEN_TTL_S } = {}) {
  if (!userId || !sid) throw new NotifyActionError(409, "session_required");
  return jwt.sign({ sub: String(userId), sid: String(sid), scope: NOTIFY_SCOPE }, notifyKey(secret), {
    algorithm: "HS256",
    audience: NOTIFY_AUDIENCE,
    expiresIn: ttlSec,
  });
}

/** Decoded claims, or throws NotifyActionError(401). */
function verifyNotifyToken(token, { secret } = {}) {
  let decoded;
  try {
    decoded = jwt.verify(String(token || ""), notifyKey(secret), {
      algorithms: ["HS256"],
      audience: NOTIFY_AUDIENCE,
    });
  } catch (err) {
    throw new NotifyActionError(401, err?.name === "TokenExpiredError" ? "token_expired" : "token_invalid");
  }
  if (decoded?.scope !== NOTIFY_SCOPE || typeof decoded.sub !== "string" || !decoded.sid) {
    throw new NotifyActionError(401, "token_invalid");
  }
  return decoded;
}

/** "dm:<peerId>" | "group:<groupId>" | "channel:<channelId>" (the push thread-id). */
function parseConversation(conv) {
  const m = /^(dm|group|channel):([A-Za-z0-9_-]{1,64})$/.exec(String(conv || ""));
  if (!m) throw new NotifyActionError(400, "bad_conversation");
  return { type: m[1], id: m[2] };
}

function normalizeReplyText(text, maxLength = 2000) {
  if (typeof text !== "string") throw new NotifyActionError(400, "empty");
  const trimmed = text.replace(/\r\n?/g, "\n").trim();
  if (!trimmed) throw new NotifyActionError(400, "empty");
  if (trimmed.length > maxLength) throw new NotifyActionError(400, "too_long");
  // Slash commands need the app (games, polls, ages gates).
  if (trimmed.startsWith("/")) throw new NotifyActionError(422, "slash_in_app");
  return trimmed;
}

function isQuickReaction(emoji) {
  return QUICK_REACTIONS.includes(String(emoji || ""));
}

function messageKind(row = {}) {
  const t = String(row.media_type || "").toLowerCase();
  const mime = String(row.mime_type || "").toLowerCase();
  if (t === "voice" || t === "audio" || String(row.content || "").startsWith("__voice__:")) return "voice";
  if (t === "image" || t === "gif" || mime.startsWith("image/")) return "image";
  if (t === "video" || mime.startsWith("video/")) return "video";
  if (row.media_url) return "file";
  if (t === "poll_v2") return "poll";
  return "text";
}

/** Thread row → preview line for the expanded notification. */
function threadLine(row, { myId, nameOf, mask = (s) => s, textMax = THREAD_TEXT_MAX } = {}) {
  const kind = messageKind(row);
  const raw = kind === "voice" ? "" : String(row.content || "");
  const text = mask(raw).replace(/\s+/g, " ").trim();
  return {
    id: row.id,
    fromId: row.sender_id,
    fromName: nameOf(row.sender_id) || "",
    mine: row.sender_id === myId,
    kind,
    text: text.length > textMax ? `${text.slice(0, textMax - 1)}…` : text,
    at: row.created_at || null,
  };
}

/**
 * Socket stand-in for running a registered handler outside a live socket.
 * Room broadcasts go through `io` (the sender's other devices receive them,
 * exactly as they do for a phone-sent message); direct replies are captured.
 */
function createVirtualSocket(io, user) {
  const listeners = new Map();
  const emitted = [];
  const rooms = new Set();
  const socket = {
    id: `notify-${crypto.randomUUID()}`,
    user,
    data: {},
    rooms,
    connected: true,
    handshake: { headers: {}, query: {}, auth: { client: "ios-notify-action" }, address: "" },
    on(event, fn) { listeners.set(event, fn); return socket; },
    once(event, fn) { listeners.set(event, fn); return socket; },
    off() { return socket; },
    onAny() {},
    use() {},
    emit(event, payload) {
      emitted.push({ event, payload });
      // Live balance for the sender's open devices (message DesCoin credit).
      if (event === "descoin:balance") io.to(`user:${user.id}`).emit(event, payload);
      return true;
    },
    to(room) { return io.to(room); },
    in(room) { return io.in ? io.in(room) : io.to(room); },
    except() { return io; },
    broadcast: { emit() {}, to: (room) => io.to(room) },
    join(room) { (Array.isArray(room) ? room : [room]).forEach((r) => rooms.add(r)); },
    leave(room) { rooms.delete(room); },
    disconnect() { socket.connected = false; },
  };
  async function call(event, payload) {
    const fn = listeners.get(event);
    if (typeof fn !== "function") throw new NotifyActionError(500, "handler_missing");
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new NotifyActionError(504, "timeout")), REPLY_TIMEOUT_MS);
    });
    try {
      await Promise.race([Promise.resolve(fn(payload)), timeout]);
    } finally {
      clearTimeout(timer);
    }
    return emitted;
  }
  return { socket, call, emitted };
}

/** Outcome of a virtual group / channel send from what the handler emitted. */
function readSendOutcome(emitted, { messageEvent, errorEvent, tempId }) {
  const err = emitted.find((e) => e.event === errorEvent && (!e.payload?.tempId || e.payload.tempId === tempId));
  if (err) {
    const code = String(err.payload?.code || "rejected").toLowerCase();
    const status = code === "not_member" || code === "missing_permission" ? 403 : code === "timed_out" ? 403 : 422;
    throw new NotifyActionError(status, code, err.payload?.message || code);
  }
  const echo = emitted.find((e) => e.event === messageEvent && e.payload?.tempId === tempId);
  if (!echo) throw new NotifyActionError(502, "not_sent");
  return { messageId: echo.payload?.message?.id || null };
}

function createNotifyActions(deps = {}) {
  const getDb = deps.getDb || (() => require("../db/supabase"));
  const state = () => deps.state || require("../runtime/sharedState");
  const dm = () => deps.dmMessages || require("./dmMessages");
  const profile = () => deps.userProfile || require("./userProfile");
  const blocking = () => deps.blocking || require("./blocking");
  const prefs = () => deps.dmPrefs || require("./dmConversationPrefs");
  const moderation = () => deps.moderation || require("./moderation");
  const push = () => deps.webPush || require("./webPush");
  const mask = (text) => {
    try { return (deps.maskProfanity || require("./profanity").maskProfanity)(text); } catch { return text; }
  };
  const registerGroup = deps.registerGroupHandlers || ((io, socket) => {
    const s = state();
    require("../socket/groupHandlers").registerGroupHandlers(io, socket, {
      presence: s.presence,
      socketToUser: s.socketToUser,
      friends: s.friends,
    });
  });
  const registerChannel = deps.registerServerChannelHandlers ||
    ((io, socket) => require("../socket/serverChannelHandlers").registerServerChannelHandlers(io, socket));
  const channelAccess = deps.assertTextChannelAccess ||
    ((...a) => require("../socket/serverChannelHandlers").assertTextChannelAccess(...a));
  const perms = () => deps.serverPermissions || require("./serverPermissions");
  const log = deps.log || console;

  function emitToUser(io, userId, event, payload) {
    if (!io || !userId) return;
    const room = `user:${userId}`;
    const roomSet = io.sockets?.adapter?.rooms?.get(room);
    if (roomSet && roomSet.size > 0) {
      io.to(room).emit(event, payload);
      return;
    }
    const p = state().presence.get(userId);
    if (p?.socketId) io.to(p.socketId).emit(event, payload);
  }

  async function loadActor(userId) {
    const s = state();
    if (s.bannedUserIds.has(userId)) throw new NotifyActionError(403, "banned");
    const row = await profile().loadUserProfile(userId).catch(() => null);
    if (!row?.id) throw new NotifyActionError(401, "user_missing");
    return {
      id: userId,
      username: row.username || s.usernameById.get(userId) || "",
      display_name: row.display_name || row.displayName || null,
      avatar_url: row.avatar_url || row.avatarUrl || null,
      is_admin: Boolean(row.is_admin || row.isAdmin),
    };
  }

  function assertNotTimedOut(userId) {
    let to = null;
    try { to = moderation().getActiveTimeout(userId); } catch { to = null; }
    if (to) throw new NotifyActionError(403, "timed_out", to.message || "timed out");
  }

  async function assertDmAllowed(myId, peerId) {
    const s = state();
    const { convKey } = dm();
    if (!peerId || peerId === myId) throw new NotifyActionError(400, "bad_conversation");
    if (s.dmBlockPairs.has(convKey(myId, peerId))) throw new NotifyActionError(403, "blocked");
    if (await blocking().isBlockedEitherWay(myId, peerId)) throw new NotifyActionError(403, "blocked");
  }

  async function assertGroupMember(groupId, userId) {
    const { data } = await getDb()
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) throw new NotifyActionError(403, "not_member");
  }

  async function assertChannelRead(userId, channelId, flag) {
    const { Permissions, hasPermission } = perms();
    let res;
    try {
      res = await channelAccess(userId, channelId, flag == null ? Permissions.VIEW_CHANNEL : flag);
    } catch (err) {
      throw new NotifyActionError(403, "not_member", err?.message);
    }
    if (!hasPermission(res.permissions, Permissions.READ_MESSAGE_HISTORY)) {
      throw new NotifyActionError(403, "missing_permission");
    }
    return res.channel;
  }

  // ── Quick reply ──────────────────────────────────────────────────────────

  async function replyDm(io, me, peerId, text) {
    const s = state();
    const { convKey, cacheDmMessages, messageSender, isAcceptedFriend } = dm();
    const myId = me.id;
    await assertDmAllowed(myId, peerId);
    const now = Date.now();
    const last = s.rateLimitDm.get(myId) || 0;
    if (now - last < s.systemConfig.dmRateLimitMs) throw new NotifyActionError(429, "rate_limited");
    s.rateLimitDm.set(myId, now);
    // Message requests go through the app (first contact shows a preview card).
    if (!(await isAcceptedFriend(myId, peerId))) throw new NotifyActionError(409, "not_friends");

    await profile().ensureCosmeticsCached([myId]).catch(() => {});
    const sender = messageSender(myId, me.username, me.avatar_url);
    const { data: row, error } = await getDb()
      .from("dm_messages")
      .insert({
        from_user_id: myId,
        to_user_id: peerId,
        content: text,
        media_url: null,
        media_type: null,
        mime_type: null,
        file_size: null,
        original_name: null,
        duration: null,
        reply_to: null,
      })
      .select("id, created_at")
      .single();
    if (error || !row) {
      log.error("[notify-actions] DM insert failed:", error?.message || "no row");
      throw new NotifyActionError(502, "not_sent");
    }
    const messageId = row.id;
    const { toUtcIso } = require("./datetime");
    const timestamp = toUtcIso(row.created_at) || row.created_at;
    void Promise.resolve().then(() => require("./userAnalyticsStore").recordFirstMessage(myId)).catch(() => {});
    try {
      void require("./descoinAntibot").observeMessage({
        userId: myId,
        convKey: `dm:${[myId, peerId].sort().join(":")}`,
        dmPeerId: peerId,
        text,
      });
    } catch { /* shadow only */ }
    try {
      if (require("./descoinMessageGuard").shouldCreditMessage(myId, text)) {
        require("./descoin")
          .creditCapped(myId, 1, "message_activity", { context: "dm", toUserId: peerId })
          .then((r) => {
            if (r.credited > 0) emitToUser(io, myId, "descoin:balance", { balance: r.balance, delta: r.credited, reason: "message_activity" });
          })
          .catch((err) => log.warn("[DesCoin] notify reply credit failed:", err?.message || err));
      }
    } catch { /* economy is best effort, as in dm:send */ }

    const p = s.presence.get(peerId);
    const recipientSocket = p?.socketId ? io?.sockets?.sockets?.get(p.socketId) : null;
    const recipientActivePeer = recipientSocket?.data?.activeDmPeer;
    if (!s.dmUnreadByUser.has(peerId)) s.dmUnreadByUser.set(peerId, new Map());
    const unreadMap = s.dmUnreadByUser.get(peerId);
    let unreadCount = 0;
    if (recipientActivePeer !== myId) {
      unreadCount = (unreadMap.get(myId) || 0) + 1;
      unreadMap.set(myId, unreadCount);
    } else {
      unreadMap.delete(myId);
    }
    const messagePayload = {
      id: messageId,
      from: sender,
      text,
      mediaUrl: null,
      mediaType: null,
      mimeType: null,
      size: null,
      originalName: null,
      duration: null,
      replyTo: null,
      timestamp,
    };
    cacheDmMessages(convKey(myId, peerId), [{ ...messagePayload, to: { id: peerId } }]);
    void Promise.all([prefs().revealOnMessage(myId, peerId), prefs().revealOnMessage(peerId, myId)]).catch(() => {});
    emitToUser(io, peerId, "dm:message", { ...messagePayload, convWith: myId });
    // The sender's own open devices (no tempId: nothing optimistic to replace).
    emitToUser(io, myId, "dm:message", { ...messagePayload, convWith: peerId });
    emitToUser(io, peerId, "dm:unread:sync", { peerId: myId, count: recipientActivePeer !== myId ? unreadCount : 0 });
    // The reply means I have read this chat.
    await markDmRead(io, myId, peerId).catch(() => {});

    let mentioned = false;
    const peerName = s.usernameById.get(peerId);
    if (peerName && new RegExp(`@${peerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
      mentioned = true;
      emitToUser(io, peerId, "mention:received", { dmConversationId: myId, from: me.username, text });
    }
    if (recipientActivePeer !== myId) {
      try {
        if (!(await prefs().isMuted(peerId, myId))) {
          const preview = text.slice(0, 140);
          const common = {
            body: preview,
            rawText: preview,
            previewKind: "text",
            from: me.username,
            fromId: myId,
            messageId,
            deepLink: `/?dm=${encodeURIComponent(myId)}`,
          };
          if (mentioned) {
            void push().sendMentionPush([peerId], { ...common, title: `${me.username || "Someone"} mentioned you`, text: preview, dmConversationId: myId });
          } else {
            void push().sendDmMessagePush([peerId], { ...common, title: me.username || "New message" });
          }
        }
      } catch (err) {
        log.warn("[notify-actions] DM push skipped:", err?.message || err);
      }
    }
    return { messageId };
  }

  async function replyGroup(io, me, groupId, text) {
    const v = createVirtualSocket(io, me);
    registerGroup(io, v.socket);
    const tempId = `notify-${crypto.randomUUID()}`;
    const emitted = await v.call("group:message", { groupId, tempId, content: text });
    return readSendOutcome(emitted, { messageEvent: "group:message", errorEvent: "group:message:error", tempId });
  }

  async function replyChannel(io, me, channelId, text) {
    const v = createVirtualSocket(io, me);
    registerChannel(io, v.socket);
    const tempId = `notify-${crypto.randomUUID()}`;
    const emitted = await v.call("server:channel:message", { channelId, tempId, content: text });
    const ack = emitted.find((e) => e.event === "server:channel:message:ack" && e.payload?.tempId === tempId);
    if (ack) return { messageId: null };
    return readSendOutcome(emitted, { messageEvent: "server:channel:message", errorEvent: "server:channel:message:error", tempId });
  }

  async function reply(io, userId, { conv, text } = {}) {
    const c = parseConversation(conv);
    const s = state();
    const body = normalizeReplyText(text, Number(s.systemConfig?.maxMessageLength) || 2000);
    assertNotTimedOut(userId);
    const me = await loadActor(userId);
    if (c.type === "dm") return replyDm(io, me, c.id, body);
    if (c.type === "group") return replyGroup(io, me, c.id, body);
    return replyChannel(io, me, c.id, body);
  }

  // ── Quick reaction ───────────────────────────────────────────────────────

  async function react(io, userId, { conv, messageId, emoji } = {}) {
    const c = parseConversation(conv);
    if (!isQuickReaction(emoji)) throw new NotifyActionError(400, "bad_emoji");
    if (!ID_RE.test(String(messageId || ""))) throw new NotifyActionError(400, "bad_message");
    const me = await loadActor(userId);
    const db = getDb();
    let conversationType;
    let conversationId;
    if (c.type === "dm") {
      await assertDmAllowed(userId, c.id);
      const { data: rows } = await db
        .from("dm_messages")
        .select("id, from_user_id, to_user_id")
        .eq("id", messageId);
      const row = (rows || [])[0];
      const pair = row && ((row.from_user_id === userId && row.to_user_id === c.id) || (row.from_user_id === c.id && row.to_user_id === userId));
      if (!pair) throw new NotifyActionError(404, "message_missing");
      conversationType = "dm";
      conversationId = dm().convKey(userId, c.id);
    } else if (c.type === "group") {
      await assertGroupMember(c.id, userId);
      const { data } = await db.from("group_messages").select("id").eq("id", messageId).eq("group_id", c.id).maybeSingle();
      if (!data) throw new NotifyActionError(404, "message_missing");
      conversationType = "group";
      conversationId = c.id;
    } else {
      const { Permissions } = perms();
      const channel = await assertChannelRead(userId, c.id, Permissions.ADD_REACTIONS);
      const { data } = await db
        .from("server_messages")
        .select("id")
        .eq("id", messageId)
        .eq("channel_id", channel.id)
        .eq("server_id", channel.server_id)
        .maybeSingle();
      if (!data) throw new NotifyActionError(404, "message_missing");
      conversationType = "server";
      conversationId = c.id;
    }
    const { error } = await db
      .from("reactions")
      .upsert(
        { message_id: messageId, conversation_type: conversationType, conversation_id: conversationId, user_id: userId, emoji },
        { onConflict: "message_id,user_id,emoji" }
      )
      .select();
    if (error) {
      log.error("[notify-actions] reaction failed:", error.message);
      throw new NotifyActionError(502, "failed");
    }
    const update = { messageId, emoji, userId, username: me.username, conversationType, conversationId };
    if (conversationType === "dm") emitToUser(io, c.id, "reaction:update", update);
    else if (conversationType === "server") io.to(`server-channel:${conversationId}`).emit("reaction:update", update);
    else io.to(`group:${conversationId}`).emit("reaction:update", update);
    emitToUser(io, userId, "reaction:update", update);
    return { ok: true };
  }

  // ── Mark as read ─────────────────────────────────────────────────────────

  async function markDmRead(io, myId, peerId) {
    const s = state();
    const at = new Date().toISOString();
    const { error } = await getDb()
      .from("dm_messages")
      .update({ read_at: at })
      .eq("from_user_id", peerId)
      .eq("to_user_id", myId)
      .is("read_at", null);
    if (error) throw new NotifyActionError(502, "failed");
    const arr = s.dmHistory.get(dm().convKey(myId, peerId));
    if (arr) {
      for (const m of arr) {
        if (m.from?.id === peerId && m.to?.id === myId) m.readAt = m.readAt || at;
      }
    }
    if (!s.dmUnreadByUser.has(myId)) s.dmUnreadByUser.set(myId, new Map());
    s.dmUnreadByUser.get(myId).delete(peerId);
    emitToUser(io, myId, "dm:unread:sync", { peerId, count: 0 });
    emitToUser(io, peerId, "dm:peer_read", { peerId: myId, at });
    void Promise.resolve(prefs().clearMarkedUnread(myId, peerId)).catch(() => {});
    return at;
  }

  async function read(io, userId, { conv } = {}) {
    const c = parseConversation(conv);
    if (state().bannedUserIds.has(userId)) throw new NotifyActionError(403, "banned");
    if (c.type === "dm") {
      if (!c.id || c.id === userId) throw new NotifyActionError(400, "bad_conversation");
      await markDmRead(io, userId, c.id);
      return { ok: true, scope: "server" };
    }
    if (c.type === "channel") {
      const channel = await assertChannelRead(userId, c.id);
      const { error } = await getDb().from("server_channel_reads").upsert(
        { user_id: userId, channel_id: c.id, last_read_at: new Date().toISOString(), last_read_message_id: null, unread_count: 0 },
        { onConflict: "user_id,channel_id" }
      );
      if (error) throw new NotifyActionError(502, "failed");
      // Same write as POST /servers/:id/channels/:channelId/read (open devices
      // pick the count up on their next unread fetch, as they do today).
      return { ok: true, scope: "server", serverId: channel.server_id };
    }
    // Group unread lives on the devices; the notification side clears the banner.
    await assertGroupMember(c.id, userId);
    return { ok: true, scope: "device" };
  }

  // ── Expanded notification preview ────────────────────────────────────────

  // 3.7.17: the Apple Watch reads a longer page (limit up to 30, longer lines);
  // the notification preview keeps THREAD_LIMIT / THREAD_TEXT_MAX.
  async function thread(userId, { conv, messageId, limit = THREAD_LIMIT, textMax = THREAD_TEXT_MAX } = {}) {
    const take = Math.max(1, Math.min(30, Number(limit) || THREAD_LIMIT));
    const c = parseConversation(conv);
    if (state().bannedUserIds.has(userId)) throw new NotifyActionError(403, "banned");
    const db = getDb();
    let rows = [];
    const header = { conv: `${c.type}:${c.id}`, type: c.type, title: "", subtitle: "", memberCount: null };
    if (c.type === "dm") {
      await assertDmAllowed(userId, c.id);
      const { data } = await db
        .from("dm_messages")
        .select("id, from_user_id, to_user_id, content, media_url, media_type, mime_type, created_at")
        .or(`and(from_user_id.eq.${userId},to_user_id.eq.${c.id}),and(from_user_id.eq.${c.id},to_user_id.eq.${userId})`)
        .order("created_at", { ascending: false })
        .limit(take + 5);
      rows = (data || []).map((r) => ({ ...r, sender_id: r.from_user_id }));
      if (!rows.length) throw new NotifyActionError(404, "empty");
    } else if (c.type === "group") {
      await assertGroupMember(c.id, userId);
      const [{ data: g }, { data: members }, { data }] = await Promise.all([
        db.from("groups").select("id, name").eq("id", c.id).maybeSingle(),
        db.from("group_members").select("user_id").eq("group_id", c.id),
        db
          .from("group_messages")
          .select("id, sender_id, content, media_url, media_type, created_at")
          .eq("group_id", c.id)
          .order("created_at", { ascending: false })
          .limit(take + 5),
      ]);
      header.title = g?.name || "";
      header.memberCount = Array.isArray(members) ? members.length : null;
      rows = data || [];
    } else {
      const channel = await assertChannelRead(userId, c.id);
      const [{ data: server }, { data }] = await Promise.all([
        db.from("servers").select("id, name").eq("id", channel.server_id).maybeSingle(),
        db
          .from("server_messages")
          .select("id, sender_id, content, media_url, media_type, created_at")
          .eq("channel_id", c.id)
          .order("created_at", { ascending: false })
          .limit(take + 5),
      ]);
      header.title = channel.name || "";
      header.subtitle = server?.name || "";
      rows = data || [];
    }
    // Up to and including the notified message, oldest first.
    let list = rows;
    const at = list.findIndex((r) => r.id === messageId);
    if (messageId && at > 0) list = list.slice(at);
    list = list.slice(0, take).reverse();
    const ids = [...new Set(list.map((r) => r.sender_id).filter(Boolean))];
    const names = new Map();
    if (ids.length) {
      const { data: users } = await db.from("users").select("id, username, display_name").in("id", ids);
      for (const u of users || []) names.set(u.id, u.display_name || u.username || "");
    }
    return {
      ...header,
      messages: list.map((r) => threadLine(r, { myId: userId, nameOf: (id) => names.get(id), mask, textMax })),
    };
  }

  return { reply, react, read, thread, markDmRead };
}

module.exports = {
  NOTIFY_AUDIENCE,
  NOTIFY_SCOPE,
  TOKEN_TTL_S,
  QUICK_REACTIONS,
  UUID_RE,
  NotifyActionError,
  signNotifyToken,
  verifyNotifyToken,
  parseConversation,
  normalizeReplyText,
  isQuickReaction,
  messageKind,
  threadLine,
  createVirtualSocket,
  readSendOutcome,
  createNotifyActions,
};
