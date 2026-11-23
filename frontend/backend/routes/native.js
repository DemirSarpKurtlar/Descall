"use strict";

/**
 * Native glance API (4.2), mounted at /api/native. Read-only data for Siri / Shortcuts /
 * Spotlight (iOS App Intents), iOS widgets and Live Activity (DescallKit), and Android
 * launcher shortcuts. Writes stay on the existing routes the native clients already use
 * (POST /api/watch/send, POST /api/watch/status: same permission checks and fan-out).
 *
 *   GET /summary                 → { me, unread, friends: { onlineCount, offlineCount, online[] }, voice[], generatedAt }
 *   GET /friends?q=&ids=a,b      → { friends[] } every accepted friend with presence (EntityQuery)
 *   GET /voice?q=&occupied=1     → { rooms[] } voice / stage channels the user can see, with occupants
 *   GET /destinations?q=         → { destinations[] } servers, text channels and groups
 *
 * Shaping is in lib/nativeGlance.js (pure, tested). Nothing here logs a token, a body or a name.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const glance = require("../lib/nativeGlance");

const READS = { windowMs: 60 * 1000, max: 90 };
const QUERY_MAX = 64;

function readQuery(req) {
  return String(req.query?.q || "").slice(0, QUERY_MAX);
}

function createNativeRouter(deps = {}) {
  const router = express.Router();
  const profile = () => deps.userProfile || require("../lib/userProfile");
  const dmLib = () => deps.dmMessages || require("../lib/dmMessages");
  const groupList = () => deps.groupList || require("../lib/groupList");
  const receipts = () => deps.readReceipts || require("../lib/readReceipts");
  const dmPrefs = () => deps.dmPrefs || require("../lib/dmConversationPrefs");
  const dmUnread = () => deps.dmUnread || require("../lib/dmUnread");
  const state = () => deps.state || require("../runtime/sharedState");
  const serverList = () => deps.serverList || require("./servers").buildMyServerList;
  const getDb = deps.getDb || (() => require("../db/supabase"));

  router.use(requireAuth);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (state().bannedUserIds?.has?.(req.user.id)) return res.status(403).json({ error: "banned" });
    const key = `native:r:${req.user.id}`;
    if (rejectIfLimited(res, [peek(key, READS)])) return;
    recordFailure(key, READS);
    return next();
  });

  function fail(res, err, where) {
    console.error(`[native] ${where} failed:`, err?.message || err);
    return res.status(500).json({ error: "failed" });
  }

  /** Accepted friends with live presence (same rule as routes/watch.js friendEntries). */
  async function friendEntries(userId) {
    const ids = await dmLib().listAcceptedFriendIds(userId);
    if (!ids.length) return [];
    const entries = ids.map((id) => profile().enrichFriendEntry(id));
    const missing = entries.filter((e) => !e.username || e.username === "?").map((e) => e.id);
    if (missing.length) {
      const { data } = await getDb().from("users").select("id, username, display_name, avatar_url, custom_status").in("id", missing.slice(0, 200));
      const byId = new Map((data || []).map((u) => [u.id, u]));
      for (const e of entries) {
        const u = byId.get(e.id);
        if (!u) continue;
        e.username = u.username;
        e.displayName = e.displayName || u.display_name || null;
        e.avatarUrl = e.avatarUrl || u.avatar_url || null;
        e.customStatus = e.customStatus || u.custom_status || null;
      }
    }
    return entries;
  }

  async function myServers(userId) {
    const payload = await serverList()(userId);
    return Array.isArray(payload?.servers) ? payload.servers : [];
  }

  /** DM counts from the live map (filled from dm_messages after a restart, lib/dmUnread). */
  async function dmUnreadMap(userId, friendIds) {
    const all = state().dmUnreadByUser;
    if (!all) return new Map();
    if (!all.has(userId)) all.set(userId, new Map());
    const map = all.get(userId);
    await dmUnread().hydrateDmUnread({ db: getDb(), userId, unreadMap: map, friendIds }).catch(() => {});
    return map;
  }

  async function channelUnread(userId, servers) {
    const channelsById = new Map();
    for (const s of servers) {
      if (s?.notificationLevel === "muted") continue;
      for (const c of Array.isArray(s.channels) ? s.channels : []) {
        if (!c?.id || !["text", "announcement"].includes(String(c.type || "text"))) continue;
        channelsById.set(String(c.id), { name: c.name || "kanal", serverName: s.name || "", serverId: s.id });
      }
    }
    const ids = [...channelsById.keys()].slice(0, 500);
    if (!ids.length) return { counts: {}, channelsById };
    const { data, error } = await getDb()
      .from("server_channel_reads")
      .select("channel_id, unread_count")
      .eq("user_id", userId)
      .in("channel_id", ids);
    if (error) throw error;
    const counts = {};
    for (const row of data || []) {
      const n = Math.max(0, Number(row.unread_count) || 0);
      if (n > 0 && row.channel_id) counts[row.channel_id] = n;
    }
    return { counts, channelsById };
  }

  router.get("/summary", async (req, res) => {
    const userId = req.user.id;
    try {
      const [meRow, friends, servers, groups, prefs] = await Promise.all([
        profile().loadUserProfile(userId).catch(() => null),
        friendEntries(userId),
        myServers(userId).catch(() => []),
        groupList().getUserGroups(userId).catch(() => []),
        dmPrefs().listPrefs(userId).catch(() => []),
      ]);
      const liveGroups = (groups || []).filter((g) => g?.id && !g.removed && !g.removedAt);
      const [dmMap, groupCounts, channels] = await Promise.all([
        dmUnreadMap(userId, friends.map((f) => f.id)),
        receipts().groupUnreadCounts(userId, liveGroups.map((g) => g.id)).catch(() => ({})),
        channelUnread(userId, servers).catch(() => ({ counts: {}, channelsById: new Map() })),
      ]);
      const mutedPeers = new Set((prefs || []).filter((p) => p?.muted).map((p) => String(p.peerId)));
      const unread = glance.shapeUnread({
        dmUnreadByPeer: dmMap,
        groupUnread: groupCounts,
        channelUnread: channels.counts,
        friendsById: new Map(friends.map((f) => [String(f.id), f])),
        groupsById: new Map(liveGroups.map((g) => [String(g.id), g])),
        channelsById: channels.channelsById,
        mutedPeers,
      });
      const live = state().presence?.get?.(userId);
      res.json(glance.shapeSummary({
        me: {
          id: userId,
          username: meRow?.username || req.user.username,
          displayName: meRow?.display_name || null,
          avatarUrl: meRow?.avatar_url || null,
        },
        myStatus: live?.status || meRow?.presence_status || "online",
        friends,
        unread,
        voice: glance.shapeVoiceRooms(servers, state().activeServerVoiceCalls, { occupiedOnly: true }),
      }));
    } catch (err) {
      return fail(res, err, "summary");
    }
  });

  router.get("/friends", async (req, res) => {
    const ids = String(req.query?.ids || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
    try {
      return res.json(glance.shapeFriendList(await friendEntries(req.user.id), { q: readQuery(req), ids }));
    } catch (err) {
      return fail(res, err, "friends");
    }
  });

  router.get("/voice", async (req, res) => {
    try {
      const rooms = glance.shapeVoiceRooms(await myServers(req.user.id), state().activeServerVoiceCalls, {
        q: readQuery(req),
        occupiedOnly: req.query?.occupied === "1",
        limit: 40,
      });
      return res.json({ rooms });
    } catch (err) {
      return fail(res, err, "voice");
    }
  });

  router.get("/destinations", async (req, res) => {
    const userId = req.user.id;
    try {
      const [servers, groups] = await Promise.all([myServers(userId), groupList().getUserGroups(userId).catch(() => [])]);
      return res.json(glance.shapeDestinations({ servers, groups, q: readQuery(req) }));
    } catch (err) {
      return fail(res, err, "destinations");
    }
  });

  return router;
}

module.exports = createNativeRouter();
module.exports.createNativeRouter = createNativeRouter;
