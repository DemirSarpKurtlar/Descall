"use strict";

const supabase = require("../../db/supabase");
const { isBlockedEitherWay } = require("../blocking");
const { createPending } = require("./agentActions");
const { findUser, friendshipRow, resolveRecipient, searchPeople } = require("./sendAsUser");
const { polishOutboundText } = require("./agentDraft");
const {
  hasPermission,
  Permissions,
  resolveChannelPermissions,
} = require("../serverPermissions");

function agentOff() {
  return {
    error: "Personal agent is off. Ask the user to enable it in Dima settings, then try again. You may still draft the message in chat for them to copy.",
  };
}

function displayName(user) {
  if (!user) return null;
  return user.display_name || user.displayName || user.username || null;
}

async function assertAgent(ctx) {
  if (ctx?.agentEnabled === false) return agentOff();
  return null;
}

async function stage(ctx, { type, payload, preview }) {
  const gated = await assertAgent(ctx);
  if (gated) return gated;
  const out = await createPending({
    userId: ctx.userId,
    conversationId: ctx.conversationId || null,
    type,
    payload,
    preview,
  });
  if (out.error) return { error: out.error };
  ctx.onPendingAction?.(out.action);
  return {
    pending_action: true,
    action_id: out.action.id,
    type: out.action.type,
    preview: out.action.preview,
    expires_at: out.action.expiresAt,
    note: "NOT SENT. Show the user this draft and tell them to tap Approve on the card. Never claim it was sent.",
  };
}

async function list_friends(ctx, args = {}) {
  const query = String(args.query || "").trim().toLowerCase();
  const { data: rows, error } = await supabase
    .from("friendships")
    .select("user_id, friend_id")
    .or(`user_id.eq.${ctx.userId},friend_id.eq.${ctx.userId}`)
    .eq("status", "accepted")
    .limit(200);
  if (error) throw error;
  const ids = [];
  for (const row of rows || []) {
    const other = row.user_id === ctx.userId ? row.friend_id : row.user_id;
    if (other && !ids.includes(other)) ids.push(other);
  }
  if (!ids.length) return { friends: [], count: 0 };
  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("id, username, display_name, custom_status")
    .in("id", ids);
  if (uErr) throw uErr;
  let friends = (users || []).map((u) => ({
    id: u.id,
    username: u.username,
    display_name: u.display_name || null,
    custom_status: u.custom_status || null,
  }));
  if (query) {
    friends = friends.filter(
      (f) =>
        String(f.username || "").toLowerCase().includes(query) ||
        String(f.display_name || "").toLowerCase().includes(query),
    );
  }
  return { friends, count: friends.length };
}

async function list_friend_requests(ctx) {
  const { data: incoming, error } = await supabase
    .from("friendships")
    .select("user_id")
    .eq("friend_id", ctx.userId)
    .eq("status", "pending")
    .limit(50);
  if (error) throw error;
  const { data: outgoing, error: oErr } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", ctx.userId)
    .eq("status", "pending")
    .limit(50);
  if (oErr) throw oErr;
  const inIds = (incoming || []).map((r) => r.user_id).filter(Boolean);
  const outIds = (outgoing || []).map((r) => r.friend_id).filter(Boolean);
  const allIds = [...new Set([...inIds, ...outIds])];
  let byId = new Map();
  if (allIds.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, username, display_name")
      .in("id", allIds);
    byId = new Map((users || []).map((u) => [u.id, u]));
  }
  const mapUser = (id) => {
    const u = byId.get(id);
    return { id, username: u?.username || null, display_name: u?.display_name || null };
  };
  return {
    incoming: inIds.map(mapUser),
    outgoing: outIds.map(mapUser),
  };
}

async function list_groups(ctx) {
  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", ctx.userId)
    .limit(50);
  if (error) throw error;
  const ids = (memberships || []).map((m) => m.group_id).filter(Boolean);
  if (!ids.length) return { groups: [] };
  const { data: groups, error: gErr } = await supabase
    .from("groups")
    .select("id, name, created_by")
    .in("id", ids);
  if (gErr) throw gErr;
  return {
    groups: (groups || []).map((g) => ({
      id: g.id,
      name: g.name,
      is_owner: g.created_by === ctx.userId,
    })),
  };
}

async function get_my_status(ctx) {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, custom_status, presence_status, bio")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: "User not found." };
  return {
    id: data.id,
    username: data.username,
    display_name: data.display_name || null,
    custom_status: data.custom_status || null,
    presence_status: data.presence_status || "online",
    bio: data.bio || null,
  };
}

