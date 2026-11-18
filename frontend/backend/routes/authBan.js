"use strict";

/**
 * Ban screen endpoints (docs/design/ban-experience/CONTRACT.md sections 3 and 4),
 * mounted inside routes/auth.js (/api/auth and /auth).
 *
 * Authorization: Bearer <banTicket> (scope "ban", 30 min, from the
 * ACCOUNT_BANNED answer of sign-in / requireAuth or the live system:kick):
 *   GET  /ban/status                 -> { ban, appeal }
 *   POST /ban/appeal  { text }       -> { appeal }   (one appeal per ban)
 *   GET  /ban/export                 -> the KVKK data export (lib/dataExport.js)
 *   POST /ban/delete  { confirm: "DELETE" } -> account deletion (lib/accountDeletion.js)
 *
 * No account needed:
 *   POST /access-appeal { code, email, text } -> { ok: true }  (rate limited per IP and code)
 *
 * public.ban_appeals missing (migration not applied) = 503 APPEALS_UNAVAILABLE.
 */

const express = require("express");
const supabase = require("../db/supabase");
const { verifyToken } = require("../config/jwt");
const { revokedSessionIds } = require("../runtime/sharedState");
const { peek, recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const { clientIp } = require("../lib/sessions");
const { apiError, apiText } = require("../lib/apiError");
const { requestLang } = require("../lib/i18n");
const moderation = require("../lib/moderation");
const accessBans = require("../lib/accessBans");
const accountDeletion = require("../lib/accountDeletion");
const banExperience = require("../lib/banExperience");

const router = express.Router();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Same bucket as POST /api/me/data-export (routes/dataExport.js): 3 exports a day.
const EXPORTS = { windowMs: DAY, max: 3 };
const APPEAL_USER = { windowMs: DAY, max: 10 };
const ACCESS_APPEAL_IP = { windowMs: HOUR, max: 5 };
const ACCESS_APPEAL_CODE = { windowMs: DAY, max: 5 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_COLS =
  "id, username, email, email_confirmed_at, apple_refresh_token, deleted_at, is_banned, ban_category, ban_reason, ban_message, banned_at, banned_by, ban_expires_at";

function getIo(req) {
  return req.app?.get?.("io") || null;
}

function notifyAdmins(req, payload) {
  try {
    const io = getIo(req);
    if (io?.to) require("../socket/adminHandlers").notifyAdminRoom(io, payload);
  } catch {
    /* best effort */
  }
}

function appealError(res, err) {
  if (err?.status === 503) return res.status(503).json({ ...banExperience.APPEALS_UNAVAILABLE });
  console.error("[ban-appeal]", err?.message || err);
  return res.status(500).json(apiError("Could not send your appeal. Try again in a bit."));
}

/** Accepts only a ban ticket (scope "ban") and loads the account into req.banUser. */
async function requireBanTicket(req, res, next) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json(apiError("Missing or malformed Authorization header."));
  }
  let decoded;
  try {
    decoded = verifyToken(header.slice(7));
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json(apiError("Ban ticket has expired. Sign in again.", null, { code: "BAN_TICKET_EXPIRED" }));
    }
    return res.status(401).json(apiError("Invalid token."));
  }
  if (decoded?.scope !== "ban" || !decoded.sub || decoded.pending2fa || decoded.stepUp) {
    return res.status(401).json(apiError("Invalid token."));
  }
  try {
    const { data: user, error } = await supabase.from("users").select(USER_COLS).eq("id", decoded.sub).maybeSingle();
    if (error) throw error;
    if (!user || user.deleted_at) return res.status(404).json(apiError("User not found."));
    req.banUser = user;
    return next();
  } catch (err) {
    console.error("[ban-ticket]", err?.message || err);
    return res.status(500).json(apiError("Internal server error."));
  }
}

/** Active ban detail of req.banUser, or null (an expired ban is cleared). */
function activeBanOf(user) {
  if (!user?.is_banned) return null;
  if (user.ban_expires_at && new Date(user.ban_expires_at).getTime() <= Date.now()) {
    moderation.revokeBan({ targetUserId: user.id, actorUserId: null, note: "Expired ban auto-clear" }).catch(() => {});
    return null;
  }
  return banExperience.detailFromUserRow(user);
}

function notBanned(res) {
  return res.status(409).json(apiError("This account is not banned.", null, { code: "NOT_BANNED" }));
}

router.get("/ban/status", requireBanTicket, async (req, res) => {
  const user = req.banUser;
  const detail = activeBanOf(user);
  res.set("Cache-Control", "no-store");
  return res.json({
    ban: detail ? banExperience.publicBan(detail, user.username) : null,
    appeal: detail
      ? { ...(await banExperience.appealStateFor(user.id, detail.bannedAt)), emailOnFile: Boolean(user.email && user.email_confirmed_at) }
      : { status: "none", submittedAt: null, canAppeal: false },
  });
});

