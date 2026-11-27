"use strict";

/**
 * Growth 3B storage (supabase/migrations/20261125a_reengage_people.sql). Every read falls
 * back to defaults before the migration runs; every write then throws NOT_READY (the
 * routes answer 503 not_ready). Small TTL caches keep the push hot path cheap.
 */

const R = require("./rules");

let dbOverride = null;
const db = () => (dbOverride ? dbOverride() : require("../../db/supabase"));
/** Tests: run the store against an in-memory database. */
function __setDb(fn) {
  dbOverride = typeof fn === "function" ? fn : null;
}
const TTL_MS = 30 * 1000;
const CHUNK = 150;

function errText(error) {
  return `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
}
function isMissing(error) {
  if (!error) return false;
  const code = String(error.code || "");
  return ["42P01", "PGRST205", "42703", "PGRST204"].includes(code) || /does not exist|schema cache|could not find/i.test(errText(error));
}
function notReady() {
  const e = new Error("not_ready");
  e.code = "NOT_READY";
  e.status = 503;
  return e;
}
function chunks(list, size = CHUNK) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const settingsCache = new Map(); // userId -> { at, value }
const personCache = new Map(); // `${user}|${peer}` -> { at, value }

function cacheGet(map, key, now = Date.now()) {
  const hit = map.get(key);
  return hit && now - hit.at < TTL_MS ? hit.value : undefined;
}
function cacheSet(map, key, value) {
  map.set(key, { at: Date.now(), value });
  if (map.size > 20000) map.clear();
}

/* ---- settings ------------------------------------------------------------ */

async function getSettingsMany(userIds) {
  const out = new Map();
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const missing = [];
  for (const id of ids) {
    const hit = cacheGet(settingsCache, id);
    if (hit) out.set(id, hit);
    else missing.push(id);
  }
  for (const part of chunks(missing)) {
    const { data, error } = await db().from("notify_settings").select("*").in("user_id", part);
    const rows = new Map((error ? [] : data || []).map((r) => [String(r.user_id), r]));
    for (const id of part) {
      const value = R.normalizeSettings(rows.get(id) || null);
      cacheSet(settingsCache, id, value);
      out.set(id, value);
    }
  }
  return out;
}

async function getSettings(userId) {
  return (await getSettingsMany([userId])).get(String(userId)) || R.normalizeSettings(null);
}

async function saveSettings(userId, row) {
  const { error } = await db()
    .from("notify_settings")
    .upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw isMissing(error) ? notReady() : error;
  settingsCache.delete(String(userId));
  // Keep the old "Friend is in voice" switch (users.notify_friend_voice) in step.
  if (row?.types && typeof row.types.friendVoice === "boolean") {
    await db().from("users").update({ notify_friend_voice: row.types.friendVoice }).eq("id", userId);
  }
}

/* ---- person prefs -------------------------------------------------------- */

async function listPersons(userId) {
  const { data, error } = await db().from("notify_person_prefs").select("*").eq("user_id", userId).limit(2000);
  if (error) return { ready: !isMissing(error), rows: [] };
  return { ready: true, rows: data || [] };
}

/** Map peerId -> normalized prefs for one recipient about many peers (or many recipients about one peer). */
async function personsFor(userIds, peerId) {
  const out = new Map();
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const missing = [];
  for (const id of ids) {
    const hit = cacheGet(personCache, `${id}|${peerId}`);
    if (hit) out.set(id, hit);
    else missing.push(id);
  }
  for (const part of chunks(missing)) {
    const { data, error } = await db().from("notify_person_prefs").select("*").eq("peer_id", peerId).in("user_id", part);
    const rows = new Map((error ? [] : data || []).map((r) => [String(r.user_id), r]));
    for (const id of part) {
      const value = R.normalizePerson(rows.get(id) || null);
      cacheSet(personCache, `${id}|${peerId}`, value);
      out.set(id, value);
    }
  }
  return out;
}

async function getPerson(userId, peerId) {
  return (await personsFor([userId], peerId)).get(String(userId)) || R.normalizePerson(null);
}

async function importantCount(userId, exceptPeer = null) {
  const { data, error } = await db().from("notify_person_prefs").select("peer_id").eq("user_id", userId).eq("important", true);
  if (error) return 0;
  return (data || []).filter((r) => String(r.peer_id) !== String(exceptPeer || "")).length;
}

async function savePerson(userId, peerId, row) {
  const { error } = await db()
    .from("notify_person_prefs")
    .upsert({ user_id: userId, peer_id: peerId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id,peer_id" });
  if (error) throw isMissing(error) ? notReady() : error;
  personCache.delete(`${userId}|${peerId}`);
}

/* ---- activity hours ------------------------------------------------------ */

const hourSeen = new Map(); // userId -> "day|hour"

async function recordHour(userId, { tz = null, now = Date.now() } = {}) {
  if (!userId) return false;
  const P = require("../reengagePolicy");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: P.recipientTimeZone(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const hour = R.localClock(tz, now).hour;
  const key = `${day}|${hour}`;
  if (hourSeen.get(userId) === key) return false;
  hourSeen.set(userId, key);
  if (hourSeen.size > 50000) hourSeen.clear();
  const { error } = await db().from("user_activity_hours").upsert({ user_id: userId, day, hour }, { onConflict: "user_id,day,hour", ignoreDuplicates: true });
  if (error) {
    hourSeen.delete(userId);
    return false;
  }
  return true;
}

/** Map userId -> 24-slot histogram over the last `days` days. */
async function hourHistograms(userIds, { days = 30, now = Date.now() } = {}) {
  const out = new Map();
  const since = new Date(now - days * R.DAY_MS).toISOString().slice(0, 10);
  for (const part of chunks([...new Set((userIds || []).map(String))])) {
    const { data, error } = await db().from("user_activity_hours").select("user_id, hour").in("user_id", part).gte("day", since).limit(50000);
    if (error) break;
    const by = new Map();
    for (const r of data || []) {
      const id = String(r.user_id);
      if (!by.has(id)) by.set(id, []);
      by.get(id).push(r);
    }
    for (const id of part) out.set(id, R.hourHistogram(by.get(id) || []));
  }
  return out;
}

/* ---- console settings, campaigns, waves --------------------------------- */

let consoleCache = null;

async function getConsole({ fresh = false } = {}) {
  if (!fresh && consoleCache && Date.now() - consoleCache.at < 10_000) return consoleCache.value;
  const { data, error } = await db().from("reengage_settings").select("*").eq("id", "default").maybeSingle();
  const value = {
    ready: !error || !isMissing(error),
    modeOverride: data?.mode_override || null,
    paused: Boolean(data?.paused),
    callReward: Number.isFinite(Number(data?.call_reward)) ? Number(data.call_reward) : R.WINBACK.defaultReward,
    gift14Amount: Number.isFinite(Number(data?.gift14_amount)) ? Number(data.gift14_amount) : R.WINBACK.defaultGift,
    updatedAt: data?.updated_at || null,
    updatedBy: data?.updated_by || null,
  };
  if (error && isMissing(error)) value.ready = false;
  consoleCache = { at: Date.now(), value };
  return value;
}

async function saveConsole(patch, by) {
  const row = { id: "default", updated_at: new Date().toISOString(), updated_by: by || null };
  if (patch.modeOverride !== undefined) row.mode_override = patch.modeOverride;
  if (patch.paused !== undefined) row.paused = Boolean(patch.paused);
  if (patch.callReward !== undefined) row.call_reward = patch.callReward;
  if (patch.gift14Amount !== undefined) row.gift14_amount = patch.gift14Amount;
  const { error } = await db().from("reengage_settings").upsert(row, { onConflict: "id" });
  if (error) throw isMissing(error) ? notReady() : error;
  consoleCache = null;
  return getConsole({ fresh: true });
}

async function listCampaignRows() {
  const { data, error } = await db().from("reengage_campaigns").select("*").limit(100);
  if (error) return { ready: !isMissing(error), rows: [] };
  return { ready: true, rows: data || [] };
}

async function saveCampaignRow(id, patch, by) {
  const { error } = await db()
    .from("reengage_campaigns")
    .upsert({ id, ...patch, updated_at: new Date().toISOString(), updated_by: by || null }, { onConflict: "id" });
  if (error) throw isMissing(error) ? notReady() : error;
}

async function createWave(row) {
  const { data, error } = await db().from("reengage_waves").insert(row).select("*").maybeSingle();
  if (error) throw isMissing(error) ? notReady() : error;
  return data;
}

async function updateWave(id, patch, guard = null) {
  let q = db().from("reengage_waves").update(patch).eq("id", id);
  if (guard?.status) q = q.eq("status", guard.status);
  const { data, error } = await q.select("*");
  if (error) throw isMissing(error) ? notReady() : error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function getWave(id) {
  const { data, error } = await db().from("reengage_waves").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data || null;
}

async function listWaves({ campaignId = null, limit = 20 } = {}) {
  let q = db().from("reengage_waves").select("*").order("started_at", { ascending: false }).limit(limit);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data, error } = await q;
  return error ? [] : data || [];
}

/** lifecycle_messages rows of a wave or a campaign since a time. */
async function messageRows({ waveId = null, campaign = null, since = null, limit = 20000 } = {}) {
  let q = db()
    .from("lifecycle_messages")
    .select("id, user_id, kind, channel, status, meta, sent_at, campaign, wave_id, lang, holdout, delivered_at, opened_at, returned_at, return_kind, recalled_at")
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (waveId) q = q.eq("wave_id", waveId);
  if (campaign) q = q.eq("campaign", campaign);
  if (since) q = q.gte("sent_at", since);
  const { data, error } = await q;
  if (error) return { ready: !isMissing(error), rows: [] };
  return { ready: true, rows: data || [] };
}

/* ---- win-back ------------------------------------------------------------ */

async function insertCall(row) {
  const { data, error } = await db().from("winback_calls").insert(row).select("*").maybeSingle();
  if (error) {
    if (String(error.code) === "23505") return null;
    throw isMissing(error) ? notReady() : error;
  }
  return data;
}

async function updateCall(id, patch, guard = {}) {
  let q = db().from("winback_calls").update(patch).eq("id", id);
  for (const [k, v] of Object.entries(guard)) q = v === null ? q.is(k, null) : q.eq(k, v);
  const { data, error } = await q.select("*");
  if (error) throw isMissing(error) ? notReady() : error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function callsWhere(filters = {}, { since = null, sinceCol = "suggested_at", limit = 500 } = {}) {
  let q = db().from("winback_calls").select("*").order(sinceCol, { ascending: false }).limit(limit);
  for (const [k, v] of Object.entries(filters)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
  if (since) q = q.gte(sinceCol, since);
  const { data, error } = await q;
  if (error) return { ready: !isMissing(error), rows: [] };
  return { ready: true, rows: data || [] };
}

/* ---- shared streaks, tasks, gifts --------------------------------------- */

async function streaksOf(userId) {
  const [a, b] = await Promise.all([
    db().from("shared_streaks").select("*").eq("user_a", userId).eq("status", "active"),
    db().from("shared_streaks").select("*").eq("user_b", userId).eq("status", "active"),
  ]);
  if (a.error && isMissing(a.error)) return { ready: false, rows: [] };
  return { ready: true, rows: [...(a.data || []), ...(b.data || [])] };
}

async function getStreak(x, y) {
  const k = R.pairKey(x, y);
  const { data, error } = await db().from("shared_streaks").select("*").eq("user_a", k.user_a).eq("user_b", k.user_b).maybeSingle();
  if (error) return null;
  return data || null;
}

async function upsertStreak(row) {
  const { error } = await db().from("shared_streaks").upsert(row, { onConflict: "user_a,user_b" });
  if (error) throw isMissing(error) ? notReady() : error;
}

/** Compare-and-set on the streak row (guard = column values that must still hold). */
async function casStreak(k, patch, guard = {}) {
  let q = db().from("shared_streaks").update(patch).eq("user_a", k.user_a).eq("user_b", k.user_b);
  for (const [col, v] of Object.entries(guard)) q = v === null ? q.is(col, null) : q.eq(col, v);
  const { data, error } = await q.select("*");
  if (error) throw isMissing(error) ? notReady() : error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function tasksOf(userId, day) {
  const { data, error } = await db().from("daily_tasks").select("*").eq("user_id", userId).eq("day", day).order("slot", { ascending: true });
  if (error) return { ready: !isMissing(error), rows: [] };
  return { ready: true, rows: data || [] };
}

async function insertTasks(rows) {
  if (!rows.length) return;
  const { error } = await db().from("daily_tasks").upsert(rows, { onConflict: "user_id,day,slot", ignoreDuplicates: true });
  if (error) throw isMissing(error) ? notReady() : error;
}

async function casTask(userId, day, slot, patch, guard = {}) {
  let q = db().from("daily_tasks").update(patch).eq("user_id", userId).eq("day", day).eq("slot", slot);
  for (const [col, v] of Object.entries(guard)) q = v === null ? q.is(col, null) : q.eq(col, v);
  const { data, error } = await q.select("*");
  if (error) throw isMissing(error) ? notReady() : error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function giftsOf(userId) {
  const { data, error } = await db().from("winback_gifts").select("*").eq("user_id", userId).is("claimed_at", null);
  return error ? [] : data || [];
}

async function insertGift(row) {
  const { error } = await db().from("winback_gifts").insert(row);
  if (error && String(error.code) !== "23505") throw isMissing(error) ? notReady() : error;
  return !error;
}

async function claimGift(userId, episodeKey, now = new Date().toISOString()) {
  const { data, error } = await db()
    .from("winback_gifts")
    .update({ claimed_at: now })
    .eq("user_id", userId)
    .eq("episode_key", episodeKey)
    .is("claimed_at", null)
    .select("*");
  if (error) return null;
  return Array.isArray(data) ? data[0] || null : data || null;
}

function __reset() {
  settingsCache.clear();
  personCache.clear();
  hourSeen.clear();
  consoleCache = null;
}

module.exports = {
  db,
  __setDb,
  isMissing,
  notReady,
  chunks,
  getSettings,
  getSettingsMany,
  saveSettings,
  listPersons,
  personsFor,
  getPerson,
  importantCount,
  savePerson,
  recordHour,
  hourHistograms,
  getConsole,
  saveConsole,
  listCampaignRows,
  saveCampaignRow,
  createWave,
  updateWave,
  getWave,
  listWaves,
  messageRows,
  insertCall,
  updateCall,
  callsWhere,
  streaksOf,
  getStreak,
  upsertStreak,
  casStreak,
  tasksOf,
  insertTasks,
  casTask,
  giftsOf,
  insertGift,
  claimGift,
  __reset,
};