async function get_dm_summary(ctx, args = {}) {
  const peer = await findUser({ userId: args.user_id || args.peer_id, username: args.username });
  if (!peer) return { error: "Provide a friend username or user_id." };
  if (peer.id === ctx.userId) return { error: "That is your own account." };
  if (await isBlockedEitherWay(ctx.userId, peer.id)) {
    return { error: "You can't view this conversation." };
  }
  const { data, error } = await supabase
    .from("dm_messages")
    .select("id, from_user_id, to_user_id, content, created_at")
    .or(
      `and(from_user_id.eq.${ctx.userId},to_user_id.eq.${peer.id}),and(from_user_id.eq.${peer.id},to_user_id.eq.${ctx.userId})`,
    )
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  const messages = (data || [])
    .slice()
    .reverse()
    .map((m) => ({
      from: m.from_user_id === ctx.userId ? "you" : peer.username,
      text: String(m.content || "").startsWith("__voice__:") ? "[voice message]" : String(m.content || "").slice(0, 400),
      at: m.created_at,
    }));
  return {
    peer: { id: peer.id, username: peer.username, display_name: peer.display_name || null },
    recent: messages,
    count: messages.length,
  };
}

async function search_messages(ctx, args = {}) {
  const query = String(args.query || "").trim();
  if (query.length < 2) return { error: "Search query is too short." };
  const like = `%${query.replace(/[%_]/g, "")}%`;
  const out = { query, dms: [], groups: [] };

  const { data: dms } = await supabase
    .from("dm_messages")
    .select("id, from_user_id, to_user_id, content, created_at")
    .or(`from_user_id.eq.${ctx.userId},to_user_id.eq.${ctx.userId}`)
    .ilike("content", like)
    .order("created_at", { ascending: false })
    .limit(15);
  out.dms = (dms || [])
    .filter((m) => !String(m.content || "").startsWith("__voice__:"))
    .map((m) => ({
      id: m.id,
      with_user_id: m.from_user_id === ctx.userId ? m.to_user_id : m.from_user_id,
      from_you: m.from_user_id === ctx.userId,
      text: String(m.content || "").slice(0, 240),
      at: m.created_at,
    }));

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", ctx.userId)
    .limit(40);
  const groupIds = (memberships || []).map((m) => m.group_id).filter(Boolean);
  if (groupIds.length) {
    const { data: gmsgs } = await supabase
      .from("group_messages")
      .select("id, group_id, sender_id, content, created_at")
      .in("group_id", groupIds)
      .ilike("content", like)
      .order("created_at", { ascending: false })
      .limit(15);
    out.groups = (gmsgs || []).map((m) => ({
      id: m.id,
      group_id: m.group_id,
      from_you: m.sender_id === ctx.userId,
      text: String(m.content || "").slice(0, 240),
      at: m.created_at,
    }));
  }
  return out;
}

async function recentThread(userId, peerId) {
  const { data, error } = await supabase
    .from("dm_messages")
    .select("id, from_user_id, to_user_id, content, created_at")
    .or(
      `and(from_user_id.eq.${userId},to_user_id.eq.${peerId}),and(from_user_id.eq.${peerId},to_user_id.eq.${userId})`,
    )
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw error;
  return (data || [])
    .slice()
    .reverse()
    .map((m) => ({
      from: m.from_user_id === userId ? "you" : "them",
      text: String(m.content || "").startsWith("__voice__:") ? "[voice message]" : String(m.content || "").slice(0, 280),
      at: m.created_at,
    }));
}

async function search_people(ctx, args = {}) {
  const query = String(args.query || args.username || "").trim();
  if (query.length < 2) return { error: "Search query is too short." };
  return searchPeople(ctx.userId, query, { limit: 8 });
}

