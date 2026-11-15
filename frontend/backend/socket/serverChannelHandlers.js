/**
 * Server channel text chat socket handlers (Steps 4–6).
 * Room: server-channel:${channelId}
 * Events: server:channel:join | leave | message (+ ack/error)
 * Gated by VIEW_CHANNEL (join/history) and SEND_MESSAGES (send).
 */

const { forwardedReplyMeta } = require("../lib/forwardedMessage");
const supabase = require("../db/supabase");
const { systemConfig } = require("../runtime/sharedState");
const { checkMessageSend, checkChatFrozen, isPlatformAdmin } = require("../lib/platformPolicy");
const { normalizeIncomingMediaUrl } = require("../lib/privateMedia");
const { getCachedPublicUser, getAvatarUrl, pickChatCosmetics, ensureCosmeticsCached } = require("../lib/userProfile");
const { toUtcIso } = require("../lib/datetime");
const descoin = require("../lib/descoin");
const { shouldCreditMessage } = require("../lib/descoinMessageGuard");
const descoinAntibot = require("../lib/descoinAntibot");
const { recordFirstMessage } = require("../lib/userAnalyticsStore");
const {
  Permissions,
  hasPermission,
  resolveChannelPermissions,
  resolveChannelPermissionsBulk,
  resolveMemberPermissions,
  computeChannelOverwriteBits,
  ALL_PERMISSIONS,
} = require("../lib/serverPermissions");
const { getActiveServerTimeout, timedOutError } = require("../lib/serverTimeoutState");
const { getServerAccessEpoch } = require("../lib/serverAccessRealtime");
const {
  executeSlashCommand,
  emitAppMessage,
  parseSlashCommand,
  isCasinoCommand,
} = require("../lib/slashCommands");
const { needsRulesAcceptance } = require("../lib/serverRulesGate");
const { normalizePollInput, pollFallbackText, buildPollSnapshot } = require("../lib/pollCore");
const { apiError, apiText } = require("../lib/apiError");
const serverMentions = require("../lib/serverMentions");
const { updateServerMessageWithHistory } = require("../lib/serverMessageHistory");
const { errorFields } = require("../lib/apiError");

// (channelId:userId) -> ms of the last send / in-flight reservation. Only kept for
// channels with slowmode and pruned past the longest slowmode (server audit SK-9).
const slowmodeLastSend = new Map();
const SLOWMODE_MAX_MS = 6 * 60 * 60 * 1000;
// Messaging phase 5: one @everyone / @here per sender per channel per minute (lib/serverMentions.js).
const massPingLimiter = serverMentions.createMassPingLimiter();

/** Media types a server message may carry (server audit MSG-3: any string was stored). */
const MEDIA_TYPES = new Set(["image", "video", "gif", "file", "document", "audio", "voice"]);
const MAX_DIRECT_MENTIONS = 20;
const MAX_PINS_PER_CHANNEL = 50;
const MAX_REJOIN_CHANNELS = 200;
const MAX_SEARCH_QUERY = 200;

function slowmodeKey(channelId, userId) {
  return `${channelId}:${userId}`;
}

function resolveSocketAvatar(socket) {
  const cached = getCachedPublicUser(socket.user?.id);
  return (
    cached?.avatarUrl ||
    cached?.avatar_url ||
    getAvatarUrl(socket.user?.id) ||
    socket.user?.avatar_url ||
    null
  );
}

function buildSenderPayload(socket) {
  const myId = socket.user?.id;
  const cached = getCachedPublicUser(myId);
  const avatar = resolveSocketAvatar(socket);
  const displayName = cached?.displayName || socket.user?.display_name || socket.user?.displayName || null;
  const username = cached?.username || socket.user?.username;
  const isAdmin =
    Boolean(cached?.is_admin || cached?.isAdmin || socket.user?.is_admin) || username === "admin";
  return {
    id: myId,
    username,
    displayName,
    display_name: displayName,
    avatar_url: avatar,
    avatarUrl: avatar,
    avatarVersion: cached?.avatarVersion || cached?.updated_at || null,
    updated_at: cached?.updated_at || null,
    is_admin: isAdmin,
    isAdmin,
    ...pickChatCosmetics(cached),
  };
}


/** Message length cap (Sistem › maxMessageLength, default 2000; server audit MSG-5). */
function maxMessageLength() {
  const n = Math.floor(Number(systemConfig?.maxMessageLength));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20000) : 2000;
}

/**
 * Per-socket event budget (server audit SK-7): `max` events per `windowMs` per bucket.
 * Returns true when the event may run.
 */
function allowSocketEvent(socket, bucket, max, windowMs = 10_000) {
  const all = socket.data.serverRate || (socket.data.serverRate = new Map());
  const now = Date.now();
  const list = (all.get(bucket) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    all.set(bucket, list);
    return false;
  }
  list.push(now);
  all.set(bucket, list);
  return true;
}

const RATE_LIMITED_TEXT = "You're doing that too fast. Wait a moment and try again.";

/** Flags a timed-out member keeps (Discord: view and read history only). */
function isPassiveFlag(flag) {
  return !flag || flag === Permissions.VIEW_CHANNEL || flag === Permissions.READ_MESSAGE_HISTORY;
}

function platformTimeoutError(to) {
  const err = new Error(to?.message || "You are timed out right now.");
  err.status = 403;
  err.code = "TIMED_OUT";
  err.timeout = to;
  return err;
}

function getPlatformTimeout(userId) {
  try {
    return require("../lib/moderation").getActiveTimeout(userId) || null;
  } catch {
    return null;
  }
}

/**
 * Throws TIMED_OUT when the member is timed out site-wide (Descall staff) or in this
 * server (the owner and ADMINISTRATOR members are exempt from server timeouts, like
 * Discord). Server audit MSG-2 / MSG-10.
 */
async function assertNotTimedOut(userId, serverId, exempt) {
  const to = getPlatformTimeout(userId);
  if (to) throw platformTimeoutError(to);
  if (exempt) return;
  const t = await getActiveServerTimeout(serverId, userId);
  if (t) throw timedOutError(t);
}

/**
 * Channel bits of one member for several channels of one server in ~5 queries (not
 * ~8 per channel). Same math as resolveChannelPermissions. Also says, per channel,
 * whether an overwrite explicitly allows SEND_MESSAGES (announcement channels).
 * channels: [{ id, parent_id }]. Returns { isMember, isOwner, bits: Map, sendAllowed: Map }.
 */
async function resolveUserChannelsBits(serverId, userId, channels) {
  const base = await resolveMemberPermissions(supabase, serverId, userId);
  const out = { isMember: Boolean(base.isMember), isOwner: Boolean(base.isOwner), baseBits: base.bits || 0n, bits: new Map(), sendAllowed: new Map() };
  if (!base.isMember || !channels.length) return out;
  if (base.isOwner || hasPermission(base.bits, Permissions.ADMINISTRATOR)) {
    for (const c of channels) {
      out.bits.set(c.id, ALL_PERMISSIONS);
      out.sendAllowed.set(c.id, true);
    }
    return out;
  }
  const ids = new Set();
  for (const c of channels) {
    ids.add(c.id);
    if (c.parent_id) ids.add(c.parent_id);
  }
  const [{ data: overrides, error: oErr }, { data: roles, error: rErr }, { data: assigned, error: aErr }] = await Promise.all([
    supabase
      .from("server_channel_overrides")
      .select("id, channel_id, target_type, target_id, allow_permissions, deny_permissions")
      .in("channel_id", [...ids]),
    supabase.from("server_roles").select("id, position, is_everyone").eq("server_id", serverId),
    supabase.from("server_member_roles").select("role_id").eq("server_id", serverId).eq("user_id", userId),
  ]);
  if (oErr) throw oErr;
  if (rErr) throw rErr;
  if (aErr) throw aErr;
  for (const c of channels) {
    const args = { roles, assigned, overrides, channelId: c.id, parentId: c.parent_id || null, userId };
    out.bits.set(c.id, computeChannelOverwriteBits({ ...args, baseBits: base.bits }));
    // Without SEND in the base, only an overwrite can grant it.
    const viaOverwrite = computeChannelOverwriteBits({ ...args, baseBits: base.bits & ~Permissions.SEND_MESSAGES });
    out.sendAllowed.set(c.id, hasPermission(viaOverwrite, Permissions.SEND_MESSAGES));
  }
  return out;
}

/**
 * Announcement channels are read-only for members (server audit MSG-1): posting needs
 * MANAGE_MESSAGES (owner / ADMINISTRATOR have it) or an overwrite that explicitly
 * allows SEND_MESSAGES in that channel (or its category).
 */
function canPostInAnnouncement(bits, explicitSendAllow) {
  return hasPermission(bits, Permissions.MANAGE_MESSAGES) || Boolean(explicitSendAllow);
}

