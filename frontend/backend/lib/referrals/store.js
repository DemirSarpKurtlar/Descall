"use strict";

/**
 * Davet ödülleri: database access (service role). Every read degrades to "nothing" while
 * 20261125b_invite_rewards.sql is not applied (missing table / column), so the app keeps
 * working; writes report { ok: false, missing: true } instead of throwing.
 */

const rulesLib = require("./rules");

function db() {
  return require("../../db/supabase");
}

const PAGE = 1000;
const MAX_ROWS = 50000;

function isMissing(err) {
  const s = `${err?.code || ""} ${err?.message || ""}`;
  return /PGRST20[45]|42P01|42703|does not exist|schema cache|Could not find/i.test(s);
}
function isUnique(err) {
  return String(err?.code || "") === "23505" || /duplicate key/i.test(String(err?.message || ""));
}

const REF_COLS =
  "id, inviter_id, invitee_id, inviter_amount, invitee_amount, created_at, status, legacy, channel, open_id, signup_at, first_message_at, first_message_peer, returned_at, unlock_at, expires_at, paid_at, inviter_skip, hold_reason, held_at, held_by, auto_hold, revoked_at, revoked_by, revoke_reason, revoked_amount, risk_score, risk_signals, device_hash, ip_hash, subnet_hash, email_domain, rules_version, nudged_at, updated_at";
const LEGACY_COLS = "id, inviter_id, invitee_id, inviter_amount, invitee_amount, created_at";

/** Rows from before the migration look like paid legacy rows. */
function fillLegacy(row) {
  if (!row) return row;
  if (row.status === undefined) {
    return { ...row, status: "paid", legacy: true, paid_at: row.created_at, risk_signals: [], signup_at: row.created_at };
  }
  return { ...row, risk_signals: Array.isArray(row.risk_signals) ? row.risk_signals : [] };
}

