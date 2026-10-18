"use strict";

/** Active server timeout for a member, or null. Shared by text, reactions, typing and voice. */
const supabase = require("../db/supabase");

async function getActiveServerTimeout(serverId, userId) {
  if (!serverId || userId == null) return null;
  const { data, error } = await supabase
    .from("server_members")
    .select("timeout_until, timeout_reason")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.timeout_until) return null;
  const until = new Date(data.timeout_until);
  if (!Number.isFinite(until.getTime()) || until <= new Date()) return null;
  return { until: until.toISOString(), reason: data.timeout_reason || null };
}

function timedOutError(t) {
  const err = new Error(`You are timed out until ${new Date(t.until).toLocaleString("en-US")}.`);
  err.code = "TIMED_OUT";
  err.status = 403;
  err.timeout = t;
  return err;
}

module.exports = { getActiveServerTimeout, timedOutError };