async function compose_direct_message(ctx, args = {}) {
  const gated = await assertAgent(ctx);
  if (gated) return gated;
  const polished = polishOutboundText(args.text || args.message);
  if (polished.error) return { error: polished.error };
  const text = polished.text;
  const resolved = await resolveRecipient(ctx.userId, { userId: args.user_id, username: args.username });
  if (resolved.error) {
    return {
      error: resolved.error,
      candidates: resolved.candidates || undefined,
    };
  }
  const peer = resolved.user;
  if (peer.id === ctx.userId) return { error: "You cannot message yourself." };
  if (await isBlockedEitherWay(ctx.userId, peer.id)) {
    return { error: "You can't message this user." };
  }
  const rows = await friendshipRow(ctx.userId, peer.id);
  const isFriend = rows.some((r) => r.status === "accepted");
  const thread = await recentThread(ctx.userId, peer.id).catch(() => []);
  const staged = await stage(ctx, {
    type: "dm",
    payload: { toUserId: peer.id, text },
    preview: {
      title: "Direct message",
      body: text,
      recipient: {
        id: peer.id,
        username: peer.username,
        displayName: displayName(peer),
        avatarUrl: peer.avatar_url || peer.avatarUrl || null,
      },
      warning: isFriend ? null : "You are not friends with this user yet. The message will still send as you if you approve.",
    },
  });
  if (staged.error) return staged;
  return {
    ...staged,
    recipient: { id: peer.id, username: peer.username, display_name: displayName(peer) },
    recent_thread: thread,
    quality_note:
      "Write as the user, in their language and tone. If the user dictated the text, keep that wording. If they asked you to write it, keep it natural — not corporate, not as Dima.",
  };
}

async function compose_group_message(ctx, args = {}) {
  const gated = await assertAgent(ctx);
  if (gated) return gated;
  const polished = polishOutboundText(args.text || args.message);
  if (polished.error) return { error: polished.error };
  const text = polished.text;
  const groupId = String(args.group_id || "").trim();
  if (!groupId) return { error: "group_id is required. Use list_groups." };
  const { data: member } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!member) return { error: "You are not a member of this group." };
  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return { error: "Group not found." };
  return stage(ctx, {
    type: "group",
    payload: { groupId, text },
    preview: {
      title: "Group message",
      body: text,
      recipient: { id: group.id, username: group.name, displayName: group.name },
    },
  });
}

async function compose_channel_message(ctx, args = {}) {
  const gated = await assertAgent(ctx);
  if (gated) return gated;
  const polished = polishOutboundText(args.text || args.message);
  if (polished.error) return { error: polished.error };
  const text = polished.text;
  const channelId = String(args.channel_id || "").trim();
  if (!channelId) return { error: "channel_id is required. Use get_server_channels." };
  const { data: channel } = await supabase
    .from("server_channels")
    .select("id, server_id, name, type")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return { error: "Channel not found." };
  const resolved = await resolveChannelPermissions(supabase, channel.server_id, ctx.userId, channelId);
  if (!resolved.isMember) return { error: "You are not a member of this server." };
  if (!hasPermission(resolved.bits, Permissions.SEND_MESSAGES) || !hasPermission(resolved.bits, Permissions.VIEW_CHANNEL)) {
    return { error: "You don't have permission to send messages in this channel." };
  }
  return stage(ctx, {
    type: "channel",
    payload: { channelId, serverId: channel.server_id, text },
    preview: {
      title: "Channel message",
      body: text,
      recipient: {
        id: channel.id,
        username: `#${channel.name}`,
        displayName: `#${channel.name}`,
      },
    },
  });
}

async function compose_friend_request(ctx, args = {}) {
  const gated = await assertAgent(ctx);
  if (gated) return gated;
  const peer = await findUser({ userId: args.user_id, username: args.username });
  if (!peer) return { error: "User not found." };
  if (peer.id === ctx.userId) return { error: "Cannot add yourself." };
  if (await isBlockedEitherWay(ctx.userId, peer.id)) {
    return { error: "You can't send a request to this user." };
  }
  const rows = await friendshipRow(ctx.userId, peer.id);
  if (rows.some((r) => r.status === "accepted")) return { error: "Already friends." };
  if (rows.some((r) => r.status === "pending")) return { error: "A friend request is already pending." };
  return stage(ctx, {
    type: "friend_request",
    payload: { userId: peer.id, username: peer.username },
    preview: {
      title: "Friend request",
      body: `Send a friend request to ${peer.username}`,
      recipient: { id: peer.id, username: peer.username, displayName: displayName(peer) },
    },
  });
}

async function compose_friend_decision(ctx, args = {}) {
  const gated = await assertAgent(ctx);
  if (gated) return gated;
  const decision = String(args.decision || args.action || "accept").toLowerCase();
  const type = decision === "decline" || decision === "reject" ? "friend_decline" : "friend_accept";
  const fromUserId = String(args.from_user_id || args.user_id || "").trim();
  let peer = fromUserId ? await findUser({ userId: fromUserId, username: args.username }) : await findUser({ username: args.username });
  if (!peer) return { error: "Whose request? Provide username or from_user_id from list_friend_requests." };
  const { data: existing } = await supabase
    .from("friendships")
    .select("id")
    .eq("user_id", peer.id)
    .eq("friend_id", ctx.userId)
    .eq("status", "pending")
    .maybeSingle();
  if (!existing) return { error: "No pending request from that user." };
  const verb = type === "friend_accept" ? "Accept" : "Decline";
  return stage(ctx, {
    type,
    payload: { fromUserId: peer.id },
    preview: {
      title: `${verb} friend request`,
      body: `${verb} friend request from ${peer.username}`,
      recipient: { id: peer.id, username: peer.username, displayName: displayName(peer) },
    },
  });
}

