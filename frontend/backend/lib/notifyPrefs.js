"use strict";

/**
 * Per-conversation notification options (messaging phase 4).
 *
 * One row per (user, DM peer or group) in conversation_notify_prefs:
 *   level        'all' | 'mentions' | 'none'
 *   muted_until  a time until which nothing notifies (null = not muted)
 * No row = 'all'. The old DM "Mute" switch (dm_conversation_prefs.muted)
 * keeps working next to it. Pushes (web push, iOS) are filtered here; the
 * app filters its own desktop / in-app notifications (src/lib/notifyPrefs).
 *
 * Table: supabase/migrations/20261108_conversation_notify_prefs.sql. Before
 * it runs everything is 'all' and saving answers 503 not_ready.
 */

const { isMissingTable } = require("./readReceipts");

const LEVELS = Object.freeze(["all", "mentions", "none"]);
const CONV_TYPES = Object.freeze(["dm", "group"]);
const MAX_MUTE_MS = 366 * 24 * 60 * 60 * 1000;
const TTL_MS = 30 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cache = new Map(); // `${user}|${type}|${id}` -> { pref, at }
let tableMissing = false;

const db = () => require("../db/supabase");
const keyOf = (userId, type, id) => `${userId}|${type}|${id}`;

/** 'all' | 'mentions' | 'none' for a stored pref at `now`. */
function effectiveLevel(pref, now = Date.now()) {
  if (!pref) return "all";
  const until = pref.muted_until ? Date.parse(pref.muted_until) : NaN;
  if (Number.isFinite(until) && until > now) return "none";
  return LEVELS.includes(pref.level) ? pref.level : "all";
}

/** Whether a message (mention or not) may notify at `level`. */
function allows(level, { mention = false } = {}) {
  if (level === "none") return false;
  if (level === "mentions") return Boolean(mention);
  return true;
}

/** Validates a PUT body. Returns { ok, row } or { ok: false, error }. */
function validatePref(body, now = Date.now()) {
  const convType = String(body?.convType || "");
  const convId = String(body?.convId || "");
  const level = String(body?.level || "all");
  if (!CONV_TYPES.includes(convType)) return { ok: false, error: "bad_type" };
  if (!UUID.test(convId)) return { ok: false, error: "bad_id" };
  if (!LEVELS.includes(level)) return { ok: false, error: "bad_level" };
  let mutedUntil = null;
  if (body?.mutedUntil != null && body.mutedUntil !== "") {
    const t = Date.parse(String(body.mutedUntil));
    if (!Number.isFinite(t) || t <= now || t - now > MAX_MUTE_MS) return { ok: false, error: "bad_until" };
    mutedUntil = new Date(t).toISOString();
  }
  return { ok: true, row: { conv_type: convType, conv_id: convId, level, muted_until: mutedUntil } };
}

async function readPref(userId, type, id, now = Date.now()) {
  if (tableMissing || !userId || !id) return null;
  const k = keyOf(userId, type, id);
  const hit = cache.get(k);
  if (hit && now - hit.at < TTL_MS) return hit.pref;
  const { data, error } = await db()
    .from("conversation_notify_prefs")
    .select("level, muted_until")
    .eq("user_id", userId)
    .eq("conv_type", type)
    .eq("conv_id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error, "conversation_notify_prefs")) tableMissing = true;
    return null;
  }
  cache.set(k, { pref: data || null, at: now });
  return data || null;
}

/** Level for `userId` in a DM with `peerId` or in group `groupId`. Never throws. */
async function levelFor(userId, type, id, now = Date.now()) {
  try {
    return effectiveLevel(await readPref(userId, type, id, now), now);
  } catch {
    return "all";
  }
}

/** The recipients whose options allow this message. */
async function filterRecipients(userIds, type, id, { mention = false, now = Date.now() } = {}) {
  const prefs = await readPrefsMany(userIds || [], type, id, now);
  const out = [];
  for (const uid of userIds || []) {
    if (allows(effectiveLevel(prefs.get(uid) || null, now), { mention })) out.push(uid);
  }
  return out;
}

/**
 * readPref for many users of one conversation: cached ones from the cache, the rest
 * with one .in("user_id") query per 100 ids (was one query per user). Map uid ->
 * pref or null. A failed query leaves those users at null ('all'), like readPref.
 */
async function readPrefsMany(userIds, type, id, now = Date.now()) {
  const out = new Map();
  if (tableMissing || !id) return out;
  const pending = [];
  for (const uid of new Set(userIds.filter(Boolean))) {
    const hit = cache.get(keyOf(uid, type, id));
    if (hit && now - hit.at < TTL_MS) out.set(uid, hit.pref);
    else pending.push(uid);
  }
  for (let i = 0; i < pending.length && !tableMissing; i += 100) {
    const chunk = pending.slice(i, i + 100);
    try {
      const { data, error } = await db()
        .from("conversation_notify_prefs")
        .select("user_id, level, muted_until")
        .in("user_id", chunk)
        .eq("conv_type", type)
        .eq("conv_id", id);
      if (error) {
        if (isMissingTable(error, "conversation_notify_prefs")) tableMissing = true;
        continue;
      }
      const byUser = new Map((data || []).map((r) => [r.user_id, { level: r.level, muted_until: r.muted_until }]));
      for (const uid of chunk) {
        const pref = byUser.get(uid) || null;
        cache.set(keyOf(uid, type, id), { pref, at: now });
        out.set(uid, pref);
      }
    } catch {
      /* unknown: these users stay on 'all' */
    }
  }
  return out;
}

async function listPrefs(userId) {
  if (tableMissing) return [];
  const { data, error } = await db()
    .from("conversation_notify_prefs")
    .select("conv_type, conv_id, level, muted_until")
    .eq("user_id", userId);
  if (error) {
    if (isMissingTable(error, "conversation_notify_prefs")) tableMissing = true;
    return [];
  }
  return (data || []).map((r) => ({ convType: r.conv_type, convId: r.conv_id, level: r.level, mutedUntil: r.muted_until }));
}

/** Save (or with 'all' and no mute, delete) a pref. */
async function savePref(userId, row) {
  if (tableMissing) return { ok: false, error: "not_ready" };
  const q = db().from("conversation_notify_prefs");
  const isDefault = row.level === "all" && !row.muted_until;
  const { error } = isDefault
    ? await q.delete().eq("user_id", userId).eq("conv_type", row.conv_type).eq("conv_id", row.conv_id)
    : await q.upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id,conv_type,conv_id" });
  if (error) {
    if (isMissingTable(error, "conversation_notify_prefs")) {
      tableMissing = true;
      return { ok: false, error: "not_ready" };
    }
    return { ok: false, error: "failed" };
  }
  cache.set(keyOf(userId, row.conv_type, row.conv_id), { pref: isDefault ? null : { level: row.level, muted_until: row.muted_until }, at: Date.now() });
  return { ok: true, pref: { convType: row.conv_type, convId: row.conv_id, level: row.level, mutedUntil: row.muted_until } };
}

function __resetNotifyPrefs() {
  cache.clear();
  tableMissing = false;
}

module.exports = { LEVELS, CONV_TYPES, effectiveLevel, allows, validatePref, levelFor, filterRecipients, listPrefs, savePref, __resetNotifyPrefs };
