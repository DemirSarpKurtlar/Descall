"use strict";

/**
 * Canlı popup persistence (supabase/migrations/20261115_livepopup_campaigns.sql).
 * Every call degrades: while the tables are missing (migration not applied) the
 * store answers "unavailable" (null / [] / false) once, logs one warning, and the
 * engine keeps campaigns in memory only. Any other database error is thrown.
 */

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

const TABLES = ["popup_campaigns", "popup_receipts", "popup_templates", "popup_exemptions"];
const missing = new Set();
let warned = false;

function isMissingTable(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || (/popup_/.test(msg) && /does not exist|not find|schema cache/i.test(msg));
}

function noteMissing(table, err) {
  missing.add(table);
  if (!warned) {
    warned = true;
    console.warn(`[live-popup] ${table} missing (${err?.code || "?"}); apply supabase/migrations/20261115_livepopup_campaigns.sql. Running from memory.`);
  }
}

function available(table = "popup_campaigns") {
  return !missing.has(table);
}

/** Runs a query; missing table -> fallback, other errors -> throw. */
async function run(table, build, fallback) {
  if (missing.has(table)) return fallback;
  const res = await build(db().from(table));
  if (res?.error) {
    if (isMissingTable(res.error)) {
      noteMissing(table, res.error);
      return fallback;
    }
    const e = new Error(res.error.message || "Database error");
    e.code = res.error.code;
    throw e;
  }
  return res;
}

const CAMPAIGN_COLS =
  "id, status, kind, parent_id, title, body, severity, icon, duration_ms, require_ack, auto_resolve, cta_label, cta_url, audience, include_self, template_id, note, stats, scheduled_at, sent_at, expires_at, ended_at, recalled_at, recall_mode, recall_reason, recalled_by, created_by, created_by_username, created_at, updated_at";
const RECEIPT_COLS =
  "campaign_id, user_id, username, platform, language, delivered_at, seen_at, clicked_at, acked_at, dismissed_at, missed_at, missed_reason, closed_at, pending_login, resend_count, updated_at";

/* ---------- campaigns ---------- */

async function saveCampaign(row) {
  const res = await run("popup_campaigns", (q) => q.upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "id" }), null);
  return Boolean(res);
}

async function getCampaign(id) {
  const res = await run("popup_campaigns", (q) => q.select(CAMPAIGN_COLS).eq("id", id).maybeSingle(), null);
  return res?.data || null;
}

/** live + scheduled, for the engine at boot. */
async function loadActive() {
  const res = await run("popup_campaigns", (q) => q.select(CAMPAIGN_COLS).in("status", ["live", "scheduled"]).order("created_at", { ascending: false }).limit(200), null);
  return res?.data || [];
}

async function listCampaigns({ limit = 30, since = null, statuses = null } = {}) {
  const res = await run(
    "popup_campaigns",
    (q) => {
      let s = q.select(CAMPAIGN_COLS);
      if (statuses?.length) s = s.in("status", statuses);
      if (since) s = s.gte("sent_at", since);
      return s.order("created_at", { ascending: false }).limit(Math.max(1, Math.min(200, limit)));
    },
    null
  );
  return res?.data || [];
}

async function countSentSince(sinceIso) {
  const res = await run(
    "popup_campaigns",
    (q) => q.select("id", { count: "exact", head: true }).gte("sent_at", sinceIso).neq("kind", "single"),
    null
  );
  return res ? Number(res.count) || 0 : null;
}

/* ---------- receipts ---------- */

async function upsertReceipts(rows) {
  if (!rows?.length) return true;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const res = await run("popup_receipts", (q) => q.upsert(chunk, { onConflict: "campaign_id,user_id" }), null);
    if (!res) return false;
  }
  return true;
}

