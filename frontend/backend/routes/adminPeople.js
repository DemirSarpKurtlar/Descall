"use strict";

const express = require("express");
const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const { kickUser, notifyAdminRoom } = require("../socket/adminHandlers");
const moderation = require("../lib/moderation");
const descoin = require("../lib/descoin");
const { listSessions } = require("../lib/sessions");
const { buildDossier } = require("../lib/userDossier");
const reports = require("../lib/userReports");
const workflow = require("../lib/reportWorkflow");

const router = express.Router();

function getIo(req) {
  return req.app.get("io");
}

function audit(actor, action, target, meta) {
  return state.appendAudit(actor.id, actor.username, action, target, meta);
}

function escapeIlike(q) {
  return String(q || "").replace(/[%_\\]/g, "\\$&");
}

router.get("/people/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().replace(/[,()]/g, "");
    if (q.length < 1) return res.json({ users: [] });
    const like = `%${escapeIlike(q)}%`;
    const { data, error } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url, last_seen, is_admin, created_at")
      .or(`username.ilike."${like}",display_name.ilike."${like}"`)
      .order("username", { ascending: true })
      .limit(12);
    if (error) return res.status(500).json({ error: error.message });
    res.json({
      users: (data || []).map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name || u.username,
        avatarUrl: u.avatar_url || null,
        lastSeen: u.last_seen || null,
        isAdmin: Boolean(u.is_admin) || u.username === "admin",
        createdAt: u.created_at || null,
        isOnline: Boolean(state.presence.get(u.id) || state.presence.get(String(u.id))),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Search failed." });
  }
});

router.get("/people/:id/dossier", async (req, res) => {
  try {
    const dossier = await buildDossier(req.params.id, { io: getIo(req) });
    res.json(dossier);
  } catch (err) {
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
    console.error("[dossier]", err);
    res.status(500).json({ error: err.message || "Failed to load dossier." });
  }
});

router.post("/people/:id/wallet-freeze", async (req, res) => {
  try {
    const frozen = req.body?.frozen !== false;
    const result = await descoin.setWalletFrozen(req.params.id, frozen);
    audit(req.user, frozen ? "wallet_freeze" : "wallet_unfreeze", req.params.id, {});
    const io = getIo(req);
    io.to(`user:${req.params.id}`).emit("descoin:frozen", { frozen: result.frozen });
    notifyAdminRoom(io, { type: frozen ? "wallet_freeze" : "wallet_unfreeze", userId: req.params.id });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message || "Wallet freeze failed." });
  }
});

router.post("/people/:id/revoke-sessions", async (req, res) => {
  try {
    const id = req.params.id;
    if (id === req.user.id) return res.status(400).json({ error: "Cannot sign out your own sessions from here." });
    const sessions = await listSessions(id);
    for (const s of sessions) {
      if (s?.id) state.revokedSessionIds.add(s.id);
    }
    await supabase.from("users").update({ active_sessions: [] }).eq("id", id);
    kickUser(getIo(req), {
      actorId: req.user.id,
      actorUsername: req.user.username,
      targetUserId: id,
      reason: "Sessions revoked by admin",
      action: "kick",
    });
    audit(req.user, "revoke_sessions", id, { count: sessions.length });
    res.json({ ok: true, revoked: sessions.length });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to revoke sessions." });
  }
});

router.get("/reports/summary", async (_req, res) => {
  try {
    res.json(await reports.summarizeInbox());
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load report summary." });
  }
});

