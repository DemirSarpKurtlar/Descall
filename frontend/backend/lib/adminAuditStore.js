"use strict";

/**
 * Durable copy of every admin audit entry (3.1.3). runtime/sharedState.appendAudit
 * keeps the in-memory list (fast, for the live overview) and hands each entry to
 * persist(); GET /admin/audit reads list() first. Writes are fire-and-forget: an
 * admin action never fails because the log write did. When the table is missing
 * (migration not applied yet) writes pause for 10 minutes and one warning is logged.
 */

const MAX_META_CHARS = 4000;
const PAUSE_MS = 10 * 60 * 1000;
const SECRET_KEY = /pass(word)?|token|secret|code|otp|hash|authorization|cookie/i;

let pausedUntil = 0;
let warned = false;
let clientOverride = null;

function db() {
  return clientOverride || require("../db/supabase");
}

function isMissingTable(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || /admin_audit/.test(msg) && /does not exist|not find/i.test(msg);
}

/** Drop secret-looking keys and cap the size; meta is for humans, not replay. */
function cleanMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEY.test(k)) continue;
    if (v === undefined || typeof v === "function") continue;
    out[k] = v;
  }
  let json = "";
  try { json = JSON.stringify(out); } catch { return { note: "unserializable" }; }
  if (json.length <= MAX_META_CHARS) return out;
  return { truncated: true, preview: json.slice(0, MAX_META_CHARS - 40) };
}

function toRow(entry) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return {
    id: String(entry.id),
    at: entry.at || new Date().toISOString(),
    actor_id: uuid.test(String(entry.actorId || "")) ? entry.actorId : null,
    actor_username: entry.actorUsername ? String(entry.actorUsername).slice(0, 64) : null,
    action: String(entry.action || "unknown").slice(0, 80),
    target: entry.target == null ? null : String(entry.target).slice(0, 200),
    meta: cleanMeta(entry.meta),
  };
}

function fromRow(row) {
  return {
    id: row.id,
    at: row.at,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    action: row.action,
    target: row.target,
    meta: row.meta || {},
    durable: true,
  };
}

/** Fire-and-forget write. Returns the promise so tests can await it. */
function persist(entry, { now = Date.now() } = {}) {
  if (!entry || now < pausedUntil) return Promise.resolve(false);
  let query;
  try {
    query = db().from("admin_audit").insert(toRow(entry));
  } catch {
    return Promise.resolve(false);
  }
  return Promise.resolve(query)
    .then((res) => {
      if (!res?.error) return true;
      if (isMissingTable(res.error)) {
        pausedUntil = now + PAUSE_MS;
        if (!warned) {
          warned = true;
          console.warn("[admin-audit] table admin_audit missing; apply supabase/migrations/20261030_admin_audit.sql");
        }
      }
      return false;
    })
    .catch(() => false);
}

/** Newest first. Missing table / error → null (caller falls back to memory). */
async function list({ limit = 200, action = null, actorId = null, before = null } = {}) {
  try {
    let q = db().from("admin_audit").select("id, at, actor_id, actor_username, action, target, meta");
    if (action) q = q.eq("action", action);
    if (actorId) q = q.eq("actor_id", actorId);
    if (before) q = q.lt("at", before);
    const res = await q.order("at", { ascending: false }).limit(Math.min(500, Math.max(1, limit)));
    if (res?.error) return null;
    return (res.data || []).map(fromRow);
  } catch {
    return null;
  }
}

function __setClientForTests(client) {
  clientOverride = client;
  pausedUntil = 0;
  warned = false;
}

module.exports = { persist, list, cleanMeta, toRow, fromRow, __setClientForTests };
