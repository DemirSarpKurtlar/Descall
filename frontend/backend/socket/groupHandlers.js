/**
 * Modern Group Socket Handlers
 * Simple, reliable, works with 2-15 people
 */

const { appendErrorLog, activeGroupCalls, screenShareSessions, presence, usernameById, systemConfig } = require("../runtime/sharedState");
const { checkMessageSend, isPlatformAdmin } = require("../lib/platformPolicy");
const supabase = require("../db/supabase");
const { normalizePollInput, pollFallbackText, buildPollSnapshot } = require("../lib/pollCore");
const { normalizeIncomingMediaUrl } = require("../lib/privateMedia");
const { getCachedPublicUser, getAvatarUrl, pickChatCosmetics, ensureCosmeticsCached } = require("../lib/userProfile");
const { sendGroupCallPush } = require("../lib/webPush");
const { assertGroupMember, bothInGroupCall } = require("../lib/groupCallMembership");
const descoin = require("../lib/descoin");
const { shouldCreditMessage } = require("../lib/descoinMessageGuard");
const descoinAntibot = require("../lib/descoinAntibot");
const { toUtcIso } = require("../lib/datetime");
const clock = require("../lib/callClock");
const { markGroupParticipantJoined } = require("../lib/callSummary");
const {
  executeSlashCommand,
  emitAppMessage,
  parseSlashCommand,
  isCasinoCommand,
} = require("../lib/slashCommands");
const {
  broadcastToGroupMembers,
  buildBannerFromCall,
  emitBannerUpdate,
  endGroupCall,
  removeUserFromGroupCall,
  removeUserFromAllGroupCalls,
  resumeParticipantInGroupCall,
} = require("./groupCallLifecycle");

