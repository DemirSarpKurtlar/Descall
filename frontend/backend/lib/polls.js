"use strict";

/**
 * Votable polls (2.12.0). Tables: polls, poll_options, poll_votes (migration
 * 20261019_polls_v1.sql). A poll hangs off one chat message (media_type
 * "poll_v2"); its scope columns are copied from that message, so every check
 * here loads the poll first and authorizes against the poll's own server /
 * channel / group / DM pair, never against ids the client sent.
 *
 * Realtime: `poll:changed` goes to the poll's room (server-channel / group /
 * both DM users) with only the version and the voter total. Results stay hidden
 * until a viewer has voted, so clients that may see them refetch with poll:get.
 */

const supabase = require("../db/supabase");
const { Permissions, hasPermission, resolveChannelPermissions } = require("./serverPermissions");
const core = require("./pollCore");

const POLL_SELECT =
  "id, scope, server_id, channel_id, group_id, dm_user_lo, dm_user_hi, server_message_id, group_message_id, dm_message_id, creator_id, question, allow_multiselect, anonymous, ends_at, closed_at, closed_by, close_reason, version, created_at";

function dmPair(a, b) {
  return [String(a), String(b)].sort();
}

function pollMessageId(poll) {
  return poll?.server_message_id || poll?.group_message_id || poll?.dm_message_id || null;
}

async function insertOptions(pollId, options) {
  const rows = options.map((o, i) => ({ poll_id: pollId, position: i, text: o.text, emoji: o.emoji || null }));
  const { data, error } = await supabase.from("poll_options").insert(rows).select("id, poll_id, position, text, emoji");
  if (error) throw error;
  return (data || rows.map((r, i) => ({ ...r, id: r.id || `${pollId}-${i}` }))).sort((a, b) => a.position - b.position);
}

/** Creates the poll rows for an already inserted message. Removes the poll again if options fail. */
async function createPollForMessage({ scope, messageId, serverId = null, channelId = null, groupId = null, dmUsers = null, creatorId, poll }) {
  const [lo, hi] = scope === "dm" ? dmPair(dmUsers[0], dmUsers[1]) : [null, null];
  const endsAt = new Date(Date.now() + poll.durationSeconds * 1000).toISOString();
  const row = {
    scope,
    server_id: scope === "server" ? serverId : null,
    channel_id: scope === "server" ? channelId : null,
    group_id: scope === "group" ? groupId : null,
    dm_user_lo: lo,
    dm_user_hi: hi,
    server_message_id: scope === "server" ? messageId : null,
    group_message_id: scope === "group" ? messageId : null,
    dm_message_id: scope === "dm" ? messageId : null,
    creator_id: creatorId,
    question: poll.question,
    allow_multiselect: poll.multi,
    anonymous: poll.anonymous,
    ends_at: endsAt,
  };
  const { data: created, error } = await supabase.from("polls").insert(row).select(POLL_SELECT).single();
  if (error) throw error;
  try {
    const options = await insertOptions(created.id, poll.options);
    return { poll: created, options };
  } catch (err) {
    await supabase.from("polls").delete().eq("id", created.id);
    throw err;
  }
}

async function loadOptions(pollIds) {
  if (!pollIds.length) return new Map();
  const { data, error } = await supabase
    .from("poll_options")
    .select("id, poll_id, position, text, emoji")
    .in("poll_id", pollIds);
  if (error) throw error;
  const map = new Map();
  for (const o of data || []) {
    if (!map.has(o.poll_id)) map.set(o.poll_id, []);
    map.get(o.poll_id).push(o);
  }
  return map;
}

