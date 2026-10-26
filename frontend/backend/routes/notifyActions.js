"use strict";

/**
 * 3.0.0 (A4) — iOS notification actions (mounted at /api/messages).
 *
 *   POST /notify-token   session JWT → scoped notify token (the app keeps it
 *                        in the shared Keychain for its notification extensions)
 *   POST /quick-reply    { conv, text }
 *   POST /quick-react    { conv, messageId, emoji }   (❤️ 😂 👍 😮 😢)
 *   POST /quick-read     { conv }
 *   GET  /notify-thread  ?conv=&messageId=   last messages for the expanded view
 *
 * conv is the push thread-id: "dm:<peerId>", "group:<id>", "channel:<id>".
 * Tokens and message text are never logged.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { sessionAllowed } = require("../lib/sessionGuard");
const { bannedUserIds } = require("../runtime/sharedState");
const {
  TOKEN_TTL_S,
  NotifyActionError,
  signNotifyToken,
  verifyNotifyToken,
  createNotifyActions,
} = require("../lib/notifyActions");

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 40;

function createNotifyActionsRouter(deps = {}) {
  const router = express.Router();
  const actions = deps.actions || createNotifyActions(deps);
  const allowSession = deps.sessionAllowed || sessionAllowed;
  const hits = new Map();

  function limited(userId, now = Date.now()) {
    const cur = hits.get(userId);
    if (!cur || now - cur.at > WINDOW_MS) {
      hits.set(userId, { at: now, n: 1 });
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (now - v.at > WINDOW_MS) hits.delete(k);
      }
      return false;
    }
    cur.n += 1;
    return cur.n > MAX_PER_WINDOW;
  }

  function fail(res, err) {
    if (err instanceof NotifyActionError) {
      return res.status(err.status).json({ ok: false, error: err.code });
    }
    console.error("[notify-actions] failed:", err?.message || err);
    return res.status(500).json({ ok: false, error: "failed" });
  }

  async function notifyAuth(req, res, next) {
    try {
      const header = String(req.headers.authorization || "");
      if (!header.startsWith("Bearer ")) throw new NotifyActionError(401, "token_missing");
      const decoded = verifyNotifyToken(header.slice(7));
      const session = await allowSession({ sub: decoded.sub, sid: decoded.sid, iat: decoded.iat });
      if (!session.ok) {
        if (session.code === "SESSION_CHECK_FAILED") throw new NotifyActionError(503, "session_check_failed");
        throw new NotifyActionError(401, "session_revoked");
      }
      if (bannedUserIds.has(decoded.sub)) throw new NotifyActionError(403, "banned");
      if (limited(decoded.sub)) throw new NotifyActionError(429, "rate_limited");
      req.notifyUser = { id: decoded.sub };
      return next();
    } catch (err) {
      return fail(res, err);
    }
  }

  router.post("/notify-token", requireAuth, (req, res) => {
    try {
      if (!req.user?.sid) throw new NotifyActionError(409, "session_required");
      const token = signNotifyToken({ userId: req.user.id, sid: req.user.sid });
      res.set("Cache-Control", "no-store");
      return res.json({
        token,
        userId: req.user.id,
        expiresAt: new Date(Date.now() + TOKEN_TTL_S * 1000).toISOString(),
      });
    } catch (err) {
      return fail(res, err);
    }
  });

  const io = (req) => deps.io || req.app.get("io");

  router.post("/quick-reply", notifyAuth, async (req, res) => {
    try {
      const out = await actions.reply(io(req), req.notifyUser.id, {
        conv: req.body?.conv,
        text: req.body?.text,
      });
      return res.json({ ok: true, messageId: out?.messageId || null });
    } catch (err) {
      return fail(res, err);
    }
  });

  router.post("/quick-react", notifyAuth, async (req, res) => {
    try {
      await actions.react(io(req), req.notifyUser.id, {
        conv: req.body?.conv,
        messageId: req.body?.messageId,
        emoji: req.body?.emoji,
      });
      return res.json({ ok: true });
    } catch (err) {
      return fail(res, err);
    }
  });

  router.post("/quick-read", notifyAuth, async (req, res) => {
    try {
      const out = await actions.read(io(req), req.notifyUser.id, { conv: req.body?.conv });
      return res.json({ ok: true, scope: out?.scope || "server" });
    } catch (err) {
      return fail(res, err);
    }
  });

  router.get("/notify-thread", notifyAuth, async (req, res) => {
    try {
      const out = await actions.thread(req.notifyUser.id, {
        conv: req.query?.conv,
        messageId: req.query?.messageId ? String(req.query.messageId) : null,
      });
      res.set("Cache-Control", "no-store");
      return res.json({ ok: true, ...out });
    } catch (err) {
      return fail(res, err);
    }
  });

  return router;
}

module.exports = createNotifyActionsRouter();
module.exports.createNotifyActionsRouter = createNotifyActionsRouter;