async function loadReceipts(campaignId) {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const res = await run("popup_receipts", (q) => q.select(RECEIPT_COLS).eq("campaign_id", campaignId).range(from, from + 999), null);
    const rows = res?.data || [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function userReceipts(userId, limit = 30) {
  const res = await run("popup_receipts", (q) => q.select(RECEIPT_COLS).eq("user_id", userId).order("updated_at", { ascending: false }).limit(limit), null);
  return res?.data || [];
}

async function campaignsByIds(ids) {
  if (!ids.length) return [];
  const res = await run("popup_campaigns", (q) => q.select(CAMPAIGN_COLS).in("id", ids), null);
  return res?.data || [];
}

/* ---------- templates ---------- */

const TEMPLATE_COLS =
  "id, name, title, body, severity, icon, duration_ms, require_ack, auto_resolve, cta_label, cta_url, audience, use_count, created_by, created_by_username, created_at, updated_at";

async function listTemplates() {
  const res = await run("popup_templates", (q) => q.select(TEMPLATE_COLS).order("updated_at", { ascending: false }).limit(100), null);
  return res ? res.data || [] : null;
}

async function insertTemplate(row) {
  const res = await run("popup_templates", (q) => q.insert(row).select(TEMPLATE_COLS).single(), null);
  return res ? res.data : null;
}

async function updateTemplate(id, patch) {
  const res = await run("popup_templates", (q) => q.update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select(TEMPLATE_COLS).maybeSingle(), null);
  return res ? res.data : null;
}

async function deleteTemplate(id) {
  const res = await run("popup_templates", (q) => q.delete().eq("id", id).select("id"), null);
  return res ? (res.data || []).length > 0 : null;
}

async function bumpTemplate(id) {
  if (!id) return;
  const res = await run("popup_templates", (q) => q.select("use_count").eq("id", id).maybeSingle(), null);
  if (!res?.data) return;
  await run("popup_templates", (q) => q.update({ use_count: (Number(res.data.use_count) || 0) + 1 }).eq("id", id), null);
}

/* ---------- exemptions ---------- */

let exemptCache = { at: 0, ids: new Set() };

async function exemptIds() {
  if (Date.now() - exemptCache.at < 60_000) return exemptCache.ids;
  const res = await run("popup_exemptions", (q) => q.select("user_id").limit(10000), null);
  exemptCache = { at: Date.now(), ids: new Set((res?.data || []).map((r) => String(r.user_id))) };
  return exemptCache.ids;
}

async function setExempt(userId, exempt, actor) {
  let res;
  if (exempt) {
    res = await run(
      "popup_exemptions",
      (q) => q.upsert({ user_id: userId, created_by: actor?.id || null, created_by_username: actor?.username || null, created_at: new Date().toISOString() }, { onConflict: "user_id" }),
      null
    );
  } else {
    res = await run("popup_exemptions", (q) => q.delete().eq("user_id", userId), null);
  }
  exemptCache.at = 0;
  return Boolean(res);
}

/* ---------- users / servers for targeting ---------- */

async function usersByIds(ids, cols = "id, username, avatar_url, language, created_at") {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let res = await db().from("users").select(cols).in("id", chunk);
    if (res?.error) res = await db().from("users").select("id, username, avatar_url, created_at").in("id", chunk);
    if (!res?.error) out.push(...(res.data || []));
  }
  return out;
}

async function serverMembersAmong(serverId, ids) {
  const out = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const res = await db().from("server_members").select("user_id").eq("server_id", serverId).in("user_id", chunk);
    if (!res?.error) for (const r of res.data || []) out.add(String(r.user_id));
  }
  return out;
}

async function serverMemberCount(serverId) {
  const res = await db().from("server_members").select("user_id", { count: "exact", head: true }).eq("server_id", serverId);
  return res?.error ? null : Number(res.count) || 0;
}

function likeTerm(q) {
  return `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

async function searchUsers(q, limit = 8) {
  const term = String(q || "").replace(/^@+/, "").trim().slice(0, 32);
  if (!term) return [];
  const res = await db().from("users").select("id, username, display_name, avatar_url").ilike("username", likeTerm(term)).limit(limit);
  return res?.error ? [] : res.data || [];
}

async function searchServers(q, limit = 8) {
  const term = String(q || "").trim().slice(0, 60);
  if (!term) return [];
  const res = await db().from("servers").select("id, name, icon_url").ilike("name", likeTerm(term)).limit(limit);
  return res?.error ? [] : res.data || [];
}

function __setDbForTests(client) {
  dbOverride = client;
  missing.clear();
  warned = false;
  exemptCache = { at: 0, ids: new Set() };
}

module.exports = {
  TABLES,
  isMissingTable,
  available,
  saveCampaign,
  getCampaign,
  loadActive,
  listCampaigns,
  countSentSince,
  upsertReceipts,
  loadReceipts,
  userReceipts,
  campaignsByIds,
  listTemplates,
  insertTemplate,
  updateTemplate,
  deleteTemplate,
  bumpTemplate,
  exemptIds,
  setExempt,
  usersByIds,
  serverMembersAmong,
  serverMemberCount,
  searchUsers,
  searchServers,
  __setDbForTests,
};
