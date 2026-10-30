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
 * Until supabase/migrations/20261031_totp_two_factor.sql is applied the TOTP
 * columns are missing and both checks stand down (one warning), so applying the
 * migration is what switches enforcement on.
 */

const { verifyToken, signStepUpToken } = require("../config/jwt");
const twoFactor = require("../lib/twoFactorService");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");

const STEP_UP_HEADER = "x-admin-step-up";
const STEP_UP_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 };
// Reads sent as POST and the step-up call itself.
const STEP_UP_EXEMPT = [/^\/step-up\/?$/, /\/search\/?$/, /\/preview\/?$/];
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
    return null;
  }
}

async function requireAdmin2fa(req, res, next) {
  const on = await totpEnabled(req.user?.id);
  if (on === false) {
    return res.status(403).json({
      error: "Yönetici Paneli için doğrulama uygulaması gerekli. Ayarlar > Güvenlik'ten kur.",
      code: "ADMIN_2FA_REQUIRED",
    });
  }
  req.adminTotpKnown = on === true;
  return next();
}

function stepUpValid(req) {
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
  if (!req.adminTotpKnown) return next(); // migration not applied yet
  if (stepUpValid(req)) return next();
  return res.status(403).json({ error: "Bu işlem için doğrulama kodu gerekli.", code: "STEP_UP_REQUIRED" });
}

async function stepUpHandler(req, res) {
  const key = `admin:stepup:${req.user.id}`;
  if (rejectIfLimited(res, [peek(key, STEP_UP_LIMIT)])) return undefined;
  const v = await twoFactor.verifySecondFactor(req.user.id, req.body?.code);
  if (!v.ok) {
    recordFailure(key, STEP_UP_LIMIT);
    const msg = v.reason === "replay" ? "Bu kod zaten kullanıldı. Bir sonraki kodu bekle." : "Kod yanlış.";
    return res.status(400).json({ error: msg, code: v.reason });
  }
  res.set("Cache-Control", "no-store");
  return res.json({ ok: true, token: signStepUpToken({ id: req.user.id, sid: req.user.sid }), expiresInSec: 15 * 60, via: v.via, recoveryLeft: v.recoveryLeft });
}

module.exports = { requireAdmin2fa, requireStepUp, stepUpHandler, stepUpValid, STEP_UP_HEADER, STEP_UP_EXEMPT };
