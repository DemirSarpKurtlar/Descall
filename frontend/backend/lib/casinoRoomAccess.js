"use strict";

/**
 * Who may run a casino game or slash command in which chat.
 *
 * Every `game:command`, `game:action` and slash-routed game resolves its target
 * here first, so a client can no longer name an arbitrary group / channel / DM
 * id and broadcast casino boards into it.
 *
 *   group   → caller is a row in group_members
 *   channel → caller is a server member with VIEW_CHANNEL + SEND_MESSAGES on a
 *             text channel and is not server-timed-out
 *   dm      → caller and peer are accepted friends (no message requests), the
 *             pair is not blocked either way, caller is not banned / timed out
 *
 * Returns { ok: true, target } or { ok: false, code, text }.
 * `target` is the per-request chat context used for emits and game keys:
 *   { kind, roomId, groupId, channelId, serverId, dmUserIds }
 */

const DENY = {
  missing: { code: "no_target", text: "Bu komut için bir sohbet seçilmedi." },
  notMember: { code: "not_member", text: "Bu sohbetin üyesi değilsin." },
  channel: { code: "no_channel_access", text: "Bu kanalda mesaj gönderme iznin yok." },
  timedOut: { code: "timed_out", text: "Zaman aşımındasın, şu an komut kullanamazsın." },
  banned: { code: "banned", text: "Hesabın engellendi." },
  blocked: { code: "dm_blocked", text: "Bu kişiyle komut kullanamazsın." },
  notFriend: { code: "dm_not_friend", text: "Oyunlar ve komutlar yalnızca arkadaşlarınla olan DM'lerde çalışır." },
  self: { code: "dm_self", text: "Kendinle DM'de komut kullanamazsın." },
};

function dmRoomId(a, b) {
  const [x, y] = [String(a), String(b)].sort();
  return `dm:${x}:${y}`;
}

function deny(kind) {
  return { ok: false, ...DENY[kind] };
}

function isId(v) {
  return typeof v === "string" && v.length > 0 && v.length <= 128;
}

function defaultDeps() {
  const supabase = require("../db/supabase");
  const { Permissions, hasPermission, resolveChannelPermissions } = require("./serverPermissions");
  const state = require("../runtime/sharedState");
  const { isAcceptedFriend, convKey } = require("./dmMessages");
  const { isBlockedEitherWay } = require("./blocking");
  const { getActiveTimeout } = require("./moderation");

  return {
    async isGroupMember(groupId, userId) {
      const { data } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle();
      return Boolean(data);
    },
    async channelAccess(channelId, userId) {
      const { data: channel } = await supabase
        .from("server_channels")
        .select("id, server_id, type")
        .eq("id", channelId)
        .maybeSingle();
      if (!channel || (channel.type !== "text" && channel.type !== "announcement")) return { ok: false };
      const resolved = await resolveChannelPermissions(supabase, channel.server_id, userId, channelId);
      if (!resolved?.isMember) return { ok: false };
      if (!hasPermission(resolved.bits, Permissions.VIEW_CHANNEL) || !hasPermission(resolved.bits, Permissions.SEND_MESSAGES)) {
        return { ok: false };
      }
      const { data: member } = await supabase
        .from("server_members")
        .select("timeout_until")
        .eq("server_id", channel.server_id)
        .eq("user_id", userId)
        .maybeSingle();
      const until = member?.timeout_until ? new Date(member.timeout_until).getTime() : 0;
      if (until && until > Date.now()) return { ok: false, timedOut: true };
      return { ok: true, serverId: channel.server_id };
    },
    isBanned: (userId) => Boolean(state.bannedUserIds?.has?.(userId)),
    isTimedOut: (userId) => Boolean(getActiveTimeout(userId)),
    isPairBlocked: async (a, b) => Boolean(state.dmBlockPairs?.has?.(convKey(a, b))) || (await isBlockedEitherWay(a, b)),
    isFriend: (a, b) => isAcceptedFriend(a, b),
  };
}

let depsOverride = null;
function setCasinoRoomAccessDeps(deps) {
  depsOverride = deps || null;
}

async function resolveCasinoTarget({ userId, groupId, channelId, dmUserId } = {}, deps = depsOverride || defaultDeps()) {
  if (!isId(userId)) return deny("missing");

  if (isId(dmUserId)) {
    if (dmUserId === userId) return deny("self");
    if (deps.isBanned(userId)) return deny("banned");
    if (deps.isTimedOut(userId)) return deny("timedOut");
    if (await deps.isPairBlocked(userId, dmUserId)) return deny("blocked");
    if (!(await deps.isFriend(userId, dmUserId))) return deny("notFriend");
    return {
      ok: true,
      target: {
        kind: "dm",
        roomId: dmRoomId(userId, dmUserId),
        groupId: null,
        channelId: null,
        serverId: null,
        dmUserIds: [userId, dmUserId],
      },
    };
  }

  if (isId(channelId)) {
    const access = await deps.channelAccess(channelId, userId);
    if (!access?.ok) return deny(access?.timedOut ? "timedOut" : "channel");
    return {
      ok: true,
      target: { kind: "channel", roomId: channelId, groupId: null, channelId, serverId: access.serverId || null, dmUserIds: null },
    };
  }

  if (isId(groupId)) {
    if (!(await deps.isGroupMember(groupId, userId))) return deny("notMember");
    return {
      ok: true,
      target: { kind: "group", roomId: groupId, groupId, channelId: null, serverId: null, dmUserIds: null },
    };
  }

  return deny("missing");
}

module.exports = { resolveCasinoTarget, setCasinoRoomAccessDeps, dmRoomId, DENY };
