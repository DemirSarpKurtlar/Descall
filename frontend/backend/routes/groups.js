const express = require("express");
const { validateGroupAvatarUrl, canEditGroupAvatar } = require("../lib/groupAvatar");
const { normalizeGroupName, canRenameGroup } = require("../lib/groupRename");
const supabase = require("../db/supabase");
const { normalizeIncomingMediaUrl } = require("../lib/privateMedia");
const { requireAuth } = require("../middleware/auth");
const { socketToUser, systemConfig } = require("../runtime/sharedState");
const { checkGroupCreate } = require("../lib/platformPolicy");
const { getUserGroups, loadGroupById, loadRemovedGroups } = require("../lib/groupList");
const {
  ROLES,
  canRemoveMember,
  canSetRole,
  normalizeReason,
  createRateLimiter,
} = require("../lib/groupRoles");
const removals = require("../lib/groupRemovals");
const { areAcceptedFriends, isUniqueViolation, publicMember, isSafeId } = require("../lib/groupMembership");
const { parseSince } = require("../lib/messagePage");
const { attachReactions } = require("../lib/dmMessages");

const router = express.Router();
const MAX_GROUP_SIZE = 15;
const takeRemoveSlot = createRateLimiter();

/** 429 body when a removed person is added back inside the 5 s cooldown. */
async function readdBlocked(groupId, userId) {
  const wait = await removals.readdWaitMs(groupId, userId);
  if (wait <= 0) return null;
  return {
    error: "This person was just removed. Try again in a few seconds.",
    code: "REMOVAL_COOLDOWN",
    retryAfterMs: wait,
  };
}

/** Insert a member_removed / member_left row; returns the stored row or null. */
async function insertMemberEvent({ groupId, type, actorId, actorName, targetId, targetName }) {
  const content = JSON.stringify({
    actorId,
    actorName: actorName || null,
    ...(targetId ? { targetId, targetName: targetName || null } : {}),
  });
  const { data, error } = await supabase
    .from("group_messages")
    .insert({ group_id: groupId, sender_id: actorId, content, message_type: type })
    .select(GROUP_MESSAGE_COLUMNS)
    .single();
  if (error) {
    console.warn(`[Groups] ${type} row insert failed:`, error.message || error);
    return null;
  }
  return data || null;
}

/** Take a user out of the live group: call, socket room. */
function detachFromGroupLive(io, groupId, userId) {
  if (!io) return;
  try {
    const { removeUserFromGroupCall } = require("../socket/groupCallLifecycle");
    Promise.resolve(removeUserFromGroupCall(io, groupId, userId)).catch((err) => {
      console.warn("[Groups] call detach failed:", err?.message || err);
    });
  } catch (err) {
    console.warn("[Groups] call detach failed:", err?.message || err);
  }
  try {
    io.in?.(`user:${userId}`)?.socketsLeave?.(`group:${groupId}`);
  } catch (err) {
    console.warn("[Groups] socketsLeave failed:", err?.message || err);
  }
}
const INVITE_CODE_LENGTH = 8;

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function isGroupMember(groupId, userId) {
  const { data } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

function publicInviteUrl(req, code) {
  const origin =
    process.env.PUBLIC_APP_URL ||
    req.get("origin") ||
    `${req.protocol}://${req.get("host")}` ||
    "https://descall.com";
  return `${String(origin).replace(/\/$/, "")}/invite/${code}`;
}

// Kullanicinin socket ID'sini bul
function getUserSocketId(userId) {
  for (const [socketId, id] of socketToUser.entries()) {
    if (id === userId) return socketId;
  }
  return null;
}

// ─── Invite links (Discord-style) ───────────────────────────────────────────

// GET /groups/invite-links/:code — public preview
router.get("/invite-links/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Missing invite code" });

    const { data: invite, error } = await supabase
      .from("group_invite_links")
      .select("code, group_id, creator_id, max_uses, uses, expires_at, created_at")
      .eq("code", code)
      .maybeSingle();

    if (error || !invite) {
      return res.status(404).json({ error: "Invite invalid or expired" });
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await supabase.from("group_invite_links").delete().eq("code", code);
      return res.status(410).json({ error: "Invite expired" });
    }
    if (invite.max_uses != null && invite.uses >= invite.max_uses) {
      return res.status(410).json({ error: "Invite has reached max uses" });
    }

    const { data: group } = await supabase
      .from("groups")
      .select("id, name, avatar_url, created_by")
      .eq("id", invite.group_id)
      .maybeSingle();
    if (!group) return res.status(404).json({ error: "Group not found" });

    const { count } = await supabase
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", group.id);

    let alreadyMember = false;
    try {
      // Optional auth — if Bearer present, check membership
      const auth = req.headers.authorization || "";
      if (auth.startsWith("Bearer ")) {
        // lightly reuse requireAuth pattern without failing public access
        const { verifyToken } = require("../config/jwt");
        const decoded = verifyToken(auth.slice(7));
        if (decoded?.sub) {
          alreadyMember = await isGroupMember(group.id, decoded.sub);
        }
      }
    } catch {
      /* ignore */
    }

    return res.json({
      invite: {
        code: invite.code,
        expiresAt: invite.expires_at,
        maxUses: invite.max_uses,
        uses: invite.uses,
        url: publicInviteUrl(req, invite.code),
      },
      group: {
        id: group.id,
        name: group.name,
        avatarUrl: group.avatar_url,
        memberCount: count || 0,
      },
      alreadyMember,
    });
  } catch (err) {
    console.error("[Groups] invite preview error:", err);
    return res.status(500).json({ error: "Failed to load invite" });
  }
});

