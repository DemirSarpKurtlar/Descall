"use strict";

/**
 * Duyurular database access. Every call degrades instead of throwing when
 * supabase/migrations/20261115_announcements_schema.sql is not applied yet:
 * `schemaReady()` is false, reads fall back to the legacy columns and the new
 * tables answer empty.
 */

const supabase = require("../../db/supabase");
const model = require("./model");

const PAGE = 1000;
const probe = { at: 0, ready: null, inflight: null };

function db() {
  return module.exports.__db || supabase;
}

function missingColumn(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return code === "42703" || code === "PGRST204" || /column .* does not exist|Could not find the '.*' column/i.test(msg);
}

function missingTable(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(String(error?.message || ""));
}

/** Whether the new columns exist (re-checked every minute so applying the migration needs no restart). */
async function schemaReady() {
  if (probe.ready != null && Date.now() - probe.at < 60_000) return probe.ready;
  if (probe.inflight) return probe.inflight;
  probe.inflight = (async () => {
    try {
      const { error } = await db().from("announcements").select("id, status, translations, audience, pin_order").limit(1);
      probe.ready = !error;
      if (error && !missingColumn(error)) console.warn("[announcements] schema probe:", error.message);
    } catch {
      probe.ready = false;
    }
    probe.at = Date.now();
    probe.inflight = null;
    return probe.ready;
  })();
  return probe.inflight;
}

function resetProbe() {
  probe.at = 0;
  probe.ready = null;
}

async function pagedSelect(build) {
  const out = [];
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}

/* ---------------- announcements ---------------- */

