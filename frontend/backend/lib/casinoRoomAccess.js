"use strict";

/**
 * Who may run a casino game or slash command in which chat.
 *
 * Every `game:command`, `game:action` and slash-routed game resolves its target
 * here first, so a client can no longer name an arbitrary group / channel / DM
 * id and broadcast casino boards into it.
 *
 *   group   → caller is a row in group_members
 *   channel → caller may send a message there (serverChannelHandlers
 *             assertTextChannelAccess: VIEW + SEND, announcement rule, not timed out
 *             site-wide or in the server) and accepted the server rules
 *   dm      → caller and peer are accepted friends (no message requests), the
 *             pair is not blocked either way, caller is not banned / timed out
 *
 * Returns { ok: true, target } or { ok: false, code, text }.
 * `target` is the per-request chat context used for emits and game keys:
 *   { kind, roomId, groupId, channelId, serverId, dmUserIds }
 */

const DENY = {
  missing: { code: "no_target", text: "No chat was selected for this command." },
  notMember: { code: "not_member", text: "You're not a member of this chat." },
  channel: { code: "no_channel_access", text: "You don't have permission to send messages in this channel." },
  timedOut: { code: "timed_out", text: "You're timed out and can't use commands right now." },
  banned: { code: "banned", text: "Your account is blocked." },
  blocked: { code: "dm_blocked", text: "You can't use commands with this person." },
  notFriend: { code: "dm_not_friend", text: "Games and commands only work in DMs with your friends." },
  self: { code: "dm_self", text: "You can't use commands in a DM with yourself." },
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
  const { Permissions } = require("./serverPermissions");
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
    // Same gate as a channel message (server audit MSG-8): membership, VIEW + SEND,
    // read-only announcement channels, site-wide and server timeouts, rules acceptance.
    // Slowmode and chat freeze are checked for new game posts in gameHandlers.
    async channelAccess(channelId, userId) {
      const { assertTextChannelAccess } = require("../socket/serverChannelHandlers");
      let access;
      try {
        access = await assertTextChannelAccess(userId, channelId, Permissions.SEND_MESSAGES);
      } catch (err) {
        return { ok: false, timedOut: err?.code === "TIMED_OUT" };
      }
      const { needsRulesAcceptance } = require("./serverRulesGate");
      if (await needsRulesAcceptance(supabase, access.channel.server_id, userId, { isOwner: access.resolved?.isOwner })) {
        return { ok: false };
      }
      return { ok: true, serverId: access.channel.server_id };
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