// POST /groups/invite-links/:code/join — join via link
router.post("/invite-links/:code/join", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Missing invite code" });

    const { data: invite, error } = await supabase
      .from("group_invite_links")
      .select("code, group_id, max_uses, uses, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (error || !invite) return res.status(404).json({ error: "Invite invalid or expired" });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await supabase.from("group_invite_links").delete().eq("code", code);
      return res.status(410).json({ error: "Invite expired" });
    }
    if (invite.max_uses != null && invite.uses >= invite.max_uses) {
      return res.status(410).json({ error: "Invite has reached max uses" });
    }

    if (await isGroupMember(invite.group_id, userId)) {
      const groups = await getUserGroups(userId);
      const group = groups.find((g) => g.id === invite.group_id);
      return res.json({ success: true, alreadyMember: true, group });
    }

    const cooldown = await readdBlocked(invite.group_id, userId);
    if (cooldown) return res.status(429).json(cooldown);

    const { count } = await supabase
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", invite.group_id);
    if ((count || 0) >= MAX_GROUP_SIZE) {
      return res.status(400).json({ error: `Group is full (max ${MAX_GROUP_SIZE})` });
    }

    const { error: joinError } = await supabase
      .from("group_members")
      .insert({ group_id: invite.group_id, user_id: userId });
    if (joinError) {
      console.error("[Groups] invite join insert:", joinError);
      return res.status(500).json({ error: "Failed to join group" });
    }
    await removals.markReadded(invite.group_id, userId).catch(() => {});

    const nextUses = (invite.uses || 0) + 1;
    if (invite.max_uses != null && nextUses >= invite.max_uses) {
      await supabase.from("group_invite_links").delete().eq("code", code);
    } else {
      await supabase.from("group_invite_links").update({ uses: nextUses }).eq("code", code);
    }

    const groups = await getUserGroups(userId);
    const group = groups.find((g) => g.id === invite.group_id);

    const io = req.app.get("io");
    if (io && group) {
      const sockId = getUserSocketId(userId);
      if (sockId) {
        const sock = io.sockets.sockets.get(sockId);
        sock?.join(`group:${group.id}`);
        sock?.emit("group:invited", { group });
      }
      io.to(`group:${group.id}`).emit("group:member:joined", {
        groupId: group.id,
        userId,
        username: req.user.username,
      });
    }

    return res.json({ success: true, group });
  } catch (err) {
    console.error("[Groups] invite join error:", err);
    return res.status(500).json({ error: "Failed to join group" });
  }
});