async function listAll({ limit = 500 } = {}) {
  const ready = await schemaReady();
  const cols = ready ? "*" : model.LEGACY_COLUMNS;
  const { data, error } = await db().from("announcements").select(cols).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

async function listActive() {
  const ready = await schemaReady();
  const cols = ready ? "*" : model.LEGACY_COLUMNS;
  const { data, error } = await db().from("announcements").select(cols).eq("is_active", true).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data || [];
}

async function listScheduled() {
  if (!(await schemaReady())) return [];
  const { data, error } = await db().from("announcements").select("*").eq("status", "scheduled").limit(200);
  if (error) throw error;
  return data || [];
}

async function getById(id) {
  const ready = await schemaReady();
  const { data, error } = await db().from("announcements").select(ready ? "*" : model.LEGACY_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insert(row) {
  const { data, error } = await db().from("announcements").insert(row).select().single();
  if (error) throw error;
  return data;
}

async function update(id, patch) {
  const { data, error } = await db().from("announcements").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

async function remove(id) {
  const { error } = await db().from("announcements").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- versions ---------------- */

const SNAPSHOT_FIELDS = ["title", "content", "icon", "color", "priority", "cta_label", "cta_url", "cover_url", "audience", "starts_at", "ends_at", "pinned", "push", "live_notify", "source_lang", "translations", "status", "version"];

function snapshotOf(row) {
  const out = {};
  for (const k of SNAPSHOT_FIELDS) if (row && row[k] !== undefined) out[k] = row[k];
  return out;
}

async function addVersion(row, { change, actor }) {
  if (!(await schemaReady())) return null;
  const { error } = await db().from("announcement_versions").insert({
    announcement_id: row.id,
    version: Number(row.version) || 1,
    snapshot: snapshotOf(row),
    change: change || "edited",
    edited_by: actor?.id || null,
    edited_by_name: actor?.username || null,
  });
  if (error && !missingTable(error)) console.warn("[announcements] version insert:", error.message);
  return null;
}

async function listVersions(id) {
  if (!(await schemaReady())) return [];
  const { data, error } = await db().from("announcement_versions").select("*").eq("announcement_id", id).order("version", { ascending: false }).limit(100);
  if (error) {
    if (missingTable(error)) return [];
    throw error;
  }
  return data || [];
}

async function versionCounts(ids) {
  if (!ids.length || !(await schemaReady())) return new Map();
  const { data, error } = await pagedSelect(() => db().from("announcement_versions").select("announcement_id, edited_by_name, version").in("announcement_id", ids));
  const out = new Map();
  if (error) return out;
  for (const r of data) {
    const k = String(r.announcement_id);
    const cur = out.get(k) || { count: 0, lastBy: null, lastVersion: 0 };
    cur.count += 1;
    if ((Number(r.version) || 0) >= cur.lastVersion) {
      cur.lastVersion = Number(r.version) || 0;
      cur.lastBy = r.edited_by_name || null;
    }
    out.set(k, cur);
  }
  return out;
}

/* ---------------- templates ---------------- */

async function listTemplates() {
  if (!(await schemaReady())) return [];
  const { data, error } = await db().from("announcement_templates").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  if (error) {
    if (missingTable(error)) return [];
    throw error;
  }
  return data || [];
}

async function getTemplate(id) {
  const { data, error } = await db().from("announcement_templates").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertTemplate(row) {
  const { data, error } = await db().from("announcement_templates").insert(row).select().single();
  if (error) throw error;
  return data;
}

async function updateTemplate(id, patch) {
  const { data, error } = await db().from("announcement_templates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/* ---------------- reads (engagement) ---------------- */

async function readsFor(ids) {
  if (!ids.length) return [];
  const ready = await schemaReady();
  const cols = ready ? "announcement_id, read_at, delivered_at, seen_at, clicked_at, platform, lang" : "announcement_id, read_at";
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data, error } = await pagedSelect(() => db().from("announcement_reads").select(cols).in("announcement_id", chunk));
    if (error && !missingTable(error)) throw error;
    out.push(...data);
  }
  return out;
}

async function userReads(userId, ids) {
  if (!userId || !ids.length) return [];
  const ready = await schemaReady();
  const cols = ready ? "announcement_id, read_at, delivered_at, seen_at, clicked_at" : "announcement_id, read_at";
  const { data, error } = await db().from("announcement_reads").select(cols).eq("user_id", userId).in("announcement_id", ids);
  if (error) {
    if (missingTable(error)) return [];
    throw error;
  }
  return data || [];
}

/** Rows for announcements this person received (delivered), never overwriting earlier marks. */
async function markDelivered(userId, ids, { platform = null, lang = null } = {}) {
  if (!userId || !ids.length || !(await schemaReady())) return;
  const now = new Date().toISOString();
  const rows = ids.map((id) => ({ user_id: userId, announcement_id: id, delivered_at: now, read_at: null, platform, lang }));
  const { error } = await db().from("announcement_reads").upsert(rows, { onConflict: "user_id,announcement_id", ignoreDuplicates: true });
  if (error && !missingTable(error)) console.warn("[announcements] delivered:", error.message);
}

async function markField(userId, ids, field, { platform = null, lang = null } = {}) {
  if (!userId || !ids.length) return;
  const ready = await schemaReady();
  const now = new Date().toISOString();
  if (!ready) {
    if (field !== "read_at") return;
    const { error } = await db().from("announcement_reads").upsert(ids.map((id) => ({ user_id: userId, announcement_id: id, read_at: now })), { onConflict: "user_id,announcement_id" });
    if (error && !missingTable(error)) throw error;
    return;
  }
  await markDelivered(userId, ids, { platform, lang });
  const patch = { [field]: now };
  if (platform) patch.platform = platform;
  if (lang) patch.lang = lang;
  const q = db().from("announcement_reads").update(patch).eq("user_id", userId).in("announcement_id", ids).is(field, null);
  const { error } = await q;
  if (error) throw error;
  if (field !== "seen_at") {
    // Reading or clicking implies having seen it.
    await db().from("announcement_reads").update({ seen_at: now }).eq("user_id", userId).in("announcement_id", ids).is("seen_at", null);
  }
}

/* ---------------- people (audience estimates, delivery) ---------------- */

async function audienceUsers({ withSessions = false } = {}) {
  const cols = withSessions ? "id, language, created_at, is_banned, active_sessions" : "id, language, created_at, is_banned";
  const { data, error } = await pagedSelect(() => db().from("users").select(cols).order("created_at", { ascending: true }));
  if (error) throw error;
  return data.filter((u) => !u.is_banned);
}

async function usersByIds(ids, cols = "id, language, created_at") {
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from("users").select(cols).in("id", ids.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

async function adminCount() {
  const { data, error } = await db().from("users").select("id, username, is_admin").eq("is_admin", true).limit(50);
  if (error) return 1;
  return (data || []).length;
}

module.exports = {
  schemaReady,
  resetProbe,
  missingColumn,
  missingTable,
  listAll,
  listActive,
  listScheduled,
  getById,
  insert,
  update,
  remove,
  snapshotOf,
  addVersion,
  listVersions,
  versionCounts,
  listTemplates,
  getTemplate,
  insertTemplate,
  updateTemplate,
  readsFor,
  userReads,
  markDelivered,
  markField,
  audienceUsers,
  usersByIds,
  adminCount,
  __db: null,
};
