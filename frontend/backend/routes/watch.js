"use strict";

/**
 * Apple Watch API (3.7.17), mounted at /api/watch.
 *
 * The watch never holds a token: it asks the paired iPhone over WatchConnectivity
 * and the iPhone's native bridge (DescallWatchBridge.swift) calls these routes
 * with the signed-in session. Admin screens use the existing /api/admin routes
 * through the same bridge (same permission, 2FA and step-up checks).
 *
 *   GET  /home                 → { me, conversations[], adminSections }
 *   GET  /thread?conv=         → { conv, title, subtitle, messages[] } (last 20)
 *   POST /send   { conv, text }
 *   POST /read   { conv }
 *   GET  /friends              → { online[], onlineCount, offlineCount }
 *   POST /status { status }    online / idle / dnd / invisible
 *
 * Sending, reading and the thread reuse lib/notifyActions (the iOS notification
 * quick actions): same friend / member / channel permission checks, rate limits
 * and real-time fan-out as a message sent from the phone.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const { NotifyActionError, createNotifyActions } = require("../lib/notifyActions");
const watch = require("../lib/watchApi");
const { requestLang } = require("../lib/i18n");

const READS = { windowMs: 60 * 1000, max: 120 };
const WRITES = { windowMs: 60 * 1000, max: 30 };
const THREAD_LIMIT = 20;
const THREAD_TEXT_MAX = 500;

function createWatchRouter(deps = {}) {
  const router = express.Router();
  const actions = deps.actions || createNotifyActions(deps);
  const profile = () => deps.userProfile || require("../lib/userProfile");
  const dmLib = () => deps.dmMessages || require("../lib/dmMessages");
  const groupList = () => deps.groupList || require("../lib/groupList");
  const perms = () => deps.adminPermissions || require("../lib/adminPermissions");
  const state = () => deps.state || require("../runtime/sharedState");
  const fanout = () => deps.presenceFanout || require("../runtime/presenceFanoutInstance");
  const io = (req) => deps.io || req.app?.get?.("io") || null;

  router.use(requireAuth);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (state().bannedUserIds?.has?.(req.user.id)) return res.status(403).json({ error: "banned" });
    const write = req.method !== "GET";
    const key = `watch:${write ? "w" : "r"}:${req.user.id}`;
    const rule = write ? WRITES : READS;
    if (rejectIfLimited(res, [peek(key, rule)])) return;
    recordFailure(key, rule);
    return next();
  });

  function fail(res, err, where) {
    if (err instanceof NotifyActionError) return res.status(err.status).json({ error: err.code });
    console.error(`[watch] ${where} failed:`, err?.message || err);
    return res.status(500).json({ error: "failed" });
  }

  const getDb = deps.getDb || (() => require("../db/supabase"));

  /** Friend rows with live presence; names the profile cache does not hold yet come from one query. */
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

  router.get("/home", async (req, res) => {
    const userId = req.user.id;
    try {
      const [meRow, friends, maps, groups, adminRow] = await Promise.all([
        profile().loadUserProfile(userId).catch(() => null),
        friendEntries(userId),
        dmLib().buildDmPreviewMaps(userId).catch(() => ({ dmPreviewsByPeer: {}, dmLastActivityByPeer: {} })),
        groupList().getUserGroups(userId).catch(() => []),
        perms().loadRow(userId).catch(() => null),
      ]);
      const sections = perms().sectionsFor(req.user, adminRow);
      const live = state().presence?.get?.(userId);
      const myStatus = live?.status || meRow?.presence_status || "online";
      res.json(watch.shapeHome({
        me: {
          id: userId,
          username: meRow?.username || req.user.username,
          displayName: meRow?.display_name || null,
          avatarUrl: meRow?.avatar_url || null,
        },
        myStatus,
        friends,
        previews: maps?.dmPreviewsByPeer || {},
        lastActivity: maps?.dmLastActivityByPeer || {},
        groups,
        adminSections: sections.length ? sections : null,
        lang: requestLang(req, "tr"),
      }));
    } catch (err) {
      return fail(res, err, "home");
    }
  });

  router.get("/thread", async (req, res) => {
    const conv = String(req.query?.conv || "");
    if (!watch.validConv(conv)) return res.status(400).json({ error: "bad_conv" });
    try {
      const out = await actions.thread(req.user.id, { conv, limit: THREAD_LIMIT, textMax: THREAD_TEXT_MAX });
      return res.json(watch.shapeThread(out, { lang: requestLang(req, "tr") }));
    } catch (err) {
      // A DM with no messages yet is an empty thread, not an error.
      if (err instanceof NotifyActionError && err.code === "empty") {
        return res.json(watch.shapeThread({ conv, title: "", messages: [] }));
      }
      return fail(res, err, "thread");
    }
  });

  router.post("/send", async (req, res) => {
    const conv = String(req.body?.conv || "");
    const text = String(req.body?.text || "").trim();
    if (!watch.validConv(conv)) return res.status(400).json({ error: "bad_conv" });
    if (!text || text.length > 1000) return res.status(400).json({ error: "bad_text" });
    try {
      const out = await actions.reply(io(req), req.user.id, { conv, text });
      return res.json({ ok: true, messageId: out?.messageId || null });
    } catch (err) {
      return fail(res, err, "send");
    }
  });

  router.post("/read", async (req, res) => {
    const conv = String(req.body?.conv || "");
    if (!watch.validConv(conv)) return res.status(400).json({ error: "bad_conv" });
    try {
      await actions.read(io(req), req.user.id, { conv });
      return res.json({ ok: true });
    } catch (err) {
      return fail(res, err, "read");
    }
  });

  router.get("/friends", async (req, res) => {
    try {
      return res.json(watch.shapeFriends(await friendEntries(req.user.id)));
    } catch (err) {
      return fail(res, err, "friends");
    }
  });

  router.post("/status", async (req, res) => {
    const status = String(req.body?.status || "");
    if (!watch.STATUSES.includes(status)) return res.status(400).json({ error: "bad_status" });
    const userId = req.user.id;
    try {
      const p = state().presence?.get?.(userId);
      if (p) {
        p.status = status;
        state().presence.set(userId, p);
      }
      await profile().savePresenceStatus(userId, status);
      const server = io(req);
      server?.to?.(`user:${userId}`)?.emit?.("status:current", { status });
      fanout().markPresenceDirty(userId);
      return res.json({ ok: true, status });
    } catch (err) {
      return fail(res, err, "status");
    }
  });

  return router;
}

module.exports = createWatchRouter();
module.exports.createWatchRouter = createWatchRouter;