// Get all groups where user is member
router.get("/my", requireAuth, async (req, res) => {
  const started = Date.now();
  try {
    const userId = req.user.id;
    const [groups, open] = await Promise.all([getUserGroups(userId), removals.listActiveRemovals(userId)]);
    const memberOf = new Set(groups.map((g) => g.id));
    let removedGroups = [];
    const pending = open.filter((r) => !memberOf.has(r.group_id));
    if (pending.length) {
      try {
        removedGroups = await loadRemovedGroups(userId, pending);
      } catch (err) {
        console.warn("[Groups API] removed groups failed:", err?.message || err);
      }
    }
    const all = [...groups, ...removedGroups];
    console.log(`[Groups API] Found groups: ${all.length} in ${Date.now() - started}ms`);
    res.json({ groups: all });
  } catch (err) {
    console.error("[Groups API] Error:", err);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// Create new group
router.post("/create", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    {
      // Yönetici Paneli › Güvenlik: "Grup oluşturmaya izin ver" (3.1.3); admins exempt.
      const verdict = checkGroupCreate({ config: systemConfig, isAdmin: req.user.username === "admin" });
      if (!verdict.ok) {
        // Only when the switch is off: one lookup so platform admins stay exempt.
        const { data: row } = await supabase.from("users").select("is_admin").eq("id", userId).maybeSingle();
        if (!row?.is_admin) return res.status(403).json({ error: verdict.message, code: verdict.code });
      }
    }
    const { name, memberIds = [] } = req.body;
    
    if (!name || name.trim().length < 2 || name.length > 50) {
      return res.status(400).json({ error: "Group name must be 2-50 characters" });
    }
    
    const totalMembers = memberIds.length + 1; // + creator
    if (totalMembers > MAX_GROUP_SIZE) {
      return res.status(400).json({ error: `Maximum ${MAX_GROUP_SIZE} members allowed` });
    }
    
    // Create group
    const { data: group, error: createError } = await supabase
      .from("groups")
      .insert({ name: name.trim(), created_by: userId })
      .select()
      .single();
    
    if (createError) throw createError;
    
    // Add creator as member
    const allMembers = [userId, ...memberIds.filter(id => id !== userId)].slice(0, MAX_GROUP_SIZE);
    const memberRows = allMembers.map(user_id => ({ group_id: group.id, user_id }));
    
    const { error: memberError } = await supabase
      .from("group_members")
      .insert(memberRows);
    
    if (memberError) throw memberError;
    
    // Socket bildirimi - diger uyelere grup olustugunu bildir
    const io = req.app.get("io");
    if (io) {
      // Every device of every member (the `user:<id>` room), not just the
      // first socket found, and straight into the group room.
      allMembers.forEach((memberId) => {
        try {
          io.in?.(`user:${memberId}`)?.socketsJoin?.(`group:${group.id}`);
        } catch {
          /* best effort: groups:rejoin on the client covers it */
        }
        if (memberId === userId) return;
        io.to(`user:${memberId}`).emit("group:invited", {
          group: { ...group, memberCount: allMembers.length },
          invitedBy: req.user.id
        });
      });
    }
    
    res.json({ 
      message: "Group created", 
      group: { ...group, memberCount: allMembers.length } 
    });
  } catch (err) {
    console.error("[Groups] Create error:", err);
    console.error("[Groups] Stack:", err.stack);
    res.status(500).json({ error: "Failed to create group", details: err.message });
  }
});

// POST /groups/:groupId/invite-links — create shareable invite
router.post("/:groupId/invite-links", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const { maxUses = null, expiresInHours = 24 * 7 } = req.body || {};

    if (!(await isGroupMember(groupId, userId))) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    let code = generateInviteCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase
        .from("group_invite_links")
        .select("code")
        .eq("code", code)
        .maybeSingle();
      if (!existing) break;
      code = generateInviteCode();
    }

    const expiresAt =
      expiresInHours == null || expiresInHours === 0
        ? null
        : new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000).toISOString();

    const { data: invite, error } = await supabase
      .from("group_invite_links")
      .insert({
        code,
        group_id: groupId,
        creator_id: userId,
        max_uses: maxUses || null,
        uses: 0,
        expires_at: expiresAt,
      })
      .select("code, group_id, creator_id, max_uses, uses, expires_at, created_at")
      .single();

    if (error || !invite) {
      console.error("[Groups] create invite-link:", error);
      return res.status(500).json({
        error: error?.message?.includes("group_invite_links")
          ? "Invite links table missing — run groupInviteLinksMigration.sql"
          : "Failed to create invite",
      });
    }

    return res.status(201).json({
      invite: {
        ...invite,
        url: publicInviteUrl(req, invite.code),
      },
    });
  } catch (err) {
    console.error("[Groups] POST invite-links error:", err);
    return res.status(500).json({ error: "Failed to create invite" });
  }
});

// GET /groups/:groupId/invite-links — list
router.get("/:groupId/invite-links", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    if (!(await isGroupMember(groupId, userId))) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }
    const { data: invites, error } = await supabase
      .from("group_invite_links")
      .select("code, group_id, creator_id, max_uses, uses, expires_at, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({
      invites: (invites || []).map((i) => ({ ...i, url: publicInviteUrl(req, i.code) })),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to list invites" });
  }
});

// DELETE /groups/:groupId/invite-links/:code
router.delete("/:groupId/invite-links/:code", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId, code } = req.params;
    if (!(await isGroupMember(groupId, userId))) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }
    await supabase.from("group_invite_links").delete().eq("group_id", groupId).eq("code", code);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to revoke invite" });
  }
});

// Get group messages
const GROUP_MESSAGE_COLUMNS = `
  id, group_id, sender_id, content, media_url, media_type, created_at, updated_at,
  edited_at, edited_by, is_edited, message_type, original_name, file_size, pinned_at, pinned_by,
  sender:sender_id (id, username, avatar_url)
`;

