const express = require("express");
const router = express.Router();
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { Permissions, hasPermission, resolveChannelPermissions } = require("../lib/serverPermissions");

// Get reactions for a conversation (DM or Group)
router.get("/conversation/:type/:id", requireAuth, async (req, res) => {
  const { type, id } = req.params;
  const userId = req.user.id;

  try {
    // Verify user has access to this conversation
    if (type === "dm") {
      // For DM, check if user is part of the conversation
      const [id1, id2] = id.split("::");
      if (id1 !== userId && id2 !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
    } else if (type === "group") {
      // For group, check membership
      console.log("[reactions] Checking group membership for user:", userId, "group:", id);
      const { data: member, error: memberError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("group_id", id)
        .eq("user_id", userId)
        .maybeSingle();
      
      console.log("[reactions] Membership check result:", member, "error:", memberError);
      
      if (!member) {
        return res.status(403).json({ error: "Access denied" });
      }
    } else if (type === "server") {
      // id is a server text channel. Before 2026-10-18 this branch was missing,
      // so any signed-in user could list reactions (message ids, user ids,
      // usernames) of any channel, including private channels of other servers.
      const { data: channel, error: chErr } = await supabase
        .from("server_channels")
        .select("id, server_id, type")
        .eq("id", id)
        .maybeSingle();
      if (chErr) throw chErr;
      if (!channel) return res.status(404).json({ error: "Channel not found" });
      const resolved = await resolveChannelPermissions(supabase, channel.server_id, userId, channel.id);
      if (
        !resolved.isMember ||
        !hasPermission(resolved.bits, Permissions.VIEW_CHANNEL) ||
        !hasPermission(resolved.bits, Permissions.READ_MESSAGE_HISTORY)
      ) {
        return res.status(403).json({ error: "Access denied" });
      }
    } else {
      return res.status(400).json({ error: "Unknown conversation type" });
    }

    // Get all reactions for this conversation
    const { data: reactions, error } = await supabase
      .from("reactions")
      .select("message_id, emoji, user_id, users(username)")
      .eq("conversation_type", type)
      .eq("conversation_id", id);

    if (error) throw error;

    // Group by message_id
    const grouped = {};
    reactions.forEach(r => {
      if (!grouped[r.message_id]) {
        grouped[r.message_id] = [];
      }
      grouped[r.message_id].push({
        emoji: r.emoji,
        userId: r.user_id,
        username: r.users?.username || "Unknown"
      });
    });

    res.json({ reactions: grouped });
  } catch (err) {
    console.error("[reactions] Error fetching:", err);
    res.status(500).json({ error: "Failed to fetch reactions" });
  }
});

module.exports = router;
