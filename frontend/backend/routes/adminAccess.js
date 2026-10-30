"use strict";

/**
 * Yönetici Paneli › Erişim Yasakları (3.5.0). Mounted inside routes/admin.js
 * (requireAdmin + 2FA + step-up + section "accessBans").
 *   GET    /access-bans?status=active|ended|all → { bans, available, stats }
 *   GET    /access-bans/hits                    → { hits }
 *   POST   /access-bans { mode: "address", ip, kind: "ip"|"network", duration, reason }
 *   POST   /access-bans { mode: "account", userId, duration, reason, includeNetwork }
 *   DELETE /access-bans/:id                     → revoke
 * Creating a ban also disconnects matching live sockets (admins excluded).
 */

const express = require("express");
const supabase = require("../db/supabase");
const accessBans = require("../lib/accessBans");
const { appendAudit } = require("../runtime/sharedState");
const { notifyAdminRoom } = require("../socket/adminHandlers");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(res, err, fallback) {
  const status = err?.status || 500;
  if (status >= 500) console.error("[access-bans]", err?.message || err);
  return res.status(status).json({ error: status >= 500 ? fallback : err.message, code: err?.code });
}

/** Disconnect live sockets that match the active bans (not admins). */
async function kickMatching(io) {
  if (!io) return 0;
  const { ipOfSocket } = require("../lib/clientIp");
  const perms = require("../lib/adminPermissions");
  let kicked = 0;
  for (const [, sock] of io.sockets.sockets) {
    const userId = sock.user?.id;
    if (!userId) continue;
    const fp = accessBans.fingerprintOf({ ip: ipOfSocket(sock), deviceId: sock.handshake?.auth?.device });
    if (!accessBans.match(fp)) continue;
    const row = await perms.loadRow(userId).catch(() => null);
    if (row?.is_admin || row?.username === "admin") continue;
    try {
      sock.emit("system:kick", { reason: "Bu cihazdan veya ağdan erişim engellendi.", action: "ban", category: "access" });
      sock.disconnect(true);
      kicked += 1;
    } catch {
      /* already gone */
    }
  }
  return kicked;
}

router.get("/access-bans", async (req, res) => {
  try {
    const status = ["active", "ended", "all"].includes(String(req.query.status)) ? String(req.query.status) : "active";
    const [{ bans, available }, all] = await Promise.all([
      accessBans.listBans({ status }),
      status === "active" ? Promise.resolve(null) : accessBans.listBans({ status: "active" }),
    ]);
    const active = all ? all.bans : bans;
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    let hits24h = 0;
    if (available) {
      const { count } = await supabase.from("access_ban_hits").select("id", { count: "exact", head: true }).gte("at", since);
      hits24h = Number(count || 0);
    }
    res.set("Cache-Control", "no-store");
    res.json({
      bans,
      available,
      stats: {
        active: active.length,
        byKind: {
          ip: active.filter((b) => b.kind === "ip").length,
          network: active.filter((b) => b.kind === "network").length,
          device: active.filter((b) => b.kind === "device").length,
        },
        hits24h,
      },
    });
  } catch (err) {
    fail(res, err, "Yasaklar yüklenemedi.");
  }
});

router.get("/access-bans/hits", async (_req, res) => {
  try {
    const hits = await accessBans.listHits({ limit: 100 });
    const ids = [...new Set(hits.map((h) => h.userId).filter(Boolean))];
    let names = {};
    if (ids.length) {
      const { data } = await supabase.from("users").select("id, username").in("id", ids);
      names = Object.fromEntries((data || []).map((u) => [u.id, u.username]));
    }
    res.set("Cache-Control", "no-store");
    res.json({ hits: hits.map((h) => ({ ...h, username: h.userId ? names[h.userId] || null : null })) });
  } catch (err) {
    fail(res, err, "Engellenen denemeler yüklenemedi.");
  }
});

router.post("/access-bans", async (req, res) => {
  const body = req.body || {};
  const duration = String(body.duration || "permanent");
  const reason = typeof body.reason === "string" ? body.reason : "";
  try {
    let added;
    let skipped = 0;
    let target = null;
    if (body.mode === "account") {
      let userId = String(body.userId || "");
      if (!UUID_RE.test(userId) && typeof body.username === "string" && body.username.trim()) {
        const { data } = await supabase.from("users").select("id").ilike("username", body.username.trim().replace(/[%_]/g, "")).maybeSingle();
        userId = data?.id || "";
      }
      if (!UUID_RE.test(userId)) return res.status(400).json({ error: "Kullanıcı bulunamadı.", code: "NOT_FOUND" });
      const result = await accessBans.banAccountAccess({ userId, duration, reason, actor: req.user, includeNetwork: Boolean(body.includeNetwork) });
      added = result.added;
      skipped = result.skipped;
      target = added[0]?.sourceUsername || userId;
      if (!added.length && !skipped) {
        return res.status(409).json({ error: "Bu hesabın kayıtlı cihazı veya IP adresi yok.", code: "NOTHING_TO_BAN" });
      }
    } else {
      added = await accessBans.banAddress({ ip: body.ip, kind: body.kind === "network" ? "network" : "ip", duration, reason, actor: req.user });
      target = added[0]?.label || null;
    }
    const kicked = await kickMatching(req.app?.get?.("io"));
    appendAudit(req.user.id, req.user.username, "access_ban", target, {
      mode: body.mode === "account" ? "account" : "address",
      count: added.length,
      kinds: [...new Set(added.map((b) => b.kind))],
      duration,
      kicked,
    });
    notifyAdminRoom(req.app?.get?.("io"), { type: "access_ban", count: added.length });
    res.status(201).json({ ok: true, added, skipped, kicked });
  } catch (err) {
    fail(res, err, "Yasak eklenemedi.");
  }
});

router.delete("/access-bans/:id", async (req, res) => {
  if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: "Geçersiz yasak." });
  try {
    const ban = await accessBans.revokeBan({ id: req.params.id, actor: req.user });
    appendAudit(req.user.id, req.user.username, "access_unban", ban.label, { kind: ban.kind });
    notifyAdminRoom(req.app?.get?.("io"), { type: "access_unban", id: ban.id });
    res.json({ ok: true, ban });
  } catch (err) {
    fail(res, err, "Yasak kaldırılamadı.");
  }
});

module.exports = router;
module.exports.kickMatching = kickMatching;