async function assertTextChannelAccess(userId, channelId, requiredFlag) {
  const { data: channel, error: cErr } = await supabase
    .from("server_channels")
    .select("id, server_id, type, name, slowmode_seconds, parent_id")
    .eq("id", channelId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!channel) {
    const err = new Error("Channel not found.");
    err.status = 404;
    throw err;
  }
  if (channel.type !== "text" && channel.type !== "announcement") {
    const err = new Error("Only text channels support chat messages.");
    err.status = 400;
    err.code = "NOT_TEXT_CHANNEL";
    throw err;
  }

  const resolved = await resolveChannelPermissions(
    supabase,
    channel.server_id,
    userId,
    channelId
  );
  if (!resolved.isMember) {
    const err = new Error("You are not a member of this server.");
    err.status = 403;
    throw err;
  }
  // VIEW_CHANNEL is always required: without it a member of the server could
  // react / pin / edit in a hidden channel (and reaction:add joined its live
  // room). Before 2026-10-18 only requiredFlag was checked.
  if (!hasPermission(resolved.bits, Permissions.VIEW_CHANNEL)) {
    const err = new Error("Missing permission.");
    err.status = 403;
    err.code = "MISSING_PERMISSION";
    throw err;
  }
  if (requiredFlag && !hasPermission(resolved.bits, requiredFlag)) {
    const err = new Error("Missing permission.");
    err.status = 403;
    err.code = "MISSING_PERMISSION";
    throw err;
  }
  if (
    requiredFlag === Permissions.SEND_MESSAGES &&
    channel.type === "announcement" &&
    !hasPermission(resolved.bits, Permissions.MANAGE_MESSAGES)
  ) {
    const one = await resolveUserChannelsBits(channel.server_id, userId, [channel]);
    if (!canPostInAnnouncement(resolved.bits, one.sendAllowed.get(channel.id))) {
      const err = new Error("Only moderators can post in this announcement channel.");
      err.status = 403;
      err.code = "ANNOUNCEMENT_READ_ONLY";
      throw err;
    }
  }
  // A timed-out member keeps only VIEW_CHANNEL + READ_MESSAGE_HISTORY: no send, edit,
  // react, pin, typing or moderation (server audit MSG-2 / MSG-10; before, only
  // reactions checked the server timeout here and nothing checked the site-wide one).
  if (!isPassiveFlag(requiredFlag)) {
    await assertNotTimedOut(userId, channel.server_id, resolved.isOwner || hasPermission(resolved.bits, Permissions.ADMINISTRATOR));
  }
  return { channel, permissions: resolved.bits, resolved };
}

/**
 * Slowmode with an in-process reservation (server audit MSG-7 / MSG-11): the DB read
 * happens first, then check-and-reserve runs in one synchronous step, so parallel
 * sends of one user cannot all pass. The last send time is also kept after a delete
 * (memory + server_slowmode_marks when that migration is applied).
 * Returns { blocked: true } (error already emitted) or { blocked: false, commit(), undo() }.
 */
let slowmodeTableMissing = false;

function isMissingTableError(error) {
  const code = String(error?.code || "");
  return code === "PGRST205" || code === "42P01" || /does not exist|could not find the table/i.test(String(error?.message || ""));
}

function pruneSlowmodeMap(now) {
  if (slowmodeLastSend.size < 5000) return;
  for (const [k, at] of slowmodeLastSend) if (now - at > SLOWMODE_MAX_MS) slowmodeLastSend.delete(k);
}

async function assertSlowmode({ userId, channel, channelId, channelBits, tempId, socket }) {
  const noop = { blocked: false, commit() {}, undo() {} };
  const slowmodeSeconds = Math.max(0, Math.floor(Number(channel?.slowmode_seconds) || 0));
  if (!slowmodeSeconds) return noop;
  // Discord parity: admins / manage-messages can bypass server enforcement.
  if (
    hasPermission(channelBits, Permissions.ADMINISTRATOR) ||
    hasPermission(channelBits, Permissions.MANAGE_MESSAGES)
  ) {
    return noop;
  }

  let dbTime = 0;
  try {
    const [msgRes, markRes] = await Promise.all([
      supabase
        .from("server_messages")
        .select("created_at")
        .eq("server_id", channel.server_id)
        .eq("channel_id", channelId)
        .eq("sender_id", userId)
        .order("created_at", { ascending: false })
        .limit(1),
      slowmodeTableMissing
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("server_slowmode_marks")
            .select("last_sent_at")
            .eq("channel_id", channelId)
            .eq("user_id", userId)
            .maybeSingle(),
    ]);
    if (msgRes.error) throw msgRes.error;
    const lastMessage = Array.isArray(msgRes.data) ? msgRes.data[0] : null;
    dbTime = lastMessage?.created_at ? new Date(lastMessage.created_at).getTime() : 0;
    if (markRes.error) {
      if (isMissingTableError(markRes.error)) slowmodeTableMissing = true;
    } else if (markRes.data?.last_sent_at) {
      dbTime = Math.max(dbTime, new Date(markRes.data.last_sent_at).getTime() || 0);
    }
  } catch (err) {
    console.warn("[ServerChannel] slowmode history lookup failed:", err?.message || err);
  }

  // Synchronous from here: check + reserve cannot interleave with another send.
  const key = slowmodeKey(channelId, userId);
  const memTime = slowmodeLastSend.get(key) || 0;
  const lastTime = Math.max(dbTime, memTime);
  const now = Date.now();
  if (lastTime) {
    const elapsedSeconds = Math.floor((now - lastTime) / 1000);
    const retryAfterSeconds = slowmodeSeconds - elapsedSeconds;
    if (retryAfterSeconds > 0) {
      socket.emit("server:channel:message:error", {
        channelId,
        tempId: tempId || null,
        ...apiText("message", "Slowmode is on. Try again in {seconds}s.", { seconds: retryAfterSeconds }),
        code: "SLOWMODE",
        retryAfterSeconds,
      });
      return { blocked: true };
    }
  }
  pruneSlowmodeMap(now);
  const prev = slowmodeLastSend.get(key);
  slowmodeLastSend.set(key, now);
  let committed = false;
  return {
    blocked: false,
    commit() {
      if (committed) return;
      committed = true;
      if (slowmodeTableMissing) return;
      void Promise.resolve(
        supabase
          .from("server_slowmode_marks")
          .upsert({ channel_id: channelId, user_id: userId, last_sent_at: new Date(now).toISOString() }, { onConflict: "channel_id,user_id" })
      )
        .then((res) => {
          if (res?.error && isMissingTableError(res.error)) slowmodeTableMissing = true;
        })
        .catch(() => {});
    },
    undo() {
      if (committed || slowmodeLastSend.get(key) !== now) return;
      if (prev == null) slowmodeLastSend.delete(key);
      else slowmodeLastSend.set(key, prev);
    },
  };
}

/**
 * Text checks shared by send and edit (server audit MSG-5 / MSG-6 / SK-4): length,
 * EMBED_LINKS, @everyone / @here permission and the word filter. Returns
 * { error: {...payload fields} } or { filtered, mentionParts, massMention }.
 */
function checkOutgoingText({ text, channelBits, resolved, userId, filterCtx, skipLength = false }) {
  const value = typeof text === "string" ? text : "";
  if (!skipLength && value.length > maxMessageLength()) {
    return { error: { message: "Message is too long.", code: "TOO_LONG", maxLength: maxMessageLength() } };
  }
  if (value && /https?:\/\//i.test(value) && !hasPermission(channelBits, Permissions.EMBED_LINKS)) {
    return { error: { message: "Missing permission to embed links.", code: "MISSING_PERMISSION" } };
  }
  const mentionParts = value ? serverMentions.parseServerMentions(value) : null;
  const massMention = Boolean(mentionParts && (mentionParts.everyone || mentionParts.here));
  if (massMention && !serverMentions.canPingEveryone({ bits: channelBits, isOwner: Boolean(resolved?.isOwner) })) {
    return { error: { message: "You cannot mention @everyone here.", code: "MISSING_PERMISSION" } };
  }
  const contentFilter = require("../lib/contentFilter");
  const filtered = value ? contentFilter.gate({ io: filterCtx.io, userId, text: value, ctx: filterCtx.ctx }) : { blocked: false, verdict: null };
  if (filtered.blocked) return { error: contentFilter.blockedPayload() };
  return { filtered, mentionParts, massMention };
}

/** Best-effort unread bump for server members when a message is sent (async). */
/** Build the per-user desktop notification payload for a new channel message. */
function buildChannelNotifyPayload({ serverId, serverName, channelId, channelName, message }) {
  const content = String(message?.content || "");
  const isVoice = message?.media_type === "voice" || /^__voice__:/.test(content);
  const hasMedia = Boolean(message?.media_url) && !isVoice;
  const mentions = [
    ...new Set([...content.matchAll(/@(\w{1,32})/g)].map((m) => m[1].toLowerCase())),
  ];
  const sender = message?.sender || {};
  return {
    serverId,
    serverName: serverName || null,
    channelId,
    channelName: channelName || null,
    messageId: message?.id || null,
    senderId: message?.sender_id || sender.id || null,
    from: sender.display_name || sender.displayName || sender.username || "Someone",
    fromUsername: sender.username || null,
    avatarUrl: sender.avatar_url || sender.avatarUrl || null,
    text: isVoice ? "" : content.slice(0, 160),
    kind: isVoice ? "voice" : hasMedia ? "media" : "text",
    mentions,
  };
}

