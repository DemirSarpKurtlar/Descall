"use strict";

/**
 * Legacy /api/feedback admin endpoints (list / mark viewed / reply / delete).
 * The admin panel uses /api/admin/feedback; these old paths stay for older
 * clients but are admin-only, like the admin router. Database error details
 * are logged on the server and never sent to the client.
 */

const express = require("express");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireAdmin2fa, requireStepUp } = require("../middleware/adminSecondFactor");

const router = express.Router();

router.use(requireAuth, requireAdmin, requireAdmin2fa, requireStepUp);

function fail(res, tag, err) {
  console.error(`[FEEDBACK] ${tag} failed:`, err?.message || err);
  return res.status(500).json({ success: false, error: "Internal server error" });
}

router.get("/list", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_feedback")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return fail(res, "list", error);
    return res.status(200).json({ success: true, feedback: data || [] });
  } catch (err) {
    return fail(res, "list", err);
  }
});

router.post("/:id/view", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("user_feedback")
      .update({ viewed: true, viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(res, "view", error);
    return res.status(200).json({ success: true, feedback: data });
  } catch (err) {
    return fail(res, "view", err);
  }
});

router.post("/:id/reply", async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body || {};
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Reply message required" });
    }
    const { data: current, error: fetchError } = await supabase
      .from("user_feedback")
      .select("admin_replies")
      .eq("id", id)
      .single();
    if (fetchError) return fail(res, "reply fetch", fetchError);

    const replies = current?.admin_replies || [];
    replies.push({
      id: Date.now().toString(),
      admin_id: req.user.id,
      admin_username: req.user.username,
      message: message.trim(),
      created_at: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("user_feedback")
      .update({ admin_replies: replies, status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(res, "reply", error);
    return res.status(200).json({ success: true, feedback: data });
  } catch (err) {
    return fail(res, "reply", err);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("user_feedback").delete().eq("id", id);
    if (error) return fail(res, "delete", error);
    return res.status(200).json({ success: true, message: "Feedback deleted" });
  } catch (err) {
    return fail(res, "delete", err);
  }
});

module.exports = router;
