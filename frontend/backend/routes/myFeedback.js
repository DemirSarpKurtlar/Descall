"use strict";

/**
 * Geri bildirim, sender side (3.7.14). Mounted at /api/me/feedback (and the
 * submit handler at POST /api/feedback/submit, which keeps its old URL).
 *
 *   GET  /api/me/feedback            → { items: [shapeForUser w/o thread], unread }
 *   GET  /api/me/feedback/unread     → { unread }
 *   GET  /api/me/feedback/:id        → { item } (with thread) and marks it read
 *   POST /api/me/feedback/:id/reply  { text, attachments? } → { item }
 *   POST /api/me/feedback/:id/read   → { ok }
 *
 * Only the sender's own rows (user_id = req.user.id); another id is 404.
 * Shaping lives in lib/userFeedback.js (no internal notes, admin names, e-mail
 * fields or raw user agents). New feedback and user answers reach the admin
 * panel live through `feedback:new` / `feedback:user_reply` on the admin room.
 */

const express = require("express");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");
const uf = require("../lib/userFeedback");

const router = express.Router();
const HOUR = 60 * 60 * 1000;
const SUBMIT = { windowMs: HOUR, max: 8 };
const REPLY = { windowMs: 10 * 60 * 1000, max: 20 };
const LIST_COLS = "id, user_id, kind, category, status, subject, message, rating, details, attachments, platform, app_version, admin_replies, user_last_read_at, created_at, updated_at";

function io(req) {
  return req.app?.get?.("io") || null;
}

function notifyAdmins(req, event, payload) {
  try { io(req)?.to?.("admin")?.emit?.(event, payload); } catch { /* best effort */ }
}

/** Older databases without the 3.7.14 columns: retry the select without them. */
async function selectOwn(userId, { id = null, limit = 50 } = {}) {
  let q = supabase.from("user_feedback").select(LIST_COLS).eq("user_id", String(userId));
  q = id ? q.eq("id", id).maybeSingle() : q.order("updated_at", { ascending: false }).limit(limit);
  let { data, error } = await q;
  if (error && /column .* does not exist|kind|user_last_read_at|details|rating/i.test(error.message || "")) {
    const legacy = LIST_COLS.split(", ").filter((c) => !["kind", "rating", "details", "user_last_read_at"].includes(c)).join(", ");
    let q2 = supabase.from("user_feedback").select(legacy).eq("user_id", String(userId));
    q2 = id ? q2.eq("id", id).maybeSingle() : q2.order("updated_at", { ascending: false }).limit(limit);
    ({ data, error } = await q2);
  }
  if (error) throw error;
  return data;
}

function validId(id) {
  return /^[0-9a-f-]{36}$/i.test(String(id || ""));
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = (await selectOwn(req.user.id)) || [];
    const items = rows.map((r) => uf.shapeForUser(r, { withThread: false }));
    res.set("Cache-Control", "no-store");
    res.json({ items, unread: items.reduce((n, i) => n + i.unread, 0) });
  } catch (err) {
    console.error("[feedback/me] list failed:", err?.message || err);
    res.status(500).json({ error: "Geri bildirimler yüklenemedi." });
  }
});

router.get("/unread", requireAuth, async (req, res) => {
  try {
    const rows = (await selectOwn(req.user.id)) || [];
    res.set("Cache-Control", "no-store");
    res.json({ unread: rows.reduce((n, r) => n + uf.unreadFor(r), 0) });
  } catch (err) {
    console.error("[feedback/me] unread failed:", err?.message || err);
    res.status(500).json({ error: "Okunmamış sayısı alınamadı." });
  }
});

async function markRead(id, userId) {
  const { error } = await supabase.from("user_feedback")
    .update({ user_last_read_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", String(userId));
  if (error && !/user_last_read_at/.test(error.message || "")) throw error;
}

router.get("/:id", requireAuth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: "Bulunamadı." });
  try {
    const row = await selectOwn(req.user.id, { id: req.params.id });
    if (!row) return res.status(404).json({ error: "Bulunamadı." });
    const item = uf.shapeForUser(row);
    await markRead(row.id, req.user.id);
    res.set("Cache-Control", "no-store");
    res.json({ item: { ...item, unread: 0 } });
  } catch (err) {
    console.error("[feedback/me] get failed:", err?.message || err);
    res.status(500).json({ error: "Geri bildirim yüklenemedi." });
  }
});

