"use strict";

/**
 * "Başla panosu" persistence (supabase/migrations/20261124y_onboarding.sql). Every read is
 * tolerant: before the migration is applied the dashboard still works (no rewards, no
 * saved interests) instead of failing.
 */

const model = require("./model");

function db() {
  return require("../../db/supabase");
}

function isMissing(err) {
  if (!err) return false;
  const code = String(err.code || "");
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) return true;
  return /does not exist|schema cache|could not find/i.test(String(err.message || ""));
}

const SETTINGS_DEFAULT = Object.freeze({
  enabled: true,
  communityServerId: null,
  autoJoin: true,
  rehberEnabled: true,
  rewardsEnabled: true,
  available: false,
  updatedAt: null,
});

let settingsCache = { at: 0, value: null };
const SETTINGS_TTL_MS = 30_000;

/** Env fallback for the official server before an admin picks one in the panel. */
function envCommunityId() {
  const v = String(process.env.ONBOARDING_COMMUNITY_SERVER_ID || "").trim();
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

async function getSettings({ fresh = false } = {}) {
  if (!fresh && settingsCache.value && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  let value = { ...SETTINGS_DEFAULT, communityServerId: envCommunityId() };
  try {
    const { data, error } = await db().from("onboarding_settings").select("*").eq("id", "default").maybeSingle();
    if (!error && data) {
      value = {
        enabled: data.enabled !== false,
        communityServerId: data.community_server_id || envCommunityId(),
        autoJoin: data.auto_join !== false,
        rehberEnabled: data.rehber_enabled !== false,
        rewardsEnabled: data.rewards_enabled !== false,
        available: true,
        updatedAt: data.updated_at || null,
      };
    }
  } catch {
    /* keep defaults */
  }
  settingsCache = { at: Date.now(), value };
  return value;
}

async function saveSettings(patch, actorId) {
  const row = { id: "default", updated_at: new Date().toISOString(), updated_by: actorId || null };
  if ("enabled" in patch) row.enabled = Boolean(patch.enabled);
  if ("communityServerId" in patch) row.community_server_id = patch.communityServerId || null;
  if ("autoJoin" in patch) row.auto_join = Boolean(patch.autoJoin);
  if ("rehberEnabled" in patch) row.rehber_enabled = Boolean(patch.rehberEnabled);
  if ("rewardsEnabled" in patch) row.rewards_enabled = Boolean(patch.rewardsEnabled);
  const { error } = await db().from("onboarding_settings").upsert(row, { onConflict: "id" });
  if (error) throw error;
  settingsCache = { at: 0, value: null };
  return getSettings({ fresh: true });
}

/** The user's onboarding row (created on first read). null before the migration. */
async function getRow(userId, { create = true } = {}) {
  try {
    const { data, error } = await db().from("user_onboarding").select("*").eq("user_id", userId).maybeSingle();
    if (error) return isMissing(error) ? null : null;
    if (data || !create) return data || null;
    const fresh = { user_id: userId, interests: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const ins = await db().from("user_onboarding").upsert(fresh, { onConflict: "user_id", ignoreDuplicates: true });
    if (ins.error) return null;
    const again = await db().from("user_onboarding").select("*").eq("user_id", userId).maybeSingle();
    return again.data || fresh;
  } catch {
    return null;
  }
}

async function patchRow(userId, patch, { onlyIfNull = null } = {}) {
  try {
    let q = db().from("user_onboarding").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (onlyIfNull) q = q.is(onlyIfNull, null);
    const { data, error } = await q.select("user_id");
    if (error) return false;
    return Array.isArray(data) ? data.length > 0 : Boolean(data);
  } catch {
    return false;
  }
}

/** step -> amount for the steps already paid. */
async function claimedSteps(userId) {
  try {
    const { data, error } = await db().from("onboarding_rewards").select("step, amount").eq("user_id", userId);
    if (error) return {};
    const out = {};
    for (const r of data || []) out[r.step] = Number(r.amount) || 0;
    return out;
  } catch {
    return {};
  }
}

/**
 * Claim one step (the primary key makes it once per account). Returns true when this call
 * won the claim; false when it was already claimed or the table is missing.
 */
async function claimStep(userId, step, amount) {
  if (!model.STEP_IDS.includes(step)) return false;
  try {
    const { error } = await db().from("onboarding_rewards").insert({ user_id: userId, step, amount: Math.max(0, Math.floor(amount) || 0) });
    if (!error) return true;
    return false;
  } catch {
    return false;
  }
}

async function setClaimAmount(userId, step, amount) {
  try {
    await db().from("onboarding_rewards").update({ amount }).eq("user_id", userId).eq("step", step);
  } catch {
    /* best effort */
  }
}

async function releaseClaim(userId, step) {
  try {
    await db().from("onboarding_rewards").delete().eq("user_id", userId).eq("step", step);
  } catch {
    /* best effort */
  }
}

/** Account facts: created_at, suspicious flag, inviter. Columns degrade before migrations. */
async function accountFacts(userId) {
  const tries = [
    "id, username, display_name, avatar_url, created_at, signup_at, suspicious_signup, referred_by, joined_via_invite_code, is_banned, deleted_at, first_message_at, descoin_balance",
    "id, username, display_name, avatar_url, created_at, suspicious_signup, referred_by, is_banned, first_message_at, descoin_balance",
    "id, username, display_name, avatar_url, created_at",
  ];
  for (const cols of tries) {
    const { data, error } = await db().from("users").select(cols).eq("id", userId).maybeSingle();
    if (!error) return data || null;
  }
  return null;
}

async function serverIdsOf(userId) {
  const { data, error } = await db().from("server_members").select("server_id, joined_at").eq("user_id", userId);
  if (error) return [];
  return (data || []).map((r) => ({ serverId: String(r.server_id), joinedAt: r.joined_at || null }));
}

async function hasAcceptedFriend(userId) {
  try {
    const { data } = await db()
      .from("friendships")
      .select("id")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq("status", "accepted")
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/** A minute in a call or voice room pays voice_activity DesCoin: that is the fact we use. */
async function hasVoiceMinute(userId, sinceIso) {
  try {
    let q = db().from("descoin_ledger").select("id").eq("user_id", userId).eq("reason", "voice_activity").limit(1);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data } = await q;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

module.exports = {
  isMissing,
  getSettings,
  saveSettings,
  getRow,
  patchRow,
  claimedSteps,
  claimStep,
  setClaimAmount,
  releaseClaim,
  accountFacts,
  serverIdsOf,
  hasAcceptedFriend,
  hasVoiceMinute,
  envCommunityId,
  __resetSettings: () => {
    settingsCache = { at: 0, value: null };
  },
};
