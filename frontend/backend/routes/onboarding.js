"use strict";

/**
 * "Başla panosu" (growth phase 2, draft 2A): the first five days of an account.
 *
 *   GET  /api/onboarding/state                   dashboard: live counts, interests, three
 *                                                live suggestions, community + Rehber,
 *                                                inviter's corner, checklist, rewards
 *   PUT  /api/onboarding/interests               { interests: [] }
 *   GET  /api/onboarding/servers/:id/preview     channel preview before joining (?channel=)
 *   GET  /api/onboarding/track                   ?serverId&channelId&messageId: replies,
 *                                                reactions after "Katıl ve gönder"
 *   POST /api/onboarding/event                   { event, props } funnel events
 *   POST /api/onboarding/hide                    { hidden } "Panoyu gizle" / reopen
 *   POST /api/onboarding/undo                    { messageId } forget a pending first message
 *
 * Privacy: the preview is read-only and leaves no trace (no presence, no typing, no read
 * marks), only for servers that opted into in-app discovery or the official community
 * server, only channels @everyone can see. Voice rooms show who is in them, like the server
 * itself does for its members.
 */

const express = require("express");
const { apiError } = require("../lib/apiError");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const model = require("../lib/onboarding/model");
const store = require("../lib/onboarding/store");
const live = require("../lib/onboarding/live");
const rewards = require("../lib/onboarding/rewards");
const firstHello = require("../lib/onboarding/firstHello");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- per-user rate limit (requests per minute)
const hits = new Map();
function limited(userId, max = 120) {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter((t) => now - t < 60_000);
  if (list.length >= max) {
    hits.set(userId, list);
    return true;
  }
  list.push(now);
  hits.set(userId, list);
  if (hits.size > 20000) hits.delete(hits.keys().next().value);
  return false;
}

function io(req) {
  return req.app?.get?.("io") || null;
}

function presenceOf(userId) {
  try {
    const { presence } = require("../runtime/sharedState");
    const { getPresenceEntry, isVisibleStatus } = require("../lib/presenceRoster");
    const e = getPresenceEntry(presence, userId);
    return Boolean(e && isVisibleStatus(e.status));
  } catch {
    return false;
  }
}

function brief(u) {
  if (!u) return null;
  return { id: String(u.id), username: u.username || null, displayName: u.display_name || null, avatarUrl: u.avatar_url || null };
}

function analytics(userId, event, props) {
  try {
    void require("../lib/userAnalyticsStore").recordAnalyticsEvent({ userId, event, props });
  } catch {
    /* best effort */
  }
}

// ---- inviter's corner -------------------------------------------------------------------

async function friendStates(userId, ids) {
  const out = new Map();
  if (!ids.length) return out;
  const { data } = await supabase
    .from("friendships")
    .select("user_id, friend_id, status")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
  for (const r of data || []) {
    const other = String(r.user_id) === String(userId) ? String(r.friend_id) : String(r.user_id);
    if (!ids.includes(other)) continue;
    const state = r.status === "accepted" ? "friend" : String(r.user_id) === String(userId) ? "requested" : "incoming";
    if (out.get(other) !== "friend") out.set(other, state);
  }
  return out;
}