router.post("/:id/read", requireAuth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: "Bulunamadı." });
  try {
    await markRead(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[feedback/me] read failed:", err?.message || err);
    res.status(500).json({ error: "İşaretlenemedi." });
  }
});

router.post("/:id/reply", requireAuth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: "Bulunamadı." });
  const key = `fbreply:${req.user.id}`;
  if (rejectIfLimited(res, [peek(key, REPLY)])) return;
  try {
    const row = await selectOwn(req.user.id, { id: req.params.id });
    if (!row) return res.status(404).json({ error: "Bulunamadı." });
    const out = uf.appendUserReply(row, req.body?.text, req.body?.attachments);
    if (out.error === "closed") return res.status(409).json({ error: "Bu geri bildirim kapatıldı. Yeni bir geri bildirim gönderebilirsin.", code: "FEEDBACK_CLOSED" });
    if (out.error) return res.status(400).json({ error: "Yanıt boş olamaz." });
    recordFailure(key, REPLY);
    const { error } = await supabase.from("user_feedback").update(out.update).eq("id", row.id).eq("user_id", String(req.user.id));
    if (error) throw error;
    notifyAdmins(req, "feedback:user_reply", { feedbackId: row.id });
    notifyAdmins(req, "feedback:new", { id: row.id });
    const next = { ...row, ...out.update };
    res.json({ item: { ...uf.shapeForUser(next), unread: 0 } });
  } catch (err) {
    console.error("[feedback/me] reply failed:", err?.message || err);
    res.status(500).json({ error: "Yanıt gönderilemedi." });
  }
});

/**
 * POST /api/feedback/submit (mounted in server.js before the legacy admin
 * router). Accepts the 3.7.14 body { kind, message, area?, frequency?,
 * likes?, rating?, attachments?, includeDevice?, platform?, appVersion? } and
 * the old { category, priority, message }.
 */
function submitHandler({ sendFeedbackEmail } = {}) {
  return async (req, res) => {
    const key = `fbsubmit:${req.user.id}`;
    if (rejectIfLimited(res, [peek(key, SUBMIT)])) return;
    const parsed = uf.sanitizeSubmission(req.body, { userAgent: req.get("user-agent") || "" });
    if (parsed.error) return res.status(400).json({ success: false, error: "En az 5 karakter yaz.", code: "TOO_SHORT" });
    recordFailure(key, SUBMIT);
    const now = new Date().toISOString();
    const base = {
      user_id: String(req.user.id),
      username: req.user.username || "Anonymous",
      status: "new",
      viewed: false,
      admin_replies: [],
      created_at: now,
      updated_at: now,
    };
    const full = { ...base, ...parsed.row, user_last_read_at: now };
    try {
      let { data, error } = await supabase.from("user_feedback").insert(full).select().single();
      if (error && /kind|rating|details|user_last_read_at/.test(error.message || "")) {
        // Database without the 3.7.14 columns yet: store what the old schema has.
        const { kind, rating, details, user_last_read_at, ...legacy } = full;
        ({ data, error } = await supabase.from("user_feedback").insert(legacy).select().single());
      }
      if (error) throw error;
      notifyAdmins(req, "feedback:new", { id: data.id });
      let emailSent = false;
      if (typeof sendFeedbackEmail === "function") {
        try {
          const delivery = await sendFeedbackEmail(data);
          emailSent = Boolean(delivery?.sent);
          await supabase.from("user_feedback").update({
            email_status: delivery?.sent ? "sent" : "skipped",
            email_provider_id: delivery?.providerId || null,
            email_sent_at: delivery?.sent ? new Date().toISOString() : null,
            email_error: delivery?.error || null,
          }).eq("id", data.id);
        } catch (emailError) {
          const message = String(emailError?.message || "Email delivery failed").slice(0, 500);
          console.error("[FEEDBACK] Email delivery failed:", message);
          await supabase.from("user_feedback").update({ email_status: "failed", email_error: message }).eq("id", data.id);
        }
      }
      res.json({ success: true, message: "Feedback submitted successfully", feedbackId: data.id, emailSent, item: uf.shapeForUser(data) });
    } catch (err) {
      console.error("[FEEDBACK] submit failed:", err?.message || err);
      res.status(500).json({ success: false, error: "Could not save feedback" });
    }
  };
}

module.exports = router;
module.exports.submitHandler = submitHandler;