router.get("/:groupId/messages", requireAuth, async (req, res) => {
  const started = Date.now();
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const { before, since, limit = 50 } = req.query;
    const sinceIso = parseSince(since);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    
    // Check membership
    const { data: member } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    
    // Removed members keep reading the history up to their removal.
    let readUntil = null;
    if (!member) {
      const removal = await removals.getActiveRemoval(groupId, userId);
      if (!removal) return res.status(403).json({ error: "Not a member of this group" });
      readUntil = removal.read_until || removal.removed_at;
    }

    let messages;
    let incremental = false;
    if (sinceIso && !before) {
      incremental = true;
      let createdQ = supabase
        .from("group_messages")
        .select(GROUP_MESSAGE_COLUMNS)
        .eq("group_id", groupId)
        .gt("created_at", sinceIso);
      let editedQ = supabase
        .from("group_messages")
        .select(GROUP_MESSAGE_COLUMNS)
        .eq("group_id", groupId)
        .gt("edited_at", sinceIso);
      if (readUntil) {
        createdQ = createdQ.lte("created_at", readUntil);
        editedQ = editedQ.lte("created_at", readUntil).lte("edited_at", readUntil);
      }
      const [createdRes, editedRes] = await Promise.all([
        createdQ.order("created_at", { ascending: true }).limit(pageSize),
        editedQ.order("edited_at", { ascending: false }).limit(pageSize),
      ]);
      if (createdRes.error) throw createdRes.error;
      const byId = new Map();
      for (const row of [...(editedRes.data || []), ...(createdRes.data || [])]) byId.set(row.id, row);
      messages = [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
      let query = supabase
        .from("group_messages")
        .select(GROUP_MESSAGE_COLUMNS)
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(pageSize);
      if (before) query = query.lt("created_at", before);
      if (readUntil) query = query.lte("created_at", readUntil);
      const { data, error } = await query;
      if (error) throw error;
      messages = data;
    }

    const senderIds = [...new Set((messages || []).map((m) => m.sender_id || m.sender?.id).filter(Boolean))];
    try {
      const { ensureCosmeticsCached, getCachedPublicUser, cacheUserProfile } = require("../lib/userProfile");
      for (const m of messages || []) {
        if (m.sender) cacheUserProfile({ ...m.sender, avatar_url: m.sender.avatar_url || m.sender.avatarUrl });
      }
      await ensureCosmeticsCached(senderIds);
      for (const m of messages || []) {
        const pub = getCachedPublicUser(m.sender_id || m.sender?.id);
        if (pub && m.sender) {
          m.sender = {
            ...m.sender,
            ...pub,
            id: m.sender.id || pub.id,
            username: m.sender.username || pub.username,
          };
          m.from = m.sender;
        }
      }
    } catch (err) {
      console.warn("[Groups] cosmetics enrich failed:", err?.message || err);
    }

    const ordered = incremental ? (messages || []) : (messages || []).slice().reverse();
    const normalized = ordered.map((m) => {
      if (m.message_type === "call_summary") {
        try {
          const summary = typeof m.content === "string" ? JSON.parse(m.content) : m.content;
          return { ...m, type: "call_summary", summary };
        } catch {
          return m;
        }
      }
      return m;
    });
    const withReactions = await attachReactions(normalized, "group", groupId);
    console.log(`[Groups] messages ${withReactions.length} in ${Date.now() - started}ms`);
    res.json({
      messages: withReactions,
      incremental,
      reactionsIncluded: true,
      ...(readUntil ? { removed: true, readUntil } : {}),
    });
  } catch (err) {
    console.error("[Groups] Messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Send message to group
router.post("/:groupId/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const { content, mediaType } = req.body;
    let { mediaUrl } = req.body;
    
    if (!content?.trim() && !mediaUrl) {
      return res.status(400).json({ error: "Message content or media required" });
    }
    
    // Check membership
    const { data: member } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (!member) return res.status(403).json({ error: "Not a member" });
    if (mediaUrl) {
      const original = mediaUrl;
      mediaUrl = await normalizeIncomingMediaUrl(supabase, userId, mediaUrl);
      if (!mediaUrl && original && !content?.trim()) return res.status(400).json({ error: "Attachment unavailable." });
    }
    
    const { data: message, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
        sender_id: userId,
        content: content?.trim() || null,
        media_url: mediaUrl || null,
        media_type: mediaType || null,
      })
      .select(`*, sender:sender_id (id, username, avatar_url)`)
      .single();
    
    if (error) throw error;

    try {
      const { ensureCosmeticsCached, getCachedPublicUser, cacheUserProfile } = require("../lib/userProfile");
      if (message.sender) {
        cacheUserProfile({ ...message.sender, avatar_url: message.sender.avatar_url });
      }
      await ensureCosmeticsCached([userId]);
      const pub = getCachedPublicUser(userId);
      if (pub) {
        message.sender = { ...(message.sender || {}), ...pub, id: userId };
        message.from = message.sender;
      }
    } catch {
      /* ignore cosmetics enrich */
    }
    
    // Broadcast to other group members via socket
    const io = req.app.get("io");
    if (io && message) {
      io.to(`group:${groupId}`).emit("group:message", {
        groupId,
        message,
      });
    }
    
    res.json({ message });
  } catch (err) {
    console.error("[Groups] Send error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Get group members
router.get("/:groupId/members", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    
    // Check membership
    const { data: myMembership } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (!myMembership) return res.status(403).json({ error: "Not a member" });
    
    let { data: members, error } = await supabase
      .from("group_members")
      .select(`
        joined_at,
        role,
        user:user_id (id, username, avatar_url)
      `)
      .eq("group_id", groupId);
    if (error && removals.isMissingSchema(error)) {
      ({ data: members, error } = await supabase
        .from("group_members")
        .select(`
          joined_at,
          user:user_id (id, username, avatar_url)
        `)
        .eq("group_id", groupId));
    }
    
    if (error) throw error;
    
    res.json({ 
      members: members.map(m => ({ ...m.user, joinedAt: m.joined_at, role: m.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.MEMBER })),
      isFull: members.length >= MAX_GROUP_SIZE
    });
  } catch (err) {
    console.error("[Groups] Members error:", err);
    console.error("[Groups] Stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch members", details: err.message });
  }
});

// Invite user to group
router.post("/:groupId/invite", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const { invitedUserId, invitedUsername, username } = req.body;
    const invitedIdentity = invitedUserId || invitedUsername || username;

    if (!invitedIdentity) {
      return res.status(400).json({ error: "invitedUserId or username required" });
    }

    let resolvedInvitedUserId = invitedIdentity;
    if (typeof invitedIdentity === "string") {
      const trimmed = invitedIdentity.trim();
      if (!trimmed) {
        return res.status(400).json({ error: "Invalid invite target" });
      }
      const isUuidLike = /^[0-9a-fA-F-]{32,36}$/.test(trimmed);
      if (!isUuidLike) {
        const { data: invitedUser, error: invitedLookupError } = await supabase
          .from("users")
          .select("id")
          .eq("username", trimmed)
          .maybeSingle();
        if (invitedLookupError) throw invitedLookupError;
        if (!invitedUser?.id) {
          return res.status(404).json({ error: "User not found" });
        }
        resolvedInvitedUserId = invitedUser.id;
      } else {
        resolvedInvitedUserId = trimmed;
      }
    }
    
    // Check if group has space
    const { count } = await supabase
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId);
    
    if (count >= MAX_GROUP_SIZE) {
      return res.status(400).json({ error: "Group is full (max 15 members)" });
    }
    
    // Check inviter is member
    const { data: inviter } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (!inviter) return res.status(403).json({ error: "Not a member" });
    
    // Check not already member
    const { data: existingMember } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", resolvedInvitedUserId)
      .maybeSingle();
    
    if (existingMember) return res.status(409).json({ error: "Already a member" });
    
    // Create invite
    const { data: invite, error } = await supabase
      .from("group_invites")
      .insert({
        group_id: groupId,
        invited_by: userId,
        invited_user_id: resolvedInvitedUserId,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ invite, message: "Invitation sent" });
  } catch (err) {
    console.error("[Groups] Invite error:", err);
    res.status(500).json({ error: "Failed to invite" });
  }
});

