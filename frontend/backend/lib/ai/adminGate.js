"use strict";

const supabase = require("../../db/supabase");

/**
 * Platform admin for DimaAI NSFW gate.
 * Matches existing Descall checks: users.is_admin OR username === "admin".
 */
async function isPlatformAdmin(reqUser) {
  if (!reqUser?.id) return false;
  if (String(reqUser.username || "").toLowerCase() === "admin") return true;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("username, is_admin")
      .eq("id", reqUser.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
    return Boolean(data.is_admin) || String(data.username || "").toLowerCase() === "admin";
  } catch {
    return String(reqUser.username || "").toLowerCase() === "admin";
  }
}

module.exports = { isPlatformAdmin };
