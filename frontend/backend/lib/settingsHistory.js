"use strict";

/**
 * Settings history (Güvenlik Merkezi "Ayar değişikliği geçmişi", Nov 2026): one row per
 * change of system_settings with { key, from, to } for every changed value, who did it,
 * why, and whether it was reverted. Table public.security_setting_changes
 * (supabase/migrations/20261115_security_center.sql). Until the migration is applied
 * the last 300 changes live in memory (lost on restart) and `persistent` reads false.
 * Shared by the Güvenlik Merkezi and the Sistem page (lib/systemSettingsChange.js).
 */

const crypto = require("crypto");

const TABLE = "security_setting_changes";
const MEMORY_MAX = 300;
const PAUSE_MS = 10 * 60 * 1000;

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");
const memory = [];
let pausedUntil = 0;
let warned = false;

function isMissingTable(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || (/security_setting_changes/.test(msg) && /does not exist|not find|schema cache/i.test(msg));
}

function pause(err) {
  pausedUntil = Date.now() + PAUSE_MS;
  if (!warned) {
    warned = true;
    console.warn("[settings-history] table missing, keeping changes in memory:", err?.message || err, "(apply supabase/migrations/20261115_security_center.sql)");
  }
}

function persistent() {
  return Date.now() >= pausedUntil;
}

function toRow(e) {
  return {
    id: e.id,
    at: e.at,
    actor_id: /^[0-9a-f-]{36}$/i.test(String(e.actorId || "")) ? e.actorId : null,
    actor_username: e.actorUsername || null,
    source: e.source || "security",
    category: e.category || "other",
    title: e.title || null,
    changes: e.changes || [],
    reason: e.reason || null,
    meta: e.meta || {},
    revert_of: e.revertOf || null,
    reverted_at: e.revertedAt || null,
    reverted_by_username: e.revertedBy || null,
  };
}

function fromRow(r) {
  return {
    id: r.id,
    at: r.at,
    actorId: r.actor_id || null,
    actorUsername: r.actor_username || null,
    source: r.source || "security",
    category: r.category || "other",
    title: r.title || null,
    changes: Array.isArray(r.changes) ? r.changes : [],
    reason: r.reason || null,
    meta: r.meta && typeof r.meta === "object" ? r.meta : {},
    revertOf: r.revert_of || null,
    revertedAt: r.reverted_at || null,
    revertedBy: r.reverted_by_username || null,
  };
}

function remember(entry) {
  const i = memory.findIndex((e) => e.id === entry.id);
  if (i >= 0) memory[i] = entry;
  else memory.unshift(entry);
  if (memory.length > MEMORY_MAX) memory.length = MEMORY_MAX;
}

/** Store one change. Never throws; returns the entry (with its id). */
async function record({ actor, source = "security", category = "other", title = null, changes = [], reason = null, meta = {}, revertOf = null, at = null }) {
  const entry = {
    id: crypto.randomUUID(),
    at: at || new Date().toISOString(),
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    source,
    category,
    title,
    changes,
    reason: reason || null,
    meta: meta || {},
    revertOf,
    revertedAt: null,
    revertedBy: null,
  };
  remember(entry);
  if (persistent()) {
    try {
      const { error } = await db().from(TABLE).insert(toRow(entry));
      if (error) {
        if (isMissingTable(error)) pause(error);
        else console.warn("[settings-history] insert:", error.message || error);
      }
    } catch (err) {
      console.warn("[settings-history] insert:", err?.message || err);
    }
  }
  return entry;
}

async function list({ category = null, limit = 60, before = null } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 60));
  if (persistent()) {
    try {
      let q = db().from(TABLE).select("*").order("at", { ascending: false }).limit(lim);
      if (category) q = q.eq("category", category);
      if (before) q = q.lt("at", before);
      const { data, error } = await q;
      if (error) {
        if (isMissingTable(error)) pause(error);
        else throw error;
      } else {
        return { entries: (data || []).map(fromRow), persistent: true };
      }
    } catch (err) {
      console.warn("[settings-history] list:", err?.message || err);
    }
  }
  let rows = memory.slice();
  if (category) rows = rows.filter((e) => e.category === category);
  if (before) rows = rows.filter((e) => e.at < before);
  return { entries: rows.slice(0, lim), persistent: false };
}

async function get(id) {
  const key = String(id || "");
  if (!/^[0-9a-f-]{36}$/i.test(key)) return null;
  if (persistent()) {
    try {
      const { data, error } = await db().from(TABLE).select("*").eq("id", key).maybeSingle();
      if (!error && data) return fromRow(data);
      if (error && isMissingTable(error)) pause(error);
    } catch {
      /* fall back to memory */
    }
  }
  return memory.find((e) => e.id === key) || null;
}

async function markReverted(id, actor, at = new Date().toISOString()) {
  const hit = memory.find((e) => e.id === id);
  if (hit) {
    hit.revertedAt = at;
    hit.revertedBy = actor?.username || null;
  }
  if (!persistent()) return;
  try {
    await db().from(TABLE).update({ reverted_at: at, reverted_by_username: actor?.username || null }).eq("id", id);
  } catch {
    /* best effort */
  }
}

function __setDbForTests(client) {
  dbOverride = client;
  memory.length = 0;
  pausedUntil = 0;
  warned = false;
}

module.exports = { TABLE, record, list, get, markReverted, persistent, fromRow, toRow, __setDbForTests };
