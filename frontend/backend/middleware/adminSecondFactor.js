"use strict";

/**
 * Yönetici güvenliği (3.2.0, owner request):
 *  - requireAdmin2fa: every admin must have the authenticator app on; otherwise
 *    403 ADMIN_2FA_REQUIRED and the panel shows the setup screen.
 *  - requireStepUp: every change (POST/PUT/PATCH/DELETE) needs a step-up token
 *    from a code entered in the last 15 minutes on this session
 *    (X-Admin-Step-Up header); otherwise 403 STEP_UP_REQUIRED and the panel asks
 *    for a code, then retries.
 *  - POST /step-up { code } issues that token.
 *  - Admin Token (dsk_admin_…, lib/adminTokens): owner decision, a token acts directly,
 *    so both checks count as passed for a request authenticated with one.
 * Until supabase/migrations/20261031_totp_two_factor.sql is applied the TOTP
 * columns are missing and both checks stand down (one warning), so applying the
 * migration is what switches enforcement on.
 */

const { verifyToken, signStepUpToken } = require("../config/jwt");
const twoFactor = require("../lib/twoFactorService");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const { apiError } = require("../lib/apiError");

const STEP_UP_HEADER = "x-admin-step-up";
const STEP_UP_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 };
// Reads sent as POST and the step-up call itself.
// Admin agent (phase 1): sending a chat message and deleting one's own conversation
// change nothing on the platform. Tool calls inside the chat still go through the admin
// routes, so a DM read still needs the step-up token.
// Admin agent (phase 2): ticking plan rows, the dry run, an admin edit (a new plan version),
// discarding a proposal and saved prompts change nothing on the platform either. Approving,
// pausing, cancelling, undoing and scheduled tasks still need the code (approval a fresh one).
const STEP_UP_EXEMPT = [
  /^\/step-up\/?$/, /\/search\/?$/, /\/preview\/?$/, /^\/agent\/chat\/?$/, /^\/agent\/threads\/[^/]+\/?$/,
  /^\/agent\/plans\/[^/]+\/(selection|dry-run|edit|discard)\/?$/, /^\/agent\/prompts(\/[^/]+(\/use)?)?\/?$/,
  // İşlem kaydı: saving / deleting one's own saved view changes nothing on the platform.
  /^\/audit\/views(\/[^/]+)?\/?$/,
  // Apple Watch games: syncing one's own best scores changes nothing on the platform.
  /^\/watch-games\/scores\/?$/,
];
let warned = false;

async function totpEnabled(userId) {
  try {
    const row = await twoFactor.loadTotp(userId);
    if (row === null) {
      if (!warned) {
        warned = true;
        console.warn("[admin-2fa] TOTP columns missing; apply supabase/migrations/20261031_totp_two_factor.sql to enforce admin 2FA");
      }
      return null; // unknown: migration not applied
    }
    return Boolean(row.totp_enabled_at && row.totp_secret_enc);
  } catch {
    // A failed lookup is not "migration missing": never wave writes through on a DB error
    // (polish admin-b-05).
    return "error";
  }
}

async function requireAdmin2fa(req, res, next) {
  // Admin Token (owner decision): a token counts as an owner who already passed 2FA and
  // step-up; creating one needed the owner's code. requireStepUp lets it through below.
  if (req.apiToken) {
    req.adminTotpKnown = true;
    req.adminTotpCheckFailed = false;
    return next();
  }
  const on = await totpEnabled(req.user?.id);
  if (on === false) {
    return res.status(403).json({
      error: "The Admin Panel needs an authenticator app. Set it up in Settings > Security.",
      code: "ADMIN_2FA_REQUIRED",
    });
  }
  req.adminTotpKnown = on === true;
  req.adminTotpCheckFailed = on === "error";
  return next();
}

function stepUpValid(req) {
  if (req.apiToken) return true;
  const raw = req.get ? req.get(STEP_UP_HEADER) : req.headers?.[STEP_UP_HEADER];
  if (!raw) return false;
  try {
    const t = verifyToken(String(raw));
    return Boolean(t.stepUp) && t.sub === req.user?.id && (t.sid || null) === (req.user?.sid || null);
  } catch {
    return false;
  }
}

function requireStepUp(req, res, next) {
  const method = String(req.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();
  if (STEP_UP_EXEMPT.some((re) => re.test(req.path || ""))) return next();
  if (req.apiToken) return next();
  if (req.adminTotpCheckFailed) {
    return res.status(503).json(apiError("Could not check your verification code status. Try again.", null, { code: "ADMIN_2FA_CHECK_FAILED" }));
  }
  if (!req.adminTotpKnown) return next(); // migration not applied yet
  if (stepUpValid(req)) return next();
  return res.status(403).json({ error: "This action needs a verification code.", code: "STEP_UP_REQUIRED" });
}

/** Güvenlik Merkezi live feed: "Yönetici adım doğrulaması" (never breaks the call). */
function noteStepUp(req, ok, how) {
  try {
    require("../lib/securityEvents").note("admin_step_up", { req, userId: req.user?.id, username: req.user?.username, reason: ok ? "ok" : "fail", detail: { ok, how: how ? String(how).slice(0, 20) : null } });
  } catch {
    /* feed optional */
  }
}

async function stepUpHandler(req, res) {
  const key = `admin:stepup:${req.user.id}`;
  if (rejectIfLimited(res, [peek(key, STEP_UP_LIMIT)])) return undefined;
  const v = await twoFactor.verifySecondFactor(req.user.id, req.body?.code);
  if (!v.ok) {
    recordFailure(key, STEP_UP_LIMIT);
    noteStepUp(req, false, v.reason);
    const msg = v.reason === "replay" ? "This code was already used. Wait for the next code." : "Wrong code.";
    return res.status(400).json({ error: msg, code: v.reason });
  }
  noteStepUp(req, true, v.via);
  res.set("Cache-Control", "no-store");
  return res.json({ ok: true, token: signStepUpToken({ id: req.user.id, sid: req.user.sid }), expiresInSec: 15 * 60, via: v.via, recoveryLeft: v.recoveryLeft });
}

module.exports = { requireAdmin2fa, requireStepUp, stepUpHandler, stepUpValid, STEP_UP_HEADER, STEP_UP_EXEMPT };
