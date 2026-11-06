"use strict";

/**
 * "Görüldü" read receipts (messaging phase 4), lib/readReceipts.js.
 *   GET  /api/read-receipts                  → { enabled }
 *   PUT  /api/read-receipts { enabled }      → { ok, enabled } | 503 { error: "not_ready" } before the migration
 *   GET  /api/read-receipts/groups/:groupId  → { reads: [{ userId, at }] } (members only)
 */

const express = require("express");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const rr = require("../lib/readReceipts");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/", requireAuth, async (req, res) => {
  res.json({ enabled: await rr.receiptsEnabled(req.user.id) });
});

router.put("/", requireAuth, async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ ok: false, error: "enabled_required" });
  const out = await rr.setReceiptsEnabled(req.user.id, req.body.enabled);
  if (!out.ok) return res.status(out.error === "not_ready" ? 503 : 500).json(out);
  return res.json(out);
});

router.get("/groups/:groupId", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  if (!UUID.test(String(groupId))) return res.status(400).json({ error: "bad_group" });
  const { data: member } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", req.user.id)
    .maybeSingle();
  if (!member) return res.status(403).json({ error: "not_member" });
  return res.json({ reads: await rr.groupReads(groupId, req.user.id) });
});

module.exports = router;
