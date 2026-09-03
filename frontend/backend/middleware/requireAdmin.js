"use strict";

const supabase = require("../db/supabase");
const { touchLastSeen } = require("../lib/presenceTouch");

async function requireAdmin(req, res, next) {
  const u = req.user;
  if (!u) {
    return res.status(403).json({ error: "Admin access required." });
  }

  // Check if username is admin or if user has is_admin in database
  if (u.username === "admin") {
    await touchLastSeen(u.id).catch(() => {});
    return next();
  }

  // Check database for is_admin field
  try {
    const { data: user } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", u.id)
      .single();

    if (user?.is_admin) {
      await touchLastSeen(u.id).catch(() => {});
      return next();
    }

    return res.status(403).json({ error: "Admin access required." });
  } catch (err) {
    console.error("[requireAdmin] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { requireAdmin };