// Accept/decline invite
router.post("/invites/:inviteId/respond", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inviteId } = req.params;
    const { accept } = req.body;
    
    const { data: invite } = await supabase
      .from("group_invites")
      .select("*")
      .eq("id", inviteId)
      .eq("invited_user_id", userId)
      .eq("status", "pending")
      .single();
    
    if (!invite) return res.status(404).json({ error: "Invite not found" });
    
    if (!accept) {
      await supabase.from("group_invites").update({ status: "declined" }).eq("id", inviteId);
      return res.json({ message: "Invite declined" });
    }
    
    // Accept - add to group
    const cooldown = await readdBlocked(invite.group_id, userId);
    if (cooldown) return res.status(429).json(cooldown);
    await supabase.from("group_members").insert({
      group_id: invite.group_id,
      user_id: userId,
    });
    await removals.markReadded(invite.group_id, userId).catch(() => {});
    
    await supabase.from("group_invites").update({ status: "accepted" }).eq("id", inviteId);
    
    res.json({ message: "Joined group" });
  } catch (err) {
    console.error("[Groups] Respond error:", err);
    res.status(500).json({ error: "Failed to respond" });
  }
});

// Add member directly (friends only, no invite flow)
//
// Contract (all clients): 200 { message, user, group, alreadyMember? }.
// - user  = the added member in the `members[]` shape of GET /groups/my
// - group = the group in the GET /groups/my shape (fresh members[],
//           memberIds, memberCount, lastMessage)
// Sockets: `group:member:added` { groupId, user, memberCount, addedBy } to
// the group room (existing members, every tab), `group:invited` { group } to
// the new member's `user:<id>` room (every device), and the new member's
// sockets join `group:<id>` so messages / calls reach them without a reload.
router.post("/:groupId/members", requireAuth, async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { groupId } = req.params;
    const targetUserId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";

    if (!targetUserId || !isSafeId(targetUserId)) return res.status(400).json({ error: "userId required" });
    if (targetUserId === requesterId) return res.status(400).json({ error: "You are already a member" });

    // Requester must be a member
    if (!(await isGroupMember(groupId, requesterId))) {
      return res.status(403).json({ error: "Not a member of this group", code: "NOT_MEMBER" });
    }

    // Target must be an accepted friend of the requester. Friendship rows can
    // exist in both directions; `.maybeSingle()` used to fail on those pairs
    // and answer 403 for real friends.
    if (!(await areAcceptedFriends(requesterId, targetUserId))) {
      return res.status(403).json({ error: "You can only add your friends", code: "NOT_FRIENDS" });
    }

    const loadAdded = async () => {
      const { data } = await supabase
        .from("users")
        .select("id, username, avatar_url, status, is_admin")
        .eq("id", targetUserId)
        .maybeSingle();
      return publicMember(data);
    };
    const loadGroup = async () => {
      try {
        return await loadGroupById(groupId);
      } catch (err) {
        console.warn("[Groups] Add member: group reload failed:", err?.message || err);
        return null;
      }
    };

    // Already a member: idempotent success so a stale client (double tap,
    // second device, old list) repairs its state instead of showing an error.
    if (await isGroupMember(groupId, targetUserId)) {
      const [user, group] = await Promise.all([loadAdded(), loadGroup()]);
      return res.json({ message: "User is already a member", alreadyMember: true, user, group });
    }

    // Owner decision: a removed person can be added back right away, after
    // a 5 second cooldown (stops a remove/add flicker loop).
    const cooldown = await readdBlocked(groupId, targetUserId);
    if (cooldown) return res.status(429).json(cooldown);

    // Check group capacity
    const { count } = await supabase
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId);

    if ((count || 0) >= MAX_GROUP_SIZE) {
      return res.status(400).json({ error: "Group is full (max 15 members)", code: "GROUP_FULL" });
    }

    const { error: insertError } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, user_id: targetUserId });

    if (insertError && !isUniqueViolation(insertError)) throw insertError;
    await removals.markReadded(groupId, targetUserId).catch((err) => {
      console.warn("[Groups] Add member: readded mark failed:", err?.message || err);
    });

    const [user, group] = await Promise.all([loadAdded(), loadGroup()]);
    const memberCount = group?.memberCount ?? ((count || 0) + 1);

    const io = req.app.get("io");
    if (io) {
      // Existing members (all their tabs/devices are in the group room).
      io.to(`group:${groupId}`).emit("group:member:added", {
        groupId,
        user,
        memberCount,
        addedBy: requesterId,
      });
      // The new member: every device, and into the room for live messages.
      try {
        io.in?.(`user:${targetUserId}`)?.socketsJoin?.(`group:${groupId}`);
      } catch (err) {
        console.warn("[Groups] Add member: socketsJoin failed:", err?.message || err);
      }
      io.to(`user:${targetUserId}`).emit("group:invited", {
        group: group || { id: groupId, memberCount },
        invitedBy: requesterId,
      });
    }

    res.json({ message: "Member added", user, group });
  } catch (err) {
    console.error("[Groups] Add member error:", err);
    res.status(500).json({ error: "Failed to add member" });
  }
});