async function inviteServer(code) {
  const raw = String(code || "");
  const i = raw.indexOf(":");
  if (i <= 0) return null;
  const kind = raw.slice(0, i);
  const value = raw.slice(i + 1);
  try {
    if (kind === "server") {
      const { data } = await supabase.from("server_invites").select("server_id").eq("code", value).maybeSingle();
      if (!data?.server_id) return null;
      const { data: s } = await supabase.from("servers").select("id, name, icon_url").eq("id", data.server_id).maybeSingle();
      return s ? { id: String(s.id), name: s.name, iconUrl: s.icon_url || null } : null;
    }
    if (kind === "vanity") {
      const { data: s } = await supabase.from("servers").select("id, name, icon_url").eq("vanity_slug", value).maybeSingle();
      return s ? { id: String(s.id), name: s.name, iconUrl: s.icon_url || null } : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function inviterCorner(account) {
  const inviterId = account?.referred_by ? String(account.referred_by) : null;
  const viaCode = account?.joined_via_invite_code || null;
  if (!inviterId && !viaCode) return { inviter: null, sameInvite: [] };
  let inviter = null;
  if (inviterId) {
    const { data } = await supabase.from("users").select("id, username, display_name, avatar_url, is_banned, deleted_at").eq("id", inviterId).maybeSingle();
    if (data && !data.is_banned && !data.deleted_at) inviter = brief(data);
  }
  // Others who came with the same invite in the last two weeks (not me).
  let peers = [];
  try {
    const since = new Date(Date.now() - 14 * model.DAY_MS).toISOString();
    let q = supabase.from("users").select("id, username, display_name, avatar_url, created_at").neq("id", account.id).gte("created_at", since).limit(6);
    if (inviterId) q = q.eq("referred_by", inviterId);
    else q = q.eq("joined_via_invite_code", viaCode);
    const { data } = await q;
    peers = (data || []).map(brief).filter(Boolean);
  } catch {
    peers = [];
  }
  const ids = [...(inviter ? [inviter.id] : []), ...peers.map((p) => p.id)];
  const states = await friendStates(account.id, ids).catch(() => new Map());
  const server = await inviteServer(viaCode);
  if (inviter) {
    inviter.online = presenceOf(inviter.id);
    inviter.friend = states.get(inviter.id) || null;
    inviter.server = server;
  }
  return {
    inviter,
    viaServer: server,
    sameInvite: peers.slice(0, 3).map((p) => ({ ...p, friend: states.get(p.id) || null, online: presenceOf(p.id) })),
    sameInviteCount: peers.length,
  };
}

// ---- community + Rehber -----------------------------------------------------------------

const REHBER = {
  id: "descall-rehber",
  username: "Rehber",
  displayName: "Rehber",
  display_name: "Rehber",
  avatar_url: "/brand/descall-logo.png",
  avatarUrl: "/brand/descall-logo.png",
  isBot: true,
};

/** Public text channels of a server with "can @everyone write here" (display order). */
async function publicTextChannels(serverId) {
  const pp = require("../lib/serverPublicPage");
  const { Permissions, hasPermission, computeMemberBaseBits, computeChannelOverwriteBits } = require("../lib/serverPermissions");
  const [{ data: channels }, { data: roles }] = await Promise.all([
    supabase.from("server_channels").select("id, name, type, parent_id, position, nsfw").eq("server_id", serverId),
    supabase.from("server_roles").select("id, permissions, position, is_everyone").eq("server_id", serverId),
  ]);
  const ids = (channels || []).map((c) => c.id);
  let overrides = [];
  if (ids.length) {
    const { data } = await supabase
      .from("server_channel_overrides")
      .select("channel_id, target_type, target_id, allow_permissions, deny_permissions")
      .in("channel_id", ids.slice(0, 200));
    overrides = data || [];
  }
  const vis = pp.publicChannels({ channels: channels || [], roles: roles || [], overrides, voiceCounts: null });
  const base = computeMemberBaseBits(roles || [], []);
  const byId = new Map((channels || []).map((c) => [String(c.id), c]));
  const canSend = (id) => {
    const ch = byId.get(String(id));
    const bits = computeChannelOverwriteBits({ baseBits: base, roles: roles || [], assigned: [], overrides, channelId: id, parentId: ch?.parent_id || null, userId: "__public__" });
    return hasPermission(bits, Permissions.SEND_MESSAGES);
  };
  return {
    text: vis.text.map((c) => ({ id: c.id, name: c.name, canSend: canSend(c.id), type: byId.get(String(c.id))?.type || "text" })),
    voice: vis.voice,
  };
}

async function greetFromRehber(req, { userId, account, serverId }) {
  const ioRef = io(req);
  if (!ioRef || model.isQuietHour()) return false;
  const { data: server } = await supabase.from("servers").select("id, name, welcome_channel_id").eq("id", serverId).maybeSingle();
  if (!server) return false;
  const ch = await publicTextChannels(serverId).catch(() => ({ text: [] }));
  const intro = model.pickIntroChannel(ch.text, { welcomeChannelId: server.welcome_channel_id });
  if (!intro) return false;
  const won = await store.patchRow(userId, { rehber_greeted_at: new Date().toISOString() }, { onlyIfNull: "rehber_greeted_at" });
  if (!won) return false;
  const name = account.display_name || account.username || "";
  const now = new Date().toISOString();
  const { put } = require("../lib/botText");
  const message = {
    id: `rehber-${Date.now()}-${userId}`,
    server_id: server.id,
    channel_id: intro.id,
    sender_id: REHBER.id,
    sender: { ...REHBER },
    type: "system",
    isBot: true,
    isAppMessage: true,
    created_at: now,
    timestamp: now,
  };
  // English fallback for old clients, the reader's language through bot.onb.* keys.
  put(message, "content", "bot.onb.rehberWelcome", { name, user: require("../lib/mentionText").mentionText(account), channel: intro.name });
  message.text = message.content;
  const payload = { serverId: server.id, channelId: intro.id, message };
  ioRef.to(`server-channel:${intro.id}`).emit("server:channel:message", payload);
  ioRef.to(`user:${userId}`).emit("server:channel:message", payload);
  return true;
}

const introCache = new Map();
/** The community's introductions channel ({ id, name }), cached for five minutes. */
async function communityIntro(serverId) {
  const hit = introCache.get(serverId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  let value = null;
  try {
    const { data: server } = await supabase.from("servers").select("welcome_channel_id").eq("id", serverId).maybeSingle();
    const ch = await publicTextChannels(serverId);
    const intro = model.pickIntroChannel(ch.text, { welcomeChannelId: server?.welcome_channel_id });
    value = intro ? { id: intro.id, name: intro.name } : null;
  } catch {
    value = null;
  }
  introCache.set(serverId, { at: Date.now(), value });
  return value;
}

async function joinedToday() {
  try {
    const start = `${model.localDay(Date.now())}T00:00:00+03:00`;
    const { count } = await supabase.from("users").select("id", { count: "exact", head: true }).gte("created_at", new Date(start).toISOString());
    return Number(count) || 0;
  } catch {
    return 0;
  }
}

// ---- state ------------------------------------------------------------------------------

router.get("/state", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  if (limited(userId)) return res.status(429).json(apiError("Too many requests."));
  try {
    live.setIo(io(req));
    const [account, settings] = await Promise.all([store.accountFacts(userId), store.getSettings()]);
    if (!account) return res.status(404).json(apiError("Account not found."));
    const created = account.signup_at || account.created_at;
    const day = model.dayOfAccount(created);
    const inWin = model.inWindow(created);
    res.set("Cache-Control", "no-store");
    if (!settings.enabled || !inWin) {
      return res.json({ active: false, inWindow: inWin, day, windowDays: model.WINDOW_DAYS, enabled: settings.enabled });
    }

    let row = await store.getRow(userId);
    if (row && !row.opened_at) {
      await store.patchRow(userId, { opened_at: new Date().toISOString() }, { onlyIfNull: "opened_at" });
      analytics(userId, "onboarding_opened", {});
    }
    if (row) await firstHello.finalizeIfDue({ io: io(req), userId, row });

    // Official community server: join once, never again after the user left it.
    const communityId = settings.communityServerId;
    let memberships = await store.serverIdsOf(userId);
    let communityJoinedNow = false;
    if (row && communityId && settings.autoJoin && !row.community_joined_at && !row.community_left_at && !account.suspicious_signup) {
      const already = memberships.some((m) => m.serverId === String(communityId));
      const servers = require("./servers");
      const r = already ? { ok: true } : await servers.joinServerForUser(req, communityId, userId, { via: "onboarding_community" });
      if (r.ok) {
        await store.patchRow(userId, { community_joined_at: new Date().toISOString(), community_server_id: communityId });
        communityJoinedNow = !already;
        if (!already) memberships = await store.serverIdsOf(userId);
      }
    } else if (row?.community_joined_at && !row.community_left_at && communityId && !memberships.some((m) => m.serverId === String(communityId))) {
      await store.patchRow(userId, { community_left_at: new Date().toISOString() });
      analytics(userId, "onboarding_community_left", { server: String(communityId) });
    }
    if (row && communityId && settings.rehberEnabled && !row.rehber_greeted_at && memberships.some((m) => m.serverId === String(communityId))) {
      await greetFromRehber(req, { userId, account, serverId: communityId }).catch(() => false);
    }
    row = (await store.getRow(userId, { create: false })) || row;

    // Checklist facts, paid server side.
    const memberOf = new Set(memberships.map((m) => m.serverId));
    const joinedOther = memberships.some((m) => m.serverId !== String(communityId || ""));
    const [voice, friend] = await Promise.all([store.hasVoiceMinute(userId, created), store.hasAcceptedFriend(userId)]);
    const facts = {
      interests: Boolean(row?.interests_at),
      join: joinedOther,
      first_message: Boolean(row?.first_hello_at),
      voice,
      friend,
    };
    let claimed = row ? await store.claimedSteps(userId) : {};
    const newlyPaid = [];
    if (row) {
      for (const step of ["interests", "join", "voice", "friend"]) {
        if (!facts[step] || claimed[step] != null) continue;
        const r = await rewards.payStep({ userId, step, io: io(req), account, settings });
        if (r.paid) newlyPaid.push({ step, amount: r.amount });
      }
      if (newlyPaid.length) claimed = await store.claimedSteps(userId);
    }
    const checklist = model.buildChecklist({ facts, claimed });
    const hidden = Boolean(row?.hidden_at);
    const active = model.dashboardVisible({ inWindow: inWin, complete: checklist.complete, hidden, enabled: settings.enabled });

    // Live numbers and suggestions.
    const snap = await live.snapshot({ extraIds: communityId ? [communityId] : [] });
    const interests = row?.interests || [];
    const exclude = [...memberOf, ...(communityId ? [String(communityId)] : [])];
    const suggestions = model.rankSuggestions(snap.servers.filter((s) => s.isPublic), { interests, exclude, n: 3 }).map(live.publicCard);
    const counts = model.interestCounts(snap.servers.filter((s) => s.isPublic));
    const inInterest = snap.servers.filter((s) => s.isPublic && s.category && interests.includes(s.category) && model.isLive(s));
    const comm = communityId ? snap.servers.find((s) => s.id === String(communityId)) : null;
    let community = null;
    if (communityId && (comm || memberOf.has(String(communityId)))) {
      let name = comm?.name;
      let iconUrl = comm?.iconUrl || null;
      if (!name) {
        const { data } = await supabase.from("servers").select("name, icon_url").eq("id", communityId).maybeSingle();
        name = data?.name || "Descall";
        iconUrl = data?.icon_url || null;
      }
      community = {
        id: String(communityId),
        name,
        iconUrl,
        members: comm?.members ?? null,
        online: comm?.online ?? null,
        joined: memberOf.has(String(communityId)),
        autoJoined: Boolean(row?.community_joined_at),
        joinedNow: communityJoinedNow,
        left: Boolean(row?.community_left_at),
        introChannel: await communityIntro(String(communityId)),
      };
    }
    const myServerIds = [...memberOf].slice(0, 12);
    let myServers = [];
    if (myServerIds.length) {
      const { data } = await supabase.from("servers").select("id, name, icon_url").in("id", myServerIds);
      myServers = (data || []).map((s) => ({ id: String(s.id), name: s.name, iconUrl: s.icon_url || null, official: String(s.id) === String(communityId || "") }));
    }
    const corner = await inviterCorner(account).catch(() => ({ inviter: null, sameInvite: [] }));
    // The invite's server is already joined by the landing; it is not suggested again.
    return res.json({
      active,
      inWindow: inWin,
      hidden,
      enabled: true,
      schema: Boolean(row),
      day,
      windowDays: model.WINDOW_DAYS,
      me: { id: userId, username: account.username, displayName: account.display_name || null },
      balance: Number(account.descoin_balance) || 0,
      interests,
      interestCatalog: model.INTERESTS.map((id) => ({ id, ...counts[id] })),
      online: snap.online,
      interestLive: {
        servers: inInterest.length,
        online: inInterest.reduce((n, s) => n + (s.online || 0), 0),
        lastHour: inInterest.reduce((n, s) => n + (s.lastHour || 0), 0),
      },
      suggestions,
      community,
      rehber: settings.rehberEnabled && community ? { joinedToday: await joinedToday(), greeted: Boolean(row?.rehber_greeted_at) } : null,
      ...corner,
      myServers,
      checklist,
      newlyPaid,
      firstHello: { at: row?.first_hello_at || null, pending: Boolean(row?.first_hello_pending), reward: 50, badge: model.BADGE_ID },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[onboarding] state failed:", err?.message || err);
    return res.status(500).json(apiError("Could not load the start dashboard."));
  }
});

router.put("/interests", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  if (limited(userId)) return res.status(429).json(apiError("Too many requests."));
  try {
    const interests = model.sanitizeInterests(req.body?.interests);
    const row = await store.getRow(userId);
    if (!row) return res.status(503).json(apiError("Not available yet.", null, { code: "ONBOARDING_UNAVAILABLE" }));
    const patch = { interests };
    if (interests.length && !row.interests_at) patch.interests_at = new Date().toISOString();
    await store.patchRow(userId, patch);
    if (interests.length) analytics(userId, "onboarding_interests", { interest: interests.join(",") });
    let paid = null;
    if (patch.interests_at) {
      const r = await rewards.payStep({ userId, step: "interests", io: io(req) });
      if (r.paid) paid = { step: "interests", amount: r.amount };
    }
    return res.json({ interests, paid });
  } catch (err) {
    console.error("[onboarding] interests failed:", err?.message || err);
    return res.status(500).json(apiError("Could not save interests."));
  }
});

// ---- preview before joining -------------------------------------------------------------

function initials(name) {
  return String(name || "?").trim().slice(0, 1).toLocaleUpperCase("tr") || "?";
}

router.get("/servers/:id/preview", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  const serverId = String(req.params.id || "");
  if (!UUID_RE.test(serverId)) return res.status(400).json(apiError("Bad server id."));
  if (limited(userId, 90)) return res.status(429).json(apiError("Too many requests."));
  try {
    const settings = await store.getSettings();
    const { data: server } = await supabase
      .from("servers")
      .select("id, name, icon_url, description, owner_id, is_public, directory_hidden_at, welcome_channel_id, rules_text")
      .eq("id", serverId)
      .maybeSingle();
    const official = String(settings.communityServerId || "") === serverId;
    if (!server || server.directory_hidden_at || (!server.is_public && !official)) {
      return res.status(404).json(apiError("Preview not available.", null, { code: "PREVIEW_UNAVAILABLE" }));
    }
    const { data: ban } = await supabase.from("server_bans").select("user_id").eq("server_id", serverId).eq("user_id", userId).maybeSingle();
    if (ban) return res.status(403).json(apiError("You are banned from this server.", null, { code: "BANNED" }));

    const snap = await live.snapshot({ extraIds: [serverId] });
    const stats = snap.servers.find((s) => s.id === serverId) || null;
    const ch = await publicTextChannels(serverId);
    const intro = model.pickIntroChannel(ch.text, { welcomeChannelId: server.welcome_channel_id });
    const wanted = String(req.query.channel || "");
    const shown = ch.text.find((c) => c.id === wanted) || ch.text.find((c) => /^(genel|general|sohbet|chat)$/i.test(c.name)) || intro || ch.text[0] || null;

    let messages = [];
    if (shown) {
      const { maskProfanity } = require("../lib/profanity");
      const { data } = await supabase
        .from("server_messages")
        .select("id, sender_id, content, media_type, created_at")
        .eq("channel_id", shown.id)
        .order("created_at", { ascending: false })
        .limit(10);
      const rows = (data || []).reverse();
      const senderIds = [...new Set(rows.map((r) => String(r.sender_id)))];
      const users = new Map();
      if (senderIds.length) {
        const { data: us } = await supabase.from("users").select("id, username, display_name, avatar_url").in("id", senderIds);
        for (const u of us || []) users.set(String(u.id), u);
      }
      messages = rows.map((r) => {
        const u = users.get(String(r.sender_id));
        const name = u?.display_name || u?.username || "?";
        const text = String(r.content || "").replace(/<@!?[0-9a-f-]{20,}>/gi, "@").slice(0, 280);
        return {
          id: String(r.id),
          author: { name, initial: initials(name), avatarUrl: u?.avatar_url || null, me: String(r.sender_id) === userId },
          text: text && !/^__voice__:/.test(text) ? maskProfanity(text) : "",
          media: r.media_type ? (r.media_type === "voice" ? "voice" : "media") : null,
          at: r.created_at,
        };
      });
    }
    const rules = String(server.rules_text || "")
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
      .filter(Boolean);
    const { maskProfanity } = require("../lib/profanity");
    analytics(userId, "onboarding_previewed", { server: serverId });
    res.set("Cache-Control", "no-store");
    return res.json({
      server: {
        id: serverId,
        name: maskProfanity(server.name || ""),
        iconUrl: server.icon_url || null,
        description: server.description ? maskProfanity(String(server.description).slice(0, 200)) : null,
        members: stats?.members ?? null,
        online: stats?.online ?? null,
        official,
      },
      channels: ch.text.slice(0, 6).map((c) => ({ id: c.id, name: c.name, canSend: c.canSend, intro: intro ? c.id === intro.id : false })),
      channelId: shown?.id || null,
      introChannel: intro ? { id: intro.id, name: intro.name } : null,
      messages,
      voice: stats?.voice || (ch.voice.find((v) => v.count > 0) ? { ...ch.voice.find((v) => v.count > 0), people: [] } : null),
      crowd: stats?.crowd || model.crowdHours([]),
      today: stats?.today ?? 0,
      replyMinutes: stats?.replyMinutes ?? null,
      rules: rules.slice(0, 3).map((r) => maskProfanity(r.slice(0, 140))),
      rulesCount: rules.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[onboarding] preview failed:", err?.message || err);
    return res.status(500).json(apiError("Could not load the preview."));
  }
});

// ---- after "Katıl ve gönder" ------------------------------------------------------------

router.get("/track", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  const { serverId, channelId, messageId } = req.query || {};
  if (![serverId, channelId, messageId].every((v) => UUID_RE.test(String(v || "")))) return res.status(400).json(apiError("Bad ids."));
  if (limited(userId, 90)) return res.status(429).json(apiError("Too many requests."));
  try {
    const { data: mine } = await supabase
      .from("server_messages")
      .select("id, created_at, channel_id, sender_id")
      .eq("id", messageId)
      .eq("sender_id", userId)
      .maybeSingle();
    if (!mine || String(mine.channel_id) !== String(channelId)) return res.json({ exists: false, replies: 0, reactions: 0, repliers: [] });
    const [{ data: after }, { count: reactions }] = await Promise.all([
      supabase
        .from("server_messages")
        .select("id, sender_id, content, reply_to, created_at")
        .eq("channel_id", channelId)
        .gt("created_at", mine.created_at)
        .order("created_at", { ascending: true })
        .limit(60),
      supabase.from("reactions").select("message_id", { count: "exact", head: true }).eq("message_id", messageId),
    ]);
    // Replies mention the sender as "@username" (the "<@id>" form is kept for old rows).
    const { data: meRow } = await supabase.from("users").select("username").eq("id", userId).maybeSingle();
    const { MENTIONABLE } = require("../lib/mentionText");
    const meMention = MENTIONABLE.test(String(meRow?.username || "")) ? `@${meRow.username}` : null;
    const replies = (after || []).filter((m) => {
      if (String(m.sender_id) === userId) return false;
      const rt = m.reply_to && typeof m.reply_to === "object" ? m.reply_to : null;
      if (rt && String(rt.id || rt.messageId || "") === String(messageId)) return true;
      const text = String(m.content || "");
      return text.includes(`<@${userId}>`) || (meMention ? new RegExp(`${meMention}(?![A-Za-z0-9_])`).test(text) : false);
    });
    const ids = [...new Set(replies.map((r) => String(r.sender_id)))].slice(0, 3);
    let repliers = [];
    if (ids.length) {
      const { data: us } = await supabase.from("users").select("id, username, display_name, avatar_url").in("id", ids);
      repliers = (us || []).map(brief);
    }
    const others = new Set((after || []).filter((m) => String(m.sender_id) !== userId).map((m) => String(m.sender_id))).size;
    res.set("Cache-Control", "no-store");
    return res.json({ exists: true, replies: replies.length, reactions: Number(reactions) || 0, repliers, activeAfter: others, serverId, channelId, messageId });
  } catch (err) {
    console.error("[onboarding] track failed:", err?.message || err);
    return res.status(500).json(apiError("Could not load replies."));
  }
});

const CLIENT_EVENTS = new Set([
  "onboarding_previewed",
  "onboarding_joined",
  "onboarding_undo",
  "onboarding_invite_shared",
  "onboarding_greeted_inviter",
]);

router.post("/event", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  if (limited(userId)) return res.status(204).end();
  const event = String(req.body?.event || "");
  if (!CLIENT_EVENTS.has(event)) return res.status(400).json(apiError("Unknown event."));
  const src = req.body?.props && typeof req.body.props === "object" ? req.body.props : {};
  const props = {
    server: UUID_RE.test(String(src.server || "")) ? String(src.server) : "",
    slot: model.cleanSlot(src.slot),
    interest: model.sanitizeInterests(String(src.interest || "").split(",")).join(","),
  };
  if (event === "onboarding_joined" && props.server) {
    await store.patchRow(userId, { last_join: { serverId: props.server, slot: props.slot, interest: props.interest || null, at: new Date().toISOString() } });
  }
  analytics(userId, event, props);
  return res.status(204).end();
});

router.post("/hide", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  if (limited(userId)) return res.status(429).json(apiError("Too many requests."));
  const hidden = req.body?.hidden !== false;
  const row = await store.getRow(userId);
  if (!row) return res.status(503).json(apiError("Not available yet.", null, { code: "ONBOARDING_UNAVAILABLE" }));
  await store.patchRow(userId, { hidden_at: hidden ? new Date().toISOString() : null });
  if (hidden) analytics(userId, "onboarding_hidden", {});
  return res.json({ hidden });
});

router.post("/undo", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  if (limited(userId)) return res.status(429).json(apiError("Too many requests."));
  const messageId = String(req.body?.messageId || "");
  const serverId = String(req.body?.serverId || "");
  const cancelled = await firstHello.cancelPending(userId, UUID_RE.test(messageId) ? messageId : null).catch(() => false);
  analytics(userId, "onboarding_undo", { server: UUID_RE.test(serverId) ? serverId : "" });
  return res.json({ cancelled: Boolean(cancelled) });
});

/** The personal invite link (same as src/lib/referral.js) and its QR code as SVG. */
router.get("/invite-qr", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  if (limited(userId, 30)) return res.status(429).json(apiError("Too many requests."));
  try {
    const { data: u } = await supabase.from("users").select("username").eq("id", userId).maybeSingle();
    const name = String(u?.username || req.user.username || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 24);
    const url = name ? `https://descall.com/register?ref=${encodeURIComponent(name)}` : "https://descall.com/register";
    const QRCode = require("qrcode");
    const svg = (await QRCode.toString(`${url}${url.includes("?") ? "&" : "?"}src=qr`, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#0b0c12ff", light: "#ffffffff" },
    })).replace(/<\?xml[^>]*>/, "").trim();
    res.set("Cache-Control", "private, max-age=3600");
    return res.json({ url, svg });
  } catch (err) {
    console.error("[onboarding] invite qr failed:", err?.message || err);
    return res.status(500).json(apiError("Could not load the preview."));
  }
});

module.exports = router;
module.exports.__test = { limited, hits, REHBER, publicTextChannels, inviterCorner };
