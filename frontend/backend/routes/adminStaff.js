"use strict";

/**
 * Yöneticiler (3.3.0): who is an admin and which panel sections each may open.
 * Mounted inside routes/admin.js after requireAdminSection, so /staff/* is
 * owner-only there ("staff" is never grantable) and /me/permissions is open to
 * every admin.
 *   GET  /me/permissions             → { sections, owner, grantable }
 *   GET  /staff                      → { admins: [...] }
 *   GET  /staff/candidates?q=        → { users: [...] } (non-admins, for "Yönetici yap")
 *   PUT  /staff/:id/sections { sections: string[] | null }
 * Granting / removing admin itself is PUT /make-admin/:id and /remove-admin/:id.
 */

const express = require("express");
const supabase = require("../db/supabase");
const perms = require("../lib/adminPermissions");
const { appendAudit } = require("../runtime/sharedState");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/me/permissions", async (req, res) => {
  const row = await perms.loadRow(req.user.id).catch(() => null);
  res.set("Cache-Control", "no-store");
  return res.json({
    sections: perms.sectionsFor(req.user, row),
    owner: perms.isOwner(req.user, row),
    grantable: perms.GRANTABLE_SECTIONS,
  });
});

router.get("/staff", async (_req, res) => {
  try {
    let q = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url, last_seen_at, is_super_admin, admin_permissions, totp_enabled_at")
      .eq("is_admin", true)
      .order("username", { ascending: true })
      .limit(200);
    if (q.error) {
      q = await supabase.from("users").select("id, username, display_name, avatar_url, last_seen_at").eq("is_admin", true).limit(200);
    }
    if (q.error) return res.status(500).json({ error: "Yöneticiler yüklenemedi." });
    const admins = (q.data || []).map((u) => {
      const owner = perms.isOwner(u, u);
      return {
        id: u.id,
        username: u.username,
        displayName: u.display_name || null,
        avatarUrl: u.avatar_url || null,
        lastSeenAt: u.last_seen_at || null,
        owner,
        twoFactor: Boolean(u.totp_enabled_at),
        // null = every section (set before 3.3.0)
        sections: owner ? null : u.admin_permissions == null ? null : perms.normalizeSections(u.admin_permissions),
      };
    });
    admins.sort((a, b) => Number(b.owner) - Number(a.owner));
    res.set("Cache-Control", "no-store");
    return res.json({ admins, grantable: perms.GRANTABLE_SECTIONS });
  } catch (err) {
    console.error("[adminStaff] list", err?.message || err);
    return res.status(500).json({ error: "Yöneticiler yüklenemedi." });
  }
});

router.get("/staff/candidates", async (req, res) => {
  const term = String(req.query.q || "").trim().replace(/[%_,()]/g, "");
  if (term.length < 2) return res.json({ users: [] });
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .eq("is_admin", false)
    .is("deleted_at", null)
    .limit(10);
  if (error) return res.status(500).json({ error: "Arama başarısız." });
  return res.json({
    users: (data || []).map((u) => ({ id: u.id, username: u.username, displayName: u.display_name || null, avatarUrl: u.avatar_url || null })),
  });
});

router.put("/staff/:id/sections", async (req, res) => {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "Geçersiz kullanıcı." });
  const raw = req.body?.sections;
  if (raw !== null && !Array.isArray(raw)) return res.status(400).json({ error: "sections bir liste olmalı." });
  try {
    const before = await supabase.from("users").select("id, username, is_admin, is_super_admin, admin_permissions").eq("id", id).maybeSingle();
    if (before.error) {
      return res.status(503).json({ error: "Yetki sütunu henüz yok (migration 20261101_admin_permissions.sql).", code: "PERMISSIONS_UNAVAILABLE" });
    }
    const target = before.data;
    if (!target?.is_admin) return res.status(404).json({ error: "Bu kişi yönetici değil." });
    if (perms.isOwner(target, target)) return res.status(400).json({ error: "Sahip hesabının yetkileri değiştirilemez." });
    const next = raw === null ? null : perms.normalizeSections(raw);
    const upd = await supabase.from("users").update({ admin_permissions: next }).eq("id", id).select("id").single();
    if (upd.error) return res.status(500).json({ error: "Kaydedilemedi." });
    perms.invalidate(id);
    appendAudit(req.user.id, req.user.username, "admin_permissions", target.username, {
      before: target.admin_permissions ?? "all",
      after: next ?? "all",
    });
    const io = req.app?.get?.("io");
    io?.to(`user:${id}`)?.emit("admin:permissions", { sections: perms.sectionsFor(target, { ...target, admin_permissions: next }) });
    return res.json({ ok: true, sections: next });
  } catch (err) {
    console.error("[adminStaff] sections", err?.message || err);
    return res.status(500).json({ error: "Kaydedilemedi." });
  }
});

module.exports = router;