async function loadPollById(pollId) {
  if (typeof pollId !== "string" || !pollId) return null;
  const { data, error } = await supabase.from("polls").select(POLL_SELECT).eq("id", pollId).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Polls for chat message ids of one scope (the client says which list it renders). */
async function loadPollsByMessageIds(scope, messageIds) {
  const col = scope === "server" ? "server_message_id" : scope === "group" ? "group_message_id" : scope === "dm" ? "dm_message_id" : null;
  const ids = [...new Set((messageIds || []).filter((x) => typeof x === "string" && x))].slice(0, 100);
  if (!col || !ids.length) return [];
  const { data, error } = await supabase.from("polls").select(POLL_SELECT).in(col, ids);
  if (error) throw error;
  return data || [];
}

/** { view, vote, manage, code } for one user on one poll, from the poll's own scope. */
async function resolvePollAccess(userId, poll) {
  const none = { view: false, vote: false, manage: false, code: "NO_ACCESS" };
  if (!poll || !userId) return none;
  if (poll.scope === "server") {
    const resolved = await resolveChannelPermissions(supabase, poll.server_id, userId, poll.channel_id);
    if (!resolved?.isMember || !hasPermission(resolved.bits, Permissions.VIEW_CHANNEL)) return none;
    const manage = hasPermission(resolved.bits, Permissions.MANAGE_MESSAGES);
    let timedOut = false;
    if (!resolved.isOwner) {
      const { getActiveServerTimeout } = require("./serverTimeoutState");
      timedOut = Boolean(await getActiveServerTimeout(poll.server_id, userId));
    }
    return { view: true, vote: !timedOut, manage: manage && !timedOut, code: timedOut ? "TIMED_OUT" : null };
  }
  if (poll.scope === "group") {
    const { data, error } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", poll.group_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return none;
    return { view: true, vote: true, manage: false, code: null };
  }
  if (poll.scope === "dm") {
    const uid = String(userId);
    if (uid !== String(poll.dm_user_lo) && uid !== String(poll.dm_user_hi)) return none;
    const other = uid === String(poll.dm_user_lo) ? poll.dm_user_hi : poll.dm_user_lo;
    const { isBlockedEitherWay } = require("./blocking");
    const blocked = await isBlockedEitherWay(uid, String(other));
    return { view: true, vote: !blocked, manage: false, code: blocked ? "NO_ACCESS" : null };
  }
  return none;
}

async function loadTallies(pollIds, viewerId) {
  const out = {};
  if (!pollIds.length) return out;
  if (typeof supabase.rpc === "function") {
    const { data, error } = await supabase.rpc("poll_tally", { p_poll_ids: pollIds, p_user_id: viewerId });
    if (error) throw error;
    return data || {};
  }
  // Test doubles without rpc: count rows directly.
  const { data, error } = await supabase.from("poll_votes").select("poll_id, option_id, user_id").in("poll_id", pollIds);
  if (error) throw error;
  for (const id of pollIds) out[id] = { counts: {}, voters: 0, mine: [] };
  const voterSets = {};
  for (const v of data || []) {
    const t = out[v.poll_id];
    if (!t) continue;
    t.counts[v.option_id] = (t.counts[v.option_id] || 0) + 1;
    (voterSets[v.poll_id] = voterSets[v.poll_id] || new Set()).add(String(v.user_id));
    if (String(v.user_id) === String(viewerId)) t.mine.push(v.option_id);
  }
  for (const id of pollIds) out[id].voters = voterSets[id]?.size || 0;
  return out;
}

/** Snapshots of `polls` the viewer may see (others are dropped silently). */
async function snapshotsForViewer(viewerId, polls) {
  const visible = [];
  for (const p of polls) {
    const access = await resolvePollAccess(viewerId, p);
    if (access.view) visible.push({ poll: p, access });
  }
  if (!visible.length) return [];
  const ids = visible.map((v) => v.poll.id);
  const [optionsById, tallies] = await Promise.all([loadOptions(ids), loadTallies(ids, viewerId)]);
  return visible.map(({ poll, access }) =>
    core.buildPollSnapshot(poll, optionsById.get(poll.id) || [], tallies[poll.id], {
      viewerId,
      canManage: access.manage,
      canVote: access.vote,
    })
  );
}

function emitPollChanged(io, poll, extra = {}) {
  if (!io || !poll) return;
  const payload = {
    pollId: poll.id,
    messageId: pollMessageId(poll),
    scope: poll.scope,
    channelId: poll.channel_id || null,
    groupId: poll.group_id || null,
    version: Number(poll.version) || 0,
    ...extra,
  };
  if (poll.scope === "server") io.to(`server-channel:${poll.channel_id}`).emit("poll:changed", payload);
  else if (poll.scope === "group") io.to(`group:${poll.group_id}`).emit("poll:changed", payload);
  else if (poll.scope === "dm") {
    io.to(`user:${poll.dm_user_lo}`).emit("poll:changed", payload);
    io.to(`user:${poll.dm_user_hi}`).emit("poll:changed", payload);
  }
}

async function castVote(io, { userId, pollId, optionIds }) {
  const poll = await loadPollById(pollId);
  if (!poll) return { ok: false, ...core.voteError("POLL_NOT_FOUND") };
  const access = await resolvePollAccess(userId, poll);
  if (!access.view) return { ok: false, ...core.voteError("NO_ACCESS") };
  if (!access.vote) return { ok: false, ...core.voteError(access.code || "NO_ACCESS") };
  if (core.isClosed(poll)) return { ok: false, ...core.voteError("POLL_CLOSED") };
  const ids = [...new Set((Array.isArray(optionIds) ? optionIds : []).filter((x) => typeof x === "string" && x))].slice(0, 10);
  // Same rules as poll_cast_vote, checked here too so a bad request never reaches the DB.
  const valid = new Set(((await loadOptions([poll.id])).get(poll.id) || []).map((o) => String(o.id)));
  if (ids.some((id) => !valid.has(id))) return { ok: false, ...core.voteError("BAD_OPTION") };
  if (!poll.allow_multiselect && ids.length > 1) return { ok: false, ...core.voteError("SINGLE_CHOICE") };
  const { data, error } = await supabase.rpc("poll_cast_vote", { p_poll_id: poll.id, p_user_id: userId, p_option_ids: ids });
  if (error) return { ok: false, ...core.voteError(error) };
  const updated = { ...poll, version: Number(data?.version) || (Number(poll.version) || 0) + 1 };
  emitPollChanged(io, updated, { voters: Number(data?.voters) || 0 });
  const [snapshot] = await snapshotsForViewer(userId, [updated]);
  return { ok: true, poll: snapshot };
}

async function loadSender(userId) {
  const { getCachedPublicUser, pickChatCosmetics, ensureCosmeticsCached } = require("./userProfile");
  await ensureCosmeticsCached([userId]).catch(() => {});
  const cached = getCachedPublicUser(userId);
  if (cached) {
    return {
      id: userId,
      username: cached.username,
      displayName: cached.displayName || null,
      display_name: cached.displayName || null,
      avatar_url: cached.avatarUrl || null,
      avatarUrl: cached.avatarUrl || null,
      ...pickChatCosmetics(cached),
    };
  }
  const { data } = await supabase.from("users").select("id, username, display_name, avatar_url").eq("id", userId).maybeSingle();
  return {
    id: userId,
    username: data?.username || null,
    displayName: data?.display_name || null,
    display_name: data?.display_name || null,
    avatar_url: data?.avatar_url || null,
    avatarUrl: data?.avatar_url || null,
  };
}

/** Posts the "anket sona erdi" line into the poll's chat as `senderId`. Never throws. */
async function postPollEndMessage(io, poll, snapshot, senderId) {
  if (!senderId) return null;
  try {
    const content = core.pollEndText(snapshot);
    const sender = await loadSender(senderId);
    const replyMeta = {
      id: pollMessageId(poll),
      text: `📊 ${poll.question}`,
      mediaType: "poll_v2",
      from: { id: poll.creator_id, username: null },
    };
    if (poll.scope === "server") {
      const { data: row, error } = await supabase
        .from("server_messages")
        .insert({ server_id: poll.server_id, channel_id: poll.channel_id, sender_id: senderId, content, media_type: "poll_end", reply_to: replyMeta })
        .select("id, created_at")
        .single();
      if (error) throw error;
      const message = {
        id: row.id,
        server_id: poll.server_id,
        channel_id: poll.channel_id,
        sender_id: senderId,
        content,
        media_type: "poll_end",
        created_at: row.created_at,
        reply_to: replyMeta,
        replyTo: replyMeta,
        sender,
      };
      io.to(`server-channel:${poll.channel_id}`).emit("server:channel:message", { serverId: poll.server_id, channelId: poll.channel_id, message });
      return message;
    }
    if (poll.scope === "group") {
      const { data: row, error } = await supabase
        .from("group_messages")
        .insert({ group_id: poll.group_id, sender_id: senderId, content, media_type: "poll_end", message_type: "text" })
        .select("id, created_at")
        .single();
      if (error) throw error;
      const message = { id: row.id, group_id: poll.group_id, sender_id: senderId, content, media_type: "poll_end", created_at: row.created_at, sender };
      io.to(`group:${poll.group_id}`).emit("group:message", { groupId: poll.group_id, message });
      return message;
    }
    if (poll.scope === "dm") {
      const other = String(senderId) === String(poll.dm_user_lo) ? poll.dm_user_hi : poll.dm_user_lo;
      const { data: row, error } = await supabase
        .from("dm_messages")
        .insert({ from_user_id: senderId, to_user_id: other, content, media_type: "poll_end", reply_to: replyMeta })
        .select("id, created_at")
        .single();
      if (error) throw error;
      const payload = {
        id: row.id,
        from: { ...sender },
        text: content,
        mediaType: "poll_end",
        replyTo: replyMeta,
        timestamp: row.created_at,
      };
      io.to(`user:${other}`).emit("dm:message", { ...payload, convWith: senderId });
      io.to(`user:${senderId}`).emit("dm:message", { ...payload, convWith: other });
      return payload;
    }
  } catch (err) {
    console.warn("[polls] end message failed:", err?.message || err);
  }
  return null;
}

/** Ends a poll once (conditional update). reason: creator | moderator | expired. */
async function closePoll(io, { pollId, actorId = null, reason = "creator", pollRow = null }) {
  const poll = pollRow || (await loadPollById(pollId));
  if (!poll) return { ok: false, ...core.voteError("POLL_NOT_FOUND") };
  if (reason !== "expired") {
    const access = await resolvePollAccess(actorId, poll);
    if (!access.view) return { ok: false, ...core.voteError("NO_ACCESS") };
    const isCreator = String(poll.creator_id) === String(actorId);
    if (!isCreator && !access.manage) return { ok: false, ...core.voteError("NO_PERMISSION") };
    reason = isCreator ? "creator" : "moderator";
  }
  if (poll.closed_at) return { ok: false, ...core.voteError("POLL_CLOSED") };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("polls")
    .update({ closed_at: now, closed_by: reason === "expired" ? null : actorId, close_reason: reason, version: (Number(poll.version) || 0) + 1, updated_at: now })
    .eq("id", poll.id)
    .is("closed_at", null)
    .select(POLL_SELECT);
  if (error) throw error;
  const closed = Array.isArray(data) ? data[0] : data;
  if (!closed) return { ok: false, ...core.voteError("POLL_CLOSED") };
  emitPollChanged(io, closed, { closed: true, structural: true });
  // The end line shows the final result, so build it from a viewer who sees everything.
  const [optionsById, tallies] = await Promise.all([loadOptions([closed.id]), loadTallies([closed.id], actorId || closed.creator_id)]);
  const snapshot = core.buildPollSnapshot(closed, optionsById.get(closed.id) || [], tallies[closed.id], { viewerId: actorId });
  await postPollEndMessage(io, closed, snapshot, reason === "expired" ? closed.creator_id : actorId);
  return { ok: true, poll: snapshot };
}

async function editPoll(io, { userId, pollId, input }) {
  const poll = await loadPollById(pollId);
  if (!poll) return { ok: false, ...core.voteError("POLL_NOT_FOUND") };
  const access = await resolvePollAccess(userId, poll);
  if (!access.view) return { ok: false, ...core.voteError("NO_ACCESS") };
  const normalized = core.normalizePollInput(input);
  if (!normalized.ok) return normalized;
  const p = normalized.poll;
  const { data, error } = await supabase.rpc("poll_edit", {
    p_poll_id: poll.id,
    p_user_id: userId,
    p_question: p.question,
    p_options: p.options.map((o) => ({ text: o.text, emoji: o.emoji || "" })),
    p_allow_multiselect: p.multi,
    p_anonymous: p.anonymous,
  });
  if (error) return { ok: false, ...core.voteError(error) };
  // Keep the fallback text of the message in sync for old clients and previews.
  const text = core.pollFallbackText(p);
  const table = poll.scope === "server" ? "server_messages" : poll.scope === "group" ? "group_messages" : "dm_messages";
  await supabase.from(table).update({ content: text }).eq("id", pollMessageId(poll));
  const updated = { ...poll, question: p.question, allow_multiselect: p.multi, anonymous: p.anonymous, version: Number(data?.version) || (Number(poll.version) || 0) + 1 };
  emitPollChanged(io, updated, { structural: true });
  const [snapshot] = await snapshotsForViewer(userId, [updated]);
  return { ok: true, poll: snapshot };
}

function intToHex(color) {
  const n = Number(color);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `#${Math.min(0xffffff, n).toString(16).padStart(6, "0")}`;
}

/** Highest coloured role per user in a server (for name colours in the voters sheet). */
async function roleColors(serverId, userIds) {
  const out = new Map();
  if (!serverId || !userIds.length) return out;
  const [{ data: links }, { data: roles }] = await Promise.all([
    supabase.from("server_member_roles").select("user_id, role_id").eq("server_id", serverId).in("user_id", userIds),
    supabase.from("server_roles").select("id, color, position").eq("server_id", serverId),
  ]);
  const byId = new Map((roles || []).map((r) => [r.id, r]));
  for (const l of links || []) {
    const r = byId.get(l.role_id);
    const hex = intToHex(r?.color);
    if (!hex) continue;
    const cur = out.get(l.user_id);
    if (!cur || (r.position || 0) > cur.position) out.set(l.user_id, { hex, position: r.position || 0 });
  }
  return new Map([...out].map(([k, v]) => [k, v.hex]));
}

/** Voters per option. Never for anonymous polls; only after the viewer voted or the poll ended. */
async function listVoters({ userId, pollId }) {
  const poll = await loadPollById(pollId);
  if (!poll) return { ok: false, ...core.voteError("POLL_NOT_FOUND") };
  const [snapshot] = await snapshotsForViewer(userId, [poll]);
  if (!snapshot) return { ok: false, ...core.voteError("NO_ACCESS") };
  if (snapshot.anonymous) return { ok: false, ...core.voteError("ANONYMOUS") };
  if (!snapshot.revealed) return { ok: false, ...core.voteError("HIDDEN") };
  const { data: votes, error } = await supabase
    .from("poll_votes")
    .select("option_id, user_id, created_at")
    .eq("poll_id", poll.id)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const userIds = [...new Set((votes || []).map((v) => v.user_id))];
  const [{ data: users }, colors] = await Promise.all([
    userIds.length
      ? supabase.from("users").select("id, username, display_name, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] }),
    poll.scope === "server" ? roleColors(poll.server_id, userIds) : Promise.resolve(new Map()),
  ]);
  const byUser = new Map((users || []).map((u) => [u.id, u]));
  const byOption = {};
  for (const o of snapshot.options) byOption[o.id] = [];
  for (const v of votes || []) {
    const u = byUser.get(v.user_id);
    if (!byOption[v.option_id]) continue;
    byOption[v.option_id].push({
      id: v.user_id,
      username: u?.username || null,
      displayName: u?.display_name || null,
      avatarUrl: u?.avatar_url || null,
      color: colors.get(v.user_id) || null,
      votedAt: v.created_at,
    });
  }
  return { ok: true, poll: snapshot, voters: byOption };
}

let sweeper = null;
/** Ends expired polls every 30 s and posts their end line. Safe on several instances (conditional update). */
function startPollSweeper(io, { intervalMs = 30000 } = {}) {
  if (sweeper) return sweeper;
  const tick = async () => {
    try {
      const { data, error } = await supabase
        .from("polls")
        .select(POLL_SELECT)
        .is("closed_at", null)
        .lte("ends_at", new Date().toISOString())
        .limit(25);
      if (error) throw error;
      for (const poll of data || []) {
        await closePoll(io, { pollId: poll.id, pollRow: poll, reason: "expired" }).catch((err) =>
          console.warn("[polls] expire failed:", poll.id, err?.message || err)
        );
      }
    } catch (err) {
      console.warn("[polls] sweeper tick failed:", err?.message || err);
    }
  };
  sweeper = setInterval(tick, intervalMs);
  sweeper.unref?.();
  return sweeper;
}

module.exports = {
  ...core,
  POLL_SELECT,
  createPollForMessage,
  loadPollById,
  loadPollsByMessageIds,
  resolvePollAccess,
  snapshotsForViewer,
  castVote,
  closePoll,
  editPoll,
  listVoters,
  emitPollChanged,
  startPollSweeper,
  pollMessageId,
};