/**
 * Native iOS alert push for a new channel message, same rules as the desktop
 * notification (server:channel:notify): notification level "all", channel not
 * muted, not the sender, and not a member who is @mentioned (they get the
 * mention push). Never throws.
 */
async function pushChannelMessageToIos({ serverId, channelId, viewerIds, payload, pingedIds = null }) {
  try {
    const { usersWithIosAlertTokens } = require("../lib/iosAlertPush");
    // Members pinged through a role / @everyone / @here get the mention push instead.
    const withTokens = await usersWithIosAlertTokens(
      viewerIds.filter((uid) => uid && uid !== payload.senderId && !pingedIds?.has(uid))
    );
    if (!withTokens.size) return;
    const ids = [...withTokens];
    const mentions = Array.isArray(payload.mentions) ? payload.mentions : [];
    const [{ data: memberships, error: lErr }, { data: mutes, error: mErr }, mentionedRes] = await Promise.all([
      supabase
        .from("server_members")
        .select("user_id, notification_level")
        .eq("server_id", serverId)
        .in("user_id", ids),
      supabase.from("server_channel_mutes").select("user_id").eq("channel_id", channelId).in("user_id", ids),
      mentions.length
        ? supabase.from("users").select("id, username").in("id", ids)
        : Promise.resolve({ data: [] }),
    ]);
    if (lErr || mErr) throw lErr || mErr;
    const allLevel = new Set(
      (memberships || [])
        .filter((r) => String(r.notification_level || "all").toLowerCase() === "all")
        .map((r) => r.user_id)
    );
    const muted = new Set((mutes || []).map((r) => r.user_id));
    const mentionSet = new Set(mentions.map((m) => String(m).toLowerCase()));
    const mentioned = new Set(
      (mentionedRes?.data || [])
        .filter((u) => mentionSet.has(String(u.username || "").toLowerCase()))
        .map((u) => u.id)
    );
    const targets = ids.filter((uid) => allLevel.has(uid) && !muted.has(uid) && !mentioned.has(uid));
    if (!targets.length) return;
    const { sendServerMessagePush } = require("../lib/webPush");
    await sendServerMessagePush(targets, {
      serverId,
      serverName: payload.serverName,
      channelId,
      channelName: payload.channelName,
      fromId: payload.senderId,
      from: payload.from,
      text: payload.text,
      previewKind: payload.kind,
      messageId: payload.messageId,
    });
  } catch (err) {
    console.warn("[ServerChannel] iOS push skipped:", err?.message || err);
  }
}

function bumpChannelUnreadForMembers(serverId, channelId, senderId, notify = null) {
  if (!serverId || !channelId || !senderId) return;
  (async () => {
    try {
      const { data: members, error: mErr } = await supabase
        .from("server_members")
        .select("user_id")
        .eq("server_id", serverId)
        .neq("user_id", senderId);
      if (mErr) throw mErr;
      const userIds = (members || []).map((m) => m.user_id).filter(Boolean);
      if (!userIds.length) return;

      // One bulk resolve (5 queries) instead of resolveChannelPermissions per member.
      const bitsByUser = await resolveChannelPermissionsBulk(supabase, serverId, channelId, userIds);
      const viewerIds = userIds.filter((uid) => hasPermission(bitsByUser.get(uid) || 0n, Permissions.VIEW_CHANNEL));
      if (!viewerIds.length) return;

      // Desktop notification fan-out: every member who can see the channel
      // gets it on their personal room, even when the server isn't open in
      // their client (Electron in the background / tray, DMs view, etc.).
      if (notify?.io && notify.message) {
        try {
          let serverName = notify.serverName || null;
          if (!serverName) {
            const { data: srv } = await supabase
              .from("servers")
              .select("name")
              .eq("id", serverId)
              .maybeSingle();
            serverName = srv?.name || null;
          }
          const payload = buildChannelNotifyPayload({
            serverId,
            serverName,
            channelId,
            channelName: notify.channelName,
            message: notify.message,
          });
          // Role mentions read "@Rol adı" on cards and pushes, not the <@&id> token.
          if (notify.displayText != null && payload.kind !== "voice") payload.text = String(notify.displayText).slice(0, 160);
          const pinged = notify.pingedIds instanceof Set ? notify.pingedIds : null;
          for (const uid of viewerIds) {
            // `mentioned`: this member was pinged (role / @everyone / @here); the
            // mention:received card shows it, so the plain card is skipped.
            notify.io.to(`user:${uid}`).emit("server:channel:notify", pinged?.has(uid) ? { ...payload, mentioned: true } : payload);
          }
          void pushChannelMessageToIos({ serverId, channelId, viewerIds, payload, pingedIds: pinged });
        } catch (err) {
          console.warn("[ServerChannel] notify fan-out failed:", err?.message || err);
        }
      }

      await bumpChannelUnreadCounts(supabase, channelId, viewerIds);
    } catch (err) {
      console.warn("[ServerChannel] unread bump failed:", err?.message || err);
    }
  })();
}

// bump_channel_unread (supabase/migrations/20261109_channel_unread_bump.sql) does the
// whole bump in one atomic statement. Until that migration runs, the RPC answers
// "function not found" once and the per-row path below is used from then on.
let unreadRpcMissing = false;

function isMissingFunctionError(error, name) {
  if (!error) return false;
  const code = String(error.code || "");
  const text = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
  if (code === "PGRST202" || code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(text) && text.includes(name);
}

/** +1 unread_count of `channelId` for every user in userIds (row created when missing). */
async function bumpChannelUnreadCounts(db, channelId, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!channelId || !ids.length) return;
  if (!unreadRpcMissing) {
    const { error } = await db.rpc("bump_channel_unread", { p_channel_id: channelId, p_user_ids: ids });
    if (!error) return;
    if (!isMissingFunctionError(error, "bump_channel_unread")) throw error;
    unreadRpcMissing = true;
  }
  await bumpChannelUnreadPerRow(db, channelId, ids);
}

/**
 * Fallback without the RPC. New rows are inserted with unread_count 1 and the column
 * default for last_read_at (it is NOT NULL; sending null failed every insert). An
 * existing row is bumped by compare-and-set on its unread_count, re-read and retried
 * when a concurrent bump won, so increments are not lost the way read-then-write lost them.
 */
async function bumpChannelUnreadPerRow(db, channelId, ids) {
  const table = "server_channel_reads";
  const { data: existing, error: rErr } = await db
    .from(table)
    .select("user_id, unread_count")
    .eq("channel_id", channelId)
    .in("user_id", ids);
  if (rErr) throw rErr;
  const byUser = new Map((existing || []).map((r) => [r.user_id, r]));

  const readCount = async (uid) => {
    const { data, error } = await db
      .from(table)
      .select("unread_count")
      .eq("user_id", uid)
      .eq("channel_id", channelId)
      .maybeSingle();
    if (error) throw error;
    return data ? data.unread_count : undefined;
  };

  const bumpOne = async (uid) => {
    let current = byUser.has(uid) ? byUser.get(uid).unread_count : undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (current === undefined) {
        const { data, error } = await db
          .from(table)
          .upsert(
            { user_id: uid, channel_id: channelId, unread_count: 1 },
            { onConflict: "user_id,channel_id", ignoreDuplicates: true }
          )
          .select("user_id");
        if (error) throw error;
        if (data && data.length) return;
        current = await readCount(uid); // created concurrently: bump it instead
        continue;
      }
      const { data, error } = await db
        .from(table)
        .update({ unread_count: Math.max(0, Number(current) || 0) + 1 })
        .eq("user_id", uid)
        .eq("channel_id", channelId)
        .eq("unread_count", current)
        .select("user_id");
      if (error) throw error;
      if (data && data.length) return;
      current = await readCount(uid);
    }
  };

  await Promise.all(
    ids.map((uid) =>
      bumpOne(uid).catch((err) => console.warn("[ServerChannel] unread bump row failed:", err?.message || err))
    )
  );
}

function __resetUnreadRpcState() {
  unreadRpcMissing = false;
}

/**
 * mention:received + mention push for members pinged through a role, @everyone
 * or @here (lib/serverMentions.js already kept only notifiable members). A
 * member also named directly (@username) is left to the direct mention path.
 * Never throws.
 */
async function notifyMassPing({ io, channel, channelId, message, fromName, fromId, text, userIds, directNames = [] }) {
  try {
    let targets = userIds;
    if (directNames.length) {
      const { data: named } = await supabase.from("users").select("id, username").in("id", userIds);
      const direct = new Set(
        (named || []).filter((u) => directNames.includes(String(u.username || "").toLowerCase())).map((u) => u.id)
      );
      targets = userIds.filter((uid) => !direct.has(uid));
    }
    if (!targets.length) return;
    const { data: serverMeta } = await supabase.from("servers").select("name").eq("id", channel.server_id).maybeSingle();
    const payload = {
      serverId: channel.server_id,
      channelId,
      channelName: channel.name || null,
      serverName: serverMeta?.name || null,
      messageId: message.id,
      from: fromName,
      fromId,
      text,
    };
    for (const uid of targets) io.to(`user:${uid}`).emit("mention:received", payload);
    const { sendMentionPush } = require("../lib/webPush");
    await sendMentionPush(targets, {
      i18n: { title: { key: "push.mentioned", vars: { from: fromName } } },
      body: String(text || "").slice(0, 140),
      text: String(text || "").slice(0, 140),
      from: fromName,
      fromId,
      serverId: channel.server_id,
      channelId,
      channelName: channel.name || null,
      serverName: serverMeta?.name || null,
      messageId: message.id,
      deepLink: `/?server=${encodeURIComponent(channel.server_id)}&channel=${encodeURIComponent(channelId)}`,
    });
  } catch (err) {
    console.warn("[ServerChannel] role mention notify failed:", err?.message || err);
  }
}

