"use strict";

/** Active server timeout for a member, or null. Shared by text, reactions, typing and voice. */
const supabase = require("../db/supabase");
const { templatedError } = require("./apiError");

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
  // err.i18n carries the template; the app can also format err.timeout.until itself.
  const err = templatedError("You are timed out until {until}.", { until: new Date(t.until).toLocaleString("en-US") }, { status: 403, code: "TIMED_OUT" });
  err.timeout = t;
  return err;
}

module.exports = { getActiveServerTimeout, timedOutError };
