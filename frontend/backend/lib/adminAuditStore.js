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
// İşlem kaydı (Nov 2026): request columns (20261115_audit_console.sql). null = not tried yet,
// false = missing (the request facts then ride in meta._req until the migration is applied).
let reqColumns = null;
const BASE_COLS = "id, at, actor_id, actor_username, action, target, meta";
const EXT_COLS = `${BASE_COLS}, ip_masked, user_agent, request_id, endpoint, step_up`;

function db() {
  return clientOverride || require("../db/supabase");
}

function isMissingColumn(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42703" || err?.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(msg);
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

function toRow(entry, { columns = reqColumns !== false } = {}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const row = {
    id: String(entry.id),
    at: entry.at || new Date().toISOString(),
    actor_id: uuid.test(String(entry.actorId || "")) ? entry.actorId : null,
    actor_username: entry.actorUsername ? String(entry.actorUsername).slice(0, 64) : null,
    action: String(entry.action || "unknown").slice(0, 80),
    target: entry.target == null ? null : String(entry.target).slice(0, 200),
    meta: cleanMeta(entry.meta),
  };
  // Who sent it (masked IP, user agent, request id, endpoint); only inside an admin request.
  const r = entry.request;
  if (r && (r.ipMasked || r.userAgent || r.requestId || r.endpoint)) {
    if (columns) {
      row.ip_masked = r.ipMasked ? String(r.ipMasked).slice(0, 64) : null;
      row.user_agent = r.userAgent ? String(r.userAgent).slice(0, 160) : null;
      row.request_id = r.requestId ? String(r.requestId).slice(0, 80) : null;
      row.endpoint = r.endpoint ? String(r.endpoint).slice(0, 160) : null;
      row.step_up = Boolean(r.stepUp);
    } else {
      row.meta = { ...row.meta, _req: { ip: r.ipMasked || null, ua: r.userAgent || null, rid: r.requestId || null, ep: r.endpoint || null, su: Boolean(r.stepUp) } };
    }
  }
  return row;
}

function fromRow(row) {
  const out = {
    id: row.id,
    at: row.at,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    action: row.action,
    target: row.target,
    meta: row.meta || {},
    durable: true,
  };
  const req = {
    ipMasked: row.ip_masked || row.meta?._req?.ip || null,
    userAgent: row.user_agent || row.meta?._req?.ua || null,
    requestId: row.request_id || row.meta?._req?.rid || null,
    endpoint: row.endpoint || row.meta?._req?.ep || null,
    stepUp: row.step_up ?? row.meta?._req?.su ?? null,
  };
  if (req.ipMasked || req.userAgent || req.requestId || req.endpoint) out.request = req;
  return out;
}

/** Fire-and-forget write. Returns the promise so tests can await it. */
function persist(entry, { now = Date.now() } = {}) {
  if (!entry) return Promise.resolve(false);
  if (!entry.request) {
    try {
      const ctx = require("./auditRuntime").current();
      if (ctx) entry.request = { ...ctx };
    } catch {
      /* no request context */
    }
  }
  // İşlem kaydı live stream: open console pages fetch the new row themselves.
  try {
    require("./auditRuntime").publish(entry);
  } catch {
    /* io not ready */
  }
  if (now < pausedUntil) return Promise.resolve(false);
  let query;
  try {
    query = db().from("admin_audit").insert(toRow(entry));
  } catch {
    return Promise.resolve(false);
  }
  return Promise.resolve(query)
    .then(async (res) => {
      if (!res?.error) {
        if (entry.request && reqColumns === null) reqColumns = true;
        return true;
      }
      if (entry.request && reqColumns !== false && isMissingColumn(res.error)) {
        reqColumns = false;
        const retry = await db().from("admin_audit").insert(toRow(entry, { columns: false }));
        return !retry?.error;
      }
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
async function list({ limit = 200, action = null, actorId = null, before = null, target = null } = {}) {
  try {
    const run = (cols) => {
      let q = db().from("admin_audit").select(cols);
      if (action) q = q.eq("action", action);
      if (actorId) q = q.eq("actor_id", actorId);
      if (target) q = q.eq("target", String(target));
      if (before) q = q.lt("at", before);
      return q.order("at", { ascending: false }).limit(Math.min(500, Math.max(1, limit)));
    };
    let res = await run(reqColumns === false ? BASE_COLS : EXT_COLS);
    if (res?.error && reqColumns !== false && isMissingColumn(res.error)) {
      reqColumns = false;
      res = await run(BASE_COLS);
    }
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
  reqColumns = null;
}

/** Request columns state for the console: true / false (missing) / null (not known yet). */
function requestColumns() {
  return reqColumns;
}

function setRequestColumns(v) {
  reqColumns = v;
}

module.exports = {
  persist,
  list,
  cleanMeta,
  toRow,
  fromRow,
  isMissingColumn,
  requestColumns,
  setRequestColumns,
  BASE_COLS,
  EXT_COLS,
  __setClientForTests,
};