async function selectRefs(build) {
  const out = [];
  let cols = REF_COLS;
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let { data, error } = await build(db().from("referral_rewards").select(cols)).range(from, from + PAGE - 1);
    if (error && isMissing(error) && cols === REF_COLS) {
      cols = LEGACY_COLS;
      ({ data, error } = await build(db().from("referral_rewards").select(cols)).range(from, from + PAGE - 1));
    }
    if (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    out.push(...(data || []).map(fillLegacy));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------- rules (cached 30 s)
let rulesCache = { at: 0, value: null };
const RULES_TTL = 30_000;

async function getRules({ fresh = false } = {}) {
  if (!fresh && rulesCache.value && Date.now() - rulesCache.at < RULES_TTL) return rulesCache.value;
  let value = { version: 0, rules: rulesLib.normalizeStored(null), createdAt: null, createdBy: null, note: null };
  try {
    const { data, error } = await db()
      .from("referral_rules")
      .select("version, rules, note, created_by, created_at")
      .order("version", { ascending: false })
      .limit(1);
    if (!error && Array.isArray(data) && data[0]) {
      const r = data[0];
      value = { version: r.version, rules: rulesLib.normalizeStored(r.rules), createdAt: r.created_at, createdBy: r.created_by, note: r.note || null };
    }
  } catch {
    /* defaults */
  }
  rulesCache = { at: Date.now(), value };
  return value;
}

async function listRuleVersions(limit = 20) {
  const { data, error } = await db()
    .from("referral_rules")
    .select("version, rules, note, created_by, created_at")
    .order("version", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return data || [];
}

/** New version = newest + 1. Returns { ok, version } or { ok: false, missing }. */
async function saveRules(rules, { actorId = null, note = null } = {}) {
  const current = await getRules({ fresh: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const version = Math.max(current.version, 0) + 1 + attempt;
    const { error } = await db().from("referral_rules").insert({ version, rules, note: note || null, created_by: actorId });
    if (!error) {
      rulesCache = { at: 0, value: null };
      return { ok: true, version };
    }
    if (isMissing(error)) return { ok: false, missing: true };
    if (!isUnique(error)) throw error;
  }
  throw new Error("RULES_VERSION_CONFLICT");
}

function __resetRulesCache() {
  rulesCache = { at: 0, value: null };
}

// ---------------------------------------------------------------- referral rows
async function insertReferral(row) {
  const { data, error } = await db().from("referral_rewards").insert(row).select(REF_COLS).maybeSingle();
  if (error) {
    if (isUnique(error)) return { ok: false, duplicate: true };
    if (isMissing(error)) return { ok: false, missing: true };
    throw error;
  }
  return { ok: true, row: fillLegacy(data) };
}

async function referralByInvitee(inviteeId) {
  const rows = await selectRefs((q) => q.eq("invitee_id", inviteeId));
  return rows[0] || null;
}

async function referralsByInviter(inviterId, { since = null } = {}) {
  return selectRefs((q) => {
    let x = q.eq("inviter_id", inviterId);
    if (since) x = x.gte("created_at", since);
    return x.order("created_at", { ascending: false });
  });
}

async function referralsByIds(ids) {
  const list = [...new Set((ids || []).map(String))].slice(0, 500);
  if (!list.length) return [];
  return selectRefs((q) => q.in("id", list));
}

async function listReferrals({ since = null, statuses = null } = {}) {
  return selectRefs((q) => {
    let x = q;
    if (since) x = x.gte("created_at", since);
    if (statuses) x = x.in("status", statuses);
    return x.order("created_at", { ascending: false });
  });
}

/** Pending rows whose unlock time passed or that are close to expiry (sweeper). */
async function pendingDue(nowIso) {
  return selectRefs((q) => q.eq("status", "pending").lte("unlock_at", nowIso).order("unlock_at", { ascending: true }));
}

/**
 * Conditional update: only rows whose status is still `expect` (when given). Returns the
 * updated rows (empty when someone else changed them first).
 */
async function updateReferral(id, patch, { expect = null } = {}) {
  let q = db()
    .from("referral_rewards")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (expect) q = Array.isArray(expect) ? q.in("status", expect) : q.eq("status", expect);
  const { data, error } = await q.select(REF_COLS);
  if (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return (Array.isArray(data) ? data : data ? [data] : []).map(fillLegacy);
}

// ---------------------------------------------------------------- opens
async function insertOpen({ inviterId, channel, visitorHash, now = Date.now() }) {
  const day = new Date(now).toISOString().slice(0, 10);
  const { data, error } = await db()
    .from("referral_opens")
    .insert({ inviter_id: inviterId, channel, visitor_hash: visitorHash, day, opened_at: new Date(now).toISOString() })
    .select("id")
    .maybeSingle();
  if (error) {
    if (isUnique(error)) {
      const { data: prev } = await db()
        .from("referral_opens")
        .select("id")
        .eq("inviter_id", inviterId)
        .eq("visitor_hash", visitorHash)
        .eq("day", day)
        .maybeSingle();
      return { ok: true, id: prev?.id || null, repeat: true };
    }
    if (isMissing(error)) return { ok: false, missing: true };
    throw error;
  }
  return { ok: true, id: data?.id || null, repeat: false };
}

async function openById(id) {
  const { data, error } = await db().from("referral_opens").select("id, inviter_id, channel, signup_user_id, opened_at").eq("id", id).maybeSingle();
  if (error) return null;
  return data || null;
}

async function linkOpen(id, userId) {
  const { error } = await db().from("referral_opens").update({ signup_user_id: userId }).eq("id", id).is("signup_user_id", null);
  return !error;
}

async function listOpens({ inviterId = null, since = null } = {}) {
  const out = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = db().from("referral_opens").select("id, inviter_id, channel, opened_at, signup_user_id");
    if (inviterId) q = q.eq("inviter_id", inviterId);
    if (since) q = q.gte("opened_at", since);
    const { data, error } = await q.order("opened_at", { ascending: false }).range(from, from + PAGE - 1);
    if (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------- milestones
async function listMilestones(inviterId) {
  const { data, error } = await db()
    .from("referral_milestones")
    .select("inviter_id, milestone, amount, item_id, reached_at, revoked_at")
    .eq("inviter_id", inviterId);
  if (error) return [];
  return data || [];
}

/** Claim a milestone once (primary key). true when this call claimed it. */
async function claimMilestone(inviterId, milestone, amount, itemId) {
  const { error } = await db()
    .from("referral_milestones")
    .insert({ inviter_id: inviterId, milestone, amount, item_id: itemId || null, reached_at: new Date().toISOString() });
  if (!error) return true;
  if (isUnique(error) || isMissing(error)) return false;
  throw error;
}

async function releaseMilestone(inviterId, milestone) {
  await db().from("referral_milestones").delete().eq("inviter_id", inviterId).eq("milestone", milestone);
}

// ---------------------------------------------------------------- inviter state
async function getInviterState(inviterId) {
  const { data, error } = await db()
    .from("referral_inviter_state")
    .select("inviter_id, link_paused, paused_reason, paused_at, paused_by, device_hashes, subnet_hashes")
    .eq("inviter_id", inviterId)
    .maybeSingle();
  if (error || !data) return { inviter_id: inviterId, link_paused: false, device_hashes: [], subnet_hashes: [] };
  return { ...data, device_hashes: data.device_hashes || [], subnet_hashes: data.subnet_hashes || [] };
}

async function upsertInviterState(inviterId, patch) {
  const { error } = await db()
    .from("referral_inviter_state")
    .upsert({ inviter_id: inviterId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "inviter_id" });
  if (error && !isMissing(error)) throw error;
  return !error;
}

/** Remember the inviter's own device / network (last 5 each) for the "same device" signal. */
async function rememberInviterDevice(inviterId, { deviceHash, subnetHash }) {
  if (!deviceHash && !subnetHash) return false;
  const st = await getInviterState(inviterId);
  const push = (list, v) => (v ? [v, ...(list || []).filter((x) => x !== v)].slice(0, 5) : list || []);
  const devices = push(st.device_hashes, deviceHash);
  const subnets = push(st.subnet_hashes, subnetHash);
  if (JSON.stringify(devices) === JSON.stringify(st.device_hashes) && JSON.stringify(subnets) === JSON.stringify(st.subnet_hashes)) return false;
  return upsertInviterState(inviterId, { device_hashes: devices, subnet_hashes: subnets, link_paused: Boolean(st.link_paused) });
}

async function listPausedInviters() {
  const { data, error } = await db().from("referral_inviter_state").select("inviter_id, paused_reason, paused_at").eq("link_paused", true);
  if (error) return [];
  return data || [];
}

// ---------------------------------------------------------------- admin actions
async function insertAction(row) {
  const { data, error } = await db().from("referral_actions").insert(row).select("*").maybeSingle();
  if (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  return data;
}

async function getAction(id) {
  const { data, error } = await db().from("referral_actions").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data || null;
}

/** Marks an action undone; false when it was already undone (race). */
async function markActionUndone(id, actorId) {
  const { data, error } = await db()
    .from("referral_actions")
    .update({ undone_at: new Date().toISOString(), undone_by: actorId })
    .eq("id", id)
    .is("undone_at", null)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

async function listActions({ limit = 30, inviterId = null } = {}) {
  let q = db().from("referral_actions").select("*");
  if (inviterId) q = q.eq("inviter_id", inviterId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return data || [];
}

// ---------------------------------------------------------------- alerts
async function insertAlert(row) {
  const { data, error } = await db().from("referral_alerts").insert(row).select("*").maybeSingle();
  if (error) return null;
  return data;
}

async function openAlertFor(inviterId, kind, sinceIso) {
  const { data, error } = await db()
    .from("referral_alerts")
    .select("id, created_at")
    .eq("inviter_id", inviterId)
    .eq("kind", kind)
    .eq("status", "open")
    .gte("created_at", sinceIso)
    .limit(1);
  if (error) return null;
  return (data || [])[0] || null;
}

async function listAlerts({ status = "open", limit = 10 } = {}) {
  let q = db().from("referral_alerts").select("*");
  if (status) q = q.eq("status", status);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return data || [];
}

async function getAlert(id) {
  const { data, error } = await db().from("referral_alerts").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateAlert(id, patch) {
  const { data, error } = await db().from("referral_alerts").update(patch).eq("id", id).select("*");
  if (error) throw error;
  return (data || [])[0] || null;
}

// ---------------------------------------------------------------- notices
async function insertNotice(row) {
  const { data, error } = await db().from("referral_notices").insert(row).select("*").maybeSingle();
  if (error) return null;
  return data;
}

async function listNotices(userId, { limit = 5 } = {}) {
  const { data, error } = await db()
    .from("referral_notices")
    .select("id, kind, text, amount, created_at, read_at, withdrawn_at")
    .eq("user_id", userId)
    .is("withdrawn_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

async function markNoticesRead(userId, ids) {
  let q = db().from("referral_notices").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  if (Array.isArray(ids) && ids.length) q = q.in("id", ids.slice(0, 50));
  const { error } = await q;
  return !error;
}

async function withdrawNotices(actionId) {
  const { data, error } = await db()
    .from("referral_notices")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("action_id", actionId)
    .select("id, user_id");
  if (error) return [];
  return data || [];
}

// ---------------------------------------------------------------- users
const USER_COLS = "id, username, display_name, avatar_url, created_at, signup_at, language, is_banned, deleted_at, last_seen, first_message_at, country, signup_country";
const USER_COLS_MIN = "id, username, display_name, avatar_url, created_at";

async function usersByIds(ids) {
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  const out = new Map();
  for (let i = 0; i < list.length; i += 300) {
    const chunk = list.slice(i, i + 300);
    let { data, error } = await db().from("users").select(USER_COLS).in("id", chunk);
    if (error && isMissing(error)) ({ data, error } = await db().from("users").select(USER_COLS_MIN).in("id", chunk));
    if (error) throw error;
    for (const u of data || []) out.set(String(u.id), u);
  }
  return out;
}

async function userById(id) {
  return (await usersByIds([id])).get(String(id)) || null;
}

module.exports = {
  isMissing,
  isUnique,
  REF_COLS,
  getRules,
  listRuleVersions,
  saveRules,
  __resetRulesCache,
  insertReferral,
  referralByInvitee,
  referralsByInviter,
  referralsByIds,
  listReferrals,
  pendingDue,
  updateReferral,
  insertOpen,
  openById,
  linkOpen,
  listOpens,
  listMilestones,
  claimMilestone,
  releaseMilestone,
  getInviterState,
  upsertInviterState,
  rememberInviterDevice,
  listPausedInviters,
  insertAction,
  getAction,
  markActionUndone,
  listActions,
  insertAlert,
  openAlertFor,
  listAlerts,
  getAlert,
  updateAlert,
  insertNotice,
  listNotices,
  markNoticesRead,
  withdrawNotices,
  usersByIds,
  userById,
};