async function compose_status_update(ctx, args = {}) {
  const gated = await assertAgent(ctx);
  if (gated) return gated;
  const kind = String(args.kind || args.type || "presence").toLowerCase();
  if (kind === "custom" || args.custom_status !== undefined || args.customStatus !== undefined) {
    const text = String(args.custom_status ?? args.customStatus ?? args.text ?? "").trim();
    return stage(ctx, {
      type: "custom_status",
      payload: { text },
      preview: {
        title: "Custom status",
        body: text ? `Set custom status to “${text}”` : "Clear custom status",
      },
    });
  }
  const status = String(args.status || args.presence || "").toLowerCase();
  const allowed = ["online", "idle", "dnd", "invisible"];
  if (!allowed.includes(status)) {
    return { error: "status must be online, idle, dnd, or invisible." };
  }
  return stage(ctx, {
    type: "presence_status",
    payload: { status },
    preview: {
      title: "Presence",
      body: `Set presence to ${status}`,
    },
  });
}

const HANDLERS = {
  list_friends,
  list_friend_requests,
  list_groups,
  get_my_status,
  get_dm_summary,
  search_messages,
  search_people,
  compose_direct_message,
  compose_group_message,
  compose_channel_message,
  compose_friend_request,
  compose_friend_decision,
  compose_status_update,
};

const CATALOG = [
  { name: "list_friends", description: "List the signed-in user's Descall friends (optional query filter).", parameters: { type: "object", properties: { query: { type: "string" } } } },
  { name: "list_friend_requests", description: "List incoming and outgoing pending friend requests.", parameters: { type: "object", properties: {} } },
  { name: "list_groups", description: "List group chats the signed-in user belongs to.", parameters: { type: "object", properties: {} } },
  { name: "get_my_status", description: "Get the signed-in user's presence, custom status, and bio.", parameters: { type: "object", properties: {} } },
  { name: "get_dm_summary", description: "Summarize recent DMs with a specific person the user already talks to. Only their conversation.", parameters: { type: "object", properties: { username: { type: "string" }, user_id: { type: "string" } } } },
  { name: "search_messages", description: "Search the user's own DMs and group messages they belong to.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "search_people", description: "Find people the user can message: friends, recent DMs, or username/display-name matches. Use before composing if the name is incomplete.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "compose_direct_message", description: "Stage a high-quality DM to send as the signed-in user. Does NOT send until the user approves in the app. One recipient only. Prefer exact username or user_id from search_people.", parameters: { type: "object", properties: { username: { type: "string" }, user_id: { type: "string" }, text: { type: "string", description: "Full message to send, already written in the user's language and requested tone. Not JSON." } }, required: ["text"] } },
  { name: "compose_group_message", description: "Stage a group chat message as the signed-in user. Does NOT send until approved.", parameters: { type: "object", properties: { group_id: { type: "string" }, text: { type: "string" } }, required: ["group_id", "text"] } },
  { name: "compose_channel_message", description: "Stage a server channel message as the signed-in user. Does NOT send until approved.", parameters: { type: "object", properties: { channel_id: { type: "string" }, text: { type: "string" } }, required: ["channel_id", "text"] } },
  { name: "compose_friend_request", description: "Stage a friend request as the signed-in user. Does NOT send until approved.", parameters: { type: "object", properties: { username: { type: "string" }, user_id: { type: "string" } } } },
  { name: "compose_friend_decision", description: "Stage accepting or declining an incoming friend request. Does NOT apply until approved.", parameters: { type: "object", properties: { username: { type: "string" }, from_user_id: { type: "string" }, decision: { type: "string", description: "accept or decline" } } } },
  { name: "compose_status_update", description: "Stage a presence (online/idle/dnd/invisible) or custom status change. Does NOT apply until approved.", parameters: { type: "object", properties: { kind: { type: "string" }, status: { type: "string" }, custom_status: { type: "string" } } } },
];

module.exports = {
  HANDLERS,
  CATALOG,
};
