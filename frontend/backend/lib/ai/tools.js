"use strict";

const supabase = require("../../db/supabase");
const {
  resolveMemberPermissions,
  resolveChannelPermissions,
  permissionsToFlags,
  hasPermission,
  Permissions,
} = require("../serverPermissions");
const { logInternal } = require("./sanitize");
const { webSearch } = require("./webSearch");
const memories = require("./memories");
const agentTools = require("./agentTools");
const { normalizeHandle } = require("./agentDraft");

/** Full catalog — implemented tools execute; others return a stub. */
const TOOL_CATALOG = [
  { name: "get_current_user", description: "Get the signed-in user's public profile (id, username, display name).", parameters: { type: "object", properties: {} } },
  { name: "get_user_profile", description: "Get a public profile by user id or username. Only public fields.", parameters: { type: "object", properties: { user_id: { type: "string" }, username: { type: "string" } } } },
  { name: "get_user_servers", description: "List servers the signed-in user is a member of.", parameters: { type: "object", properties: {} } },
  { name: "get_server_info", description: "Get basic info about a server the user belongs to.", parameters: { type: "object", properties: { server_id: { type: "string" } }, required: ["server_id"] } },
  { name: "get_server_channels", description: "List channels in a server the user can see.", parameters: { type: "object", properties: { server_id: { type: "string" } }, required: ["server_id"] } },
  { name: "get_channel_info", description: "Get info about a channel if the user can view it.", parameters: { type: "object", properties: { channel_id: { type: "string" }, server_id: { type: "string" } }, required: ["channel_id"] } },
  { name: "get_user_roles", description: "List roles assigned to the signed-in user on a server.", parameters: { type: "object", properties: { server_id: { type: "string" } }, required: ["server_id"] } },
  { name: "get_server_roles", description: "List roles defined on a server the user belongs to.", parameters: { type: "object", properties: { server_id: { type: "string" } }, required: ["server_id"] } },
  { name: "get_user_permissions", description: "Resolve effective permission flags for the signed-in user on a server (optional channel).", parameters: { type: "object", properties: { server_id: { type: "string" }, channel_id: { type: "string" } }, required: ["server_id"] } },
  { name: "web_search", description: "Search the public web for current information. Returns titled sources with URLs and snippets. Use when the user needs up-to-date or external facts.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "remember_fact", description: "Store a short durable fact/preference about the user (e.g. after they say hatırla / remember).", parameters: { type: "object", properties: { fact: { type: "string" } }, required: ["fact"] } },
  { name: "forget_fact", description: "Forget memories matching a query, or clear all if query empty (e.g. after unut).", parameters: { type: "object", properties: { fact: { type: "string" }, query: { type: "string" } } } },
  { name: "list_memories", description: "List what you currently remember about this user (ne hatırlıyorsun).", parameters: { type: "object", properties: {} } },
  ...agentTools.CATALOG,
];

const IMPLEMENTED = new Set([
  "get_current_user",
  "get_user_profile",
  "get_user_servers",
  "get_server_info",
  "get_server_channels",
  "get_channel_info",
  "get_user_roles",
  "get_server_roles",
  "get_user_permissions",
  "web_search",
  "remember_fact",
  "forget_fact",
  "list_memories",
  ...Object.keys(agentTools.HANDLERS),
]);

function toGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return { type: "OBJECT", properties: {} };
  }
  const typeMap = {
    object: "OBJECT",
    string: "STRING",
    number: "NUMBER",
    integer: "INTEGER",
    boolean: "BOOLEAN",
    array: "ARRAY",
  };
  const out = {
    type: typeMap[String(schema.type || "object").toLowerCase()] || "OBJECT",
  };
  if (schema.description) out.description = schema.description;
  if (schema.properties && typeof schema.properties === "object") {
    out.properties = {};
    for (const [key, val] of Object.entries(schema.properties)) {
      out.properties[key] = toGeminiSchema(val);
    }
  }
  if (Array.isArray(schema.required) && schema.required.length) {
    out.required = schema.required.map(String);
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  return out;
}

function geminiFunctionDeclarations() {
  return TOOL_CATALOG.filter((t) => IMPLEMENTED.has(t.name) && !t.stub).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.parameters || { type: "object", properties: {} }),
  }));
}

function toolCatalogPublic() {
  return TOOL_CATALOG.map(({ name, description, stub }) => ({
    name,
    description,
    implemented: IMPLEMENTED.has(name) && !stub,
  }));
}

async function assertServerMember(userId, serverId) {
  const { data: server } = await supabase
    .from("servers")
    .select("id, name, icon_url, description, owner_id, is_public, created_at")
    .eq("id", serverId)
    .maybeSingle();
  if (!server) return { ok: false, error: "Server not found." };
  if (server.owner_id === userId) return { ok: true, server, isOwner: true };
  const { data: membership } = await supabase
    .from("server_members")
    .select("server_id, nickname, joined_at")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return { ok: false, error: "You are not a member of this server." };
  return { ok: true, server, membership, isOwner: false };
}