/** iOS alert push for a group DM message; mentioned members get a mention push. Never throws. */
async function pushGroupMessageToIos({ groupId, groupName, fromId, from, message, isVoice, mentionedUserIds }) {
  try {
    const [{ data: members, error }, groupRow] = await Promise.all([
      supabase.from("group_members").select("user_id").eq("group_id", groupId).neq("user_id", fromId),
      groupName
        ? Promise.resolve({ data: { name: groupName } })
        : supabase.from("groups").select("name").eq("id", groupId).maybeSingle(),
    ]);
    if (error) throw error;
    const memberIds = (members || []).map((r) => r.user_id).filter(Boolean);
    if (!memberIds.length) return;
    const { sendGroupMessagePush, sendIosGroupMentionPush } = require("../lib/webPush");
    const content = String(message?.content || "");
    const payload = {
      groupId,
      groupName: groupRow?.data?.name || null,
      fromId,
      from,
      text: isVoice ? "" : content.slice(0, 160),
      previewKind: isVoice ? "voice" : message?.media_url ? "media" : "text",
      messageId: message?.id || null,
    };
    const mentioned = memberIds.filter((id) => mentionedUserIds?.has(id));
    const others = memberIds.filter((id) => !mentionedUserIds?.has(id));
    await Promise.allSettled([
      mentioned.length ? sendIosGroupMentionPush(mentioned, payload) : null,
      others.length ? sendGroupMessagePush(others, payload) : null,
    ]);
  } catch (err) {
    console.warn("[GroupMessage] iOS push skipped:", err?.message || err);
  }
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

/** Call signaling payload with shop cosmetics for avatar frames / name effects. */
function resolveCallFromUser(socket) {
  const myId = socket.user?.id;
  const cached = getCachedPublicUser(myId);
  const avatar = resolveSocketAvatar(socket);
  const username = cached?.username || socket.user?.username || "?";
  const displayName = cached?.displayName || socket.user?.display_name || socket.user?.displayName || null;
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

function resolveParticipantPublic(userId) {
  const cached = getCachedPublicUser(userId);
  const presenceEntry = presence.get(userId);
  const username = cached?.username || presenceEntry?.username || usernameById.get(userId) || "Member";
  const avatar =
    cached?.avatarUrl || cached?.avatar_url || presenceEntry?.avatar_url || getAvatarUrl(userId) || null;
  return {
    id: userId,
    username,
    displayName: cached?.displayName || null,
    avatar_url: avatar,
    avatarUrl: avatar,
    isScreenSharing: false,
    ...pickChatCosmetics(cached),
  };
}

const MENTION_PATTERN = /@(\w{1,32})/g;

function extractMentionedUsernames(text) {
  if (!text) return [];
  const matches = [...text.matchAll(MENTION_PATTERN)];
  return [...new Set(matches.map((m) => m[1].toLowerCase()))];
}

function emitMentionToUser(io, userId, payload) {
  const p = presence.get(userId);
  if (p?.socketId) io.to(p.socketId).emit("mention:received", payload);
}

function registerGroupHandlers(io, socket, state) {
  const myId = socket.user?.id;
  if (!myId) return;

  // activeGroupCalls is imported from sharedState — shared across all socket connections

  // Join group room
  socket.on("group:join", async (groupId) => {
    if (!groupId) return;
    const { data: membership } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", myId)
      .maybeSingle();
    if (!membership) return;
    socket.join(`group:${groupId}`);

    // Notify user if there's an active call in this group
    const activeCall = activeGroupCalls.get(groupId);
    if (activeCall && activeCall.participants.size > 0) {
      socket.emit("group:call:active-banner", {
        groupId,
        initiatorId: activeCall.initiatorId,
        initiatorUsername: activeCall.initiatorUsername,
        callType: activeCall.callType,
        participantCount: activeCall.participants.size,
        participants: Array.from(activeCall.participants),
        startTime: activeCall.startTime,
      });
    }
  });

  // Bulk rejoin all group rooms at once (used on connect / reconnect)
  // Restores active-banner state without requiring a page reload
  socket.on("groups:rejoin", async (groupIds) => {
    if (!Array.isArray(groupIds)) return;
    for (const groupId of groupIds) {
      if (!groupId) continue;
      const { data: membership } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("group_id", groupId)
        .eq("user_id", myId)
        .maybeSingle();
      if (!membership) continue;
      socket.join(`group:${groupId}`);
      const activeCall = activeGroupCalls.get(groupId);
      if (activeCall && activeCall.participants.size > 0) {
        socket.emit("group:call:active-banner", {
          groupId,
          initiatorId: activeCall.initiatorId,
          initiatorUsername: activeCall.initiatorUsername,
          callType: activeCall.callType,
          participantCount: activeCall.participants.size,
          participants: Array.from(activeCall.participants),
          startTime: activeCall.startTime,
        });
      }
    }
  });

  // Leave group room
  socket.on("group:leave", (groupId) => {
    if (!groupId) return;
    socket.leave(`group:${groupId}`);
    console.log(`[Socket] ${myId} left group: ${groupId}`);
  });

  // Group message — persist to DB then broadcast
  socket.on("group:message", async ({ groupId, tempId, content, mediaUrl, mediaType, duration, replyTo, poll: pollInput } = {}) => {
    // Poll from the creation sheet: validated here, stored as a poll_v2 row + polls tables.
    let pollDraft = null;
    if (pollInput) {
      const normalized = normalizePollInput(pollInput);
      if (!normalized.ok) {
        socket.emit("group:message:error", { groupId, tempId: tempId || null, message: normalized.message, code: normalized.code });
        return;
      }
      pollDraft = normalized.poll;
      content = pollFallbackText(pollDraft);
      mediaUrl = null;
      mediaType = "poll_v2";
      replyTo = null;
    } else if (mediaType === "poll_v2" || mediaType === "poll_end" || mediaType === "app_card") {
      mediaType = null;
    }
    try {
      const { getActiveTimeout } = require("../lib/moderation");
      const to = getActiveTimeout(myId);
      if (to) {
        socket.emit("group:message:error", {
          groupId,
          tempId: tempId || null,
          message: to.message || "You are timed out and cannot send messages.",
          code: "TIMED_OUT",
          timeout: to,
        });
        return;
      }
    } catch {
      /* ignore */
    }

    if (!groupId || (!content?.trim() && !mediaUrl)) {
      appendErrorLog("group:message", "Missing required parameters", { groupId, hasContent: !!content, hasMedia: !!mediaUrl }, myId, socket.user?.username);
      if (tempId) {
        socket.emit("group:message:error", { groupId, tempId, message: "Missing message content." });
      }
      return;
    }

    const { data: groupMembership } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", myId)
      .maybeSingle();
    if (!groupMembership) {
      socket.emit("group:message:error", {
        groupId,
        tempId: tempId || null,
        message: "You are not a member of this group.",
        code: "NOT_MEMBER",
      });
      return;
    }
    {
      // Yönetici Paneli switches (3.1.3): freeze, slow mode, per-minute cap.
      const verdict = checkMessageSend({ config: systemConfig, userId: myId, isAdmin: isPlatformAdmin(socket), kind: "group" });
      if (!verdict.ok) {
        socket.emit("group:message:error", { groupId, tempId: tempId || null, message: verdict.message, messageKey: verdict.messageKey, messageVars: verdict.messageVars, code: verdict.code, retryAfterMs: verdict.retryAfterMs });
        return;
      }
    }

    if (mediaUrl) {
      const original = mediaUrl;
      mediaUrl = await normalizeIncomingMediaUrl(supabase, myId, mediaUrl);
      if (!mediaUrl && original && !content?.trim()) {
        socket.emit("group:message:error", { groupId, tempId: tempId || null, message: "Attachment unavailable.", code: "MEDIA_UNAVAILABLE" });
        return;
      }
    }
    const isVoice = mediaType === "voice" || mediaType === "audio";
    let trimmedContent = content?.trim() || null;
    if (isVoice && mediaUrl) {
      const dur = Math.max(0, Math.round(Number(duration) || 0));
      // Persist duration in content so it survives page reload (no DB column needed)
      if (!trimmedContent || !trimmedContent.startsWith("__voice__:")) {
        trimmedContent = `__voice__:${dur || 1}`;
      }
    }

    // Slash commands: casino delegates to gameHandlers; app commands use the registry.
    if (trimmedContent && trimmedContent.startsWith('/')) {
      const parsed = parseSlashCommand(trimmedContent);
      if (parsed) {
        const result = await executeSlashCommand({
          io,
          socket,
          context: "group",
          userId: myId,
          roomId: groupId,
          groupId,
          sender: resolveCallFromUser(socket),
          content: trimmedContent,
        });
        if (result.handled) {
          if (result.message) {
            if (result.message.sender_id === myId) {
              io.to(`group:${groupId}`).emit("group:message", {
                groupId,
                message: result.message,
                tempId,
              });
            } else {
              emitAppMessage({ io, socket, context: "group", roomId: groupId, message: result.message });
            }
          }
          socket.emit("group:message:ack", {
            groupId,
            tempId: tempId || null,
            suppress: result.message?.sender_id === myId ? false : true,
            isGameCommand: isCasinoCommand(parsed.name),
            isAppCommand: !isCasinoCommand(parsed.name),
          });
          return;
        }
      }
    }

    const { data: row, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
        sender_id: myId,
        content: trimmedContent,
        media_url: mediaUrl || null,
        media_type: isVoice ? "voice" : (mediaType || null),
        message_type: "text",
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("[GroupMessage] DB insert error:", error.message);
      socket.emit("group:message:error", {
        groupId,
        tempId: tempId || null,
        message: "Failed to send message. Please try again.",
      });
      return;
    }
    let pollSnapshot = null;
    if (pollDraft) {
      try {
        const { createPollForMessage } = require("../lib/polls");
        const made = await createPollForMessage({ scope: "group", messageId: row.id, groupId, creatorId: myId, poll: pollDraft });
        pollSnapshot = buildPollSnapshot(made.poll, made.options, null, {});
      } catch (pollErr) {
        console.error("[GroupMessage] poll create failed:", pollErr?.message || pollErr);
        await supabase.from("group_messages").delete().eq("id", row.id).eq("group_id", groupId);
        socket.emit("group:message:error", { groupId, tempId: tempId || null, message: "Could not create the poll. Try again." });
        return;
      }
    }

    // Anti-bot monitor (Faz 0): shadow evaluation only; earning below is unchanged.
    if (trimmedContent) void descoinAntibot.observeMessage({ userId: myId, convKey: `group:${groupId}`, text: trimmedContent });
    if (trimmedContent && shouldCreditMessage(myId, trimmedContent)) {
      descoin
        .creditCapped(myId, 1, "message_activity", { context: "group", groupId })
        .then((result) => {
          if (result.credited > 0) {
            socket.emit("descoin:balance", { balance: result.balance, delta: result.credited, reason: "message_activity" });
          }
        })
        .catch((err) => console.warn("[DesCoin] group message credit failed:", err?.message || err));
    }

    const replyMeta = replyTo && typeof replyTo === "object"
      ? {
          id: replyTo.id || null,
          text: replyTo.text || "",
          mediaType: replyTo.mediaType || null,
          from: replyTo.from || null,
        }
      : null;

    await ensureCosmeticsCached([myId]).catch(() => {});

    const message = {
      id: row?.id ?? crypto.randomUUID(),
      sender_id: myId,
      content: trimmedContent,
      media_url: mediaUrl,
      media_type: isVoice ? "voice" : mediaType,
      duration: isVoice
        ? Math.max(0, Math.round(Number(duration) || Number(String(trimmedContent || "").replace(/^__voice__:/, "")) || 0))
        : null,
      created_at: toUtcIso(row?.created_at) || new Date().toISOString(),
      reply_to: replyMeta,
      replyTo: replyMeta,
      ...(pollSnapshot ? { poll: pollSnapshot } : {}),
      sender: (() => {
        const cached = getCachedPublicUser(myId);
        const avatar = resolveSocketAvatar(socket);
        const displayName = cached?.displayName || socket.user.display_name || socket.user.displayName || null;
        const username = cached?.username || socket.user.username;
        const isAdmin =
          Boolean(cached?.is_admin || cached?.isAdmin || socket.user?.is_admin) ||
          username === "admin";
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
      })(),
    };

    // Broadcast to all group members except sender
    socket.to(`group:${groupId}`).emit("group:message", { groupId, message });
    // Echo back to sender with tempId for optimistic message replacement
    socket.emit("group:message", { groupId, message, tempId });

    // Detect @mentions and notify mentioned users
    const mentionedUserIds = new Set();
    let groupNameForPush = null;
    if (trimmedContent) {
      const mentionedUsernames = extractMentionedUsernames(trimmedContent);
      if (mentionedUsernames.length > 0) {
        const { data: groupMeta } = await supabase
          .from("groups")
          .select("name")
          .eq("id", groupId)
          .single();
        groupNameForPush = groupMeta?.name || null;

        const { data: mentionedUsers } = await supabase
          .from("users")
          .select("id, username")
          .in("username", mentionedUsernames);

        for (const mentioned of (mentionedUsers || [])) {
          if (mentioned.id === myId) continue;
          mentionedUserIds.add(mentioned.id);
          emitMentionToUser(io, mentioned.id, {
            groupId,
            groupName: groupMeta?.name || "Grup",
            from: socket.user.username,
            fromId: myId,
            text: trimmedContent,
          });
        }
      }
    }

    // Native iOS alert pushes (web / desktop notify from the socket events above).
    void pushGroupMessageToIos({
      groupId,
      groupName: groupNameForPush,
      fromId: myId,
      from: socket.user.username,
      message,
      isVoice,
      mentionedUserIds,
    });
  });

  // ========== GROUP CALL ==========

  // Check if there's an active call in the group — used to sync the
  // "ongoing call" banner when a client opens/switches to a group chat, or
  // reconnects, and may have missed the original push (offline, socket not
  // yet joined to the group room, app was closed, etc). Reuses the same
  // group:call:banner-update event/shape the live push uses so there's only
  // one code path on the client for "should the banner be showing".
  socket.on("group:call:check", async ({ groupId }) => {
    if (!groupId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    const activeCall = activeGroupCalls.get(groupId);
    const banner = buildBannerFromCall(groupId, activeCall);
    socket.emit("group:call:banner-update", { groupId, banner });
  });

  // Start group call. hangout=true → persistent voice room (no ring / no push).
  socket.on("group:call:start", async ({ groupId, callType, memberIds = [], hangout = false } = {}) => {
    if (!groupId || !callType) {
      appendErrorLog("group:call:start", "Missing required parameters", { groupId, callType }, myId, socket.user?.username);
      return;
    }
    if (!(await assertGroupMember(supabase, groupId, myId))) {
      socket.emit("group:call:error", {
        groupId,
        message: "You are not a member of this group.",
        code: "not_member",
      });
      return;
    }

    const isHangout = Boolean(hangout);

    // Check if there's already an active call in this group
    const existingCall = activeGroupCalls.get(groupId);
    if (existingCall) {
      console.log(`[GroupCall] ${myId} trying to start call but existing call found in group ${groupId}`);
      // Notify user to join existing call instead
      socket.emit("group:call:join-existing", {
        groupId,
        initiatorId: existingCall.initiatorId,
        callType: existingCall.callType,
        participants: Array.from(existingCall.participants),
        hangout: Boolean(existingCall.hangout),
      });
      return;
    }

    console.log(`[GroupCall] ${myId} started ${callType}${isHangout ? " hangout" : " call"} in group ${groupId}`);

    // Ensure initiator receives left/ended/participant events via group room
    socket.join(`group:${groupId}`);

    // Ring only people who are actually in the group. Client memberIds can
    // narrow that list; they cannot add anyone the database does not list.
    let targets = [];
    try {
      const { data: rows, error } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId);
      if (error) throw error;
      const members = (rows || []).map((row) => row.user_id).filter((id) => id && id !== myId);
      const requested = new Set(Array.isArray(memberIds) ? memberIds.filter(Boolean) : []);
      targets = requested.size ? members.filter((id) => requested.has(id)) : members;
    } catch (err) {
      console.error("[GroupCall] member lookup error:", err?.message || err);
      targets = [];
    }

    // Persist call start to DB
    supabase
      .from("group_calls")
      .insert({ group_id: groupId, started_by: myId, call_type: callType, status: "active" })
      .select("id")
      .single()
      .then(({ data, error }) => {
        if (error) console.error("[GroupCall] DB insert error:", error.message);
        else {
          const call = activeGroupCalls.get(groupId);
          if (call) call.dbCallId = data.id;
          // Insert initiator as first participant
          supabase.from("group_call_participants").insert({ call_id: data.id, user_id: myId }).then(() => {});
        }
      });

    // Track this call as active
    // 3.0.0 (C3): per-call id + start time for the push tap resolver.
    const groupCallUuid = require("crypto").randomUUID();
    const groupCallStartedAt = clock.now();
    activeGroupCalls.set(groupId, {
      callUuid: groupCallUuid,
      initiatorId: myId,
      initiatorUsername: socket.user.username,
      initiatorAvatarUrl: resolveSocketAvatar(socket),
      callType,
      hangout: isHangout,
      participants: new Set([myId]),
      allParticipants: new Set([myId]),
      startTime: clock.now(),
      connectedAt: null,
      dbCallId: null,
      disconnectGraceByUser: new Map(),
    });

    const payload = {
      groupId,
      fromUser: resolveCallFromUser(socket),
      callType,
      hangout: isHangout,
    };

    if (!isHangout) {
      // Dual delivery: per-user rooms + group room (open chats).
      targets.forEach((targetUserId) => {
        io.to(`user:${targetUserId}`).emit("group:call:incoming", payload);
      });
      // Backgrounded clients cannot rely on Socket.IO; push contains no SDP/ICE.
      // Push only to real members (client-sent memberIds are not trusted for push).
      void (async () => {
        let pushTargets = targets;
        let groupName = null;
        try {
          const [{ data: rows, error }, { data: groupRow }] = await Promise.all([
            supabase.from("group_members").select("user_id").eq("group_id", groupId),
            supabase.from("groups").select("name").eq("id", groupId).maybeSingle(),
          ]);
          if (!error && rows) {
            const memberSet = new Set(rows.map((r) => r.user_id));
            pushTargets = targets.filter((id) => memberSet.has(id));
          }
          groupName = groupRow?.name || null;
        } catch {
          /* fall back to the resolved targets */
        }
        if (!pushTargets.length) return;
        await sendGroupCallPush(pushTargets, {
          type: "group-call",
          groupId,
          groupName,
          callType,
          from: socket.user.username,
          i18n: {
            title: { key: "push.calling", vars: { from: socket.user.username } },
            body: { key: callType === "video" ? "push.groupCallJoinVideo" : "push.groupCallJoinVoice" },
          },
          tag: `group-call-${groupId}`,
          deepLink: `/?group=${encodeURIComponent(groupId)}`,
          action: "join",
          callUuid: groupCallUuid,
          callKind: "group",
          startedAt: groupCallStartedAt,
        });
      })().catch((err) => console.warn("[GroupCall] push failed:", err?.message || err));
      socket.to(`group:${groupId}`).emit("group:call:incoming", payload);
    } else {
      // Soft notify open chats only — no ring, no push spam.
      io.to(`group:${groupId}`).emit("group:call:hangout-open", payload);
      targets.forEach((targetUserId) => {
        io.to(`user:${targetUserId}`).emit("group:call:hangout-open", payload);
      });
    }

    io.to(`group:${groupId}`).emit("group:call:started", {
      groupId,
      fromUserId: myId,
      fromUser: resolveCallFromUser(socket),
      callType,
      hangout: isHangout,
    });
    void emitBannerUpdate(io, groupId);
  });

  socket.on("group:call:resume", async ({ groupId } = {}) => {
    if (!groupId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    resumeParticipantInGroupCall(io, groupId, myId, socket);
  });

  // Accept call and send offer
  socket.on("group:call:accept", async ({ groupId, toUserId }) => {
    if (!groupId || !toUserId) {
      appendErrorLog("group:call:accept", "Missing required parameters", { groupId, toUserId }, myId, socket.user?.username);
      return;
    }
    if (!(await assertGroupMember(supabase, groupId, myId))) {
      socket.emit("group:call:error", {
        groupId,
        message: "You are not a member of this group.",
        code: "not_member",
      });
      return;
    }
    if (!activeGroupCalls.get(groupId)?.participants?.has(toUserId)) return;

    // Other tabs/devices of this user should drop their incoming ring.
    socket.to(`user:${myId}`).emit("group:call:answered-elsewhere", { groupId });

    // Add participant to active call tracking
    const activeCall = activeGroupCalls.get(groupId);
    if (activeCall) {
      markGroupParticipantJoined(activeCall, myId, clock.now());
      if (activeCall.dbCallId) {
        supabase.from("group_call_participants")
          .insert({ call_id: activeCall.dbCallId, user_id: myId })
          .then(({ error }) => {
            // Accept on a second tab, or accept after join, hits the primary key.
            if (error && !String(error.message || "").includes("duplicate")) {
              console.error("[GroupCall] Participant insert error:", error.message);
            }
          });
      }
    }

    // Ensure acceptor is in the group room
    socket.join(`group:${groupId}`);

    // Notify the initiator that someone accepted
    io.to(`user:${toUserId}`).emit("group:call:accepted", {
      groupId,
      fromUserId: myId,
      fromUser: resolveCallFromUser(socket),
    });

    // Also notify other participants in the group that a new person joined
    socket.to(`group:${groupId}`).emit("group:call:participant-joined", {
      groupId,
      fromUserId: myId,
      fromUser: resolveCallFromUser(socket),
    });
    void emitBannerUpdate(io, groupId);
  });

  // Join existing call (new handler for joining active calls)
  socket.on("group:call:join", async ({ groupId, callType }) => {
    if (!groupId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) {
      socket.emit("group:call:error", {
        groupId,
        message: "You are not a member of this group.",
        code: "not_member",
      });
      return;
    }

    const activeCall = activeGroupCalls.get(groupId);
    if (!activeCall) {
      socket.emit("group:call:error", { groupId, message: "No active call in this group" });
      return;
    }

    // Ensure joiner is in the group room for left/ended/screen events
    socket.join(`group:${groupId}`);

    // Add participant to tracking (also starts the connected clock once a
    // second person is in the call).
    markGroupParticipantJoined(activeCall, myId, clock.now());

    if (activeCall.dbCallId) {
      supabase.from("group_call_participants")
        .insert({ call_id: activeCall.dbCallId, user_id: myId })
        .then(({ error }) => {
          // Unique violation if they rejoin — ignore
          if (error && !String(error.message || "").includes("duplicate")) {
            console.error("[GroupCall] Participant insert error:", error.message);
          }
        });
    }

    // Notify all participants that someone is joining (including other sockets)
    io.to(`group:${groupId}`).emit("group:call:participant-joined", {
      groupId,
      fromUserId: myId,
      fromUser: resolveCallFromUser(socket),
    });

    // Send enriched participant list to the joining user (include cosmetics)
    const otherParticipantIds = Array.from(activeCall.participants).filter(id => id !== myId);
    void ensureCosmeticsCached(otherParticipantIds).finally(() => {
      const enrichedParticipants = otherParticipantIds.map((id) => ({
        ...resolveParticipantPublic(id),
        isScreenSharing: screenShareSessions.has(`${groupId}:${id}`),
      }));
      socket.emit("group:call:participants", {
        groupId,
        participants: enrichedParticipants,
        callType: activeCall.callType,
      });
    });
    void emitBannerUpdate(io, groupId);
  });

  // Send answer
  socket.on("group:call:answer", async ({ groupId, toUserId, answer }) => {
    if (!groupId || !toUserId || !answer) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    if (!bothInGroupCall(activeGroupCalls, groupId, myId, toUserId)) return;

    io.to(`user:${toUserId}`).emit("group:call:answer", {
      groupId,
      fromUserId: myId,
      answer,
    });
  });

  // Send ICE candidate
  socket.on("group:call:ice", async ({ groupId, toUserId, candidate }) => {
    if (!groupId || !toUserId || !candidate) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    if (!bothInGroupCall(activeGroupCalls, groupId, myId, toUserId)) return;

    io.to(`user:${toUserId}`).emit("group:call:ice", {
      groupId,
      fromUserId: myId,
      candidate,
    });
  });

  // Send offer (for renegotiation or camera toggle)
  socket.on("group:call:offer", async ({ groupId, toUserId, offer, callType, screen }) => {
    if (!groupId || !toUserId || !offer) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    if (!bothInGroupCall(activeGroupCalls, groupId, myId, toUserId)) return;
    const { sanitizeScreenAnnouncement } = require("../lib/screenShareSignal");
    const announced = sanitizeScreenAnnouncement(screen);

    io.to(`user:${toUserId}`).emit("group:call:offer", {
      groupId,
      fromUserId: myId,
      fromUser: resolveCallFromUser(socket),
      offer,
      callType,
      ...(announced ? { screen: announced } : {}),
    });
  });

  // Decline call
  socket.on("group:call:decline", async ({ groupId, toUserId }) => {
    if (!groupId || !toUserId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    if (!activeGroupCalls.get(groupId)?.participants?.has(toUserId)) return;

    socket.to(`user:${myId}`).emit("group:call:declined-elsewhere", { groupId });

    io.to(`user:${toUserId}`).emit("group:call:declined", {
      groupId,
      fromUserId: myId,
    });
  });

  // Busy signal
  socket.on("group:call:busy", async ({ groupId, toUserId }) => {
    if (!groupId || !toUserId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    if (!activeGroupCalls.get(groupId)?.participants?.has(toUserId)) return;

    io.to(`user:${toUserId}`).emit("group:call:busy", {
      groupId,
      fromUserId: myId,
    });
  });

  // Leave call
  socket.on("group:call:leave", async ({ groupId }) => {
    if (!groupId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    await removeUserFromGroupCall(io, groupId, myId, socket);
  });

  // Force-end call for everyone (initiator only)
  socket.on("group:call:end", async ({ groupId }) => {
    if (!groupId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;

    const activeCall = activeGroupCalls.get(groupId);
    if (!activeCall) {
      await broadcastToGroupMembers(io, groupId, "group:call:banner-update", { groupId, banner: null });
      return;
    }
    if (activeCall.initiatorId !== myId) return;

    await endGroupCall(io, groupId, myId, activeCall);
  });

  // Broadcast per-participant UI state. Media tracks can remain live after
  // their sender is disabled, so receivers cannot reliably infer these flags.
  socket.on("group:call:media-state", async ({ groupId, muted, cameraOn, deafened, requestState } = {}) => {
    if (!groupId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    const activeCall = activeGroupCalls.get(groupId);
    if (!activeCall?.participants?.has(myId)) return;
    socket.to(`group:${groupId}`).emit("group:call:media-state", {
      groupId,
      fromUserId: myId,
      muted: Boolean(muted),
      cameraOn: Boolean(cameraOn),
      deafened: Boolean(deafened),
      // Late joiners ask everyone to re-send their state once.
      requestState: Boolean(requestState),
    });
  });

  // Screen share started — persist session
  socket.on("group:screen:start", async ({ groupId, screen }) => {
    if (!groupId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    if (!activeGroupCalls.get(groupId)?.participants?.has(myId)) return;

    const activeCall = activeGroupCalls.get(groupId);
    const dbCallId = activeCall?.dbCallId ?? null;

    supabase.from("screen_share_sessions")
      .insert({ group_id: groupId, call_id: dbCallId, user_id: myId })
      .select("id")
      .single()
      .then(({ data, error }) => {
        if (error) console.error("[ScreenShare] DB insert error:", error.message);
        else {
          // Store session id keyed by userId so we can close it on stop
          screenShareSessions.set(`${groupId}:${myId}`, data.id);
        }
      });

    const { sanitizeScreenAnnouncement } = require("../lib/screenShareSignal");
    const announced = sanitizeScreenAnnouncement(screen);
    socket.to(`group:${groupId}`).emit("group:screen:started", {
      groupId,
      fromUserId: myId,
      ...(announced ? { screen: announced } : {}),
    });
  });

  // Screen share stopped — close DB session
  socket.on("group:screen:stop", async ({ groupId }) => {
    if (!groupId) return;
    if (!(await assertGroupMember(supabase, groupId, myId))) return;
    if (!activeGroupCalls.get(groupId)?.participants?.has(myId)) return;

    const sessionId = screenShareSessions.get(`${groupId}:${myId}`);
    if (sessionId) {
      supabase.from("screen_share_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId)
        .then(({ error }) => { if (error) console.error("[ScreenShare] DB stop error:", error.message); });
      screenShareSessions.delete(`${groupId}:${myId}`);
    }

    socket.to(`group:${groupId}`).emit("group:screen:stopped", { groupId, fromUserId: myId });
  });
}

module.exports = { registerGroupHandlers, removeUserFromAllGroupCalls, pushGroupMessageToIos };
