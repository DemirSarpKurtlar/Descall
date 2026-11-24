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
 *   POST /wave { to, source? }   → { ok, remainingToday, remainingForFriend, resetAt } "El salla" from a
 *                                   widget (lib/friendWave.js: friends only, daily limits, push + socket)
 *
 * Widgets (draft B): ?activity=1 on /summary and /friends adds each friend's activity line,
 * ?previews=1 on /summary adds the message bubbles to unread.top (both opt-in: Siri and
 * Shortcuts keep the smaller, cheaper answers).
 *
 * Shaping is in lib/nativeGlance.js (pure, tested). Nothing here logs a token, a body or a name.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const glance = require("../lib/nativeGlance");

const READS = { windowMs: 60 * 1000, max: 90 };
const WAVES = { windowMs: 60 * 1000, max: 12 };
const PREVIEW_ROWS = 5;
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
  const activityRows = () => deps.visibleActivityRows || require("./activityPresenceBatch").visibleActivityRows;
  const previewPref = () => deps.pushPreview || require("../lib/pushPreview");
  const wave = () => deps.friendWave || require("../lib/friendWave");
  const blocking = () => deps.blocking || require("../lib/blocking");
  const pushLib = () => deps.webPush || require("../lib/webPush");
  const watchShape = () => require("../lib/watchApi");

  function wants(req, key) {
    return String(req.query?.[key] || "") === "1";
  }

  router.use(requireAuth);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (state().bannedUserIds?.has?.(req.user.id)) return res.status(403).json({ error: "banned" });
    const key = `native:r:${req.user.id}`;
    if (rejectIfLimited(res, [peek(key, READS)])) return;
    recordFailure(key, READS);
    return next();
  });

  /** Friend entries + activity line (voice whereabouts, visible app activity). */
  async function withActivity(userId, friends, servers) {
    const online = friends.filter((f) => f?.id && f.status && f.status !== "offline" && f.status !== "invisible").map((f) => String(f.id));
    let appRows = new Map();
    if (online.length) {
      try {
        const rows = await activityRows()(online.slice(0, 500));
        appRows = new Map(Object.entries(rows || {}).filter(([, r]) => r && !r.privacy));
      } catch {
        appRows = new Map();
      }
    }
    const whereabouts = glance.voiceWhereabouts(servers || (await myServers(userId).catch(() => [])), state().activeServerVoiceCalls);
    return glance.withActivity(friends, { whereabouts, appRows });
  }

  /** Last message per unread conversation (top rows only), for the widget bubbles. */
  async function previewSources(userId, unread, { username, groupsById }) {
    const rows = (unread?.top || []).slice(0, PREVIEW_ROWS);
    const dmLast = {};
    const channelLast = {};
    const db = getDb();
    await Promise.all(rows.map(async (row) => {
      const [kind, id] = String(row.conv || "").split(":");
      try {
        if (kind === "dm") {
          const cached = dmLib().getLastDmMessage?.(userId, id);
          if (cached && String(cached.from?.id || cached.from || "") === String(id)) {
            dmLast[id] = { text: dmLib().formatDmPreview(cached), at: cached.timestamp || cached.created_at || null };
            return;
          }
          const { data } = await db
            .from("dm_messages")
            .select("content, media_url, media_type, created_at")
            .eq("from_user_id", id)
            .eq("to_user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            dmLast[id] = {
              text: dmLib().formatDmPreview({ text: data.content, mediaUrl: data.media_url, mediaType: data.media_type }),
              at: data.created_at,
            };
          }
        } else if (kind === "channel") {
          const { data } = await db
            .from("server_messages")
            .select("content, media_url, media_type, created_at, sender:sender_id (id, username, display_name, avatar_url)")
            .eq("channel_id", id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            const raw = String(data.content || "");
            const text = raw && !raw.startsWith("{") && !raw.startsWith("__voice__:")
              ? raw
              : dmLib().formatDmPreview({ text: "", mediaUrl: data.media_url, mediaType: data.media_type });
            channelLast[id] = { text, at: data.created_at, sender: data.sender || null, mention: glance.mentionsViewer(raw, username) };
          }
        }
      } catch {
        /* that bubble keeps its count only */
      }
    }));
    return { dmLast, channelLast, groupsById };
  }

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
      const lang = String(req.get?.("accept-language") || "tr").slice(0, 5);
      let unreadOut = unread;
      if (wants(req, "previews") && unread.top.length) {
        const shown = await previewPref().previewEnabled(userId).catch(() => true);
        if (shown) {
          const groupsById = new Map(liveGroups.map((g) => [String(g.id), g]));
          const src = await previewSources(userId, unread, { username: meRow?.username || req.user.username, groupsById });
          unreadOut = glance.attachPreviews(unread, {
            ...src,
            friendsById: new Map(friends.map((f) => [String(f.id), f])),
            text: (t) => watchShape().previewText(t, lang.split("-")[0]),
          });
        }
      }
      const friendRows = wants(req, "activity") ? await withActivity(userId, friends, servers) : friends;
      const live = state().presence?.get?.(userId);
      res.json(glance.shapeSummary({
        me: {
          id: userId,
          username: meRow?.username || req.user.username,
          displayName: meRow?.display_name || null,
          avatarUrl: meRow?.avatar_url || null,
        },
        myStatus: live?.status || meRow?.presence_status || "online",
        friends: friendRows,
        unread: unreadOut,
        voice: glance.shapeVoiceRooms(servers, state().activeServerVoiceCalls, { occupiedOnly: true }),
      }));
    } catch (err) {
      return fail(res, err, "summary");
    }
  });

  router.get("/friends", async (req, res) => {
    const ids = String(req.query?.ids || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
    try {
      let entries = await friendEntries(req.user.id);
      if (wants(req, "activity")) entries = await withActivity(req.user.id, entries, null);
      return res.json(glance.shapeFriendList(entries, { q: readQuery(req), ids }));
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

  router.post("/wave", async (req, res) => {
    const userId = req.user.id;
    const key = `native:w:${userId}`;
    if (rejectIfLimited(res, [peek(key, WAVES)])) return;
    recordFailure(key, WAVES);
    const io = req.app?.get?.("io");
    try {
      const out = await wave().sendWave({
        db: getDb(),
        isAcceptedFriend: (a, b) => dmLib().isAcceptedFriend(a, b),
        isBlockedEitherWay: (a, b) => blocking().isBlockedEitherWay(a, b),
        emit: (to, event, payload) => {
          if (io) io.to(`user:${to}`).emit(event, payload);
        },
        push: (to, payload) => pushLib().sendFriendWavePush(to, payload),
        sender: async (id) => {
          const row = await profile().loadUserProfile(id).catch(() => null);
          return {
            username: row?.username || req.user.username || null,
            name: row?.display_name || row?.username || req.user.username || null,
            avatarUrl: row?.avatar_url || null,
          };
        },
      }, { fromId: userId, to: req.body?.to, source: String(req.body?.source || "widget") });
      return res.json(out);
    } catch (err) {
      if (err instanceof wave().WaveError) {
        if (err.status === 429) res.set("Retry-After", String(err.retryAfter || 60));
        return res.status(err.status).json({
          error: err.code,
          ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
          ...(err.resetAt ? { resetAt: new Date(err.resetAt).toISOString() } : {}),
        });
      }
      return fail(res, err, "wave");
    }
  });

  return router;
}

module.exports = createNativeRouter();
module.exports.createNativeRouter = createNativeRouter;
