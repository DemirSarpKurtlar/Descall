"use strict";

/**
 * Davet Merkezi (growth phase 4, owner pick 4A). Mounted at /api/invites.
 *
 *   GET  /landing/:username   public: the invite page descall.com/r/<username>
 *   POST /open                public: count one anonymous link open { username, channel }
 *   GET  /me                  the inviter's dashboard (funnel, link + QR, friends, wallet)
 *   POST /attach              the invitee's channel / open after sign-up { openId, channel }
 *   POST /nudge/:referralId   "Dürt": a ready message for a friend who has not written yet
 *   GET  /welcome             the invitee's first entry (inviter, gift progress, server)
 *   POST /notices/read        mark Davet Merkezi notices as read
 *
 * Rewards: lib/referrals/engine.js. Nothing here pays DesCoin.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { apiError } = require("../lib/apiError");
const model = require("../lib/referrals/model");
const store = require("../lib/referrals/store");
const views = require("../lib/referrals/views");
const engine = require("../lib/referrals/engine");
const texts = require("../lib/referrals/texts");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Small in-memory limiter (per key, sliding minute); the database is the durable guard.
const hits = new Map();
function limited(key, perMinute, now = Date.now()) {
  const list = (hits.get(key) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 20000) hits.delete(hits.keys().next().value);
  return list.length > perMinute;
}

function ipOf(req) {
  try {
    return require("../lib/clientIp").ipOfRequest(req);
  } catch {
    return req.ip || "";
  }
}

function fail(res, err, where) {
  if (err?.status && err.status < 500) return res.status(err.status).json(apiError(err.message || "Request failed.", undefined, { code: err.code }));
  console.error(`[invites] ${where}:`, err?.message || err);
  return res.status(500).json(apiError("Could not load invites."));
}

router.get("/landing/:username", async (req, res) => {
  if (limited(`land:${ipOf(req)}`, 60)) return res.status(429).json(apiError("Too many requests."));
  try {
    const data = await views.landing({ username: req.params.username });
    if (!data) return res.status(404).json(apiError("This invite link is not valid.", undefined, { code: "INVITE_NOT_FOUND" }));
    res.set("Cache-Control", "no-store");
    return res.json(data);
  } catch (err) {
    return fail(res, err, "landing");
  }
});

/** Art of the exclusive invite cosmetics (badge / invited / frame / banner), public and cacheable. */
router.get("/art/:key", (req, res) => {
  const key = String(req.params.key || "").replace(/\.svg$/, "");
  if (!/^[a-z]{3,12}$/.test(key)) return res.status(404).end();
  const svg = require("../lib/referrals/cosmetics").art(key);
  if (!svg) return res.status(404).end();
  res.set("Content-Type", "image/svg+xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=86400");
  res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  return res.send(svg);
});