// Leave group
//
// Sockets: `group:member:left` { groupId, userId, message, memberCount,
// ownerId } to the group room (the system row "Can gruptan ayrıldı" rides
// along), `group:left` { groupId } to the leaver's own devices. The leaver is
// taken out of a running group call and out of the socket room.
router.post("/:groupId/leave", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;

    const { data: group } = await supabase
      .from("groups")
      .select("created_by")
      .eq("id", groupId)
      .single();

    if (!(await isGroupMember(groupId, userId))) {
      // Leaving a group you were removed from = drop it from your list.
      await removals.dismissRemoval(groupId, userId).catch(() => {});
      return res.json({ message: "Left group", notMember: true });
    }

    let ownerId = group?.created_by || null;
    if (group?.created_by === userId) {
      // Remaining members (excluding the creator): a group admin takes over
      // first, otherwise the earliest-joined member.
      let { data: remaining, error: remainingError } = await supabase
        .from("group_members")
        .select("user_id, joined_at, role")
        .eq("group_id", groupId)
        .neq("user_id", userId)
        .order("joined_at", { ascending: true })
        .limit(MAX_GROUP_SIZE);
      if (remainingError && removals.isMissingSchema(remainingError)) {
        ({ data: remaining } = await supabase
          .from("group_members")
          .select("user_id, joined_at")
          .eq("group_id", groupId)
          .neq("user_id", userId)
          .order("joined_at", { ascending: true })
          .limit(MAX_GROUP_SIZE));
      }

      if (!remaining || remaining.length === 0) {
        // No other members — delete the group entirely
        await supabase.from("group_members").delete().eq("group_id", groupId);
        await supabase.from("groups").delete().eq("id", groupId);
        const io = req.app.get("io");
        if (io) io.to(`user:${userId}`).emit("group:left", { groupId, deleted: true });
        detachFromGroupLive(io, groupId, userId);
        return res.json({ message: "Left group", deleted: true });
      }

      const heir = remaining.find((m) => m.role === ROLES.ADMIN) || remaining[0];
      ownerId = heir.user_id;
      await supabase.from("groups").update({ created_by: ownerId }).eq("id", groupId);
    }

    await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);

    const message = await insertMemberEvent({
      groupId,
      type: "member_left",
      actorId: userId,
      actorName: req.user.username,
    });
    const { count } = await supabase
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId);

    const io = req.app.get("io");
    if (io) {
      detachFromGroupLive(io, groupId, userId);
      io.to(`group:${groupId}`).emit("group:member:left", {
        groupId,
        userId,
        message,
        memberCount: count ?? null,
        ownerId,
      });
      io.to(`user:${userId}`).emit("group:left", { groupId });
    }

    res.json({ message: "Left group", ownerId });
  } catch (err) {
    console.error("[Groups] Leave error:", err);
    res.status(500).json({ error: "Failed to leave" });
  }
});

