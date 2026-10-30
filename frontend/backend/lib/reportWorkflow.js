"use strict";

/**
 * Rapor iş akışı (3.4.0). The reports of one account are worked as a case:
 * one admin is assigned to all of its open reports, and admins keep a
 * timeline on the account (notes, assignment changes, decisions) in
 * public.user_report_notes (supabase/migrations/20261101_report_workflow.sql).
 * Only admins who may open the "reports" section can be assigned.
 */

const perms = require("./adminPermissions");

const NOTE_MAX = 2000;
const NOTE_KINDS = new Set(["note", "assign", "unassign", "resolve"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

function isUuid(v) {
  return UUID_RE.test(String(v || ""));
}

/** Trim, collapse runs of blank lines, cap length. Empty → null. */
function cleanNoteBody(text) {
  const s = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!s) return null;
  return s.length > NOTE_MAX ? s.slice(0, NOTE_MAX) : s;
}

function missingTable(err) {
  const msg = String(err?.message || "");
  return err?.code === "42P01" || err?.code === "42703" || err?.code === "PGRST205" || /user_report_notes|assignee_id/.test(msg);
}

function unavailable() {
  const err = new Error("Rapor iş akışı henüz etkin değil (migration 20261101_report_workflow.sql).");
  err.code = "WORKFLOW_UNAVAILABLE";
  err.status = 503;
  return err;
}

function publicNote(row) {
  return {
    id: row.id,
    targetId: row.target_id,
    reportId: row.report_id || null,
    authorId: row.author_id || null,
    authorUsername: row.author_username || null,
    kind: NOTE_KINDS.has(row.kind) ? row.kind : "note",
    body: row.body,
    createdAt: row.created_at,
  };
}

async function insertNote({ targetId, reportId = null, actor, kind = "note", body }) {
  const clean = cleanNoteBody(body);
  if (!clean) {
    const err = new Error("Not boş olamaz.");
    err.code = "EMPTY";
    err.status = 400;
    throw err;
  }
  const { data, error } = await db()
    .from("user_report_notes")
    .insert({
      target_id: targetId,
      report_id: reportId,
      author_id: actor?.id || null,
      author_username: actor?.username || null,
      kind: NOTE_KINDS.has(kind) ? kind : "note",
      body: clean,
    })
    .select("*")
    .single();
  if (error) throw missingTable(error) ? unavailable() : error;
  return publicNote(data);
}

async function listNotes(targetId, { limit = 100 } = {}) {
  const { data, error } = await db()
    .from("user_report_notes")
    .select("*")
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, Number(limit) || 100)));
  if (error) {
    if (missingTable(error)) return { notes: [], available: false };
    throw error;
  }
  return { notes: (data || []).map(publicNote), available: true };
}

/** Admins who may work reports (section "reports"), for the assign menu. */
async function listAssignees() {
  let q = await db().from("users").select("id, username, display_name, avatar_url, is_admin, is_super_admin, admin_permissions").eq("is_admin", true).limit(200);
  if (q.error) q = await db().from("users").select("id, username, display_name, avatar_url, is_admin").eq("is_admin", true).limit(200);
  if (q.error) throw q.error;
  return (q.data || [])
    .filter((u) => perms.canOpen(u, u, "reports"))
    .map((u) => ({ id: u.id, username: u.username, displayName: u.display_name || null, avatarUrl: u.avatar_url || null }))
    .sort((a, b) => String(a.username).localeCompare(String(b.username), "tr"));
}

/**
 * Assign (or clear) every open report of one account. Writes an "assign" /
 * "unassign" line to the timeline. Returns { assignee, count, changed }.
 */
async function assignTarget({ targetId, assigneeId, actor }) {
  let assignee = null;
  if (assigneeId) {
    if (!isUuid(assigneeId)) {
      const err = new Error("Geçersiz yönetici.");
      err.status = 400;
      throw err;
    }
    const row = await perms.loadRow(assigneeId);
    if (!row || !perms.canOpen(row, row, "reports")) {
      const err = new Error("Bu kişi raporlarla çalışamaz (Raporlar yetkisi yok).");
      err.code = "NOT_ASSIGNABLE";
      err.status = 400;
      throw err;
    }
    assignee = { id: row.id, username: row.username };
  }
  const { data: open, error: openErr } = await db()
    .from("user_reports")
    .select("id, assignee_id")
    .eq("target_id", targetId)
    .eq("status", "open");
  if (openErr) throw missingTable(openErr) ? unavailable() : openErr;
  const rows = open || [];
  if (!rows.length) {
    const err = new Error("Bu hesap için açık rapor yok.");
    err.code = "NO_OPEN";
    err.status = 409;
    throw err;
  }
  const want = assignee?.id || null;
  const changed = rows.some((r) => (r.assignee_id || null) !== want);
  if (!changed) return { assignee, count: rows.length, changed: false };

  const upd = await db()
    .from("user_reports")
    .update({ assignee_id: want, assigned_at: want ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("target_id", targetId)
    .eq("status", "open");
  if (upd.error) throw missingTable(upd.error) ? unavailable() : upd.error;

  await insertNote({
    targetId,
    actor,
    kind: want ? "assign" : "unassign",
    body: want
      ? want === actor?.id
        ? `${actor?.username || "Bir yönetici"} raporları üzerine aldı.`
        : `${actor?.username || "Bir yönetici"} raporları ${assignee.username} adlı yöneticiye atadı.`
      : `${actor?.username || "Bir yönetici"} atamayı kaldırdı.`,
  }).catch(() => {});
  return { assignee, count: rows.length, changed: true };
}

/** Timeline line when a case is closed (ban, timeout, dismiss). */
async function noteResolution({ targetId, reportId, actor, resolution }) {
  const label = { ban: "yasakladı", timeout: "zaman aşımı verdi", dismissed: "raporu kapattı (işlem gerekmedi)" }[resolution] || resolution;
  return insertNote({ targetId, reportId, actor, kind: "resolve", body: `${actor?.username || "Bir yönetici"} ${label}.` }).catch(() => null);
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = {
  NOTE_MAX,
  cleanNoteBody,
  publicNote,
  insertNote,
  listNotes,
  listAssignees,
  assignTarget,
  noteResolution,
  isUuid,
  __setDbForTests,
};
