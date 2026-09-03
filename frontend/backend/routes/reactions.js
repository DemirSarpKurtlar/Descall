const express = require("express");
const router = express.Router();
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");

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