// Remove a member (owner decisions 25.10.2026)
//
// Owner removes anyone but themself; a group admin removes plain members.
// Body: { reason? } ≤ 140 chars, shown only to the removed person (never in
// the system row). The removed person keeps reading the history up to this
// moment and gets no push or in-app notification; their open chat turns
// read-only through `group:removed`.
// Sockets: `group:member:removed` { groupId, userId, by, message, memberCount }
// to the group room, `group:removed` { groupId, by, byUsername, reason,
// removedAt, readUntil } to the removed person's devices.
router.post("/:groupId/members/:userId/remove", requireAuth, async (req, res) => {
  try {
    const actorId = req.user.id;
    const { groupId } = req.params;
    const targetId = String(req.params.userId || "").trim();
    if (!isSafeId(groupId) || !isSafeId(targetId)) return res.status(400).json({ error: "Invalid id" });

    const parsed = normalizeReason(req.body?.reason);
    if (!parsed.ok) {
      return res.status(400).json({ error: "Reason must be 140 characters or fewer", code: parsed.code });
    }

    const { data: group } = await supabase
      .from("groups")
      .select("id, created_by")
      .eq("id", groupId)
      .maybeSingle();
    if (!group) return res.status(404).json({ error: "Group not found", code: "NOT_FOUND" });

    const [actor, target] = await Promise.all([
      removals.getMemberRole(groupId, actorId),
      targetId === actorId ? Promise.resolve(null) : removals.getMemberRole(groupId, targetId),
    ]);
    const verdict = canRemoveMember({
      actorId,
      targetId,
      ownerId: group.created_by,
      actorRole: actor?.role,
      targetRole: target?.role,
      actorIsMember: Boolean(actor),
      targetIsMember: Boolean(target),
    });
    if (!verdict.ok) {
      const messages = {
        NOT_MEMBER: "Not a member of this group",
        CANNOT_REMOVE_SELF: "Use leave to exit the group",
        NOT_ALLOWED: "You can't remove this member",
        CANNOT_REMOVE_OWNER: "The owner can't be removed",
        NOT_FOUND: "Not a member of this group",
      };
      return res.status(verdict.status).json({ error: messages[verdict.code] || "Not allowed", code: verdict.code });
    }

    const wait = takeRemoveSlot(actorId);
    if (wait > 0) {
      res.set("Retry-After", String(Math.ceil(wait / 1000)));
      return res.status(429).json({ error: "Too many removals. Try again in a minute.", code: "RATE_LIMITED", retryAfterMs: wait });
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", targetId)
      .select("user_id");
    if (deleteError) throw deleteError;
    if (Array.isArray(deleted) && deleted.length === 0) {
      return res.status(404).json({ error: "Not a member of this group", code: "NOT_FOUND" });
    }

    const { data: targetUser } = await supabase
      .from("users")
      .select("id, username")
      .eq("id", targetId)
      .maybeSingle();

    const message = await insertMemberEvent({
      groupId,
      type: "member_removed",
      actorId,
      actorName: req.user.username,
      targetId,
      targetName: targetUser?.username || null,
    });
    const removedAt = message?.created_at || new Date().toISOString();
    await removals
      .recordRemoval({
        groupId,
        userId: targetId,
        removedBy: actorId,
        reason: parsed.reason,
        removedAt,
        readUntil: removedAt,
      })
      .catch((err) => console.warn("[Groups] removal record failed:", err?.message || err));

    const { count } = await supabase
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId);

    const io = req.app.get("io");
    if (io) {
      detachFromGroupLive(io, groupId, targetId);
      io.to(`group:${groupId}`).emit("group:member:removed", {
        groupId,
        userId: targetId,
        by: actorId,
        message,
        memberCount: count ?? null,
      });
      io.to(`user:${targetId}`).emit("group:removed", {
        groupId,
        by: actorId,
        byUsername: req.user.username || null,
        byName: req.user.display_name || req.user.displayName || null,
        reason: parsed.reason,
        removedAt,
        readUntil: removedAt,
        message,
      });
    }

    res.json({ message: "Member removed", userId: targetId, memberCount: count ?? null, systemMessage: message });
  } catch (err) {
    console.error("[Groups] Remove member error:", err);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// Make / unmake a group admin. Owner only. Body: { role: "admin" | "member" }.
// Socket: `group:member:role` { groupId, userId, role } to the group room.
router.patch("/:groupId/members/:userId/role", requireAuth, async (req, res) => {
  try {
    const actorId = req.user.id;
    const { groupId } = req.params;
    const targetId = String(req.params.userId || "").trim();
    if (!isSafeId(groupId) || !isSafeId(targetId)) return res.status(400).json({ error: "Invalid id" });
    const role = req.body?.role;

    const { data: group } = await supabase
      .from("groups")
      .select("id, created_by")
      .eq("id", groupId)
      .maybeSingle();
    if (!group) return res.status(404).json({ error: "Group not found", code: "NOT_FOUND" });

    const target = await removals.getMemberRole(groupId, targetId);
    const verdict = canSetRole({ actorId, targetId, ownerId: group.created_by, role, targetIsMember: Boolean(target) });
    if (!verdict.ok) return res.status(verdict.status).json({ error: "Not allowed", code: verdict.code });

    const { error } = await supabase
      .from("group_members")
      .update({ role })
      .eq("group_id", groupId)
      .eq("user_id", targetId);
    if (error) {
      if (removals.isMissingSchema(error)) {
        return res.status(503).json({ error: "Group roles are not available yet", code: "ROLES_UNAVAILABLE" });
      }
      throw error;
    }

    const io = req.app.get("io");
    if (io) io.to(`group:${groupId}`).emit("group:member:role", { groupId, userId: targetId, role });
    res.json({ userId: targetId, role });
  } catch (err) {
    console.error("[Groups] Role error:", err);
    res.status(500).json({ error: "Failed to change role" });
  }
});

// The removed person drops the read-only chat ("Sohbetten kaldır").
router.delete("/:groupId/removed-view", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    if (!isSafeId(groupId)) return res.status(400).json({ error: "Invalid id" });
    await removals.dismissRemoval(groupId, userId);
    const io = req.app.get("io");
    if (io) io.to(`user:${userId}`).emit("group:left", { groupId });
    res.json({ ok: true });
  } catch (err) {
    console.error("[Groups] Removed view error:", err);
    res.status(500).json({ error: "Failed to remove chat" });
  }
});

// Rename group. Any member may rename (like the group photo); every member's
// list and open chat header update live through group:renamed.
router.post("/:groupId/rename", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const checked = normalizeGroupName(req.body?.name);
    if (!checked.ok) return res.status(400).json({ error: checked.error, code: checked.code });

    const { data: group, error: fetchError } = await supabase
      .from("groups")
      .select("created_by, name")
      .eq("id", groupId)
      .maybeSingle();
    if (fetchError || !group) return res.status(404).json({ error: "Group not found", code: "NOT_FOUND" });

    const isMember = await isGroupMember(groupId, userId);
    if (!canRenameGroup({ userId, createdBy: group.created_by, isMember })) {
      return res.status(403).json({ error: "Only group members can rename the group", code: "NOT_MEMBER" });
    }

    if (group.name !== checked.name) {
      const { error } = await supabase
        .from("groups")
        .update({ name: checked.name, updated_at: new Date().toISOString() })
        .eq("id", groupId);
      if (error) throw error;

      const io = req.app.get("io");
      if (io) {
        io.to(`group:${groupId}`).emit("group:renamed", {
          groupId,
          name: checked.name,
          renamedBy: userId,
          renamedByUsername: req.user.username || null,
        });
      }
    }
    res.json({ success: true, name: checked.name });
  } catch (err) {
    console.error("[Groups] Rename error:", err);
    res.status(500).json({ error: "Failed to rename group", code: "SERVER" });
  }
});