function mapPinnedServerMessage(row, senderProfile) {
  const sender = senderProfile
    ? {
        id: senderProfile.id,
        username: senderProfile.username || "Unknown",
        displayName: senderProfile.display_name || senderProfile.displayName || null,
        display_name: senderProfile.display_name || senderProfile.displayName || null,
        avatar_url: senderProfile.avatar_url || senderProfile.avatarUrl || null,
        avatarUrl: senderProfile.avatar_url || senderProfile.avatarUrl || null,
      }
    : { id: row.sender_id, username: "Unknown" };
  return {
    id: row.id,
    channelId: row.channel_id,
    serverId: row.server_id,
    sender,
    from: sender,
    text: row.content || "",
    mediaUrl: row.media_url || null,
    mediaType: row.media_type || null,
    originalName: row.original_name || null,
    pinnedAt: row.pinned_at,
    pinnedBy: row.pinned_by,
    timestamp: toUtcIso(row.created_at) || row.created_at,
  };
}

async function loadSenderProfiles(senderIds) {
  if (!senderIds.length) return new Map();
  const { data: profiles, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url")
    .in("id", senderIds);
  if (error) throw error;
  return new Map((profiles || []).map((p) => [p.id, p]));
}

const REPLY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** { id, text, mediaType, from } for a reply, read from the DB; null when the target is not in this channel. */
async function resolveServerReplyMeta(replyTo, channelId) {
  const id = replyTo && typeof replyTo === "object" ? String(replyTo.id || "") : "";
  if (!id || !REPLY_ID_RE.test(id) || !channelId) return null;
  const { data: target, error } = await supabase
    .from("server_messages")
    .select("id, channel_id, sender_id, content, media_type")
    .eq("id", id)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error || !target) return null;
  let from = null;
  if (target.sender_id) {
    const { data: u } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url")
      .eq("id", target.sender_id)
      .maybeSingle();
    from = u
      ? {
          id: u.id,
          username: u.username || null,
          displayName: u.display_name || null,
          display_name: u.display_name || null,
          avatar: u.avatar_url || null,
          avatar_url: u.avatar_url || null,
        }
      : { id: target.sender_id };
  }
  return {
    id: target.id,
    text: String(target.content || "").slice(0, 500),
    mediaType: target.media_type || null,
    from,
  };
}

