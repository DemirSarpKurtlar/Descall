"use strict";

/**
 * Yönetici Paneli › Hata Kayıtları (3.7.0). Mounted inside routes/admin.js
 * (requireAdmin + 2FA + step-up + section "errors").
 *   GET  /error-groups?range=24h|7d|30d&status=open|resolved|ignored|all&platform=&q=&sort=recent|count|users
 *        → { groups, stats, available }
 *   GET  /error-groups/:fp       → { group, events }  (last 50, full stack)
 *   POST /error-groups/:fp/status { status, note }
 * Grouping: lib/errorGroups.js. Storage: error_logs + error_group_state
 * (supabase/migrations/20261101_error_groups.sql).
 */

const express = require("express");
const supabase = require("../db/supabase");
const eg = require("../lib/errorGroups");
const { appendAudit } = require("../runtime/sharedState");

const router = express.Router();
const FP_RE = /^[0-9a-f]{8,64}$/;
const SCAN = 5000;

async function loadStates() {
  const { data, error } = await supabase.from("error_group_state").select("*").limit(5000);
  if (error) return new Map();
  return new Map((data || []).map((r) => [r.fingerprint, r]));
}

async function loadRows(sinceIso) {
  const cols = "id, message, stack, url, user_agent, user_id, timestamp, severity, source, fingerprint, platform, app_version";
  let res = await supabase.from("error_logs").select(cols).gte("timestamp", sinceIso).order("timestamp", { ascending: false }).limit(SCAN);
  if (res.error) {
    // Before the migration: no fingerprint / platform / app_version columns.
    res = await supabase.from("error_logs").select("id, message, stack, url, user_agent, user_id, timestamp, severity, source").gte("timestamp", sinceIso).order("timestamp", { ascending: false }).limit(SCAN);
  }
  if (res.error) throw res.error;
  return res.data || [];
}

router.get("/error-groups", async (req, res) => {
  try {
    const range = eg.RANGES[req.query.range] ? String(req.query.range) : "7d";
    const now = Date.now();
    const since = new Date(now - eg.RANGES[range] * 3600e3).toISOString();
    const [rows, states] = await Promise.all([loadRows(since), loadStates()]);
    let groups = eg.groupRows(rows, states, { now, range });
    const all = groups;
    const status = ["open", "resolved", "ignored", "all"].includes(String(req.query.status)) ? String(req.query.status) : "open";
    if (status !== "all") groups = groups.filter((g) => g.status === status);
    const platform = String(req.query.platform || "");
    if (eg.PLATFORMS.includes(platform)) groups = groups.filter((g) => g.platforms[platform]);
    const q = String(req.query.q || "").trim().toLocaleLowerCase("tr");
    if (q) groups = groups.filter((g) => `${g.title} ${g.frame || ""}`.toLocaleLowerCase("tr").includes(q));
    groups = eg.sortGroups(groups, String(req.query.sort || "recent")).slice(0, 200);
    const users = new Set(rows.map((r) => r.user_id).filter((u) => u && u !== "anonymous"));
    res.set("Cache-Control", "no-store");
    res.json({
      groups,
      stats: {
        events: rows.length,
        users: users.size,
        open: all.filter((g) => g.status === "open").length,
        newIssues: all.filter((g) => g.isNew && g.status === "open").length,
        regressed: all.filter((g) => g.regressed).length,
        truncated: rows.length >= SCAN,
      },
      range,
      available: true,
    });
  } catch (err) {
    console.error("[admin-errors] list", err?.message || err);
    res.status(500).json({ error: "Hata kayıtları yüklenemedi." });
  }
});

router.get("/error-groups/:fp", async (req, res) => {
  const fp = String(req.params.fp || "");
  if (!FP_RE.test(fp)) return res.status(400).json({ error: "Geçersiz kayıt." });
  try {
    const since = new Date(Date.now() - 30 * 24 * 3600e3).toISOString();
    const rows = (await loadRows(since)).filter((r) => (r.fingerprint || eg.fingerprint(r.message, r.stack)) === fp);
    if (!rows.length) return res.status(404).json({ error: "Bu hata son 30 günde yok." });
    const states = await loadStates();
    const [group] = eg.groupRows(rows, states, { range: "30d" });
    const ids = [...new Set(rows.map((r) => r.user_id).filter((u) => u && u !== "anonymous"))].slice(0, 200);
    let names = {};
    if (ids.length) {
      const { data } = await supabase.from("users").select("id, username").in("id", ids);
      names = Object.fromEntries((data || []).map((u) => [u.id, u.username]));
    }
    res.set("Cache-Control", "no-store");
    res.json({
      group,
      events: rows.slice(0, 50).map((r) => ({
        id: r.id,
        at: r.timestamp,
        message: r.message,
        stack: r.stack || null,
        url: r.url || null,
        platform: r.platform || eg.platformOf(r.user_agent, r.source),
        userAgent: r.user_agent || null,
        appVersion: r.app_version || null,
        username: r.user_id && r.user_id !== "anonymous" ? names[r.user_id] || null : null,
      })),
    });
  } catch (err) {
    console.error("[admin-errors] detail", err?.message || err);
    res.status(500).json({ error: "Hata ayrıntısı yüklenemedi." });
  }
});

router.post("/error-groups/:fp/status", async (req, res) => {
  const fp = String(req.params.fp || "");
  if (!FP_RE.test(fp)) return res.status(400).json({ error: "Geçersiz kayıt." });
  const status = String(req.body?.status || "");
  if (!["open", "resolved", "ignored"].includes(status)) return res.status(400).json({ error: "Geçersiz durum." });
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) || null : null;
  try {
    const row = {
      fingerprint: fp,
      status,
      note,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      updated_by: req.user.id,
      updated_by_username: req.user.username,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("error_group_state").upsert(row, { onConflict: "fingerprint" });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return res.status(503).json({ error: "Hata kayıtları henüz etkin değil.", code: "ERRORS_UNAVAILABLE" });
      throw error;
    }
    appendAudit(req.user.id, req.user.username, `error_${status}`, fp, { note: note ? note.slice(0, 120) : null });
    res.json({ ok: true, status });
  } catch (err) {
    console.error("[admin-errors] status", err?.message || err);
    res.status(500).json({ error: "Kaydedilemedi." });
  }
});

module.exports = router;