async function get_current_user(ctx) {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, bio, custom_status, created_at")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: "User not found." };
  return {
    id: data.id,
    username: data.username,
    display_name: data.display_name || null,
    avatar_url: data.avatar_url || null,
    bio: data.bio || null,
    custom_status: data.custom_status || null,
  };
}

async function get_user_profile(ctx, args) {
  const userId = String(args.user_id || "").trim();
  const username = normalizeHandle(args.username);
  let q = supabase
    .from("users")
    .select("id, username, display_name, avatar_url, bio, custom_status");
  if (userId) q = q.eq("id", userId);
  else if (username) q = q.ilike("username", username);
  else return { error: "Provide user_id or username." };
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return { error: "Profile not found." };
  return {
    id: data.id,
    username: data.username,
    display_name: data.display_name || null,
    avatar_url: data.avatar_url || null,
    bio: data.bio || null,
    custom_status: data.custom_status || null,
  };
}

async function get_user_servers(ctx) {
  const { data: memberships, error } = await supabase
    .from("server_members")
    .select("server_id, nickname, joined_at")
    .eq("user_id", ctx.userId)
    .limit(100);
  if (error) throw error;
  const ids = (memberships || []).map((m) => m.server_id);
  const { data: owned } = await supabase
    .from("servers")
    .select("id, name, icon_url, description, owner_id, is_public")
    .eq("owner_id", ctx.userId)
    .limit(50);
  const ownedIds = new Set((owned || []).map((s) => s.id));
  const allIds = [...new Set([...ids, ...ownedIds])];
  if (!allIds.length) return { servers: [] };
  const { data: servers, error: sErr } = await supabase
    .from("servers")
    .select("id, name, icon_url, description, owner_id, is_public")
    .in("id", allIds);
  if (sErr) throw sErr;
  const nickBy = new Map((memberships || []).map((m) => [m.server_id, m.nickname]));
  return {
    servers: (servers || []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description || null,
      is_owner: s.owner_id === ctx.userId,
      nickname: nickBy.get(s.id) || null,
      is_public: Boolean(s.is_public),
    })),
  };
}

async function get_server_info(ctx, args) {
  const serverId = String(args.server_id || "").trim();
  if (!serverId) return { error: "server_id required." };
  const gate = await assertServerMember(ctx.userId, serverId);
  if (!gate.ok) return { error: gate.error };
  const s = gate.server;
  return {
    id: s.id,
    name: s.name,
    description: s.description || null,
    is_owner: s.owner_id === ctx.userId,
    is_public: Boolean(s.is_public),
    created_at: s.created_at || null,
  };
}

async function get_server_channels(ctx, args) {
  const serverId = String(args.server_id || "").trim();
  if (!serverId) return { error: "server_id required." };
  const gate = await assertServerMember(ctx.userId, serverId);
  if (!gate.ok) return { error: gate.error };

  const { data: channels, error } = await supabase
    .from("server_channels")
    .select("id, name, type, topic, position, parent_id")
    .eq("server_id", serverId)
    .order("position", { ascending: true })
    .limit(200);
  if (error) throw error;

  const visible = [];
  for (const ch of channels || []) {
    try {
      const resolved = await resolveChannelPermissions(
        supabase,
        serverId,
        ctx.userId,
        ch.id,
      );
      if (hasPermission(resolved.bits, Permissions.VIEW_CHANNEL) || gate.isOwner) {
        visible.push({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          topic: ch.topic || null,
          parent_id: ch.parent_id || null,
        });
      }
    } catch (err) {
      logInternal("tool-channel-perm", err);
    }
  }
  return { server_id: serverId, channels: visible };
}

async function get_channel_info(ctx, args) {
  const channelId = String(args.channel_id || "").trim();
  if (!channelId) return { error: "channel_id required." };
  const { data: channel, error } = await supabase
    .from("server_channels")
    .select("id, server_id, name, type, topic, position, parent_id")
    .eq("id", channelId)
    .maybeSingle();
  if (error) throw error;
  if (!channel) return { error: "Channel not found." };
  const serverId = String(args.server_id || channel.server_id).trim();
  const gate = await assertServerMember(ctx.userId, serverId);
  if (!gate.ok) return { error: gate.error };
  if (channel.server_id !== serverId) return { error: "Channel does not belong to that server." };

  const resolved = await resolveChannelPermissions(supabase, serverId, ctx.userId, channelId);
  if (!gate.isOwner && !hasPermission(resolved.bits, Permissions.VIEW_CHANNEL)) {
    return { error: "You cannot view this channel." };
  }
  return {
    id: channel.id,
    server_id: channel.server_id,
    name: channel.name,
    type: channel.type,
    topic: channel.topic || null,
    parent_id: channel.parent_id || null,
  };
}