router.get("/reports", async (req, res) => {
  try {
    const status = String(req.query.status || "open");
    const targetId = req.query.targetId || null;
    const assignee = ["me", "none"].includes(String(req.query.assignee)) ? String(req.query.assignee) : null;
    const rows = await reports.listReports({
      status,
      targetId,
      limit: req.query.limit,
      assignee,
      actorId: req.user.id,
    });
    const groups = reports.groupReportsByTarget(rows);
    const summary = await reports.summarizeInbox();
    res.json({
      reports: rows,
      groups,
      autoOpenUserId: summary.autoOpenUserId,
      openCount: summary.openCount,
      uniqueTargets: summary.uniqueTargets,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load reports." });
  }
});

async function applyFromReport(req, res, kind) {
  try {
    const { data: row, error } = await supabase
      .from("user_reports")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.status(404).json({ error: "Report not found." });

    const io = getIo(req);
    const category = row.reason || "other";
    const message = String(req.body?.message || "").trim() || undefined;
    const presetId = req.body?.presetId;
    const durationSeconds = req.body?.durationSeconds;
    const targetId = row.target_id;

    if (kind === "timeout") {
      const result = await moderation.applyTimeout({
        targetUserId: targetId,
        actorUserId: req.user.id,
        category,
        message,
        presetId: presetId || "1h",
        durationSeconds,
      });
      io.to(`user:${targetId}`).emit("system:timeout", result);
      audit(req.user, "timeout", targetId, { fromReport: row.id, category });
      notifyAdminRoom(io, { type: "timeout", userId: targetId, ...result });
    } else if (kind === "ban") {
      const result = await moderation.applyBan({
        targetUserId: targetId,
        actorUserId: req.user.id,
        category,
        message,
        presetId: presetId || "permanent",
        durationSeconds,
      });
      kickUser(io, {
        actorId: req.user.id,
        actorUsername: req.user.username,
        targetUserId: targetId,
        reason: result.message || result.reason || "Banned",
        action: "ban",
        category: result.category,
        message: result.message,
        expiresAt: result.expiresAt,
      });
      audit(req.user, "ban", targetId, { fromReport: row.id, category });
      notifyAdminRoom(io, { type: "ban", userId: targetId, ...result });
    }

    const resolved = await reports.resolveReport(row.id, {
      actorId: req.user.id,
      status: "actioned",
      resolution: kind,
      markAllOpenForTarget: true,
    });
    workflow.noteResolution({ targetId, reportId: row.id, actor: req.user, resolution: kind });
    notifyReporters(io, resolved);
    res.json({ ok: true, ...resolved });
  } catch (err) {
    console.error(`[reports] ${kind}:`, err);
    res.status(500).json({ error: err.message || "Action failed." });
  }
}

function notifyReporters(io, resolved) {
  const ids = Array.isArray(resolved?.reporterIds) ? resolved.reporterIds : [];
  if (!io || ids.length === 0) return;
  try {
    const { pushNotification } = require("../socket/handlers");
    const notice = reports.reporterNotice(resolved.status);
    for (const id of ids) {
      pushNotification(io, id, { ...notice, meta: { reportId: resolved.reportId, status: resolved.status } });
    }
  } catch (err) {
    console.warn("[reports] reporter notification failed:", err?.message || err);
  }
}

router.post("/reports/:id/dismiss", async (req, res) => {
  try {
    const resolved = await reports.resolveReport(req.params.id, {
      actorId: req.user.id,
      status: "dismissed",
      resolution: "dismissed",
      markAllOpenForTarget: false,
    });
    audit(req.user, "report_dismiss", resolved.targetId, { reportId: req.params.id });
    workflow.noteResolution({ targetId: resolved.targetId, reportId: req.params.id, actor: req.user, resolution: "dismissed" });
    notifyAdminRoom(getIo(req), { type: "report_dismiss", reportId: req.params.id, targetId: resolved.targetId });
    notifyReporters(getIo(req), resolved);
    res.json({ ok: true, ...resolved });
  } catch (err) {
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || "Dismiss failed." });
  }
});

/* ---------- 3.4.0 rapor iş akışı: atama + not zaman çizelgesi ---------- */

function workflowError(res, err, fallback) {
  const status = err?.status || (err?.code === "WORKFLOW_UNAVAILABLE" ? 503 : 500);
  return res.status(status).json({ error: err?.message || fallback, code: err?.code });
}

router.get("/reports/assignees", async (_req, res) => {
  try {
    res.json({ assignees: await workflow.listAssignees() });
  } catch (err) {
    workflowError(res, err, "Yöneticiler yüklenemedi.");
  }
});

router.post("/reports/target/:targetId/assign", async (req, res) => {
  const { targetId } = req.params;
  if (!workflow.isUuid(targetId)) return res.status(400).json({ error: "Geçersiz hesap." });
  const raw = req.body?.assigneeId;
  const assigneeId = raw === "me" ? req.user.id : raw || null;
  try {
    const result = await workflow.assignTarget({ targetId, assigneeId, actor: req.user });
    if (result.changed) {
      audit(req.user, assigneeId ? "report_assign" : "report_unassign", targetId, { assignee: result.assignee?.username || null, count: result.count });
      const io = getIo(req);
      notifyAdminRoom(io, { type: "report_assign", targetId, assigneeId: result.assignee?.id || null });
      if (result.assignee && result.assignee.id !== req.user.id) {
        try {
          const { pushNotification } = require("../socket/handlers");
          pushNotification(io, result.assignee.id, {
            type: "admin_report_assigned",
            title: "Sana bir rapor atandı",
            body: `${req.user.username} bir hesabın raporlarını sana atadı (${result.count} açık rapor).`,
            meta: { targetId },
          });
        } catch {
          /* notification is best effort */
        }
      }
    }
    res.json({ ok: true, assigneeId: result.assignee?.id || null, assigneeUsername: result.assignee?.username || null, count: result.count });
  } catch (err) {
    workflowError(res, err, "Atama yapılamadı.");
  }
});

router.get("/reports/target/:targetId/notes", async (req, res) => {
  const { targetId } = req.params;
  if (!workflow.isUuid(targetId)) return res.status(400).json({ error: "Geçersiz hesap." });
  try {
    res.set("Cache-Control", "no-store");
    res.json(await workflow.listNotes(targetId));
  } catch (err) {
    workflowError(res, err, "Notlar yüklenemedi.");
  }
});

router.post("/reports/target/:targetId/notes", async (req, res) => {
  const { targetId } = req.params;
  if (!workflow.isUuid(targetId)) return res.status(400).json({ error: "Geçersiz hesap." });
  const reportId = workflow.isUuid(req.body?.reportId) ? req.body.reportId : null;
  try {
    const note = await workflow.insertNote({ targetId, reportId, actor: req.user, kind: "note", body: req.body?.body });
    audit(req.user, "report_note", targetId, { length: note.body.length });
    notifyAdminRoom(getIo(req), { type: "report_note", targetId });
    res.status(201).json({ ok: true, note });
  } catch (err) {
    workflowError(res, err, "Not eklenemedi.");
  }
});

router.post("/reports/:id/timeout", (req, res) => applyFromReport(req, res, "timeout"));
router.post("/reports/:id/ban", (req, res) => applyFromReport(req, res, "ban"));

module.exports = router;
