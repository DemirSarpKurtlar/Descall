"use strict";

/**
 * Which invite brought a new account (users.joined_via_invite_code, nullable text,
 * 20261111_signup_measurement.sql). Values carry their kind as a prefix:
 *   server:<code>   /invite/s/:code, /servers/join/:code
 *   vanity:<slug>   /s/:slug
 *   group:<code>    /invite/:code, /i/:code
 *   friend:<name>   /register?ref=<username> (users.referred_by holds the inviter id)
 *
 * Written once (only while the column is still empty) at sign-up and again when a
 * fresh account redeems an invite, so an invite the app did not send with the
 * sign-up request is still counted. A database without the column is ignored.
 */

const supabase = require("../db/supabase");

const VALUE_RE = {
  server: /^[A-Za-z0-9_-]{4,64}$/,
  vanity: /^[a-z0-9][a-z0-9-]{1,31}$/,
  group: /^[A-Za-z0-9_-]{2,64}$/,
  friend: /^[A-Za-z0-9_.-]{2,24}$/,
};

/** Fresh accounts only: an older account joining a server was not brought in by it. */
const FRESH_ACCOUNT_MS = 48 * 60 * 60 * 1000;

/** "server:abc" style value, or null when the kind or the value is not valid. */
function normalizeInviteAttribution(raw) {
  const text = String(raw ?? "").trim();
  const i = text.indexOf(":");
  if (i <= 0) return null;
  const kind = text.slice(0, i).toLowerCase();
  let value = text.slice(i + 1).trim();
  if (kind === "vanity") value = value.toLowerCase();
  const re = VALUE_RE[kind];
  return re && re.test(value) ? `${kind}:${value}` : null;
}

function inviteValue(kind, value) {
  return normalizeInviteAttribution(`${kind}:${value}`);
}

/** invite_kind for lib/signupSourceTaxonomy.js from a stored value. */
function inviteKindForTaxonomy(raw) {
  const v = normalizeInviteAttribution(raw);
  if (!v) return "";
  const kind = v.slice(0, v.indexOf(":"));
  if (kind === "server" || kind === "vanity") return "server_invite";
  if (kind === "group") return "group_invite";
  return "friend_invite";
}

const isMissingColumn = (e) => /column|schema cache|does not exist|42703|PGRST204/i.test(`${e?.code || ""} ${e?.message || ""}`);

/**
 * Store the invite on a fresh account when it has none yet. Never throws; resolves
 * true when a row was updated.
 */
async function recordJoinedViaInvite(userId, raw, { now = Date.now(), db = supabase } = {}) {
  const value = normalizeInviteAttribution(raw);
  if (!userId || !value) return false;
  try {
    const since = new Date(now - FRESH_ACCOUNT_MS).toISOString();
    const { data, error } = await db
      .from("users")
      .update({ joined_via_invite_code: value })
      .eq("id", userId)
      .is("joined_via_invite_code", null)
      .gte("created_at", since)
      .select("id");
    if (error) {
      if (!isMissingColumn(error)) console.warn("[invite-attribution] write failed");
      return false;
    }
    return Array.isArray(data) ? data.length > 0 : Boolean(data);
  } catch {
    return false;
  }
}

module.exports = {
  FRESH_ACCOUNT_MS,
  normalizeInviteAttribution,
  inviteValue,
  inviteKindForTaxonomy,
  recordJoinedViaInvite,
};
