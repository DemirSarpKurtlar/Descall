"use strict";

/**
 * Authenticator-app two-factor endpoints (3.2.0), mounted under /auth and /api/auth.
 *   GET  /2fa/status                → { method, totpEnabled, recoveryLeft, emailAvailable, adminRequired }
 *   POST /2fa/totp/setup            → { otpauthUri, secret, qrSvg }   (fresh pending secret)
 *   POST /2fa/totp/enable { code }  → { recoveryCodes }               (shown once)
 *   POST /2fa/totp/disable { code, password? }
 *   POST /2fa/recovery/regenerate { code } → { recoveryCodes }
 * Admins cannot turn the authenticator off (Yönetici Paneli requires it).
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const twoFactor = require("../lib/twoFactorService");
const { appendAudit } = require("../runtime/sharedState");

const router = express.Router();
const LIMIT = { windowMs: 15 * 60 * 1000, max: 10 };

const REASON_TR = {
  format: "Kod 6 haneli olmalı.",
  mismatch: "Kod yanlış. Uygulamadaki güncel kodu gir.",
  replay: "Bu kod zaten kullanıldı. Bir sonraki kodu bekle.",
  expired: "Kurulum süresi doldu. Baştan başla.",
  no_pending: "Önce kurulumu başlat.",
  not_enabled: "Doğrulama uygulaması açık değil.",
  secret_unreadable: "Doğrulama bilgisi okunamadı. Destek ile iletişime geç.",
};

function limited(res, key) {
  return rejectIfLimited(res, [peek(key, LIMIT)]);
}

async function userBasics(userId) {
  const { data } = await supabase
    .from("users")
    .select("id, username, email, email_confirmed_at, two_factor_enabled, is_admin, password_hash")
    .eq("id", userId)
    .maybeSingle();
  return data || null;
}

function isAdminUser(u) {
  return Boolean(u?.is_admin) || u?.username === "admin";
}

router.get("/2fa/status", requireAuth, async (req, res) => {
  try {
    const [user, row] = await Promise.all([userBasics(req.user.id), twoFactor.loadTotp(req.user.id)]);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    res.set("Cache-Control", "no-store");
    return res.json({
      method: twoFactor.methodFor(user, row),
      totpAvailable: row !== null,
      totpEnabled: Boolean(row?.totp_enabled_at),
      enabledAt: row?.totp_enabled_at || null,
      recoveryLeft: Array.isArray(row?.totp_recovery_hashes) ? row.totp_recovery_hashes.length : 0,
      emailAvailable: Boolean(user.email && user.email_confirmed_at),
      adminRequired: isAdminUser(user),
      hasPassword: Boolean(user.password_hash),
    });
  } catch (err) {
    console.error("[2FA] status", err?.message || err);
    return res.status(500).json({ error: "Durum alınamadı." });
  }
});

router.post("/2fa/totp/setup", requireAuth, async (req, res) => {
  try {
    const key = `2fa:setup:${req.user.id}`;
    if (limited(res, key)) return;
    recordFailure(key, LIMIT);
    const row = await twoFactor.loadTotp(req.user.id);
    if (row === null) return res.status(503).json({ error: "Doğrulama uygulaması henüz etkin değil.", code: "TOTP_UNAVAILABLE" });
    if (row.totp_enabled_at) return res.status(409).json({ error: "Doğrulama uygulaması zaten açık.", code: "TOTP_ALREADY_ON" });
    const { secret, uri } = await twoFactor.beginSetup(req.user.id, req.user.username);
    const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
    res.set("Cache-Control", "no-store");
    return res.json({ otpauthUri: uri, secret: secret.match(/.{1,4}/g).join(" "), qrSvg, expiresInSec: twoFactor.PENDING_TTL_MS / 1000 });
  } catch (err) {
    console.error("[2FA] setup", err?.message || err);
    return res.status(500).json({ error: "Kurulum başlatılamadı." });
  }
});

router.post("/2fa/totp/enable", requireAuth, async (req, res) => {
  try {
    const key = `2fa:enable:${req.user.id}`;
    if (limited(res, key)) return;
    const result = await twoFactor.confirmSetup(req.user.id, req.body?.code);
    if (!result.ok) {
      recordFailure(key, LIMIT);
      return res.status(400).json({ error: REASON_TR[result.reason] || REASON_TR.mismatch, code: result.reason });
    }
    if (isAdminUser(await userBasics(req.user.id))) appendAudit(req.user.id, req.user.username, "2fa_totp_enabled", req.user.username, {});
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, recoveryCodes: result.recoveryCodes });
  } catch (err) {
    console.error("[2FA] enable", err?.message || err);
    return res.status(500).json({ error: "Açılamadı." });
  }
});

router.post("/2fa/totp/disable", requireAuth, async (req, res) => {
  try {
    const key = `2fa:disable:${req.user.id}`;
    if (limited(res, key)) return;
    const user = await userBasics(req.user.id);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    if (isAdminUser(user)) {
      return res.status(403).json({ error: "Yöneticiler doğrulama uygulamasını kapatamaz.", code: "ADMIN_2FA_REQUIRED" });
    }
    if (user.password_hash) {
      const ok = typeof req.body?.password === "string" && (await bcrypt.compare(req.body.password, user.password_hash));
      if (!ok) {
        recordFailure(key, LIMIT);
        return res.status(401).json({ error: "Şifre yanlış.", code: "bad_password" });
      }
    }
    const v = await twoFactor.verifySecondFactor(req.user.id, req.body?.code);
    if (!v.ok) {
      recordFailure(key, LIMIT);
      return res.status(400).json({ error: REASON_TR[v.reason] || REASON_TR.mismatch, code: v.reason });
    }
    await twoFactor.disableTotp(req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[2FA] disable", err?.message || err);
    return res.status(500).json({ error: "Kapatılamadı." });
  }
});

router.post("/2fa/recovery/regenerate", requireAuth, async (req, res) => {
  try {
    const key = `2fa:regen:${req.user.id}`;
    if (limited(res, key)) return;
    const v = await twoFactor.verifySecondFactor(req.user.id, req.body?.code, { allowRecovery: false });
    if (!v.ok) {
      recordFailure(key, LIMIT);
      return res.status(400).json({ error: REASON_TR[v.reason] || REASON_TR.mismatch, code: v.reason });
    }
    const codes = await twoFactor.regenerateRecovery(req.user.id);
    if (isAdminUser(await userBasics(req.user.id))) appendAudit(req.user.id, req.user.username, "2fa_recovery_regenerated", req.user.username, {});
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, recoveryCodes: codes });
  } catch (err) {
    console.error("[2FA] regenerate", err?.message || err);
    return res.status(500).json({ error: "Yeni kodlar oluşturulamadı." });
  }
});

module.exports = router;
module.exports.REASON_TR = REASON_TR;
