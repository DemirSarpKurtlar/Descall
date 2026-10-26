"use strict";

/**
 * GET/PUT /api/me/appearance — Settings › Görünüm on the account, so every
 * device ends up the same. Table: public.user_appearance_settings (additive,
 * service-role only). A missing table answers like "nothing saved yet".
 */
const express = require("express");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { sanitizeAppearance } = require("../lib/appearanceSettings");

const router = express.Router();
const TABLE = "user_appearance_settings";

function missingTable(error) {
  const msg = String(error?.message || "");
  return error?.code === "42P01" || error?.code === "PGRST205" || /does not exist|schema cache/i.test(msg);
}

router.get("/appearance", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from(TABLE).select("settings, updated_at").eq("user_id", req.user.id).maybeSingle();
    if (error) {
      if (missingTable(error)) return res.json({ appearance: null, updatedAt: null });
      console.error("[appearance] GET failed");
      return res.status(500).json({ error: "Görünüm ayarları yüklenemedi." });
    }
    if (!data) return res.json({ appearance: null, updatedAt: null });
    return res.json({ appearance: sanitizeAppearance(data.settings), updatedAt: data.updated_at || null });
  } catch {
    console.error("[appearance] GET failed");
    return res.status(500).json({ error: "Görünüm ayarları yüklenemedi." });
  }
});

router.put("/appearance", requireAuth, async (req, res) => {
  try {
    const patch = sanitizeAppearance(req.body?.appearance);
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Geçerli bir görünüm ayarı yok." });
    const { data: cur, error: readErr } = await supabase.from(TABLE).select("settings").eq("user_id", req.user.id).maybeSingle();
    if (readErr) {
      if (missingTable(readErr)) return res.status(503).json({ error: "Görünüm eşitlemesi henüz hazır değil." });
      console.error("[appearance] PUT read failed");
      return res.status(500).json({ error: "Görünüm ayarları kaydedilemedi." });
    }
    const settings = { ...sanitizeAppearance(cur?.settings), ...patch };
    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .upsert({ user_id: req.user.id, settings, updated_at: updatedAt }, { onConflict: "user_id" });
    if (error) {
      console.error("[appearance] PUT failed");
      return res.status(500).json({ error: "Görünüm ayarları kaydedilemedi." });
    }
    return res.json({ appearance: settings, updatedAt });
  } catch {
    console.error("[appearance] PUT failed");
    return res.status(500).json({ error: "Görünüm ayarları kaydedilemedi." });
  }
});

module.exports = router;
