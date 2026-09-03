"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { isUuid, listPrefs, upsertPref } = require("../lib/dmConversationPrefs");
const {
  convKey,
  loadDmMessages,
  isAcceptedFriend,
  buildDmPreviewMaps,
  attachReactions,
} = require("../lib/dmMessages");

const router = express.Router();

function emitPref(req, userId, pref) {
  const io = req.app.get("io");
  if (!io || !userId || !pref) return;
  io.to(`user:${userId}`).emit("dm:prefs:update", { pref });
}

router.get("/prefs", requireAuth, async (req, res) => {
  try {
    const prefs = await listPrefs(req.user.id);
    res.json({ prefs });
  } catch (err) {
    console.error("[DM prefs] GET failed:", err?.message || err);
    res.status(500).json({ error: "Failed to load chat preferences." });
  }
});

router.patch("/prefs/:peerId", requireAuth, async (req, res) => {
  try {
    const peerId = req.params.peerId;
    if (!isUuid(peerId)) {
      return res.status(400).json({ error: "Invalid conversation." });
    }
    if (peerId === req.user.id) {
      return res.status(400).json({ error: "Invalid conversation." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const patch = {};
    if (body.pinned !== undefined) patch.pinned = Boolean(body.pinned);
    if (body.muted !== undefined) patch.muted = Boolean(body.muted);
    if (body.hidden !== undefined) patch.hidden = Boolean(body.hidden);
    if (body.markedUnread !== undefined) patch.markedUnread = Boolean(body.markedUnread);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nothing to update." });
    }
    const result = await upsertPref(req.user.id, peerId, patch);
    if (!result.ok) {
      return res.status(500).json({ error: result.error || "Failed to update chat." });
    }
    emitPref(req, req.user.id, result.pref);
    res.json({ pref: result.pref });
  } catch (err) {
    console.error("[DM prefs] PATCH failed:", err?.message || err);
    res.status(500).json({ error: "Failed to update chat." });
  }
});

// Static paths MUST be registered before /:peerId/messages so "previews"
// and "prefs" are never treated as peer ids.
router.get("/previews", requireAuth, async (req, res) => {
  try {
    const { dmPreviewsByPeer, dmLastActivityByPeer } = await buildDmPreviewMaps(req.user.id);
    const previews = {};
    for (const peerId of new Set([
      ...Object.keys(dmPreviewsByPeer || {}),
      ...Object.keys(dmLastActivityByPeer || {}),
    ])) {
      previews[peerId] = {
        preview: dmPreviewsByPeer[peerId] || null,
        timestamp: dmLastActivityByPeer[peerId] || null,
      };
    }
    res.json({ previews, dmPreviewsByPeer, dmLastActivityByPeer });
  } catch (err) {
    console.error("[DM] REST previews failed:", err?.message || err);
    res.status(500).json({ error: "Failed to load message previews." });
  }
});

router.get("/:peerId/messages", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const peerId = req.params.peerId;
  if (!isUuid(peerId) || peerId === myId) {
    return res.status(400).json({ error: "Invalid conversation." });
  }
  if (!(await isAcceptedFriend(myId, peerId))) {
    return res.json({ withUserId: peerId, messages: [], hasMore: false });
  }
  try {
    const before = typeof req.query.before === "string" ? req.query.before : null;
    const { messages, hasMore } = await loadDmMessages(myId, peerId, {
      before,
      limit: req.query.limit,
    });
    const withReactions = await attachReactions(messages, "dm", convKey(myId, peerId));
    res.json({ withUserId: peerId, messages: withReactions, hasMore });
  } catch (err) {
    console.error("[DM] REST history failed:", err?.message || err);
    res.status(500).json({ error: "Failed to load message history." });
  }
});

module.exports = router;