async function get_user_roles(ctx, args) {
  const serverId = String(args.server_id || "").trim();
  if (!serverId) return { error: "server_id required." };
  const gate = await assertServerMember(ctx.userId, serverId);
  if (!gate.ok) return { error: gate.error };

  const { data: links, error } = await supabase
    .from("server_member_roles")
    .select("role_id")
    .eq("server_id", serverId)
    .eq("user_id", ctx.userId);
  if (error) throw error;
  const roleIds = (links || []).map((l) => l.role_id);
  const { data: everyone } = await supabase
    .from("server_roles")
    .select("id, name, color, position, hoist, mentionable, is_everyone")
    .eq("server_id", serverId)
    .eq("is_everyone", true)
    .maybeSingle();
  let roles = [];
  if (roleIds.length) {
    const { data, error: rErr } = await supabase
      .from("server_roles")
      .select("id, name, color, position, hoist, mentionable, is_everyone")
      .in("id", roleIds);
    if (rErr) throw rErr;
    roles = data || [];
  }
  if (everyone && !roles.some((r) => r.id === everyone.id)) roles.push(everyone);
  return {
    server_id: serverId,
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      is_everyone: Boolean(r.is_everyone),
    })),
  };
}

async function get_server_roles(ctx, args) {
  const serverId = String(args.server_id || "").trim();
  if (!serverId) return { error: "server_id required." };
  const gate = await assertServerMember(ctx.userId, serverId);
  if (!gate.ok) return { error: gate.error };
  const { data, error } = await supabase
    .from("server_roles")
    .select("id, name, color, position, hoist, mentionable, is_everyone")
    .eq("server_id", serverId)
    .order("position", { ascending: false })
    .limit(100);
  if (error) throw error;
  return {
    server_id: serverId,
    roles: (data || []).map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      is_everyone: Boolean(r.is_everyone),
    })),
  };
}

async function get_user_permissions(ctx, args) {
  const serverId = String(args.server_id || "").trim();
  const channelId = String(args.channel_id || "").trim();
  if (!serverId) return { error: "server_id required." };
  const gate = await assertServerMember(ctx.userId, serverId);
  if (!gate.ok) return { error: gate.error };

  let resolved;
  if (channelId) {
    resolved = await resolveChannelPermissions(supabase, serverId, ctx.userId, channelId);
  } else {
    resolved = await resolveMemberPermissions(supabase, serverId, ctx.userId);
  }
  const flags = permissionsToFlags(resolved.bits);
  return {
    server_id: serverId,
    channel_id: channelId || null,
    is_owner: Boolean(resolved.isOwner || gate.isOwner),
    permissions: flags,
  };
}

async function web_search(ctx, args) {
  const query = String(args.query || "").trim();
  if (!query) return { error: "query required." };
  const result = await webSearch(query, { signal: ctx.signal });
  if (result.error && !(result.results || []).length) return { error: result.error };
  // Collect citations on ctx for the final SSE payload.
  if (ctx.citations && Array.isArray(result.results)) {
    for (const r of result.results) {
      if (!r?.url) continue;
      if (ctx.citations.some((c) => c.url === r.url)) continue;
      ctx.citations.push({
        title: r.title || "Source",
        url: r.url,
        snippet: r.snippet || "",
      });
    }
  }
  return {
    query: result.query || query,
    results: (result.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    })),
    note: "These are web search results. Cite them when using their facts; do not mix them with unverified model knowledge.",
  };
}

async function remember_fact(ctx, args) {
  if (ctx.memoryEnabled === false) {
    return { error: "Memory is disabled in the user's settings." };
  }
  const fact = String(args.fact || "").trim();
  const out = await memories.addMemory(ctx.userId, fact);
  if (out.error) return { error: out.error };
  return {
    stored: true,
    duplicate: Boolean(out.duplicate),
    fact: out.memory?.fact,
    id: out.memory?.id,
  };
}

async function forget_fact(ctx, args) {
  if (ctx.memoryEnabled === false) {
    return { error: "Memory is disabled in the user's settings." };
  }
  const q = String(args.query || args.fact || "").trim();
  return memories.forgetMatching(ctx.userId, q);
}

async function list_memories(ctx) {
  if (ctx.memoryEnabled === false) {
    return { memories: [], note: "Memory is disabled in settings." };
  }
  const items = await memories.listMemories(ctx.userId);
  return {
    memories: items.map((m) => ({ id: m.id, fact: m.fact, created_at: m.created_at })),
  };
}

const HANDLERS = {
  get_current_user,
  get_user_profile,
  get_user_servers,
  get_server_info,
  get_server_channels,
  get_channel_info,
  get_user_roles,
  get_server_roles,
  get_user_permissions,
  web_search,
  remember_fact,
  forget_fact,
  list_memories,
  ...agentTools.HANDLERS,
};

async function executeTool(name, args, ctx) {
  const toolName = String(name || "");
  if (!IMPLEMENTED.has(toolName) || !HANDLERS[toolName]) {
    return {
      ok: false,
      error: "This tool is not available yet. Tell the user you cannot verify that live data.",
    };
  }
  try {
    const result = await HANDLERS[toolName](ctx, args || {});
    if (result && result.error) return { ok: false, error: result.error };
    return { ok: true, result };
  } catch (err) {
    logInternal("tool-exec", err, { status: 0 });
    return {
      ok: false,
      error: "Could not fetch that information. Tell the user you cannot verify it right now.",
    };
  }
}

module.exports = {
  TOOL_CATALOG,
  IMPLEMENTED,
  geminiFunctionDeclarations,
  toolCatalogPublic,
  executeTool,
};