router.post("/ban/appeal", requireBanTicket, async (req, res) => {
  const user = req.banUser;
  const detail = activeBanOf(user);
  if (!detail) return notBanned(res);
  const text = banExperience.cleanAppealText(req.body?.text);
  if (!text) {
    return res.status(400).json(
      apiError("Write between {min} and {max} characters.", { min: banExperience.APPEAL_MIN, max: banExperience.APPEAL_MAX }, { code: "APPEAL_TEXT_LENGTH" })
    );
  }
  const key = `ban-appeal:${user.id}`;
  if (rejectIfLimited(res, [peek(key, APPEAL_USER)])) return;
  recordFailure(key, APPEAL_USER);
  try {
    const { available, row } = await banExperience.latestAccountAppeal(user.id, detail.bannedAt);
    if (!available) throw banExperience.appealsUnavailableError();
    if (row && row.status !== "accepted") {
      return res.status(409).json(
        apiError("You already appealed this ban.", null, { code: "APPEAL_EXISTS", appeal: banExperience.publicAppeal(row) })
      );
    }
    const saved = await banExperience.insertAppeal({
      type: "account",
      user_id: user.id,
      email: user.email && user.email_confirmed_at ? String(user.email).toLowerCase() : null,
      text,
      status: "pending",
    });
    notifyAdmins(req, { type: "ban_appeal", appealType: "account", id: saved?.id || null });
    return res.json({ appeal: banExperience.publicAppeal(saved) });
  } catch (err) {
    return appealError(res, err);
  }
});

router.get("/ban/export", requireBanTicket, async (req, res) => {
  const user = req.banUser;
  if (!activeBanOf(user)) return notBanned(res);
  const key = `export:${user.id}`;
  if (rejectIfLimited(res, [peek(key, EXPORTS)])) return;
  try {
    recordFailure(key, EXPORTS);
    const { buildExport } = require("../lib/dataExport");
    const { filename, data } = await buildExport(user.id, { requestedBy: "self", lang: requestLang(req, "tr") });
    res.set("Cache-Control", "no-store");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    return res.json(data);
  } catch (err) {
    console.error("[ban-export]", err?.message || err);
    const body = err?.status === 404 ? { error: err.message } : apiError("Your data could not be prepared. Try again in a bit.");
    return res.status(err?.status || 500).json(body);
  }
});

router.post("/ban/delete", requireBanTicket, async (req, res) => {
  const user = req.banUser;
  if (!activeBanOf(user)) return notBanned(res);
  if (req.body?.confirm !== "DELETE") {
    return res.status(400).json(apiError("Type DELETE to confirm.", null, { code: "confirm_required" }));
  }
  try {
    const result = await accountDeletion.closeAccountNow(user);
    for (const sid of result.sessionIds || []) revokedSessionIds.add(sid);
    return res.json(
      // Signing in to a banned account only reaches the ban screen, so it does not
      // cancel this deletion: no "unless you sign in again" here.
      apiText("message", "Account closed. It will be permanently deleted after the grace period.", null, {
        graceDays: accountDeletion.GRACE_DAYS,
        purgeAfter: result.purgeAfter,
      })
    );
  } catch (err) {
    console.error("[ban-delete]", err?.message || err);
    return res.status(500).json(apiError("Internal server error."));
  }
});

router.post("/access-appeal", async (req, res) => {
  const ip = clientIp(req);
  const ipKey = `access-appeal:ip:${ip}`;
  if (rejectIfLimited(res, [peek(ipKey, ACCESS_APPEAL_IP)])) return;
  recordFailure(ipKey, ACCESS_APPEAL_IP);

  const code = accessBans.normalizeAccessCode(req.body?.code);
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const text = banExperience.cleanAppealText(req.body?.text);
  if (!code) return res.status(400).json(apiError("Enter the code shown on the blocked screen.", null, { code: "ACCESS_CODE_INVALID" }));
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json(apiError("Enter a valid email address.", null, { code: "EMAIL_INVALID" }));
  }
  if (!text) {
    return res.status(400).json(
      apiError("Write between {min} and {max} characters.", { min: banExperience.APPEAL_MIN, max: banExperience.APPEAL_MAX }, { code: "APPEAL_TEXT_LENGTH" })
    );
  }
  const codeKey = `access-appeal:code:${code}`;
  if (rejectIfLimited(res, [peek(codeKey, ACCESS_APPEAL_CODE)])) return;
  recordFailure(codeKey, ACCESS_APPEAL_CODE);

  try {
    const ban = await accessBans.findActiveByCode(code);
    if (!ban) return res.status(404).json(apiError("No active access block has this code.", null, { code: "ACCESS_CODE_UNKNOWN" }));
    const { data: open, error } = await supabase
      .from("ban_appeals")
      .select("id")
      .eq("type", "access")
      .eq("access_ban_id", ban.id)
      .eq("email", email)
      .eq("status", "pending")
      .limit(1);
    if (error) {
      if (banExperience.isMissingTable(error)) throw banExperience.appealsUnavailableError();
      throw new Error(error.message);
    }
    if (!(open || []).length) {
      const saved = await banExperience.insertAppeal({
        type: "access",
        access_ban_id: ban.id,
        access_code: code,
        email,
        text,
        status: "pending",
      });
      notifyAdmins(req, { type: "ban_appeal", appealType: "access", id: saved?.id || null });
    }
    return res.json({ ok: true });
  } catch (err) {
    return appealError(res, err);
  }
});

module.exports = router;
module.exports.requireBanTicket = requireBanTicket;