function registerServerChannelHandlers(io, socket) {
  const myId = socket.user?.id;
  if (!myId) return;

  /**
   * Join the server room for structure/member live updates (not voice-only).
   * Check, join, then re-check when a kick / access change ran meanwhile (server audit
   * SK-13 / CA-1): the kick's room cleanup could run before this socket joined.
   */
  socket.on("server:subscribe", async ({ serverId } = {}) => {
    if (!serverId || typeof serverId !== "string") return;
    if (!allowSocketEvent(socket, "subscribe", 30)) return;
    const epoch = getServerAccessEpoch();
    try {
      const resolved = await resolveMemberPermissions(supabase, serverId, myId);
      if (!resolved.isMember) return;
      socket.join(`server:${serverId}`);
      if (getServerAccessEpoch() !== epoch) {
        const again = await resolveMemberPermissions(supabase, serverId, myId);
        if (!again.isMember) socket.leave(`server:${serverId}`);
      }
    } catch (err) {
      console.error("[ServerChannel] subscribe error:", err.message || err);
    }
  });

  socket.on("server:unsubscribe", ({ serverId } = {}) => {
    if (!serverId) return;
    socket.leave(`server:${serverId}`);
  });

  const bumpChannelRooms = () => {
    socket.data.channelRoomEpoch = (socket.data.channelRoomEpoch || 0) + 1;
    return socket.data.channelRoomEpoch;
  };

  /**
   * Join a channel's live room after VIEW_CHANNEL. When a kick / role / overwrite change
   * ran while the check was in flight (access epoch moved), the eviction may have run
   * before this join, so the access is checked again after joining and the room left
   * on failure (server audit CA-1).
   */
  const joinChannelRoom = async (channelId, roomEpoch) => {
    const room = `server-channel:${channelId}`;
    const wasIn = socket.rooms?.has?.(room);
    const accessEpoch = getServerAccessEpoch();
    try {
      await assertTextChannelAccess(myId, channelId, Permissions.VIEW_CHANNEL);
    } catch (err) {
      // Denied: never stay in the room. A transient error keeps an existing membership.
      if (err?.status || !wasIn) socket.leave(room);
      throw err;
    }
    if ((socket.data.channelRoomEpoch || 0) !== roomEpoch) return false;
    socket.join(room);
    if (getServerAccessEpoch() !== accessEpoch) {
      try {
        await assertTextChannelAccess(myId, channelId, Permissions.VIEW_CHANNEL);
      } catch (err) {
        socket.leave(room);
        throw err;
      }
    }
    return true;
  };

  socket.on("server:channel:join", async (channelId) => {
    if (!channelId || typeof channelId !== "string") return;
    if (!allowSocketEvent(socket, "join", 60)) return;
    const epoch = socket.data.channelRoomEpoch || 0;
    try {
      await joinChannelRoom(channelId, epoch);
    } catch (err) {
      if ((socket.data.channelRoomEpoch || 0) !== epoch) return;
      socket.emit("server:channel:error", {
        channelId,
        ...errorFields(err, "message"),
        message: err.message || "Failed to join channel.",
        code: err.code || null,
      });
    }
  });

  /**
   * Re-join the open server's text / announcement channels (reconnect, server switch).
   * At most MAX_REJOIN_CHANNELS ids; the permission read is one batch per server
   * (server audit SK-7: one emit used to run ~8 queries per id, unbounded).
   */
  socket.on("server:channels:rejoin", async (channelIds) => {
    if (!Array.isArray(channelIds)) return;
    if (!allowSocketEvent(socket, "rejoin", 10)) return;
    const epoch = bumpChannelRooms();
    const accessEpoch = getServerAccessEpoch();
    const ids = [...new Set(channelIds.filter((id) => typeof id === "string" && id && id.length <= 64))].slice(0, MAX_REJOIN_CHANNELS);
    const allowed = new Set();
    try {
      const { data: chans, error } = ids.length
        ? await supabase.from("server_channels").select("id, server_id, type, parent_id").in("id", ids)
        : { data: [], error: null };
      if (error) throw error;
      const byServer = new Map();
      for (const c of chans || []) {
        if (c.type !== "text" && c.type !== "announcement") continue;
        if (!byServer.has(c.server_id)) byServer.set(c.server_id, []);
        byServer.get(c.server_id).push(c);
      }
      for (const [serverId, list] of byServer) {
        const res = await resolveUserChannelsBits(serverId, myId, list);
        if (!res.isMember) continue;
        for (const c of list) {
          if (hasPermission(res.bits.get(c.id) || 0n, Permissions.VIEW_CHANNEL)) allowed.add(String(c.id));
        }
      }
    } catch (err) {
      console.warn("[ServerChannel] rejoin failed:", err?.message || err);
      return;
    }
    if ((socket.data.channelRoomEpoch || 0) !== epoch) return;
    for (const id of allowed) socket.join(`server-channel:${id}`);
    for (const room of [...socket.rooms]) {
      if (!String(room).startsWith("server-channel:")) continue;
      const id = String(room).slice("server-channel:".length);
      if (!allowed.has(id)) socket.leave(room);
    }
    if (getServerAccessEpoch() !== accessEpoch) {
      // An access change ran meanwhile: verify each joined room again (CA-1).
      for (const id of allowed) {
        try {
          await assertTextChannelAccess(myId, id, Permissions.VIEW_CHANNEL);
        } catch {
          socket.leave(`server-channel:${id}`);
        }
      }
    }
  });

  /**
   * This member's channel permission bits for every channel of a server, for the
   * composer / voice / moderation controls (server audit P2 / DF-4: the client used
   * server-wide flags and ignored channel overwrites). Bits are decimal strings.
   * ack({ ok, serverId, channels: { [id]: { bits, send } }, timedOut })
   */
  socket.on("server:channels:permissions", async ({ serverId } = {}, ack) => {
    const reply = (out) => { if (typeof ack === "function") { try { ack(out); } catch { /* gone */ } } };
    if (!serverId || typeof serverId !== "string") return reply({ ok: false, code: "BAD_REQUEST" });
    if (!allowSocketEvent(socket, "perms", 20)) return reply({ ok: false, code: "RATE_LIMITED" });
    try {
      const { data: chans, error } = await supabase
        .from("server_channels")
        .select("id, server_id, type, parent_id")
        .eq("server_id", serverId);
      if (error) throw error;
      const res = await resolveUserChannelsBits(serverId, myId, chans || []);
      if (!res.isMember) return reply({ ok: false, code: "NOT_MEMBER" });
      let timedOut = null;
      const to = getPlatformTimeout(myId);
      if (to) timedOut = { until: to.until || null, scope: "platform" };
      else if (!res.isOwner && !hasPermission(res.baseBits || 0n, Permissions.ADMINISTRATOR)) {
        const t = await getActiveServerTimeout(serverId, myId);
        if (t) timedOut = { until: t.until, scope: "server" };
      }
      const channels = {};
      for (const c of chans || []) {
        const bits = res.bits.get(c.id) || 0n;
        if (!hasPermission(bits, Permissions.VIEW_CHANNEL)) continue;
        let send = hasPermission(bits, Permissions.SEND_MESSAGES);
        if (send && c.type === "announcement") send = canPostInAnnouncement(bits, res.sendAllowed.get(c.id));
        if (timedOut) send = false;
        channels[c.id] = { bits: bits.toString(), send };
      }
      reply({ ok: true, serverId, channels, timedOut, isOwner: res.isOwner });
    } catch (err) {
      console.warn("[ServerChannel] permissions read failed:", err?.message || err);
      reply({ ok: false, code: "FAILED" });
    }
  });

  socket.on("server:channel:leave", (channelId) => {
    if (!channelId) return;
    bumpChannelRooms();
    socket.leave(`server-channel:${channelId}`);
  });

  /**
   * Edit own channel message. Runs the same checks as a send (server audit MSG-6 /
   * SK-4): timeouts, length, EMBED_LINKS, @everyone permission, word filter, chat
   * freeze, plus a per-socket edit budget.
   */
  socket.on("server:channel:message:edit", async ({ serverId, channelId, messageId, newText } = {}) => {
    const fail = (message, code = "EDIT_FAILED", extra = {}) => {
      socket.emit("server:channel:message:error", {
        channelId,
        messageId,
        ...extra,
        message,
        code,
      });
    };
    if (!channelId || !messageId || typeof newText !== "string") return fail("Failed to edit message.");
    const trimmed = newText.trim();
    if (!trimmed) return fail("Message cannot be empty.");
    if (trimmed.length > maxMessageLength()) return fail("Message is too long.", "TOO_LONG", { maxLength: maxMessageLength() });
    if (!allowSocketEvent(socket, "edit", 10)) return fail(RATE_LIMITED_TEXT, "RATE_LIMITED");
    try {
      const { channel, permissions: channelBits, resolved } = await assertTextChannelAccess(myId, channelId, Permissions.SEND_MESSAGES);
      if (serverId && serverId !== channel.server_id) {
        return fail("Channel does not belong to this server.");
      }
      const frozen = checkChatFrozen({ config: systemConfig, isAdmin: isPlatformAdmin(socket) });
      if (!frozen.ok) return fail(frozen.message, frozen.code);
      const { data: row, error } = await supabase
        .from("server_messages")
        .select("id, sender_id, channel_id, server_id, media_type, content")
        .eq("id", messageId)
        .eq("channel_id", channelId)
        .maybeSingle();
      if (error) throw error;
      if (!row) return fail("Message not found.");
      if (row.sender_id !== myId) return fail("You can only edit your own messages.", "MISSING_PERMISSION");
      if (["poll_v2", "poll_end", "app_card"].includes(row.media_type)) return fail("This message can't be edited as text.", "NOT_EDITABLE");
      const filterCtx = { io, ctx: { convType: "server", serverId: channel.server_id, channelId } };
      const textCheck = checkOutgoingText({ text: trimmed, channelBits, resolved, userId: myId, filterCtx });
      if (textCheck.error) {
        const { message, code, ...rest } = textCheck.error;
        return fail(message, code || "EDIT_FAILED", rest);
      }
      const editedAt = new Date().toISOString();
      // Like DMs, the text before the edit is kept in edit_history (admin review only).
      const { error: updErr } = await updateServerMessageWithHistory(supabase, {
        messageId,
        channelId,
        senderId: myId,
        previousText: typeof row.content === "string" ? row.content : null,
        newText: trimmed,
        editedAt,
      });
      if (updErr) throw updErr;
      require("../lib/contentFilter").after(textCheck.filtered?.verdict, { io, userId: myId, text: trimmed, messageId, ctx: filterCtx.ctx });
      const payload = {
        serverId: channel.server_id,
        channelId,
        messageId,
        newText: trimmed,
        editedAt,
      };
      io.to(`server-channel:${channelId}`).emit("server:channel:message:edited", payload);
      socket.emit("server:channel:message:edited", payload);
    } catch (err) {
      fail(err.message || "Failed to edit message.", err.code || "EDIT_FAILED", { ...errorFields(err, "message"), ...(err.timeout ? { timeout: err.timeout } : {}) });
    }
  });

  /** Pin / unpin (MANAGE_MESSAGES). */
  socket.on("server:channel:message:pin", async ({ serverId, channelId, messageId } = {}) => {
    if (!channelId || !messageId) return;
    if (!allowSocketEvent(socket, "moderate", 30)) {
      socket.emit("server:channel:message:error", { channelId, message: RATE_LIMITED_TEXT, code: "RATE_LIMITED" });
      return;
    }
    try {
      const { channel } = await assertTextChannelAccess(
        myId,
        channelId,
        Permissions.MANAGE_MESSAGES
      );
      if (serverId && serverId !== channel.server_id) {
        socket.emit("server:channel:message:error", {
          channelId,
          message: "Channel does not belong to this server.",
        });
        return;
      }
      // At most MAX_PINS_PER_CHANNEL pins (server audit MSG-16: the list silently cut at 100).
      const { data: target, error: tErr } = await supabase
        .from("server_messages")
        .select("id, pinned_at")
        .eq("id", messageId)
        .eq("channel_id", channelId)
        .maybeSingle();
      if (tErr) throw tErr;
      if (target && !target.pinned_at) {
        const { count, error: cntErr } = await supabase
          .from("server_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", channelId)
          .not("pinned_at", "is", null);
        if (cntErr) throw cntErr;
        if ((count || 0) >= MAX_PINS_PER_CHANNEL) {
          socket.emit("server:channel:message:error", {
            channelId,
            ...apiText("message", "This channel already has {max} pinned messages. Unpin one first.", { max: MAX_PINS_PER_CHANNEL }),
            code: "PIN_LIMIT",
          });
          return;
        }
      }
      const pinnedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("server_messages")
        .update({ pinned_at: pinnedAt, pinned_by: myId })
        .eq("id", messageId)
        .eq("channel_id", channelId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        socket.emit("server:channel:message:error", {
          channelId,
          message: "Message not found.",
        });
        return;
      }
      const payload = {
        serverId: channel.server_id,
        channelId,
        messageId,
        pinnedAt,
        pinnedBy: myId,
      };
      io.to(`server-channel:${channelId}`).emit("server:channel:message:pinned", payload);
      socket.emit("server:channel:message:pinned", payload);
    } catch (err) {
      socket.emit("server:channel:message:error", {
        channelId,
        ...errorFields(err, "message"),
        message: err.message || "Failed to pin message.",
        code: err.code || null,
      });
    }
  });

  socket.on("server:channel:message:unpin", async ({ serverId, channelId, messageId } = {}) => {
    if (!channelId || !messageId) return;
    if (!allowSocketEvent(socket, "moderate", 30)) {
      socket.emit("server:channel:message:error", { channelId, message: RATE_LIMITED_TEXT, code: "RATE_LIMITED" });
      return;
    }
    try {
      const { channel } = await assertTextChannelAccess(
        myId,
        channelId,
        Permissions.MANAGE_MESSAGES
      );
      if (serverId && serverId !== channel.server_id) {
        socket.emit("server:channel:message:error", {
          channelId,
          message: "Channel does not belong to this server.",
        });
        return;
      }
      const { data, error } = await supabase
        .from("server_messages")
        .update({ pinned_at: null, pinned_by: null })
        .eq("id", messageId)
        .eq("channel_id", channelId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        socket.emit("server:channel:message:error", {
          channelId,
          message: "Message not found.",
        });
        return;
      }
      const payload = {
        serverId: channel.server_id,
        channelId,
        messageId,
      };
      io.to(`server-channel:${channelId}`).emit("server:channel:message:unpinned", payload);
      socket.emit("server:channel:message:unpinned", payload);
    } catch (err) {
      socket.emit("server:channel:message:error", {
        channelId,
        ...errorFields(err, "message"),
        message: err.message || "Failed to unpin message.",
        code: err.code || null,
      });
    }
  });

  /** Delete a channel message (author or MANAGE_MESSAGES). */
  socket.on("server:channel:pinned:list", async ({ channelId } = {}) => {
    if (!channelId) return socket.emit("server:channel:pinned:list", { channelId, pinned: [] });
    if (!allowSocketEvent(socket, "pinned", 20)) return socket.emit("server:channel:pinned:list", { channelId, pinned: [], code: "RATE_LIMITED" });
    try {
      const { channel } = await assertTextChannelAccess(
        myId,
        channelId,
        Permissions.VIEW_CHANNEL
      );
      const resolved = await resolveChannelPermissions(
        supabase,
        channel.server_id,
        myId,
        channelId
      );
      if (!hasPermission(resolved.bits, Permissions.READ_MESSAGE_HISTORY)) {
        return socket.emit("server:channel:pinned:list", { channelId, pinned: [] });
      }

      const { data: rows, error } = await supabase
        .from("server_messages")
        .select(
          "id, server_id, channel_id, sender_id, content, media_url, media_type, original_name, pinned_at, pinned_by, created_at"
        )
        .eq("channel_id", channelId)
        .eq("server_id", channel.server_id)
        .not("pinned_at", "is", null)
        .order("pinned_at", { ascending: false })
        .limit(MAX_PINS_PER_CHANNEL + 50);
      if (error) throw error;

      const senderIds = [...new Set((rows || []).map((r) => r.sender_id).filter(Boolean))];
      const usersById = await loadSenderProfiles(senderIds);
      const pinned = (rows || []).map((row) =>
        mapPinnedServerMessage(row, usersById.get(row.sender_id))
      );
      socket.emit("server:channel:pinned:list", { channelId, pinned });
    } catch (err) {
      console.error("[ServerChannel] pinned list failed:", err?.message || err);
      socket.emit("server:channel:pinned:list", { channelId, pinned: [] });
    }
  });

  socket.on("server:channel:message:search", async ({ channelId, q, limit = 50 } = {}) => {
    const query = String(typeof q === "string" ? q : "").trim().slice(0, MAX_SEARCH_QUERY);
    if (!channelId || query.length < 2) {
      return socket.emit("server:channel:message:search", { channelId, q: query, messages: [] });
    }
    if (!allowSocketEvent(socket, "search", 10)) {
      return socket.emit("server:channel:message:search", { channelId, q: query, messages: [], code: "RATE_LIMITED" });
    }
    try {
      const { channel } = await assertTextChannelAccess(
        myId,
        channelId,
        Permissions.VIEW_CHANNEL
      );
      const resolved = await resolveChannelPermissions(
        supabase,
        channel.server_id,
        myId,
        channelId
      );
      if (!hasPermission(resolved.bits, Permissions.READ_MESSAGE_HISTORY)) {
        return socket.emit("server:channel:message:search", { channelId, q: query, messages: [] });
      }

      const capped = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const { data: rows, error } = await supabase
        .from("server_messages")
        .select(
          "id, server_id, channel_id, sender_id, content, media_url, media_type, original_name, pinned_at, pinned_by, created_at, edited_at"
        )
        .eq("channel_id", channelId)
        .eq("server_id", channel.server_id)
        .ilike("content", `%${query.replace(/[%_\\]/g, "\\$&")}%`)
        .order("created_at", { ascending: false })
        .limit(capped);
      if (error) throw error;

      const senderIds = [...new Set((rows || []).map((r) => r.sender_id).filter(Boolean))];
      const usersById = await loadSenderProfiles(senderIds);
      const messages = (rows || []).map((row) => {
        const mapped = mapPinnedServerMessage(row, usersById.get(row.sender_id));
        mapped.editedAt = row.edited_at || null;
        return mapped;
      });
      socket.emit("server:channel:message:search", { channelId, q: query, messages });
    } catch (err) {
      console.error("[ServerChannel] message search failed:", err?.message || err);
      socket.emit("server:channel:message:search", { channelId, q: query, messages: [] });
    }
  });

  socket.on("server:channel:message:delete", async ({ serverId, channelId, messageId } = {}) => {
    if (!channelId || !messageId) return;
    if (!allowSocketEvent(socket, "moderate", 30)) {
      socket.emit("server:channel:message:error", { channelId, message: RATE_LIMITED_TEXT, code: "RATE_LIMITED" });
      return;
    }
    try {
      const { channel, permissions: bits, resolved } = await assertTextChannelAccess(
        myId,
        channelId,
        Permissions.VIEW_CHANNEL
      );
      if (serverId && serverId !== channel.server_id) {
        socket.emit("server:channel:message:error", {
          channelId,
          message: "Channel does not belong to this server.",
        });
        return;
      }
      const { data: row, error } = await supabase
        .from("server_messages")
        .select("id, sender_id, channel_id, server_id")
        .eq("id", messageId)
        .eq("channel_id", channelId)
        .maybeSingle();
      if (error) throw error;
      if (!row) {
        socket.emit("server:channel:message:error", {
          channelId,
          message: "Message not found.",
        });
        return;
      }
      const canManage = hasPermission(bits, Permissions.MANAGE_MESSAGES);
      if (row.sender_id !== myId && !canManage) {
        socket.emit("server:channel:message:error", {
          channelId,
          message: "Missing permission.",
          code: "MISSING_PERMISSION",
        });
        return;
      }
      // Deleting someone else's message is moderation: not while timed out (server
      // audit MSG-2 / MSG-10). Deleting your own message stays allowed.
      if (row.sender_id !== myId) await assertNotTimedOut(myId, channel.server_id, resolved?.isOwner || hasPermission(bits, Permissions.ADMINISTRATOR));
      const { error: delErr } = await supabase
        .from("server_messages")
        .delete()
        .eq("id", messageId)
        .eq("channel_id", channelId);
      if (delErr) throw delErr;
      const payload = { serverId: channel.server_id, channelId, messageId };
      io.to(`server-channel:${channelId}`).emit("server:channel:message:deleted", payload);
      socket.emit("server:channel:message:deleted", payload);
    } catch (err) {
      socket.emit("server:channel:message:error", {
        channelId,
        ...errorFields(err, "message"),
        message: err.message || "Failed to delete message.",
        code: err.code || null,
      });
    }
  });

  /** "Kanala paylaş" for an invoker-only Descall Apps reply (2.12.0). */
  socket.on("server:app:share", async ({ serverId, channelId, messageId } = {}, cb) => {
    const reply = (out) => {
      if (typeof cb === "function") cb(out);
      else if (!out.ok) socket.emit("server:channel:message:error", { channelId, message: out.message, code: out.code });
    };
    if (typeof channelId !== "string" || typeof messageId !== "string") return reply({ ok: false, code: "BAD_REQUEST", message: "Could not share." });
    if (!allowSocketEvent(socket, "share", 10)) return reply({ ok: false, code: "RATE_LIMITED", message: RATE_LIMITED_TEXT });
    const frozen = checkChatFrozen({ config: systemConfig, isAdmin: isPlatformAdmin(socket) });
    if (!frozen.ok) return reply({ ok: false, code: frozen.code, message: frozen.message });
    try {
      const { shareAppMessage } = require("../lib/slashCommands");
      reply(await shareAppMessage({ io, socket, userId: myId, serverId, channelId, messageId, sender: buildSenderPayload(socket) }));
    } catch (err) {
      reply({ ok: false, code: err.code || "SHARE_FAILED", message: err.code === "TIMED_OUT" ? "You can't share while you're timed out." : err.status === 403 ? "You don't have permission to send messages to this channel." : "Could not share." });
    }
  });

  socket.on(
    "server:channel:message",
    async ({ serverId, channelId, tempId, content, mediaUrl, mediaType, duration, replyTo, forwarded, poll: pollInput } = {}) => {
      // Reservations taken during the checks (slowmode, @everyone cooldown) are given
      // back when the send fails before the message is stored.
      let slowmode = { commit() {}, undo() {} };
      let massSlot = { undo() {} };
      const refuse = (fields) => {
        slowmode.undo();
        massSlot.undo();
        socket.emit("server:channel:message:error", { channelId, tempId: tempId || null, ...fields });
      };
      try {
        // Poll from the creation sheet: validated here, stored as a poll_v2 row + polls tables.
        let pollDraft = null;
        if (pollInput) {
          const normalized = normalizePollInput(pollInput);
          if (!normalized.ok) {
            socket.emit("server:channel:message:error", { channelId, tempId: tempId || null, message: normalized.message, code: normalized.code });
            return;
          }
          pollDraft = normalized.poll;
          content = pollFallbackText(pollDraft);
          mediaUrl = null;
          mediaType = "poll_v2";
          replyTo = null;
        } else {
          // Only known attachment kinds (server audit MSG-3); poll / app cards are server-made.
          mediaType = typeof mediaType === "string" && MEDIA_TYPES.has(mediaType) ? mediaType : null;
        }
        if (typeof content !== "string") content = content == null ? "" : null;
        if (content === null) {
          socket.emit("server:channel:message:error", { channelId, tempId: tempId || null, message: "Missing message content." });
          return;
        }
        if (mediaUrl != null && typeof mediaUrl !== "string") mediaUrl = null;

        if (!channelId || typeof channelId !== "string" || (!content.trim() && !mediaUrl)) {
          if (tempId) {
            socket.emit("server:channel:message:error", {
              channelId,
              tempId,
              message: "Missing message content.",
            });
          }
          return;
        }
        // Length cap before any DB work (server audit MSG-5). Poll text is built here.
        if (!pollDraft && content.trim().length > maxMessageLength()) {
          socket.emit("server:channel:message:error", { channelId, tempId: tempId || null, message: "Message is too long.", code: "TOO_LONG", maxLength: maxMessageLength() });
          return;
        }

        // Membership, VIEW + SEND, announcement rule, site-wide and server timeouts.
        const { channel, permissions: channelBits, resolved } = await assertTextChannelAccess(
          myId,
          channelId,
          Permissions.SEND_MESSAGES
        );

        if (serverId && serverId !== channel.server_id) {
          socket.emit("server:channel:message:error", {
            channelId,
            tempId: tempId || null,
            message: "Channel does not belong to this server.",
          });
          return;
        }

        if (
          await needsRulesAcceptance(supabase, channel.server_id, myId, {
            isOwner: resolved?.isOwner,
          })
        ) {
          socket.emit("server:channel:message:error", {
            channelId,
            tempId: tempId || null,
            message: "You must accept the server rules before sending messages.",
            code: "RULES_REQUIRED",
          });
          return;
        }

        if (mediaUrl) {
          const original = mediaUrl;
          mediaUrl = await normalizeIncomingMediaUrl(supabase, myId, mediaUrl);
          if (!mediaUrl && original && !content.trim()) {
            socket.emit("server:channel:message:error", { channelId, tempId: tempId || null, message: "Attachment unavailable.", code: "MEDIA_UNAVAILABLE" });
            return;
          }
        }
        if (!mediaUrl && mediaType !== "poll_v2") mediaType = null;
        const isVoice = Boolean(mediaUrl) && (mediaType === "voice" || mediaType === "audio");
        let trimmedContent = content.trim() || null;
        if (isVoice) {
          const dur = Math.max(0, Math.round(Number(duration) || 0));
          if (!trimmedContent || !trimmedContent.startsWith("__voice__:")) {
            trimmedContent = `__voice__:${dur || 1}`;
          }
        }

        // Voice notes need SEND_VOICE_MESSAGES; an audio file is a file (ATTACH_FILES).
        // Before, the client-chosen "voice" label skipped every attachment check (MSG-4).
        if (mediaUrl && mediaType === "voice" && !hasPermission(channelBits, Permissions.SEND_VOICE_MESSAGES)) {
          socket.emit("server:channel:message:error", {
            channelId,
            tempId: tempId || null,
            message: "Missing permission to send voice messages.",
            code: "MISSING_PERMISSION",
          });
          return;
        }
        if (mediaUrl && mediaType !== "voice" && !hasPermission(channelBits, Permissions.ATTACH_FILES)) {
          socket.emit("server:channel:message:error", {
            channelId,
            tempId: tempId || null,
            message: "Missing permission to attach files.",
            code: "MISSING_PERMISSION",
          });
          return;
        }

        // Moderasyon kelime filtresi (lib/contentFilter.js), EMBED_LINKS and the
        // @everyone / @here permission: the same checks run on edit.
        const filterCtx = { convType: "server", serverId: channel.server_id, channelId };
        const textCheck = checkOutgoingText({
          text: isVoice ? "" : trimmedContent || "",
          channelBits,
          resolved,
          userId: myId,
          filterCtx: { io, ctx: filterCtx },
          skipLength: true,
        });
        if (textCheck.error) {
          socket.emit("server:channel:message:error", { channelId, tempId: tempId || null, ...textCheck.error });
          return;
        }
        const filtered = textCheck.filtered;
        const mentionParts = textCheck.mentionParts;
        const massMention = textCheck.massMention;

        // Channel slowmode: check and reserve in one step (parallel sends, MSG-7).
        slowmode = await assertSlowmode({
          userId: myId,
          channel,
          channelId,
          channelBits,
          tempId,
          socket,
        });
        if (slowmode.blocked) {
          slowmode = { commit() {}, undo() {} };
          return;
        }

        // Messaging phase 5: @everyone / @here at most once a minute per channel,
        // reserved now so parallel sends cannot all ping (MSG-12).
        if (massMention) {
          const limit = massPingLimiter.reserve(channelId, myId);
          if (!limit.ok) {
            const retryAfterSeconds = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));
            refuse({
              ...apiText("message", "You can mention @everyone or @here again in {seconds}s.", { seconds: retryAfterSeconds }),
              code: "MENTION_RATE_LIMITED",
              retryAfterSeconds,
            });
            return;
          }
          massSlot = limit;
        }

        {
          // Yönetici Paneli switches (3.1.3): freeze, global slow mode, per-minute cap.
          const verdict = checkMessageSend({ config: systemConfig, userId: myId, isAdmin: isPlatformAdmin(socket), kind: "server" });
          if (!verdict.ok) {
            refuse({ message: verdict.message, messageKey: verdict.messageKey, messageVars: verdict.messageVars, code: verdict.code, retryAfterMs: verdict.retryAfterMs });
            return;
          }
        }

        // Slash commands — casino stays delegated to gameHandlers; app commands use the registry.
        if (trimmedContent && trimmedContent.startsWith("/")) {
          const parsed = parseSlashCommand(trimmedContent);
          if (parsed && (isCasinoCommand(parsed.name) || parsed.name)) {
            const sender = buildSenderPayload(socket);
            const result = await executeSlashCommand({
              io,
              socket,
              context: "server",
              userId: myId,
              roomId: channelId,
              serverId: channel.server_id,
              channelId,
              channel,
              permissions: channelBits,
              sender,
              content: trimmedContent,
              gameOptions: {
                channelId,
                serverId: channel.server_id,
                slowmodeChecked: true,
              },
            });
            if (!result.handled) {
              // Unknown slash command is treated like normal text for compatibility.
            } else {
              if (result.message && result.message.sender_id !== myId) {
                emitAppMessage({
                  io,
                  socket,
                  context: "server",
                  roomId: channelId,
                  message: result.message,
                });
              }
              if (result.message?.id && result.message?.sender_id === myId) {
                socket.to(`server-channel:${channelId}`).emit("server:channel:message", {
                  serverId: channel.server_id,
                  channelId,
                  message: result.message,
                });
              }
              if (result.message?.sender_id !== myId) {
                socket.emit("server:channel:message:ack", {
                  channelId,
                  tempId: tempId || null,
                  suppress: true,
                  isGameCommand: isCasinoCommand(parsed.name),
                  isAppCommand: !isCasinoCommand(parsed.name),
                });
              } else {
                socket.emit("server:channel:message", {
                  serverId: channel.server_id,
                  channelId,
                  message: result.message,
                  tempId,
                });
              }
              // A command post counts for slowmode like a message (MSG-8).
              slowmode.commit();
              return;
            }
          }
        }

        // Quote meta is built from the stored message (same channel only). The client used
        // to send text/from itself, so a reply could quote words nobody wrote (T3-2).
        // Messaging phase 4: a forward carries { forwarded: true } and never quotes.
        // Quoting needs READ_MESSAGE_HISTORY like reading it would (server audit CA-7).
        if (!hasPermission(channelBits, Permissions.READ_MESSAGE_HISTORY)) replyTo = null;
        const replyMeta = forwardedReplyMeta(forwarded) || await resolveServerReplyMeta(replyTo, channelId);

        const { data: row, error } = await supabase
          .from("server_messages")
          .insert({
            server_id: channel.server_id,
            channel_id: channelId,
            sender_id: myId,
            content: trimmedContent,
            media_url: mediaUrl || null,
            media_type: isVoice ? "voice" : mediaType || null,
            reply_to: replyMeta,
          })
          .select("id, created_at")
          .single();

        if (error) {
          console.error("[ServerChannel] DB insert error:", error.message);
          refuse({ message: "Failed to send message. Please try again." });
          return;
        }
        require("../lib/contentFilter").after(filtered?.verdict, { io, userId: myId, text: trimmedContent, messageId: row.id, ctx: filterCtx });
        let pollSnapshot = null;
        if (pollDraft) {
          try {
            const { createPollForMessage } = require("../lib/polls");
            const made = await createPollForMessage({
              scope: "server",
              messageId: row.id,
              serverId: channel.server_id,
              channelId,
              creatorId: myId,
              poll: pollDraft,
            });
            pollSnapshot = buildPollSnapshot(made.poll, made.options, null, {});
          } catch (pollErr) {
            console.error("[ServerChannel] poll create failed:", pollErr?.message || pollErr);
            await supabase.from("server_messages").delete().eq("id", row.id).eq("channel_id", channelId);
            refuse({ message: "Could not create the poll. Try again." });
            return;
          }
        }
        slowmode.commit();
        massSlot = { undo() {} };
        void recordFirstMessage(myId);

        // Anti-bot monitor (Faz 0): shadow evaluation only; earning below is unchanged.
        if (trimmedContent) void descoinAntibot.observeMessage({ userId: myId, convKey: `channel:${channelId}`, text: trimmedContent });
        if (trimmedContent && shouldCreditMessage(myId, trimmedContent)) {
          descoin
            .creditCapped(myId, 1, "message_activity", {
              context: "server_channel",
              serverId: channel.server_id,
              channelId,
            })
            .then((result) => {
              if (result.credited > 0) {
                socket.emit("descoin:balance", {
                  balance: result.balance,
                  delta: result.credited,
                  reason: "message_activity",
                });
              }
            })
            .catch((err) =>
              console.warn("[DesCoin] server channel message credit failed:", err?.message || err)
            );
        }

        await ensureCosmeticsCached([myId]).catch(() => {});

        const message = {
          id: row?.id ?? crypto.randomUUID(),
          server_id: channel.server_id,
          channel_id: channelId,
          sender_id: myId,
          content: trimmedContent,
          media_url: mediaUrl,
          media_type: isVoice ? "voice" : mediaType,
          duration: isVoice
            ? Math.max(
                0,
                Math.round(
                  Number(duration) ||
                    Number(String(trimmedContent || "").replace(/^__voice__:/, "")) ||
                    0
                )
              )
            : null,
          created_at: toUtcIso(row?.created_at) || new Date().toISOString(),
          reply_to: replyMeta,
          replyTo: replyMeta,
          sender: buildSenderPayload(socket),
          ...(pollSnapshot ? { poll: pollSnapshot } : {}),
        };

        const room = `server-channel:${channelId}`;
        socket.to(room).emit("server:channel:message", {
          serverId: channel.server_id,
          channelId,
          message,
        });
        socket.emit("server:channel:message", {
          serverId: channel.server_id,
          channelId,
          message,
          tempId,
        });
        // Same-user other devices: see groupHandlers note (iOS → Electron).
        require("../lib/messageFanout").fanoutOwnMessageToOtherDevices(io, {
          userId: myId,
          exceptSocketId: socket.id,
          event: "server:channel:message",
          payload: { serverId: channel.server_id, channelId, message },
        });

        // The message is stored and delivered: a failure below (mention lookups,
        // notifications) is logged only, never reported as a failed send (MSG-14).
        try {
        // Messaging phase 5: who a role / @everyone / @here ping reaches (server-side only).
        let massPing = { userIds: [], roles: [] };
        if (mentionParts && (mentionParts.roleIds.length || massMention)) {
          try {
            massPing = await serverMentions.resolveMassPingTargets(supabase, {
              serverId: channel.server_id,
              channelId,
              senderId: myId,
              resolved: { bits: channelBits, isOwner: Boolean(resolved?.isOwner) },
              text: trimmedContent,
              presence: require("../runtime/sharedState").presence,
              canView: async (uid) => {
                const r = await resolveChannelPermissions(supabase, channel.server_id, uid, channelId);
                return r.isMember && hasPermission(r.bits, Permissions.VIEW_CHANNEL);
              },
              // One bulk read for all candidates (MSG-13).
              canViewMany: async (uids) => {
                const bitsByUser = await resolveChannelPermissionsBulk(supabase, channel.server_id, channelId, uids);
                return new Set(uids.filter((uid) => hasPermission(bitsByUser.get(uid) || 0n, Permissions.VIEW_CHANNEL)));
              },
            });
          } catch (pingErr) {
            console.warn("[ServerChannel] role mention lookup failed:", pingErr?.message || pingErr);
          }
        }
        const notifyText = trimmedContent && massPing.roles?.length
          ? serverMentions.roleTokensToText(trimmedContent, massPing.roles)
          : trimmedContent;
        const pingedIds = new Set(massPing.userIds || []);

        bumpChannelUnreadForMembers(channel.server_id, channelId, myId, {
          io,
          channelName: channel.name || null,
          message,
          displayText: notifyText,
          pingedIds,
        });

        if (pingedIds.size) {
          void notifyMassPing({
            io,
            channel,
            channelId,
            message,
            fromName: message.sender?.username || socket.user?.username || "Someone",
            fromId: myId,
            text: notifyText,
            userIds: [...pingedIds],
            directNames: [...new Set([...trimmedContent.matchAll(/@(\w{1,32})/g)].map((m) => m[1].toLowerCase()))],
          });
        }

        // Direct @mention alerts (works even if the target is not in the channel room)
        if (trimmedContent) {
          // At most MAX_DIRECT_MENTIONS distinct names are looked up (MSG-14 / SK-7).
          const mentionedUsernames = [
            ...new Set(
              [...trimmedContent.matchAll(/@(\w{1,32})/g)].map((m) => m[1].toLowerCase())
            ),
          ].filter((u) => u !== "everyone" && u !== "here").slice(0, MAX_DIRECT_MENTIONS);
          if (mentionedUsernames.length > 0) {
            const [{ data: serverMeta }, { data: mentionedUsers }] = await Promise.all([
              supabase.from("servers").select("name").eq("id", channel.server_id).maybeSingle(),
              supabase
                .from("users")
                .select("id, username")
                .or(mentionedUsernames.map((u) => `username.ilike.${u}`).join(",")),
            ]);
            const candidates = (mentionedUsers || []).filter((u) => {
              if (!u?.id || u.id === myId) return false;
              return mentionedUsernames.includes(String(u.username || "").toLowerCase());
            });
            const candidateIds = candidates.map((u) => u.id);
            if (candidateIds.length > 0) {
              const { data: memberRows } = await supabase
                .from("server_members")
                .select("user_id")
                .eq("server_id", channel.server_id)
                .in("user_id", candidateIds);
              const memberSet = new Set((memberRows || []).map((r) => r.user_id));
              const fromName =
                message.sender?.username || socket.user?.username || "Someone";
              // Only members who can see the channel: a mention in a hidden channel used to
              // send its text (mention:received + push) to anyone named in it (2026-10-18).
              const mentionTargets = [];
              const memberCandidates = candidateIds.filter((id) => memberSet.has(id));
              if (memberCandidates.length) {
                try {
                  const bitsByUser = await resolveChannelPermissionsBulk(supabase, channel.server_id, channelId, memberCandidates);
                  for (const uid of memberCandidates) {
                    if (hasPermission(bitsByUser.get(uid) || 0n, Permissions.VIEW_CHANNEL)) mentionTargets.push(uid);
                  }
                } catch {
                  /* cannot resolve: no alert */
                }
              }
              for (const uid of mentionTargets) {
                io.to(`user:${uid}`).emit("mention:received", {
                  serverId: channel.server_id,
                  channelId,
                  channelName: channel.name || null,
                  serverName: serverMeta?.name || null,
                  messageId: message.id,
                  from: fromName,
                  fromId: socket.user?.id || null,
                  text: notifyText,
                });
              }
              if (mentionTargets.length > 0) {
                try {
                  const [{ data: memberships }, { data: mutes }] = await Promise.all([
                    supabase
                      .from("server_members")
                      .select("user_id, notification_level")
                      .eq("server_id", channel.server_id)
                      .in("user_id", mentionTargets),
                    supabase
                      .from("server_channel_mutes")
                      .select("user_id")
                      .eq("channel_id", channelId)
                      .in("user_id", mentionTargets),
                  ]);
                  const mutedSet = new Set((mutes || []).map((r) => r.user_id));
                  const levelByUser = new Map(
                    (memberships || []).map((r) => [r.user_id, String(r.notification_level || "all").toLowerCase()])
                  );
                  const pushTargets = mentionTargets.filter((uid) => {
                    if (mutedSet.has(uid)) return false;
                    return levelByUser.get(uid) !== "muted";
                  });
                  if (pushTargets.length > 0) {
                    const { sendMentionPush } = require("../lib/webPush");
                    void sendMentionPush(pushTargets, {
                      i18n: { title: { key: "push.mentioned", vars: { from: fromName } } },
                      body: notifyText.slice(0, 140),
                      text: notifyText.slice(0, 140),
                      from: fromName,
                      serverId: channel.server_id,
                      channelId,
                      channelName: channel.name || null,
                      serverName: serverMeta?.name || null,
                      messageId: message.id,
                      deepLink: `/?server=${encodeURIComponent(channel.server_id)}&channel=${encodeURIComponent(channelId)}`,
                    });
                  }
                } catch (pushErr) {
                  console.warn("[WebPush] Mention push skipped:", pushErr?.message || pushErr);
                }
              }
            }
          }
        }
        } catch (postErr) {
          console.warn("[ServerChannel] post-send work failed:", postErr?.message || postErr);
        }
      } catch (err) {
        if (!err?.status) console.error("[ServerChannel] message error:", err);
        slowmode.undo();
        massSlot.undo();
        socket.emit("server:channel:message:error", {
          channelId,
          tempId: tempId || null,
          ...errorFields(err, "message"),
          message: err.message || "Failed to send message.",
          code: err.code || null,
          ...(err.timeout ? { timeout: err.timeout } : {}),
        });
      }
    }
  );
}

module.exports = {
  registerServerChannelHandlers,
  notifyMassPing,
  __massPingLimiter: massPingLimiter,
  buildChannelNotifyPayload,
  bumpChannelUnreadForMembers,
  bumpChannelUnreadCounts,
  __resetUnreadRpcState,
  assertTextChannelAccess,
  assertNotTimedOut,
  assertSlowmode,
  resolveUserChannelsBits,
  canPostInAnnouncement,
  allowSocketEvent,
  pushChannelMessageToIos,
};