// Delete group (creator only)
router.delete("/:groupId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;

    // Check if user is creator
    const { data: group, error: fetchError } = await supabase
      .from("groups")
      .select("created_by")
      .eq("id", groupId)
      .single();

    if (fetchError || !group) return res.status(404).json({ error: "Group not found" });
    if (group.created_by !== userId) return res.status(403).json({ error: "Only creator can delete group" });

    // Notify members via socket BEFORE deletion
    const io = req.app.get("io");
    if (io) {
      io.to(`group:${groupId}`).emit("group:deleted", { groupId });
    }

    // Delete in order (members first, then messages, then group)
    // Note: Supabase doesn't support multi-table transactions in JS client easily
    // We delete in dependency order to minimize issues
    await supabase.from("group_members").delete().eq("group_id", groupId);
    await supabase.from("group_messages").delete().eq("group_id", groupId);
    await supabase.from("groups").delete().eq("id", groupId);

    res.json({ success: true, message: "Group deleted" });
  } catch (err) {
    console.error("[Groups] Delete error:", err);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

// Update / remove group photo. Any member may change it (like renaming a
// group chat in iMessage); the URL must come from Descall's own storage.
async function applyGroupAvatar(req, res, rawUrl) {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const checked = validateGroupAvatarUrl(rawUrl);
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    const { data: group, error: fetchError } = await supabase
      .from("groups")
      .select("created_by")
      .eq("id", groupId)
      .maybeSingle();
    if (fetchError || !group) return res.status(404).json({ error: "Group not found" });

    const isMember = await isGroupMember(groupId, userId);
    if (!canEditGroupAvatar({ userId, createdBy: group.created_by, isMember })) {
      return res.status(403).json({ error: "Only group members can change the group photo" });
    }

    const { error } = await supabase
      .from("groups")
      .update({ avatar_url: checked.url })
      .eq("id", groupId);
    if (error) throw error;

    const io = req.app.get("io");
    if (io) {
      io.to(`group:${groupId}`).emit("group:avatar:updated", {
        groupId,
        avatarUrl: checked.url,
        updatedBy: userId,
      });
    }
    return res.json({ success: true, avatarUrl: checked.url });
  } catch (err) {
    console.error("[Groups] Avatar update error:", err);
    return res.status(500).json({ error: "Failed to update avatar" });
  }
}

router.post("/:groupId/avatar", requireAuth, (req, res) => {
  const raw = req.body?.avatarUrl;
  if (raw === undefined) return res.status(400).json({ error: "Avatar URL required" });
  return applyGroupAvatar(req, res, raw);
});

router.delete("/:groupId/avatar", requireAuth, (req, res) => applyGroupAvatar(req, res, null));

module.exports = router;
