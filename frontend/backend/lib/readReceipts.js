"use strict";

/**
 * "Görüldü" read receipts (messaging phase 4).
 *
 * DMs already store dm_messages.read_at (dm:mark_read). Groups store one row
 * per member in group_read_state (last_read_at), written by group:mark_read.
 *
 * Privacy (users.read_receipts, default on), as in other messengers it works
 * both ways: someone who turns it off does not report their reads and does
 * not see anyone else's. DM history hides read_at when either side has it
 * off; dm:peer_read and group:read are not sent; group read lists skip them.
 *
 * Both columns come from supabase/migrations/20261108_read_receipts.sql.
 * Before it runs, everyone counts as "on" and group reads are not stored.
 */

const { isMissingColumn } = require("./forwardedMessage");

const TTL_MS = 60 * 1000;
const cache = new Map(); // userId -> { on, at }
let columnMissing = false;
let tableMissing = false;

function db() {
  return require("../db/supabase");
}

function isMissingTable(error, table) {
  if (!error) return false;
  const code = String(error.code || "");
  const text = `${error.message || ""} ${error.details || ""}`;
  return (code === "42P01" || code === "PGRST205" || /relation|table/i.test(text)) && text.includes(table);
}

/** Whether `userId` shares read receipts (true when unknown). */
async function receiptsEnabled(userId, { now = Date.now() } = {}) {
  if (!userId || columnMissing) return true;
  const hit = cache.get(userId);
  if (hit && now - hit.at < TTL_MS) return hit.on;
  const { data, error } = await db().from("users").select("read_receipts").eq("id", userId).maybeSingle();
  if (error) {
    if (isMissingColumn(error, "read_receipts")) columnMissing = true;
    return true;
  }
  const on = data?.read_receipts !== false;
  cache.set(userId, { on, at: now });
  return on;
}

/** Both people share receipts. */
async function bothShare(a, b) {
  const [x, y] = await Promise.all([receiptsEnabled(a), receiptsEnabled(b)]);
  return x && y;
}

async function setReceiptsEnabled(userId, on) {
  const { error } = await db().from("users").update({ read_receipts: Boolean(on) }).eq("id", userId);
  if (error) {
    if (isMissingColumn(error, "read_receipts")) {
      columnMissing = true;
      return { ok: false, error: "not_ready" };
    }
    return { ok: false, error: "failed" };
  }
  cache.set(userId, { on: Boolean(on), at: Date.now() });
  return { ok: true, enabled: Boolean(on) };
}

/** DM history for `viewerId`: hide read_at of their messages unless both share receipts. */
async function maskDmReads(messages, viewerId, peerId) {
  if (!Array.isArray(messages) || !messages.length) return messages;
  if (await bothShare(viewerId, peerId)) return messages;
  return messages.map((m) => (m && m.readAt && (m.from?.id === viewerId || m.from_user_id === viewerId) ? { ...m, readAt: null } : m));
}

/** Upsert the member's read position. Returns the stored time or null. */
async function markGroupRead(groupId, userId, at = new Date().toISOString()) {
  if (tableMissing) return null;
  const { error } = await db()
    .from("group_read_state")
    .upsert({ group_id: groupId, user_id: userId, last_read_at: at }, { onConflict: "group_id,user_id" });
  if (error) {
    if (isMissingTable(error, "group_read_state")) tableMissing = true;
    return null;
  }
  return at;
}

/** [{ userId, at }] of members (not `viewerId`) who share receipts; [] when the viewer does not. */
async function groupReads(groupId, viewerId) {
  if (tableMissing || !(await receiptsEnabled(viewerId))) return [];
  const { data, error } = await db().from("group_read_state").select("user_id, last_read_at").eq("group_id", groupId);
  if (error) {
    if (isMissingTable(error, "group_read_state")) tableMissing = true;
    return [];
  }
  const rows = (data || []).filter((r) => r.user_id && r.user_id !== viewerId && r.last_read_at);
  const enabled = await receiptsEnabledMany(rows.map((r) => r.user_id));
  const out = [];
  for (const r of rows) {
    if (enabled.get(r.user_id) !== false) out.push({ userId: r.user_id, at: new Date(r.last_read_at).toISOString() });
  }
  return out;
}

/**
 * receiptsEnabled for many users: cached ones from the cache, the rest with one
 * .in("id") query per 100 ids (was one query per member). Map userId -> boolean;
 * unknown (failed query) counts as on, like receiptsEnabled.
 */
async function receiptsEnabledMany(userIds, { now = Date.now() } = {}) {
  const out = new Map();
  const pending = [];
  for (const uid of new Set((userIds || []).filter(Boolean))) {
    const hit = columnMissing ? null : cache.get(uid);
    if (columnMissing) out.set(uid, true);
    else if (hit && now - hit.at < TTL_MS) out.set(uid, hit.on);
    else pending.push(uid);
  }
  for (let i = 0; i < pending.length; i += 100) {
    const chunk = pending.slice(i, i + 100);
    const { data, error } = columnMissing
      ? { data: null, error: null }
      : await db().from("users").select("id, read_receipts").in("id", chunk);
    if (columnMissing || error) {
      if (error && isMissingColumn(error, "read_receipts")) columnMissing = true;
      for (const uid of chunk) out.set(uid, true);
      continue;
    }
    const byId = new Map((data || []).map((u) => [u.id, u]));
    for (const uid of chunk) {
      const on = byId.get(uid)?.read_receipts !== false;
      cache.set(uid, { on, at: now });
      out.set(uid, on);
    }
  }
  return out;
}

function __resetReadReceipts() {
  cache.clear();
  columnMissing = false;
  tableMissing = false;
}

module.exports = { receiptsEnabled, bothShare, setReceiptsEnabled, maskDmReads, markGroupRead, groupReads, isMissingTable, __resetReadReceipts };
