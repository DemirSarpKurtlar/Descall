"use strict";

/**
 * "Paylaş > Descall" (4.3), mounted at /api/native/share. Used by the iOS share extension
 * (DescallShare, session from the shared Keychain), the Android share target
 * (share.html in DescallShareActivity and DescallShareWorker) and the web share target.
 * Attachments are uploaded first with POST /api/media/upload (purpose=message), the same
 * upload the app uses.
 *
 *   GET  /targets                  → recents, friends, groups, servers > channels with a
 *                                    per-channel verdict (canSend, canAttach, reason, slowModeSec)
 *   POST /precheck { convs, links?, text?, files? }
 *                                  → { results: { [conv]: { canSend, canAttach, reason,
 *                                      slowModeSec, duplicate: { kind, at, value } | null } } }
 *   POST /send { clientId, conv, text?, items?, silent?, sendAt? }
 *                                  → { ok, conv, results[], sent, scheduled, failed }
 *   POST /undo { conv, messageIds?, scheduledIds? } → { ok, removed, failed }
 *
 * Errors: { ok: false, error } with 400 / 403 / 413 / 429 / 502. Nothing here logs a
 * token, a message text or a file name.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const { ShareError, shareService } = require("../lib/shareService");

const READS = { windowMs: 60 * 1000, max: 60 };
const SENDS = { windowMs: 60 * 1000, max: 60 };
const UNDOS = { windowMs: 60 * 1000, max: 30 };

function createShareRouter(deps = {}) {
  const router = express.Router();
  const svc = () => deps.service || shareService();
  const banned = () => deps.bannedUserIds || require("../runtime/sharedState").bannedUserIds;
  const io = (req) => deps.io || req.app?.get?.("io") || null;

  router.use(express.json({ limit: "64kb" }));
  router.use(requireAuth);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (banned()?.has?.(req.user.id)) return res.status(403).json({ ok: false, error: "banned" });
    return next();
  });

  function limit(res, key, rule) {
    if (rejectIfLimited(res, [peek(key, rule)])) return true;
    recordFailure(key, rule);
    return false;
  }

  function fail(res, err, where) {
    if (err instanceof ShareError) return res.status(err.status).json({ ok: false, error: err.code });
    console.error(`[share] ${where} failed:`, err?.message || err);
    return res.status(500).json({ ok: false, error: "failed" });
  }

  router.get("/targets", async (req, res) => {
    if (limit(res, `share:r:${req.user.id}`, READS)) return undefined;
    try {
      return res.json(await svc().targets(req.user.id));
    } catch (err) {
      return fail(res, err, "targets");
    }
  });

  router.post("/precheck", async (req, res) => {
    if (limit(res, `share:r:${req.user.id}`, READS)) return undefined;
    try {
      return res.json(await svc().precheck(req.user.id, req.body || {}));
    } catch (err) {
      return fail(res, err, "precheck");
    }
  });

  router.post("/send", async (req, res) => {
    if (limit(res, `share:s:${req.user.id}`, SENDS)) return undefined;
    try {
      return res.json(await svc().send(io(req), req.user.id, req.body || {}));
    } catch (err) {
      return fail(res, err, "send");
    }
  });

  router.post("/undo", async (req, res) => {
    if (limit(res, `share:u:${req.user.id}`, UNDOS)) return undefined;
    try {
      return res.json(await svc().undo(io(req), req.user.id, req.body || {}));
    } catch (err) {
      return fail(res, err, "undo");
    }
  });

  return router;
}

module.exports = createShareRouter();
module.exports.createShareRouter = createShareRouter;