router.post("/open", async (req, res) => {
  const ip = ipOf(req);
  if (limited(`open:${ip}`, 20)) return res.status(429).json(apiError("Too many requests."));
  try {
    const inviter = await views.userByUsername(req.body?.username);
    if (!inviter) return res.status(404).json(apiError("This invite link is not valid.", undefined, { code: "INVITE_NOT_FOUND" }));
    const channel = model.normalizeChannel(req.body?.channel) || "link";
    const ua = String(req.get("user-agent") || "").slice(0, 200);
    const visitorHash = model.hashOf("visitor", `${ip}|${ua}|${String(req.body?.visitor || "").slice(0, 64)}`);
    const out = await store.insertOpen({ inviterId: inviter.id, channel, visitorHash });
    if (out.ok && !out.repeat) {
      try {
        req.app.get("io")?.to(`user:${inviter.id}`).emit("invites:update", { kind: "open", channel });
      } catch {
        /* best effort */
      }
    }
    return res.json({ ok: true, openId: out.id || null, channel });
  } catch (err) {
    return fail(res, err, "open");
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  if (limited(`me:${userId}`, 60)) return res.status(429).json(apiError("Too many requests."));
  try {
    // The inviter's own device and network: a sign-up from them is "same device" later.
    void store.rememberInviterDevice(userId, engine.signupFingerprint(req)).catch(() => {});
    const data = await views.myDashboard({ userId });
    res.set("Cache-Control", "no-store");
    return res.json(data);
  } catch (err) {
    return fail(res, err, "me");
  }
});

router.post("/attach", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  if (limited(`attach:${userId}`, 10)) return res.status(429).json(apiError("Too many requests."));
  try {
    const row = await store.referralByInvitee(userId);
    if (!row || row.legacy) return res.json({ attached: false });
    if (Date.now() - new Date(row.signup_at || row.created_at).getTime() > 48 * model.HOUR) return res.json({ attached: false });
    const patch = {};
    const openId = String(req.body?.openId || "");
    if (UUID_RE.test(openId)) {
      const open = await store.openById(openId);
      if (open && String(open.inviter_id) === String(row.inviter_id) && !open.signup_user_id) {
        await store.linkOpen(open.id, userId);
        patch.open_id = open.id;
        if (!row.channel) patch.channel = model.normalizeChannel(open.channel) || "link";
      }
    }
    const channel = model.normalizeChannel(req.body?.channel);
    if (!row.channel && !patch.channel && channel) patch.channel = channel;
    if (!Object.keys(patch).length) return res.json({ attached: false });
    await store.updateReferral(row.id, patch);
    try {
      req.app.get("io")?.to(`user:${row.inviter_id}`).emit("invites:update", { kind: "channel" });
    } catch {
      /* best effort */
    }
    return res.json({ attached: true, channel: patch.channel || row.channel || null });
  } catch (err) {
    return fail(res, err, "attach");
  }
});

router.post("/nudge/:referralId", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  const id = String(req.params.referralId || "");
  if (!UUID_RE.test(id)) return res.status(400).json(apiError("Invalid invite."));
  if (limited(`nudge:${userId}`, 10)) return res.status(429).json(apiError("Too many requests."));
  try {
    const [row] = await store.referralsByIds([id]);
    if (!row || String(row.inviter_id) !== userId) return res.status(404).json(apiError("Invite not found.", undefined, { code: "INVITE_NOT_FOUND" }));
    if (row.status !== "pending" || row.first_message_at) {
      return res.status(409).json(apiError("Your friend already wrote.", undefined, { code: "NUDGE_NOT_NEEDED" }));
    }
    if (row.nudged_at && Date.now() - new Date(row.nudged_at).getTime() < 24 * model.HOUR) {
      return res.status(429).json(apiError("You can nudge once a day.", undefined, { code: "NUDGE_LIMIT", nextAt: new Date(new Date(row.nudged_at).getTime() + 24 * model.HOUR).toISOString() }));
    }
    const users = await store.usersByIds([row.invitee_id, userId]);
    const friend = users.get(String(row.invitee_id));
    const me = users.get(userId);
    if (!friend || friend.is_banned || friend.deleted_at) return res.status(404).json(apiError("Invite not found.", undefined, { code: "INVITE_NOT_FOUND" }));
    const lang = texts.langOf(req.body?.lang || me?.language);
    const variant = Number.isFinite(Number(req.body?.variant)) ? Number(req.body.variant) : Math.floor(Math.random() * 3);
    const text = texts.nudgeText({ lang, name: friend.display_name || friend.username, variant });
    await store.updateReferral(row.id, { nudged_at: new Date().toISOString() }, { expect: "pending" });
    return res.json({ text, friend: { id: String(friend.id), username: friend.username, displayName: friend.display_name || friend.username, avatarUrl: friend.avatar_url || null } });
  } catch (err) {
    return fail(res, err, "nudge");
  }
});

router.get("/welcome", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  if (limited(`welcome:${userId}`, 30)) return res.status(429).json(apiError("Too many requests."));
  try {
    void engine.noteSeen({ userId, io: req.app.get("io") }).catch(() => {});
    const data = await views.welcome({ userId });
    res.set("Cache-Control", "no-store");
    return res.json(data);
  } catch (err) {
    return fail(res, err, "welcome");
  }
});

router.post("/notices/read", requireAuth, async (req, res) => {
  const userId = String(req.user.id);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => UUID_RE.test(String(x))) : null;
  try {
    await store.markNoticesRead(userId, ids);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err, "notices");
  }
});

module.exports = router;
module.exports.__test = { limited, hits };
