"use strict";

/**
 * Account deletion (App Store Guideline 5.1.1(v)).
 *
 * Request: the account is closed at once (all sessions revoked, push tokens
 * dropped) and deletion_requested_at is set. Signing in again within the grace
 * period cancels it. After GRACE_DAYS the account is permanently anonymized:
 * personal data and private-only rows are deleted; messages the user sent in
 * shared chats stay, shown as "Deleted user", so other people's history keeps
 * making sense. The users row is kept (not hard-deleted) because servers.owner_id
 * and message foreign keys cascade and would wipe other people's servers/chats.
 */

const supabase = require("../db/supabase");

const GRACE_DAYS = 14;
const DELETED_DISPLAY_NAME = "Deleted user";

// Rows that only matter to the deleted user.
const OWN_ROWS = [
  ["device_push_tokens", "user_id"],
  ["push_devices", "user_id"],
  ["web_push_subscriptions", "user_id"],
  ["friendships", "user_id"],
  ["friendships", "friend_id"],
  ["friend_requests", "from_user_id"],
  ["friend_requests", "to_user_id"],
  ["dm_conversation_prefs", "user_id"],
  ["notifications", "user_id"],
  ["notification_preferences", "user_id"],
  ["user_presence", "user_id"],
  ["user_activity_log", "user_id"],
  ["user_activity_settings", "user_id"],
  ["analytics_events", "user_id"],
  ["server_folders", "user_id"],
  ["server_channel_reads", "user_id"],
  ["server_channel_mutes", "user_id"],
  ["group_invites", "invited_user_id"],
  // Legacy tables (assistant and call recording removed in 2.9.141). Kept so a
  // user-requested account deletion still erases any rows they left behind.
  ["dimaai_pending_actions", "user_id"],
  ["dimaai_messages", "user_id"],
  ["dimaai_conversations", "user_id"],
  ["dimaai_memories", "user_id"],
  ["dimaai_memory_prefs", "user_id"],
  ["dimaai_attachments", "user_id"],
  ["dimaai_files", "user_id"],
  ["dimaai_project_notes", "user_id"],
  ["dimaai_projects", "user_id"],
  ["dimaai_agents", "user_id"],
  ["dimaai_user_settings", "user_id"],
  ["voice_recordings", "created_by"],
];

const ATTRIBUTION_COLUMNS = [
  "first_touch_source", "first_touch_medium", "first_touch_campaign", "first_touch_term",
  "first_touch_content", "first_touch_gclid", "first_touch_fbclid", "first_touch_landing_page",
  "first_touch_referrer", "last_touch_source", "last_touch_medium", "last_touch_campaign",
  "last_touch_term", "last_touch_content", "last_touch_gclid", "last_touch_fbclid",
  "last_touch_landing_page", "last_touch_referrer", "signup_device", "signup_browser",
  "signup_os", "signup_country", "signup_visitor_key",
];

async function requestDeletion(userId) {
  const now = new Date().toISOString();
  const { data: row } = await supabase.from("users").select("active_sessions").eq("id", userId).maybeSingle();
  const sessionIds = (Array.isArray(row?.active_sessions) ? row.active_sessions : [])
    .map((s) => s && s.id)
    .filter(Boolean);
  const { error } = await supabase
    .from("users")
    .update({ deletion_requested_at: now, active_sessions: [] })
    .eq("id", userId);
  if (error) throw error;
  await supabase.from("device_push_tokens").delete().eq("user_id", userId);
  return { requestedAt: now, purgeAfter: new Date(Date.now() + GRACE_DAYS * 86400000).toISOString(), sessionIds };
}

/** Called after a successful sign-in. Returns true when a pending deletion was cancelled. */
async function cancelDeletionIfPending(userId) {
  const { data } = await supabase
    .from("users")
    .select("deletion_requested_at, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.deletion_requested_at || data.deleted_at) return false;
  await supabase.from("users").update({ deletion_requested_at: null }).eq("id", userId);
  return true;
}

async function anonymizeUser(userId) {
  // Leave memberships of servers/groups the user does not own.
  const { data: owned } = await supabase.from("servers").select("id").eq("owner_id", userId);
  const ownedIds = (owned || []).map((s) => s.id);
  let q = supabase.from("server_members").delete().eq("user_id", userId);
  if (ownedIds.length) q = q.not("server_id", "in", `(${ownedIds.join(",")})`);
  await q;
  await supabase.from("group_members").delete().eq("user_id", userId);

  for (const [table, column] of OWN_ROWS) {
    const { error } = await supabase.from(table).delete().eq(column, userId);
    if (error && !/does not exist|schema cache/i.test(error.message || "")) {
      console.warn(`[accountDeletion] ${table}.${column}:`, error.message);
    }
  }

  const patch = {
    username: `deleted_${String(userId).replace(/-/g, "").slice(0, 12)}`,
    display_name: DELETED_DISPLAY_NAME,
    password_hash: null,
    email: null,
    email_confirmed_at: null,
    google_id: null,
    apple_sub: null,
    apple_refresh_token: null,
    auth_provider: "deleted",
    avatar_url: null,
    banner_url: null,
    bio: null,
    custom_status: null,
    avatar_frame_url: null,
    profile_background_url: null,
    blocked_users: [],
    active_sessions: [],
    birth_date: null,
    confirmation_token: null,
    reauthentication_token: null,
    password_reset_token: null,
    two_factor_enabled: false,
    deleted_at: new Date().toISOString(),
  };
  for (const c of ATTRIBUTION_COLUMNS) patch[c] = null;
  const { error } = await supabase.from("users").update(patch).eq("id", userId);
  if (error) throw error;
}

async function purgeDueAccounts() {
  const cutoff = new Date(Date.now() - GRACE_DAYS * 86400000).toISOString();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .lt("deletion_requested_at", cutoff)
    .is("deleted_at", null)
    .limit(50);
  if (error) {
    if (!/deletion_requested_at/.test(error.message || "")) console.warn("[accountDeletion] scan:", error.message);
    return 0;
  }
  let done = 0;
  for (const { id } of data || []) {
    try {
      await anonymizeUser(id);
      done += 1;
    } catch (err) {
      console.error("[accountDeletion] anonymize failed", id, err?.message || err);
    }
  }
  if (done) console.log(`[accountDeletion] anonymized ${done} account(s)`);
  return done;
}

function startDeletionSweeper() {
  const run = () => purgeDueAccounts().catch((e) => console.warn("[accountDeletion]", e?.message || e));
  setTimeout(run, 60 * 1000).unref?.();
  setInterval(run, 60 * 60 * 1000).unref?.();
}

module.exports = { GRACE_DAYS, requestDeletion, cancelDeletionIfPending, anonymizeUser, purgeDueAccounts, startDeletionSweeper };
