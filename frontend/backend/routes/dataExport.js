"use strict";

/**
 * KVKK veri dışa aktarma, account owner side (3.6.0), mounted at /api/me and /me.
 *   POST /data-export { password?, code? } → the JSON file (attachment)
 * Identity is confirmed again before anything is built: the password when the
 * account has one, otherwise the authenticator code when it uses one. At most
 * 3 exports per account per day. Built by lib/dataExport.js.
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const twoFactor = require("../lib/twoFactorService");
const { buildExport } = require("../lib/dataExport");

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;
const EXPORTS = { windowMs: DAY, max: 3 };
const WRONG = { windowMs: 15 * 60 * 1000, max: 8 };

router.post("/data-export", requireAuth, async (req, res) => {
  const id = req.user.id;
  if (rejectIfLimited(res, [peek(`export:${id}`, EXPORTS), peek(`export:wrong:${id}`, WRONG)])) return;
  try {
    const { data: user } = await supabase.from("users").select("id, password_hash").eq("id", id).maybeSingle();
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    if (user.password_hash) {
      const ok = typeof req.body?.password === "string" && (await bcrypt.compare(req.body.password, user.password_hash));
      if (!ok) {
        recordFailure(`export:wrong:${id}`, WRONG);
        return res.status(401).json({ error: "Şifre yanlış.", code: "bad_password" });
      }
    } else {
      const row = await twoFactor.loadTotp(id).catch(() => null);
      if (row?.totp_enabled_at) {
        const v = await twoFactor.verifySecondFactor(id, req.body?.code, { allowRecovery: false, row });
        if (!v.ok) {
          recordFailure(`export:wrong:${id}`, WRONG);
          return res.status(401).json({ error: "Kod yanlış.", code: "bad_code" });
        }
      }
    }
    recordFailure(`export:${id}`, EXPORTS);
    const { filename, data } = await buildExport(id, { requestedBy: "self" });
    res.set("Cache-Control", "no-store");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    return res.json(data);
  } catch (err) {
    console.error("[data-export]", err?.message || err);
    return res.status(err?.status || 500).json({ error: err?.status === 404 ? err.message : "Verilerin hazırlanamadı. Biraz sonra tekrar dene." });
  }
});

module.exports = router;
